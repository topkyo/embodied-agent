/**
 * 轻量 Prometheus 文本格式指标导出。
 *
 * 不引入 prom-client 等外部依赖；Prometheus exposition format 是纯文本，
 * 仅需按规范输出 `# HELP` / `# TYPE` / `metric_name{labels} value`。
 *
 * Node 单线程模型下计数无需锁；本模块仅提供 counter / gauge / histogram
 * 三种指标类型与 `renderPrometheus()` 文本输出。
 */

export type LabelSet = Record<string, string>;

export type Counter = {
  readonly name: string;
  /** 增加计数；value 默认 1。labels 必须与声明 labelNames 一致。 */
  inc(labels?: LabelSet, value?: number): void;
};

export type Gauge = {
  readonly name: string;
  /** 设置当前值。labels 必须与声明 labelNames 一致。 */
  set(labels: LabelSet, value: number): void;
};

export type Histogram = {
  readonly name: string;
  /** 记录一次观测值。labels 必须与声明 labelNames 一致。 */
  observe(labels: LabelSet, value: number): void;
};

type MetricKind = "counter" | "gauge" | "histogram";

type CounterEntry = {
  kind: "counter";
  name: string;
  help: string;
  labelNames: readonly string[];
  values: Map<string, number>;
};

type GaugeEntry = {
  kind: "gauge";
  name: string;
  help: string;
  labelNames: readonly string[];
  values: Map<string, number>;
};

type HistogramEntry = {
  kind: "histogram";
  name: string;
  help: string;
  labelNames: readonly string[];
  buckets: readonly number[];
  /** labelKey -> { bucketCounts: number[] (per bucket, 不含 +Inf), sum, count } */
  series: Map<string, { bucketCounts: number[]; sum: number; count: number }>;
};

type MetricEntry = CounterEntry | GaugeEntry | HistogramEntry;

function formatLabelKey(labelNames: readonly string[], labels: LabelSet | undefined): string {
  if (labelNames.length === 0) return "";
  const parts: string[] = [];
  for (const name of labelNames) {
    const v = labels?.[name];
    if (v === undefined || v === null) {
      throw new Error(`metric label "${name}" missing for value`);
    }
    parts.push(`${name}="${escapeLabelValue(String(v))}"`);
  }
  return parts.join(",");
}

