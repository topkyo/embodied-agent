import type {
  DomainPackClarificationAliasIndex,
  DomainPackClarificationMergeResult,
  DomainPackPendingClarification,
  DomainPackPendingClarificationDraft,
  DomainPackPendingClarificationPartial,
  IntentPayload,
} from "@embodied-agent/core";

const RETRY_RE = /^(重试|再来一次|重新执行|再试一次|再发一次)$/;
const NIGHT_MODE_CONTINUATION_RE = /(那就)?(开|启用|打开)?\s*夜间(通风|模式)?|开一晚上|自动通风/;
const SUPPRESS_L2_RE = /今晚别提醒|别烦我|今晚不要建议|不要推送建议|别提醒了/;

function resolveGreenhouseId(
  text: string,
  aliases: DomainPackClarificationAliasIndex,
): string | undefined {
  const t = text.trim();
  for (const [id, names] of Object.entries(aliases)) {
    for (const name of names) {
      if (t.includes(name) || t.includes(id)) return id;
    }
  }
  const m = t.match(/gh-\d{3}/i);
  return m ? m[0].toLowerCase() : undefined;
}

function parseDurationSeconds(text: string): number | undefined {
  const t = text.trim();
  const min = t.match(/(\d+)\s*分(钟|鐘)?/);
  if (min) return Number(min[1]) * 60;
  const hour = t.match(/(\d+)\s*小?时/);
  if (hour) return Number(hour[1]) * 3600;
  const sec = t.match(/(\d+)\s*秒/);
  if (sec) return Number(sec[1]);
  const plain = t.match(/^(\d{1,4})$/);
  if (plain) return Number(plain[1]);
  return undefined;
}

function openVentIntent(greenhouse_id: string, duration_seconds: number): IntentPayload {
  return {
    skill: "greenhouse.open_vent",
    target: { greenhouse_id },
    parameters: { duration_seconds },
    confidence: 0.95,
  };
}

function nightVentIntent(greenhouse_id: string, maxTemp = 30): IntentPayload {
  return {
    skill: "greenhouse.set_mode",
    target: { greenhouse_id },
    parameters: {
      mode: "night_vent",
      max_temp_c: maxTemp,
      temp_low_c: maxTemp - 2,
    },
    confidence: 0.95,
  };
}

