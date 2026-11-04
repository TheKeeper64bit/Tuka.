# Judge audit — November 4, 2026

## Scope

This audit covers the protected `codex/meta-hackathon` submission. It did not modify the original checkout, deploy a Worker, merge a branch, or make a paid model request.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| `bash scripts/setup-judges.sh test` in an isolated checkout | PASS | Locked `npm ci`, the complete `npm test` command, and `npm run build:meta` all completed under Node 24.22.1. The three Node test groups reported 100 + 64 + 34 = 198 passing tests and zero failures; standalone regression checks also passed. The protected build produced 65 assets. |
| Original repository at pinned pre-hack commit | PASS | `/home/rand0m/Desktop/RaNd0m/Tuka-work-source` is clean at `57e29934a14b5dd19c303e6e927e735176284048` (`Update Site source`, October 8, 2026). |
| Reconstruction baseline | PASS with documented scope | The submission head has the pinned commit as an ancestor. The working tree is intentionally different because the hackathon features extend the original app; it is not an identical-tree claim. |
| Secrets excluded | PASS | `.env` and `.dev.vars` are ignored and not tracked; no sibling checkout is a submodule or tracked directory. |
| Local essential functionality | PASS | `npm run dev:meta` builds successfully and starts Wrangler; an unauthenticated request returns the expected redirect to `/login`. Automated checks cover login, city startup and switching, stops/routes, journey planning, offline behavior, saved state, GTFS import, ticket UI, news, Meta boundaries and the protected build. |
| Live Meta integration | PARTIAL / credential-gated | Tests verify provider contracts and fail closed without credentials. A real live model request was not made during this audit, so no secret was read or exposed and no paid request was incurred. |

## Boundaries

The clean setup uses `git archive HEAD`, so it cannot accidentally pass because of uncommitted files or an existing `node_modules`. It intentionally does not copy local credentials. A live model round trip and live external transit freshness remain deployment/environment checks, not claims established by the local test suite. Local Wrangler startup required upgrading the locked Wrangler dependency from 4.148.0 to 4.157.0 because the older bundled workerd did not recognize the configured `2026-10-28` compatibility date; the production compatibility date was left unchanged.