function formatLabelsString(labelKey: string): string {
  return labelKey.length > 0 ? `{${labelKey}}` : "";
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "+Inf" : "-Inf";
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

export type MetricsRegistry = {
  /** 声明一个 counter（重复声明同名返回已存在条目，help/labelNames 必须一致）。 */
  counter(name: string, help: string, labelNames?: readonly string[]): Counter;
  /** 声明一个 gauge。 */
  gauge(name: string, help: string, labelNames?: readonly string[]): Gauge;
  /** 声明一个 histogram；buckets 必须升序。 */
  histogram(
    name: string,
    help: string,
    buckets: readonly number[],
    labelNames?: readonly string[],
  ): Histogram;
  /** 输出 Prometheus 文本格式。 */
  renderPrometheus(): string;
};

/** 便捷埋点接口；封装标准指标，避免散落各处的字符串字面量。 */
export type MetricsRecorder = {
  /** command 完成计数（result: success/failed/rejected）。 */
  incCommand(skill: string, result: "success" | "failed" | "rejected"): void;
  /** command 耗时分布（秒）。 */
  observeCommandDuration(skill: string, seconds: number): void;
  /** LLM 调用计数（result: success/failed/timeout）。 */
  incLlmCall(model: string, result: "success" | "failed" | "timeout"): void;
  /** LLM 调用耗时分布（秒）。 */
  observeLlmDuration(model: string, seconds: number): void;
  /** MQTT 连接态（1=connected, 0=disconnected）。 */
  setMqttConnection(connected: boolean): void;
  /** 进程运行时间（秒）。 */
  setUptime(seconds: number): void;
};

const COMMAND_BUCKETS = [0.1, 0.5, 1, 5, 10, 30, 60];
const LLM_BUCKETS = [0.5, 1, 2, 5, 10, 30, 60];

export function createMetricsRegistry(): MetricsRegistry & MetricsRecorder {
  const metrics = new Map<string, MetricEntry>();
  const order: string[] = [];

  function assertNotRegistered(name: string, kind: MetricKind, help: string): void {
    const existing = metrics.get(name);
    if (existing) {
      if (existing.kind !== kind) {
        throw new Error(`metric "${name}" already registered as ${existing.kind}`);
      }
      if (existing.help !== help) {
        throw new Error(`metric "${name}" help mismatch`);
      }
    }
  }

  function register<T extends MetricEntry>(entry: T): T {
    if (!metrics.has(entry.name)) {
      metrics.set(entry.name, entry);
      order.push(entry.name);
    }
    return metrics.get(entry.name) as T;
  }

  function counter(name: string, help: string, labelNames: readonly string[] = []): Counter {
    assertNotRegistered(name, "counter", help);
    const entry = register<CounterEntry>({
      kind: "counter",
      name,
      help,
      labelNames,
      values: new Map<string, number>(),
    });
    return {
      name,
      inc(labels, value = 1) {
        const key = formatLabelKey(labelNames, labels);
        entry.values.set(key, (entry.values.get(key) ?? 0) + value);
      },
    };
  }

  function gauge(name: string, help: string, labelNames: readonly string[] = []): Gauge {
    assertNotRegistered(name, "gauge", help);
    const entry = register<GaugeEntry>({
      kind: "gauge",
      name,
      help,
      labelNames,
      values: new Map<string, number>(),
    });
    return {
      name,
      set(labels, value) {
        const key = formatLabelKey(labelNames, labels);
        entry.values.set(key, value);
      },
    };
  }

  function histogram(
    name: string,
    help: string,
    buckets: readonly number[],
    labelNames: readonly string[] = [],
  ): Histogram {
    if (buckets.length === 0) {
      throw new Error(`histogram "${name}" requires at least one bucket`);
    }
    for (let i = 1; i < buckets.length; i += 1) {
      if (buckets[i] <= buckets[i - 1]) {
        throw new Error(`histogram "${name}" buckets must be ascending`);
      }
    }
    assertNotRegistered(name, "histogram", help);
    const entry = register<HistogramEntry>({
      kind: "histogram",
      name,
      help,
      labelNames,
      buckets,
      series: new Map<string, { bucketCounts: number[]; sum: number; count: number }>(),
    });
    return {
      name,
      observe(labels, value) {
        const key = formatLabelKey(labelNames, labels);
        let series = entry.series.get(key);
        if (!series) {
          series = { bucketCounts: new Array(buckets.length).fill(0), sum: 0, count: 0 };
          entry.series.set(key, series);
        }
        for (let i = 0; i < buckets.length; i += 1) {
          if (value <= buckets[i]) series.bucketCounts[i] += 1;
        }
        series.sum += value;
        series.count += 1;
      },
    };
  }

  function renderPrometheus(): string {
    const lines: string[] = [];
    for (const name of order) {
      const entry = metrics.get(name)!;
      lines.push(`# HELP ${entry.name} ${entry.help}`);
      lines.push(`# TYPE ${entry.name} ${entry.kind}`);
      if (entry.kind === "counter" || entry.kind === "gauge") {
        for (const [key, value] of entry.values) {
          lines.push(`${entry.name}${formatLabelsString(key)} ${formatNumber(value)}`);
        }
      } else {
        for (const [key, series] of entry.series) {
          const baseLabels = key.length > 0 ? `${key},` : "";
          for (let i = 0; i < entry.buckets.length; i += 1) {
            lines.push(
              `${entry.name}_bucket{${baseLabels}le="${formatNumber(entry.buckets[i])}"} ${series.bucketCounts[i]}`,
            );
          }
          lines.push(`${entry.name}_bucket{${baseLabels}le="+Inf"} ${series.count}`);
          lines.push(`${entry.name}_sum${formatLabelsString(key)} ${formatNumber(series.sum)}`);
          lines.push(`${entry.name}_count${formatLabelsString(key)} ${series.count}`);
        }
      }
    }
    if (lines.length > 0) lines.push("");
    return lines.join("\n");
  }

  // 预注册标准指标，确保 # HELP / # TYPE 始终存在。
  const commandTotal = counter("embodied_command_total", "Command completion count", [
    "skill",
    "result",
  ]);
  const commandDuration = histogram(
    "embodied_command_duration_seconds",
    "Command duration distribution in seconds",
    COMMAND_BUCKETS,
    ["skill"],
  );
  const llmCalls = counter("embodied_llm_calls_total", "LLM call count", ["model", "result"]);
  const llmDuration = histogram(
    "embodied_llm_duration_seconds",
    "LLM call duration distribution in seconds",
    LLM_BUCKETS,
    ["model"],
  );
  const mqttStatus = gauge(
    "embodied_mqtt_connection_status",
    "MQTT connection status (1=connected, 0=disconnected)",
    [],
  );
  const uptime = gauge("embodied_uptime_seconds", "Process uptime in seconds", []);

  const recorder: MetricsRecorder = {
    incCommand(skill, result) {
      commandTotal.inc({ skill, result });
    },
    observeCommandDuration(skill, seconds) {
      commandDuration.observe({ skill }, seconds);
    },
    incLlmCall(model, result) {
      llmCalls.inc({ model, result });
    },
    observeLlmDuration(model, seconds) {
      llmDuration.observe({ model }, seconds);
    },
    setMqttConnection(connected) {
      mqttStatus.set({}, connected ? 1 : 0);
    },
    setUptime(seconds) {
      uptime.set({}, seconds);
    },
  };

  return {
    counter,
    gauge,
    histogram,
    renderPrometheus,
    ...recorder,
  };
}
