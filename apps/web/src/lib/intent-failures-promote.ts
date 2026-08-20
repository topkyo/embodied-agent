import { AdminFetchError } from "../api";
import type { PromoteWechatResponse } from "../api";

export function formatPromoteFeedback(
  res: PromoteWechatResponse,
  t: (key: string) => string,
): { msg: string | null; err: string | null } {
  if (!res.ok || res.failed > 0) {
    const parts: string[] = [];
    if (res.error) parts.push(res.error);
    if (res.failed > 0) {
      parts.push(t("settings.intentFailures.result.failed").replace("{n}", String(res.failed)));
    }
    const detail = res.results
      ?.filter((r) => r.status === "failed" && r.error)
      .map((r) => r.error)
      .join(", ");
    if (detail) parts.push(detail);
    if (res.sim_exit_code != null) parts.push(`sim exit ${res.sim_exit_code}`);
    return { msg: null, err: parts.join(" — ") || "promote failed" };
  }
  if (res.promoted > 0) {
    return {
      msg: t("settings.intentFailures.result.promoted").replace("{n}", String(res.promoted)),
      err: null,
    };
  }
  if (res.skipped > 0) {
    return {
      msg: t("settings.intentFailures.result.skipped").replace("{n}", String(res.skipped)),
      err: null,
    };
  }
  return { msg: t("settings.intentFailures.result.none"), err: null };
}

export function promoteErrorMessage(e: unknown): string {
  if (e instanceof AdminFetchError) {
    const body = e.body as PromoteWechatResponse;
    const parts = [e.message];
    if (body.failed > 0) parts.push(`${body.failed} failed`);
    if (body.sim_exit_code != null) parts.push(`sim exit ${body.sim_exit_code}`);
    const detail = body.results
      ?.filter((r) => r.status === "failed" && r.error)
      .map((r) => r.error)
      .join(", ");
    if (detail) parts.push(detail);
    return parts.join(" — ");
  }
  return e instanceof Error ? e.message : String(e);
}
