<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project operations (Zain B2B platform)

- **Database first.** `pnpm db:up` starts PostgreSQL (`:5434`) and MinIO
  (`:9100`); `pnpm dev` fails on content pages without them. Apply schema with
  `pnpm db:migrate`, load approved content with `pnpm db:seed`.
- **Quality gates** (run before claiming work is done): `pnpm lint`,
  `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`,
  `pnpm verify:assets`, `pnpm verify:deps`, `pnpm audit:content`, and the
  Playwright suites (`pnpm test:e2e`, `pnpm test:e2e:rtl`).
- **Never invent content.** Facts, statistics, coordinates and copy must trace
  to CMS/seed/settings. Statistics render only after a permission-gated
  approval writes the server-side register; `approved: true` in a draft is not
  enough.
- **Dependencies:** keep `pnpm-lock.yaml` in sync; the only tolerated audit
  exception is documented in `docs/ops/dependency-audit.md` and enforced by
  `pnpm verify:deps`. Do not add blanket audit ignores or dependency overrides.
- **Ops docs:** `docs/ops/production-deployment.md`,
  `docs/ops/backup-and-restore.md`, `docs/ops/security-headers.md`,
  `docs/ops/dependency-audit.md`.
- **Windows/PowerShell 5.1:** no `&&`, `rg`, `head`/`tail`, or `pwsh`; use
  `cmd1; if ($?) { cmd2 }`, `Select-String`, and `Select-Object`. Never
  round-trip UTF-8 sources through `Get-Content`/`Set-Content` (BOM/encoding
  corruption) — use the file tools.
- **Git:** do not commit, push, stage, amend, reset or rebase unless explicitly
  asked. Preserve the untracked scratch files that are intentionally kept
  (`brands-404.png`, `tests/e2e/zz-us5-debug.spec.ts`, `.vitest.cms.tmp.mts`).
