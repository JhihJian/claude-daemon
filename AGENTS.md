# Repository Guidelines

## Project Structure & Module Organization
- `daemon/`: core Bun-based daemon (hooks ingestion, queueing, storage, scheduling).
- `hooks/` and `hooks-push/`: hook scripts invoked by Claude Code; produce JSON events.
- `lib/`: shared utilities (config, logging, error helpers).
- `tools/`: CLI query utilities (session search/stats).
- `web/`: Web UI server (`web/server.ts`) + static assets under `web/public/`.
- `bin/`: CLI entrypoints (e.g., `bin/claude-daemon`, `bin/claude-daemon.sh`).
- `systemd/` and `launchd/`: service definitions for Linux/macOS.
- Root scripts: `install.sh`, `install-daemon.sh`, Windows install scripts.

## Build, Test, and Development Commands
This repo is Bun-first (TypeScript executed directly by Bun). Common commands:
- `./install-daemon.sh`: install runtime, hooks, and system service.
- `claude-daemon start|stop|restart|status`: manage the daemon after install.
- `claude-daemon start --web-ui`: start daemon with Web UI enabled.
- `bun web/server.ts`: run the Web UI server standalone (default `http://127.0.0.1:3000`).
- `bun tools/SessionQuery.ts recent 10`: list recent sessions.

## Coding Style & Naming Conventions
- TypeScript with Bun shebangs (`#!/usr/bin/env bun`).
- 2-space indentation; keep files ASCII-only unless necessary.
- Use explicit `.ts` extensions in imports (see `daemon/main.ts`).
- Filenames: kebab-case for modules, PascalCase for hook files.
- Classes: PascalCase; functions/vars: camelCase.

## Testing Guidelines
- No automated test runner configured; use `./test-daemon.sh` for smoke checks.
- Manual validation: start daemon, trigger a session, then query with `bun tools/SessionQuery.ts recent 1`.
- If adding new features, extend `test-daemon.sh` or add focused scripts under `tools/`.

## Commit & Pull Request Guidelines
- Commit history follows Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`.
- Keep commits small and scoped; prefer one logical change per commit.
- PRs should include: clear description, tested commands run, and screenshots for Web UI changes.
- Link issues when applicable.

## Security & Configuration Tips
- Session data lives under `~/.claude/SESSIONS` by default; treat as sensitive.
- Web UI is intended for localhost; use `WEB_HOST=127.0.0.1` and avoid exposing `0.0.0.0`.
- Useful env vars: `WEB_PORT`, `WEB_HOST`, `PAI_DIR`.
