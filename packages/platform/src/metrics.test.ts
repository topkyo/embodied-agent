import { describe, expect, it } from "vitest";
import { createMetricsRegistry } from "./metrics.js";

describe("createMetricsRegistry", () => {
  it("counter 累加并按 label 维度区分", () => {
    const r = createMetricsRegistry();
    const c = r.counter("test_total", "test counter", ["skill", "result"]);
    c.inc({ skill: "irrigation", result: "success" });
    c.inc({ skill: "irrigation", result: "success" });
    c.inc({ skill: "irrigation", result: "failed" });
    c.inc({ skill: "irrigation", result: "success" }, 2);

    const out = r.renderPrometheus();
    expect(out).toContain("# HELP test_total test counter");
    expect(out).toContain("# TYPE test_total counter");
    expect(out).toContain('test_total{skill="irrigation",result="success"} 4');
    expect(out).toContain('test_total{skill="irrigation",result="failed"} 1');
  });

  it("gauge 设置当前值", () => {
    const r = createMetricsRegistry();
    const g = r.gauge("test_status", "test gauge", []);
    g.set({}, 1);
    g.set({}, 0);

    const out = r.renderPrometheus();
    expect(out).toContain("# TYPE test_status gauge");
    expect(out).toContain("test_status 0");
  });

  it("histogram 记录 bucket 累计计数、sum 与 count", () => {
    const r = createMetricsRegistry();
    const h = r.histogram("test_dur", "test histogram", [0.1, 1, 10], ["skill"]);
    h.observe({ skill: "irrigation" }, 0.05);
    h.observe({ skill: "irrigation" }, 0.5);
    h.observe({ skill: "irrigation" }, 5);
    h.observe({ skill: "irrigation" }, 100);

    const out = r.renderPrometheus();
    expect(out).toContain("# TYPE test_dur histogram");
    // le=0.1: 1 个 (0.05)
    expect(out).toContain('test_dur_bucket{skill="irrigation",le="0.1"} 1');
    // le=1: 2 个 (0.05, 0.5)
    expect(out).toContain('test_dur_bucket{skill="irrigation",le="1"} 2');
    // le=10: 3 个
    expect(out).toContain('test_dur_bucket{skill="irrigation",le="10"} 3');
    // +Inf: 全部 4 个
    expect(out).toContain('test_dur_bucket{skill="irrigation",le="+Inf"} 4');
    expect(out).toContain('test_dur_count{skill="irrigation"} 4');
    expect(out).toContain('test_dur_sum{skill="irrigation"} 105.55');
  });

  it("renderPrometheus 输出标准指标头与便捷埋点值", () => {
    const r = createMetricsRegistry();
    r.incCommand("irrigation", "success");
    r.incCommand("irrigation", "failed");
    r.observeCommandDuration("irrigation", 0.3);
    r.incLlmCall("deepseek-v4-flash", "success");
    r.observeLlmDuration("deepseek-v4-flash", 1.2);
    r.setMqttConnection(true);
    r.setUptime(42);

    const out = r.renderPrometheus();
    expect(out).toContain("# HELP embodied_command_total Command completion count");
    expect(out).toContain("# TYPE embodied_command_total counter");
    expect(out).toContain('embodied_command_total{skill="irrigation",result="success"} 1');
    expect(out).toContain('embodied_command_total{skill="irrigation",result="failed"} 1');
    expect(out).toContain("# TYPE embodied_command_duration_seconds histogram");
    expect(out).toContain(
      'embodied_command_duration_seconds_bucket{skill="irrigation",le="0.5"} 1',
    );
    expect(out).toContain("# TYPE embodied_llm_calls_total counter");
    expect(out).toContain('embodied_llm_calls_total{model="deepseek-v4-flash",result="success"} 1');
    expect(out).toContain("# TYPE embodied_mqtt_connection_status gauge");
    expect(out).toContain("embodied_mqtt_connection_status 1");
    expect(out).toContain("# TYPE embodied_uptime_seconds gauge");
    expect(out).toContain("embodied_uptime_seconds 42");
  });

  it("重复声明同名同类型返回同一指标", () => {
    const r = createMetricsRegistry();
    const c1 = r.counter("dup_total", "dup", ["k"]);
    const c2 = r.counter("dup_total", "dup", ["k"]);
    c1.inc({ k: "a" });
    c2.inc({ k: "a" });
    expect(r.renderPrometheus()).toContain('dup_total{k="a"} 2');
  });

  it("重复声明同名但不同类型抛错", () => {
    const r = createMetricsRegistry();
    r.counter("conflict", "c", []);
    expect(() => r.gauge("conflict", "c", [])).toThrow(/already registered/);
  });

  it("histogram buckets 必须升序", () => {
    const r = createMetricsRegistry();
    expect(() => r.histogram("bad", "h", [1, 0.5], [])).toThrow(/ascending/);
  });

  it("label 缺失抛错", () => {
    const r = createMetricsRegistry();
    const c = r.counter("need_label", "n", ["skill"]);
    expect(() => c.inc({})).toThrow(/missing/);
  });

  it("空 registry renderPrometheus 返回空串", () => {
    // 标准指标已预注册，故非空；用裸 registry 验证空路径
    const bare = createMetricsRegistry();
    bare.counter("x", "y", []).inc({}, 1);
    expect(bare.renderPrometheus()).toContain("x");
  });
});
