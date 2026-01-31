# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Daemon is a background service system that automatically records, analyzes, and monitors Claude Code sessions. It uses a daemon architecture where lightweight hooks push session data via Unix Socket to a persistent background process that handles storage, analysis, and maintenance.

**Key Architecture**: Hook → Unix Socket → Daemon (Event Queue → Analyzer → Storage) → JSONL/JSON files

## Development Commands

### Running the Daemon

```bash
# Start daemon directly (development)
bun daemon/main.ts

# Start daemon with Web UI
bun daemon/main.ts --enable-web-ui

# Start Web UI separately
bun web/server.ts

# Test daemon functionality
./test-daemon.sh
```

### Installation & Setup

```bash
# Install on Linux/macOS
./install.sh

# Install on Windows
powershell -ExecutionPolicy Bypass -File install-windows-final.ps1

# Install daemon mode (legacy)
./install-daemon.sh
```

### Testing Hooks

```bash
# Test session recorder hook
echo '{"session_id":"test-123","claude_version":"2.0"}' | bun hooks-push/SessionRecorder.hook.ts

# Test tool capture hook
echo '{"session_id":"test-123","tool_name":"Read","success":true}' | bun hooks-push/SessionToolCapture.hook.ts

# Test session analyzer hook
echo '{"session_id":"test-123"}' | bun hooks-push/SessionAnalyzer.hook.ts
```

### Querying Sessions

```bash
# Query recent sessions (requires tools to be installed)
bun tools/SessionQuery.ts recent 10

# Query by type
bun tools/SessionQuery.ts type coding

# Get statistics
bun tools/SessionStats.ts
```

## Architecture Deep Dive

### Data Flow

1. **Hook Execution**: Claude Code triggers hooks at session lifecycle events (start, tool use, end)
2. **Push to Daemon**: Hooks connect to `/tmp/claude-daemon.sock` and push JSON events
3. **Event Queue**: Daemon receives events and queues them for sequential processing
4. **Session Analyzer**: Tracks active sessions, accumulates tool usage, classifies session type
5. **Storage Service**: Writes raw events to JSONL, generates summaries as JSON
6. **Indexing**: Creates indexes by type, directory, and hostname for fast queries
7. **Scheduled Tasks**: Health checks (5min), cleanup (daily), session monitoring (1min)

### Critical Components

**daemon/main.ts** - Orchestrates all services, sets up event handlers, manages lifecycle
- Connects HookServer events to EventQueue
- EventQueue events trigger SessionAnalyzer and StorageService
- Registers scheduled tasks with Scheduler
- Handles graceful shutdown (SIGTERM/SIGINT)

**daemon/hook-server.ts** - Unix Socket server listening on `/tmp/claude-daemon.sock`
- Receives newline-delimited JSON from hooks
- Emits typed events: `session_start`, `tool_use`, `session_end`
- Non-blocking, handles multiple concurrent connections

**daemon/event-queue.ts** - Ensures sequential event processing
- Prevents race conditions when multiple hooks fire simultaneously
- FIFO queue with configurable max size
- Emits events after dequeuing for processing

**daemon/session-analyzer.ts** - Real-time session tracking and classification
- Maintains map of active sessions with accumulated data
- Classifies sessions based on tool usage patterns:
  - `coding`: Edit/Write > 40%
  - `debugging`: Has test commands + Read > Edit
  - `research`: Grep/Glob > 30%
  - `writing`: Markdown edits > 50%
  - `git`: Git commands > 50%
- Generates summary on session end with tool stats, files modified, duration

**daemon/storage-service.ts** - Unified data persistence layer
- Raw events: `~/.claude/SESSIONS/raw/YYYY-MM/session-{id}.jsonl`
- Summaries: `~/.claude/SESSIONS/analysis/summaries/YYYY-MM/summary-{id}.json`
- Indexes: `~/.claude/SESSIONS/analysis/by-type/{type}/sessions.json`
- Directory indexes: `~/.claude/SESSIONS/analysis/by-directory/{hash}/sessions.json`

**lib/config.ts** - Centralized configuration management
- Loads from environment variables, config file (`~/.claude/session-config.json`), and defaults
- Environment variables take precedence over config file
- Provides path helpers for all storage locations

