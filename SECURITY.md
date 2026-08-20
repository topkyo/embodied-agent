# Security Policy

## Safety model

Embodied Agent controls physical devices. The safety chain is **fail-closed**: if any check is missing, inconclusive, or fails, the system refuses to execute the command.

The chain runs in order — a failure at any step stops execution:

1. **Role check** — principal must have permission
2. **Device state check** — device must be in an operable state
3. **Domain policy** — Domain Pack safety rules (e.g., temperature thresholds)
4. **Interlock** — physical interlock conditions must be satisfied
5. **Duration confirmation** — long-running commands require explicit confirmation

## Node token security

Scene Node tokens are AES-256-GCM encrypted at rest. Production deployments must explicitly configure `deployment_id` and `active_domain`. Missing tokens or config cause visible failures, not silent fallbacks.

## Reporting a vulnerability

If you discover a security vulnerability, please **do not open a public issue**. Instead, email [topkyoxp@gmail.com](mailto:topkyoxp@gmail.com). Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact (especially if it affects physical device safety)
- Suggested fix if any

## Production hardening

- Set `deployment_id` and `active_domain` explicitly in `settings.json`
- Configure `EVAL_EVIDENCE_SECRET` for signed eval evidence
- Restrict `METRICS_ALLOW_PUBLIC` to network-isolated or CI environments only
- See [`docs/operations/safety-checklist.zh.md`](docs/operations/safety-checklist.zh.md) for the full checklist