export function tryMergeGreenhousePendingClarification(
  text: string,
  pending: DomainPackPendingClarification,
  aliases: DomainPackClarificationAliasIndex,
): DomainPackClarificationMergeResult {
  const normalized = text.trim();
  if (!normalized) return { kind: "none" };

  if (SUPPRESS_L2_RE.test(normalized)) {
    return { kind: "notification_pref", suppress_l2_tonight: true };
  }

  if (RETRY_RE.test(normalized) && pending.last_rejected_intent) {
    return { kind: "intent", intent: pending.last_rejected_intent };
  }

  if (NIGHT_MODE_CONTINUATION_RE.test(normalized) && pending.last_rejected_intent) {
    const rejectedTarget = pending.last_rejected_intent.target;
    const gh =
      ("greenhouse_id" in rejectedTarget ? rejectedTarget.greenhouse_id : undefined) ??
      pending.partial.greenhouse_id ??
      resolveGreenhouseId(normalized, aliases);
    if (typeof gh === "string") {
      return { kind: "intent", intent: nightVentIntent(gh) };
    }
  }

  const ghFromText = resolveGreenhouseId(normalized, aliases);
  const durationFromText = parseDurationSeconds(normalized);

  if (durationFromText && pending.last_rejected_intent) {
    const rejected = pending.last_rejected_intent;
    if (rejected.skill === "greenhouse.open_vent" || rejected.skill === "greenhouse.close_vent") {
      const gh =
        ghFromText ??
        ("greenhouse_id" in rejected.target ? rejected.target.greenhouse_id : undefined) ??
        pending.partial.greenhouse_id;
      if (typeof gh === "string") {
        return {
          kind: "intent",
          intent: {
            skill: rejected.skill,
            target: { greenhouse_id: gh },
            parameters: { duration_seconds: durationFromText },
            confidence: 0.92,
          },
        };
      }
    }
    if (rejected.skill === "fan.start") {
      const gh =
        ghFromText ??
        (typeof pending.partial.greenhouse_id === "string"
          ? pending.partial.greenhouse_id
          : undefined) ??
        ("fan_id" in rejected.target && typeof rejected.target.fan_id === "string"
          ? rejected.target.fan_id.match(/fan-(gh-\d{3})/)?.[1]
          : undefined);
      const fan_id =
        ("fan_id" in rejected.target ? rejected.target.fan_id : undefined) ??
        pending.partial.fan_id ??
        (gh ? `fan-${gh}-01` : undefined);
      if (typeof fan_id === "string") {
        return {
          kind: "intent",
          intent: {
            skill: "fan.start",
            target: { fan_id },
            parameters: { duration_seconds: durationFromText },
            confidence: 0.92,
          },
        };
      }
    }
    if (rejected.skill === "irrigation.start") {
      const gh =
        ghFromText ??
        ("greenhouse_id" in rejected.target ? rejected.target.greenhouse_id : undefined) ??
        pending.partial.greenhouse_id;
      const zone =
        "zone_id" in rejected.target && rejected.target.zone_id
          ? rejected.target.zone_id
          : undefined;
      if (typeof zone === "string") {
        return {
          kind: "intent",
          intent: {
            skill: "irrigation.start",
            target: {
              zone_id: zone,
              ...(typeof gh === "string" ? { greenhouse_id: gh } : {}),
            },
            parameters: { duration_seconds: durationFromText },
            confidence: 0.92,
          },
        };
      }
    }
  }

  const gh =
    ghFromText ??
    (typeof pending.partial.greenhouse_id === "string" ? pending.partial.greenhouse_id : undefined);
  const duration =
    durationFromText ??
    (typeof pending.partial.duration_seconds === "number"
      ? pending.partial.duration_seconds
      : undefined);

  if (
    pending.expected_skill === "greenhouse.open_vent" ||
    pending.expected_skill === "greenhouse.close_vent"
  ) {
    const skill = pending.expected_skill;
    if (gh && duration) {
      return {
        kind: "intent",
        intent: {
          skill,
          target: { greenhouse_id: gh },
          parameters: { duration_seconds: duration },
          confidence: 0.9,
        },
      };
    }
  }

  if (pending.expected_skill === "fan.start" && gh && duration) {
    return {
      kind: "intent",
      intent: {
        skill: "fan.start",
        target: { fan_id: `fan-${gh}-01` },
        parameters: { duration_seconds: duration },
        confidence: 0.9,
      },
    };
  }

  if (
    (pending.missing_slots.includes("greenhouse_id") ||
      pending.missing_slots.includes("duration_seconds")) &&
    gh &&
    duration
  ) {
    return { kind: "intent", intent: openVentIntent(gh, duration) };
  }

  return { kind: "none" };
}

export function inferGreenhouseClarificationFromIntent(
  intent: IntentPayload,
  hint?: string,
): DomainPackPendingClarificationDraft | null {
  const target = intent.target as { greenhouse_id?: string; fan_id?: string };
  const params = intent.parameters as { duration_seconds?: number };
  if (intent.skill === "greenhouse.open_vent" || intent.skill === "greenhouse.close_vent") {
    const gh = target.greenhouse_id;
    const dur = params.duration_seconds;
    const missing: string[] = [];
    if (!gh) missing.push("greenhouse_id");
    if (!dur) missing.push("duration_seconds");
    if (missing.length === 0) return null;
    return {
      expected_skill: intent.skill,
      missing_slots: missing,
      partial: { greenhouse_id: gh, duration_seconds: dur },
      last_hint: hint,
    };
  }
  return null;
}

export function greenhouseClarificationPartialFromIntent(
  intent: IntentPayload,
): DomainPackPendingClarificationPartial {
  const target = intent.target as { greenhouse_id?: string; fan_id?: string };
  const params = intent.parameters as { duration_seconds?: number };
  const partial: DomainPackPendingClarificationPartial = {};
  if ("greenhouse_id" in target && target.greenhouse_id) {
    partial.greenhouse_id = target.greenhouse_id;
  }
  if ("fan_id" in target && target.fan_id) {
    partial.fan_id = target.fan_id;
  }
  if (intent.skill === "greenhouse.open_vent" || intent.skill === "greenhouse.close_vent") {
    const dur = params.duration_seconds;
    if (dur) partial.duration_seconds = dur;
  }
  if (intent.skill === "fan.start" && params.duration_seconds) {
    partial.duration_seconds = params.duration_seconds;
  }
  if (intent.skill === "irrigation.start" && params.duration_seconds) {
    partial.duration_seconds = params.duration_seconds;
  }
  return partial;
}