### Hook System

Hooks are lightweight TypeScript scripts executed by Claude Code at specific lifecycle points. They must:
- Read JSON from stdin
- Complete within timeout (default 10s)
- Output `{"continue": true}` to allow session to proceed
- Use `#!/usr/bin/env bun` shebang

**Push Mode Hooks** (hooks-push/):
- Connect to daemon socket with 2s timeout
- Fall back to file mode if daemon unavailable
- Non-blocking to avoid delaying Claude Code

**Fallback Behavior**: If daemon is not running, hooks write directly to JSONL files (degraded mode)

### Web UI Architecture

**web/server.ts** - Bun.serve-based HTTP + WebSocket server
- RESTful API endpoints under `/api/`
- Static file serving from `web/public/`
- WebSocket at `/ws` for real-time session updates
- Daemon broadcasts new session summaries to all connected clients

**API Endpoints**:
- `GET /api/sessions/recent?limit=N` - Recent sessions
- `GET /api/sessions/by-type?type=coding` - Filter by type
- `GET /api/sessions/by-directory?directory=/path` - Filter by directory
- `GET /api/sessions/{id}` - Single session details
- `GET /api/stats/global` - Global statistics
- `GET /api/stats/types` - Type distribution
- `GET /api/stats/timeline?days=30` - Time series data

### Storage Format

**JSONL (raw events)**: One JSON object per line, append-only
```json
{"event_type":"session_start","session_id":"abc","timestamp":"2026-01-31T...","data":{...}}
{"event_type":"tool_use","session_id":"abc","timestamp":"2026-01-31T...","data":{...}}
{"event_type":"session_end","session_id":"abc","timestamp":"2026-01-31T...","data":{...}}
```

**JSON (summaries)**: Complete session analysis
```json
{
  "session_id": "abc",
  "session_type": "coding",
  "duration_seconds": 120,
  "total_tools": 15,
  "success_rate": 0.93,
  "tool_usage": {"Edit": 5, "Read": 8, "Bash": 2},
  "files_modified": ["src/main.ts", "README.md"],
  "working_directory": "/path/to/project",
  "git_repo": "my-repo",
  "git_branch": "main"
}
```

## Important Patterns

### Error Handling
- Use custom error classes from `lib/errors.ts`: `FileSystemError`, `ValidationError`, `TimeoutError`
- Hooks must never throw - catch all errors and log them
- Daemon logs errors but continues running (resilient design)

### Logging
- Use `createHookLogger(component)` from `lib/logger.ts`
- Log levels: DEBUG, INFO, WARN, ERROR, SILENT
- Set via `SESSION_LOG_LEVEL` environment variable
- Daemon logs to `~/.claude/daemon.log`

### Configuration
- Always use `config.get()` or `config.getPath()` from `lib/config.ts`
- Never hardcode paths like `~/.claude` - use config helpers
- Support environment variable overrides for all settings

### Concurrency
- Event queue ensures sequential processing - no locks needed in handlers
- Storage operations are synchronous (appendFileSync, writeFileSync) for atomicity
- Scheduler tasks run independently but should be idempotent

### Security
- All directories created with mode 0o700 (owner-only access)
- All files created with mode 0o600 (owner-only read/write)
- Web UI binds to 127.0.0.1 only (no external access)
- No authentication - relies on filesystem permissions

## Platform Differences

### IPC Mechanism
- **Linux/macOS**: Unix domain socket at `/tmp/claude-daemon.sock`
- **Windows**: TCP socket on `127.0.0.1:39281` (localhost only)
  - Note: Bun v1.3.5 has a critical bug with Windows named pipes that causes crashes
  - TCP socket workaround provides equivalent functionality with negligible performance impact (<0.2ms latency)
  - Port 39281 chosen as "CLAUDE" on phone keypad
  - Security: Bound to localhost only, same security model as Web UI

### Installation Scripts
- `install.sh` - Linux/macOS with systemd/launchd integration
- `install-windows-final.ps1` - Windows with Task Scheduler
- Both set up hooks in `~/.claude/hooks/` and configure Claude Code settings

### Line Endings
- `.gitattributes` ensures shell scripts use LF (required for bash)
- PowerShell scripts use CRLF (Windows native)

