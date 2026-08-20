import { adminFetch } from "./admin-fetch.js";

export type AlertRuleRow = {
  entity_id: string;
  metric: string;
  operator: string;
  value: number;
  enabled: boolean;
};

export function fetchAlertRules(): Promise<{
  deployment_id: string;
  rules: AlertRuleRow[];
  count: number;
}> {
  return adminFetch("/admin/alert-rules");
}

export type ReportScheduleRow = {
  id: string;
  deployment_id: string;
  user_id: string;
  entity_ids: string[];
  interval_minutes: number;
  enabled: boolean;
};

export function fetchReportSchedules(): Promise<{
  deployment_id: string;
  schedules: ReportScheduleRow[];
  count: number;
}> {
  return adminFetch("/admin/report-schedules");
}

export type CommandRow = {
  command_id: string;
  scene_skill_id?: string;
  execution_transport?: string;
  lifecycle_source?: "scene_node_mqtt" | "api_domain_executor";
  status: string;
  updated_at: string;
  command: {
    device_id: string;
    device_type?: string;
    action: string;
    issued_by: { user_id: string };
  };
  result?: { actual_duration_seconds?: number; reason?: string };
};

export function fetchRecentCommands(limit = 20): Promise<{
  commands: CommandRow[];
  count: number;
}> {
  return adminFetch(`/admin/commands?limit=${limit}`);
}

export type SceneOutcomeRow = {
  ts: string;
  deployment_id: string;
  scene_skill_id: string;
  command_id?: string;
  entity_id?: string;
  success: boolean;
  user_confirmed?: boolean;
  metrics: Record<string, unknown>;
};

export function fetchSceneOutcomes(opts?: {
  limit?: number;
  since_days?: number;
}): Promise<{ deployment_id: string; outcomes: SceneOutcomeRow[] }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.since_days) params.set("since_days", String(opts.since_days));
  const q = params.toString();
  return adminFetch(`/admin/scene-outcomes${q ? `?${q}` : ""}`);
}

export type PilotRoiSummary = {
  deployment_id: string;
  baseline_runs_per_week?: number;
  scene_total: number;
  scene_success_count: number;
  estimated_runs_saved: number;
  summary_text: string;
};

export function fetchPilotRoi(since_days = 7): Promise<PilotRoiSummary> {
  return adminFetch(`/admin/pilot/roi?since_days=${since_days}`);
}

export type PolicySuggestionRow = {
  id: string;
  deployment_id: string;
  kind: string;
  scene_skill_id?: string;
  status: string;
  created_at: string;
  reason: string;
};

export function fetchPolicySuggestions(): Promise<{
  deployment_id: string;
  suggestions: PolicySuggestionRow[];
}> {
  return adminFetch("/admin/policy-suggestions");
}

export function applyPolicySuggestionAdmin(
  id: string,
): Promise<{ ok: boolean; suggestion: PolicySuggestionRow }> {
  return adminFetch(`/admin/policy-suggestions/${id}/apply`, { method: "POST" });
}

export type IntentFailureRow = {
  id: string;
  utterance: string;
  failure_kind: string;
  confidence: "high" | "medium" | "low";
  promoted: boolean;
  promote_dest?: "wechat" | "golden" | "golden_without_gate" | "skipped";
  platform?: string;
  flash_skill?: string;
  pro_skill?: string;
  expected_skill?: string;
  recorded_at: string;
  promotable: boolean;
  raw_response_preview: string;
};

export function fetchIntentFailures(opts?: {
  confidence?: string;
  promoted?: boolean;
  platform?: string;
}): Promise<{ cases: IntentFailureRow[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.confidence) params.set("confidence", opts.confidence);
  if (opts?.promoted !== undefined) params.set("promoted", String(opts.promoted));
  if (opts?.platform) params.set("platform", opts.platform);
  const q = params.toString();
  return adminFetch(`/admin/intent-failures${q ? `?${q}` : ""}`);
}

export type PromoteWechatResponse = {
  ok: boolean;
  promoted: number;
  skipped: number;
  failed: number;
  sim_exit_code?: number;
  results: {
    id: string;
    utterance: string;
    status: "promoted" | "skipped" | "failed" | "dry_run";
    error?: string;
  }[];
  error?: string;
};

export type PromoteWechatJobResponse = {
  job_id: string;
  status: "running" | "completed" | "failed";
  started_at?: string;
  finished_at?: string;
  result?: PromoteWechatResponse;
};

const PROMOTE_POLL_MS = 2000;
const PROMOTE_POLL_MAX_MS = 900_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPromoteWechatJob(jobId: string): Promise<PromoteWechatJobResponse> {
  return adminFetch(`/admin/intent-failures/promote-wechat/jobs/${encodeURIComponent(jobId)}`);
}

async function waitForPromoteJob(jobId: string): Promise<PromoteWechatResponse> {
  const deadline = Date.now() + PROMOTE_POLL_MAX_MS;
  while (Date.now() < deadline) {
    const job = await fetchPromoteWechatJob(jobId);
    if (job.status !== "running") {
      if (job.result) return job.result;
      return {
        ok: false,
        promoted: 0,
        skipped: 0,
        failed: 0,
        results: [],
        error: "promote job finished without result",
      };
    }
    await sleep(PROMOTE_POLL_MS);
  }
  return {
    ok: false,
    promoted: 0,
    skipped: 0,
    failed: 0,
    results: [],
    error: "promote job timed out while waiting for sim:matrix",
  };
}

async function startPromoteWechat(path: string): Promise<PromoteWechatResponse> {
  const started = (await adminFetch(path, { method: "POST" })) as
    PromoteWechatJobResponse | PromoteWechatResponse;
  if ("job_id" in started && started.status === "running") {
    return waitForPromoteJob(started.job_id);
  }
  return started as PromoteWechatResponse;
}

export function promoteIntentFailureWechat(id: string): Promise<PromoteWechatResponse> {
  return startPromoteWechat(`/admin/intent-failures/${encodeURIComponent(id)}/promote-wechat`);
}

export function promoteAllIntentFailuresWechat(): Promise<PromoteWechatResponse> {
  return startPromoteWechat("/admin/intent-failures/promote-wechat");
}
