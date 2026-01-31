# Repository Guidelines

## Project Structure & Module Organization
- `daemon/`: core daemon services (event queue, storage, scheduler, plugins).
- `hooks/` and `hooks-push/`: Claude hook entry points and variants.
- `lib/`: shared utilities (config, logger, errors).
- `tools/`: CLI utilities for querying/stats (`SessionQuery.ts`, `SessionStats.ts`).
- `plugins/`: optional plugin implementations (e.g., `claude-openai-proxy`).
- `web/`: Web UI API handlers and static assets (`web/public/`).
- `test/` plus root `test-*.ts`/`test-daemon.sh`: ad-hoc test scripts.

## Build, Test, and Development Commands
- `bun daemon/main.ts --web --port 3000`: run the daemon with Web UI enabled.
- `bun web/server.ts`: run the Web UI server standalone.
- `bun tools/SessionQuery.ts recent 5`: query recent sessions (example).
- `bun tools/SessionStats.ts global`: show global stats (example).
- `bash test-daemon.sh`: basic daemon smoke tests.
- `bun test-plugin-load.ts`: plugin load check (similar scripts: `test-plugin-*.ts`).

## Coding Style & Naming Conventions
- TypeScript-first; use `.ts` imports with explicit extensions (see `daemon/main.ts`).
- 2-space indentation, semicolons, and conventional `camelCase` for variables.
- Files and directories use kebab-case where applicable (e.g., `daemon/health-monitor.ts`).
- No enforced linter in repo; keep formatting consistent with existing files.

## Testing Guidelines
- Tests are script-based, not a single framework runner.
- Name ad-hoc tests as `test-*.ts` or `test-*.sh` and keep them runnable with `bun`/`bash`.
- Prefer adding a small reproduction script when fixing bugs in hooks or plugins.

## Commit & Pull Request Guidelines
- Commit messages follow conventional types: `feat:`, `fix:`, `docs:`, `chore:`.
- Keep commits scoped and descriptive; include issue references when relevant (e.g., `fix: resolve issue #10`).
- PRs should include a short summary, test evidence (commands run), and any platform-specific notes (Windows/macOS/Linux).

## Configuration & Security Tips
- `daemon-config.example.json` is the template; avoid committing secrets in `daemon-config.json`.
- Hook and daemon sockets/paths are local-only; document changes in `README.md` or `DAEMON-GUIDE.md`.

## Agent Notes
- Review `CLAUDE.md` for operational constraints and storage formats before changing daemon internals.
