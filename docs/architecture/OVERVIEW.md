# Architecture Overview

Claude Daemon is a background service system that automatically records, analyzes, and monitors Claude Code sessions using a daemon architecture with lightweight hooks, Unix Socket IPC, and persistent storage.

## System Architecture

The system follows a push-based event-driven architecture:

```
Claude Code → Hooks → Unix Socket → Daemon → Storage
                         ↓
                    Event Queue → Session Analyzer → JSONL/JSON Files
```

### Core Data Flow

1. **Hook Execution**: Claude Code triggers hooks at session lifecycle events (start, tool use, end)
2. **Push to Daemon**: Hooks connect to Unix Socket and push JSON events
3. **Event Queue**: Daemon receives events and queues them for sequential processing
4. **Session Analyzer**: Tracks active sessions, accumulates tool usage, classifies session type
5. **Storage Service**: Writes raw events to JSONL, generates summaries as JSON
6. **Indexing**: Creates indexes by type, directory, and hostname for fast queries
7. **Scheduled Tasks**: Health checks (5min), cleanup (daily), session monitoring (1min)

## Core Components

### Daemon Services

**daemon/main.ts** - Orchestrates all services, sets up event handlers, manages lifecycle. Connects HookServer events to EventQueue, which triggers SessionAnalyzer and StorageService. Registers scheduled tasks with Scheduler and handles graceful shutdown (SIGTERM/SIGINT).

**daemon/hook-server.ts** - Unix Socket server listening on `/tmp/claude-daemon.sock` (Linux/macOS) or TCP socket on `127.0.0.1:39281` (Windows). Receives newline-delimited JSON from hooks, emits typed events (`session_start`, `tool_use`, `session_end`), handles multiple concurrent connections non-blocking.

**daemon/event-queue.ts** - Ensures sequential event processing to prevent race conditions when multiple hooks fire simultaneously. FIFO queue with configurable max size, emits events after dequeuing for processing.

**daemon/session-analyzer.ts** - Real-time session tracking and classification. Maintains map of active sessions with accumulated data. Classifies sessions based on tool usage patterns: `coding` (Edit/Write > 40%), `debugging` (test commands + Read > Edit), `research` (Grep/Glob > 30%), `writing` (Markdown edits > 50%), `git` (Git commands > 50%). Generates summary on session end with tool stats, files modified, and duration.

**daemon/storage-service.ts** - Unified data persistence layer. Stores raw events as JSONL (`~/.claude/SESSIONS/raw/YYYY-MM/session-{id}.jsonl`), summaries as JSON (`~/.claude/SESSIONS/analysis/summaries/YYYY-MM/summary-{id}.json`), and creates indexes by type and directory.

**daemon/scheduler.ts** - Task scheduling system for periodic maintenance operations. Runs health checks, cleanup tasks, and session monitoring at configured intervals.

**daemon/health-monitor.ts** - Monitors system health including directory structure, storage usage, hook configuration, and index integrity.

**daemon/cleanup-service.ts** - Automated data cleanup service that removes old sessions (default 90 days) and manages storage limits (default 5GB).

### Hook System

Hooks are lightweight TypeScript scripts executed by Claude Code at specific lifecycle points. They must read JSON from stdin, complete within timeout (default 10s), output `{"continue": true}` to allow session to proceed, and use `#!/usr/bin/env bun` shebang.

**Push Mode Hooks** (hooks-push/):
- **SessionRecorder.hook.ts** - Captures session start events with metadata
- **SessionToolCapture.hook.ts** - Records tool invocations and results
- **SessionAnalyzer.hook.ts** - Triggers session analysis on completion

Hooks connect to daemon socket with 2s timeout and fall back to file mode if daemon unavailable, ensuring non-blocking operation to avoid delaying Claude Code.

### Storage Layer

**JSONL Format** (raw events): One JSON object per line, append-only. Contains event_type, session_id, timestamp, and data fields.

**JSON Format** (summaries): Complete session analysis including session_id, session_type, duration_seconds, total_tools, success_rate, tool_usage breakdown, files_modified array, working_directory, git_repo, and git_branch.

**Indexes**: JSON files organized by type (`by-type/{type}/sessions.json`) and directory (`by-directory/{hash}/sessions.json`) for fast queries.

## Platform Differences

### IPC Mechanism

**Linux/macOS**: Unix domain socket at `/tmp/claude-daemon.sock` for high-performance local IPC.

**Windows**: TCP socket on `127.0.0.1:39281` (localhost only). Bun v1.3.5 has a critical bug with Windows named pipes causing crashes. TCP socket provides equivalent functionality with negligible performance impact (<0.2ms latency). Port 39281 chosen as "CLAUDE" on phone keypad. Security maintained by binding to localhost only.

### Installation

**install.sh** - Linux/macOS with systemd/launchd integration for automatic daemon startup.

**install-windows-final.ps1** - Windows with Task Scheduler integration.

Both scripts set up hooks in `~/.claude/hooks/` and configure Claude Code settings.

## Web UI Architecture

**web/server.ts** - Bun.serve-based HTTP + WebSocket server providing RESTful API endpoints under `/api/`, static file serving from `web/public/`, and WebSocket at `/ws` for real-time session updates. Daemon broadcasts new session summaries to all connected clients.

**API Endpoints**: Recent sessions, filter by type/directory, single session details, global statistics, type distribution, and timeline data.

## Configuration Management

**lib/config.ts** - Centralized configuration loading from environment variables, config file (`~/.claude/session-config.json`), and defaults. Environment variables take precedence. Provides path helpers for all storage locations.

**lib/logger.ts** - Structured logging system with levels (DEBUG, INFO, WARN, ERROR, SILENT) controlled via `SESSION_LOG_LEVEL` environment variable.

**lib/errors.ts** - Custom error classes (`FileSystemError`, `ValidationError`, `TimeoutError`) for consistent error handling.

## Key Design Patterns

### Concurrency Safety

Event queue ensures sequential processing - no locks needed in handlers. Storage operations use synchronous methods (appendFileSync, writeFileSync) for atomicity. Scheduler tasks run independently but are idempotent.

### Error Handling

Hooks never throw - catch all errors and log them. Daemon logs errors but continues running (resilient design). Custom error classes provide structured error information.

### Security

All directories created with mode 0o700 (owner-only access). All files created with mode 0o600 (owner-only read/write). Web UI binds to 127.0.0.1 only (no external access). No authentication - relies on filesystem permissions.

### Fallback Behavior

If daemon is not running, hooks automatically write directly to JSONL files (degraded mode), ensuring session data is never lost even if the daemon crashes or is unavailable.

## Extension Points

The system supports plugins through a plugin architecture in the `plugins/` directory. Plugins can extend daemon functionality, add new API endpoints, or integrate with external services. The modular design allows independent development and deployment of extensions without modifying core daemon code.
