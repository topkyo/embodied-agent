# Contributing to Embodied Agent

Development and pull requests belong on **`topkyo/embodied-agent-internal`**. The public `topkyo/embodied-agent` repository is a read-only snapshot; do not open PRs there. See [`docs/operations/repos.zh.md`](docs/operations/repos.zh.md).

## Development setup

```bash
npm ci
npm run dev:greenhouse -- --no-monitor
npm run dev:status
```

## Before submitting a PR

Open pull requests only on **`topkyo/embodied-agent-internal`**. PRs on the public snapshot are closed automatically.

```bash
npm run lint
npm run test --workspaces --if-present
npm run build
```

All three must pass. `npm run lint` includes TypeScript type-checking, ESLint (`--max-warnings=0`), and a suite of structural checks (repo layout, domain pack contracts, env keys, doc sync, etc.).

## Engineering conventions

External contributors should treat **this file and [`docs/`](docs/)** as the source of truth for how to contribute. [`AGENTS.md`](AGENTS.md) is an **internal convention for AI collaborators** (lint gates, test principles, Domain Pack boundaries, CI); it is not the public contributor contract.

## Code conventions

- **No implicit fallbacks.** Missing config should fail visibly, not silently default.
- **No mock LLM in tests.** Understanding-layer tests use real LLM calls. Vitest covers only deterministic layers: routing, safety, slot-filling, auth, 503-no-key, state storage.
- **Tests need isolated `AGENT_DATA_DIR`.** Use explicit temp directories; never write to the source tree's old default data path.
- **Structured logging.** `apps/api/src` uses `createLogger(scope)` from `@embodied-agent/platform`. No bare `console.*` in API source.
- **Formatting.** Run `npm run format` on changed files only. Do not bulk-format unrelated files.

## Domain Pack contributions

A Domain Pack is a self-contained package in `scenes/{pack}/`. It must implement `createDomainPackContract()` and pass the readiness gate. See:

- [`docs/domain-pack/authoring.zh.md`](docs/domain-pack/authoring.zh.md) — skill authoring guide
- [`docs/domain-pack/delivery-kit.zh.md`](docs/domain-pack/delivery-kit.zh.md) — minimum delivery checklist

Scaffold a new pack with `npm run domain:new -- --id <id> --slug <slug> --transport mqtt|http`.

## Architecture boundaries

- **Platform** (`packages/`, `apps/api/`) owns channels, LLM runtime, routing, safety, node runtime, memory, deployment.
- **Domain Pack** (`scenes/{pack}/`) owns skills, schemas, prompts, eval, target resolution, scene runtime.
- Each deployment runs exactly one `active_domain`. Production must explicitly configure `deployment_id` and `active_domain`.
- Do not deep-import from `scenes/*` in `apps/api/` except through the loader/pack entry point.

## CI

PRs run `deterministic` + `e2e` (lint → test → coverage gates → build → Playwright). LLM-dependent gates run only on push to `main` and nightly. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for details.