## Configuration Files

### ~/.claude/session-config.json
Optional configuration file for customizing behavior:
```json
{
  "maxOutputLength": 5000,
  "hookTimeout": 10000,
  "gitTimeout": 3000,
  "logLevel": "INFO",
  "classificationThresholds": {
    "coding": 0.4,
    "debugging": 0.0,
    "research": 0.3,
    "writing": 0.5,
    "git": 0.5
  }
}
```

### Environment Variables
- `PAI_DIR` - Base directory (default: `~/.claude`)
- `SESSION_LOG_LEVEL` - Logging verbosity
- `MAX_OUTPUT_LENGTH` - Truncate tool outputs
- `HOOK_TIMEOUT` - Hook execution timeout (ms)
- `GIT_TIMEOUT` - Git command timeout (ms)
- `WEB_PORT` - Web UI port (default: 3001)
- `WEB_HOST` - Web UI bind address (default: 127.0.0.1)
- `DAEMON_SOCKET` - Override IPC path (auto-detected by platform)

## Troubleshooting

### Daemon Not Receiving Events

**Linux/macOS:**
1. Check if daemon is running: `ps aux | grep daemon/main.ts`
2. Check socket exists: `ls -la /tmp/claude-daemon.sock`
3. Test socket: `echo '{"test":true}' | nc -U /tmp/claude-daemon.sock`
4. Check daemon logs: `tail -f ~/.claude/daemon.log`

**Windows:**
1. Check if daemon is running: `tasklist | findstr bun`
2. Check TCP port is listening: `netstat -ano | findstr 39281`
3. Test connection: `Test-NetConnection -ComputerName 127.0.0.1 -Port 39281` (PowerShell)
4. Check daemon logs: `Get-Content -Tail 50 -Wait $env:USERPROFILE\.claude\daemon.log` (PowerShell)

**Common Issues:**
- Port 39281 conflict (Windows): Another process using the port - check with `netstat -ano | findstr 39281`
- Firewall blocking localhost (rare): Add exception for port 39281
- Hooks falling back to file mode: Daemon not running or IPC connection failing

### Hooks Not Executing
1. Verify hooks are installed: `ls -la ~/.claude/hooks/`
2. Check Claude Code settings: `cat ~/.claude/settings.json`
3. Test hook manually: `echo '{"session_id":"test"}' | bun ~/.claude/hooks/SessionRecorder.hook.ts`
4. Check hook permissions: Should be 700 (rwx------)

### Data Not Appearing
1. Check directory structure: `ls -R ~/.claude/SESSIONS/`
2. Verify recent JSONL files: `ls -lt ~/.claude/SESSIONS/raw/$(date +%Y-%m)/ | head`
3. Check for errors in daemon log
4. Ensure sufficient disk space: `df -h ~/.claude`

## Development Workflow

### Adding a New Hook
1. Create hook file in `hooks-push/` with `#!/usr/bin/env bun` shebang
2. Read stdin, parse JSON event
3. Connect to daemon socket, send event with newline
4. Handle timeout and fallback to file mode
5. Output `{"continue": true}` to stdout
6. Update install scripts to copy new hook

### Adding a New Scheduled Task
1. Open `daemon/main.ts`
2. Add task in `setupScheduledTasks()` method:
   ```typescript
   this.scheduler.register({
     name: 'my-task',
     interval: 60 * 1000, // 1 minute
     enabled: true,
     handler: async () => {
       // Task logic
     },
   });
   ```

### Adding a New API Endpoint
1. Create handler in `web/api/` directory
2. Import and instantiate in `web/server.ts`
3. Add route handling in `handleAPIRequest()` method
4. Update Web UI frontend if needed

### Modifying Session Classification
1. Edit `daemon/session-analyzer.ts`
2. Update `classifySession()` method logic
3. Adjust thresholds in `lib/config.ts` defaults
4. Document new classification rules in README

## NPM Package

This project is published as `@jhihjian/claude-daemon` on npm. The package includes:
- Installation scripts for all platforms
- Hooks and shared libraries
- CLI entry point: `bin/cli.js`
- Post-install message with usage instructions

Users install via: `npx @jhihjian/claude-daemon install`
