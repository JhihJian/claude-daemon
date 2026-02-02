# Session Launcher Design

**Date:** 2026-02-02
**Status:** Design Complete
**Author:** Design collaboration with user

## Overview

This design adds a CLI entry point for launching configured agents as isolated sessions. Each agent can be instantiated multiple times as separate sessions, each with its own workspace directory, environment variables, and launch script.

**Key Concepts:**
- **Agent Definition**: Template configuration stored in `agent-configs/` (CLAUDE.md, config.json, .env)
- **Session**: Instantiated agent with dedicated workspace and launch script
- **Session Lifecycle**: create → use → close → re-enter → delete
- **Environment Isolation**: Each session has isolated environment variables (proxy, API settings)

## Architecture Overview

### Directory Structure

```
~/.claude/
  sessions/
    scripts/          # Launch scripts for all sessions
      agent1-20260202-143022.sh
      my-custom-session.sh
    metadata/         # Session metadata (JSON)
      agent1-20260202-143022.json
      my-custom-session.json

/path/to/workspaces/  # User-specified workspace root
  agent1-20260202-143022/  # Session workspace
    .claude/
      CLAUDE.md       # Agent's instructions
      config.json     # Agent config
      .env            # Session-specific environment
    # User's work files here
```

### Session Lifecycle

1. **Create**: `claude-daemon launch --agent coding-assistant`
   - Creates workspace directory
   - Copies agent config files to workspace/.claude/
   - Generates launch script in ~/.claude/sessions/scripts/
   - Stores metadata in ~/.claude/sessions/metadata/
   - Launches Claude Code CLI in the workspace

2. **Re-enter**: `claude-daemon resume my-project` or run launch script directly
   - Reads metadata to find workspace path
   - Sets environment variables from .env
   - Launches Claude Code CLI in existing workspace

3. **List**: `claude-daemon sessions list`
   - Shows all active sessions with status
   - Displays agent name, workspace path, created time

4. **Delete**: `claude-daemon sessions delete my-project`
   - Removes launch script and metadata
   - Optionally deletes workspace directory (with confirmation)

## CLI Commands

### Command Structure

```bash
claude-daemon launch [options]           # Create and launch new session
claude-daemon resume <session-name>      # Re-enter existing session
claude-daemon sessions list              # List all sessions
claude-daemon sessions delete <name>     # Delete session
claude-daemon sessions info <name>       # Show session details
```

### Launch Command

**Options:**
```bash
# Launch by agent (creates new directory)
claude-daemon launch --agent coding-assistant
claude-daemon launch --agent coding-assistant --session custom-name

# Launch with custom session name (creates new directory)
claude-daemon launch --session my-project --agent coding-assistant

# Launch from existing directory (no agent needed)
claude-daemon launch --dir /path/to/existing/project

# Environment variables (optional, per-session)
claude-daemon launch --agent coding-assistant \
  --http-proxy http://proxy:8080 \
  --https-proxy https://proxy:8080 \
  --api-url https://api.anthropic.com \
  --api-token sk-ant-xxx

# Workspace root (where session directories are created)
claude-daemon launch --agent coding-assistant --workspace-root ~/projects
```

**Validation Rules:**
- Cannot specify both `--agent` and `--dir` (mutually exclusive)
- If `--dir` is specified, it must exist
- If `--agent` is specified, agent must exist in agent-configs/
- Session names must be unique (no duplicates)
- Session names must be valid directory names (alphanumeric, hyphens, underscores only)

**Environment Variable Handling:**
- Stored in workspace/.claude/.env (session-specific)
- Only applied when launching that specific session
- Never affect global environment or other sessions
- Supported variables: `http_proxy`, `https_proxy`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`

### Resume Command

```bash
claude-daemon resume <session-name>
```

**Behavior:**
- Locates session metadata
- Validates workspace still exists
- Updates lastAccessedAt timestamp
- Launches Claude Code CLI with session environment

**Alternative:** Users can run launch scripts directly:
```bash
~/.claude/sessions/scripts/my-project.sh      # Unix
~/.claude/sessions/scripts/my-project.ps1     # Windows
```

### List Command

```bash
claude-daemon sessions list [options]
```

**Output format:**
```
Active Sessions:

NAME                          AGENT              STATUS    WORKSPACE                           LAST ACCESSED
coding-assistant-20260202     coding-assistant   stopped   ~/workspaces/coding-assistant-...   2 hours ago
my-project                    research-agent     stopped   ~/workspaces/my-project             5 minutes ago
debug-session                 debugging-agent    stopped   ~/workspaces/debug-session          3 days ago

Total: 3 sessions
```

**Options:**
```bash
--agent <name>     # Filter by agent
--recent           # Show only recently accessed (last 7 days)
--full             # Show full paths (no truncation)
```

### Delete Command

```bash
claude-daemon sessions delete <session-name> [options]
```

**Interactive workflow:**
```
Deleting session: my-project
  Agent: coding-assistant
  Workspace: ~/workspaces/my-project

⚠️  This will remove:
  - Launch script: ~/.claude/sessions/scripts/my-project.sh
  - Metadata: ~/.claude/sessions/metadata/my-project.json

Delete workspace directory? [y/N]: n

✓ Session deleted (workspace preserved)
```

**Options:**
```bash
--with-workspace   # Delete workspace directory
--force            # Skip confirmation prompts
--agent <name>     # Delete all sessions for an agent
```

**Cleanup behavior:**
- Always remove: metadata file, launch script
- Optional: workspace directory (requires confirmation unless --force)
- If files already missing: log warning but continue
- If workspace has uncommitted git changes: warn user before deletion

## Session Metadata & Launch Scripts

### Metadata Format

**File:** `~/.claude/sessions/metadata/{session-name}.json`

```json
{
  "sessionName": "coding-assistant-20260202-143022",
  "agentName": "coding-assistant",
  "workspacePath": "/home/user/workspaces/coding-assistant-20260202-143022",
  "createdAt": "2026-02-02T14:30:22Z",
  "lastAccessedAt": "2026-02-02T14:30:22Z",
  "environment": {
    "http_proxy": "http://proxy:8080",
    "https_proxy": "https://proxy:8080",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
    "ANTHROPIC_AUTH_TOKEN": "sk-ant-xxx"
  },
  "platform": "linux"
}
```

### Launch Script Format

**Linux/macOS:** `~/.claude/sessions/scripts/{session-name}.sh`

```bash
#!/bin/bash
# Session: coding-assistant-20260202-143022
# Agent: coding-assistant
# Created: 2026-02-02T14:30:22Z

# Set session-specific environment variables
export http_proxy="http://proxy:8080"
export https_proxy="https://proxy:8080"
export ANTHROPIC_BASE_URL="https://api.anthropic.com"
export ANTHROPIC_AUTH_TOKEN="sk-ant-xxx"

# Change to workspace directory
cd "/home/user/workspaces/coding-assistant-20260202-143022"

# Launch Claude Code CLI
exec claude
```

**Windows:** `~/.claude/sessions/scripts/{session-name}.ps1`

```powershell
# Session: coding-assistant-20260202-143022
# Agent: coding-assistant
# Created: 2026-02-02T14:30:22Z

# Set session-specific environment variables
$env:http_proxy = "http://proxy:8080"
$env:https_proxy = "https://proxy:8080"
$env:ANTHROPIC_BASE_URL = "https://api.anthropic.com"
$env:ANTHROPIC_AUTH_TOKEN = "sk-ant-xxx"

# Change to workspace directory
Set-Location "C:\Users\user\workspaces\coding-assistant-20260202-143022"

# Launch Claude Code CLI
claude
```

**Key Features:**
- Scripts are executable and can be run directly
- Environment variables are isolated to the script's process
- Scripts include metadata as comments for human readability
- `exec` on Unix replaces the shell process (cleaner process tree)
- Scripts are platform-specific (detected during creation)

## Workflows

### Session Creation Workflow

**Command:** `claude-daemon launch --agent coding-assistant --session my-project`

**Steps:**

1. **Validate inputs**
   - Check agent exists in agent-configs/
   - Check session name is unique (no existing metadata file)
   - Check session name is valid (alphanumeric, hyphens, underscores only)
   - Validate mutually exclusive options (--agent vs --dir)

2. **Determine workspace path**
   - If `--workspace-root` specified: use it
   - Otherwise: use current working directory
   - Create session directory: `{workspace-root}/{session-name}/`

3. **Copy agent configuration**
   - Create `{workspace}/.claude/` directory
   - Copy agent's `CLAUDE.md` → `{workspace}/.claude/CLAUDE.md`
   - Copy agent's `config.json` → `{workspace}/.claude/config.json`
   - Merge environment variables:
     - Start with agent's `.env` file (if exists)
     - Override with CLI flags (--http-proxy, --api-token, etc.)
     - Write to `{workspace}/.claude/.env`

4. **Generate launch script**
   - Create script in `~/.claude/sessions/scripts/{session-name}.sh` (or .ps1)
   - Make executable (chmod +x on Unix)
   - Include all environment variables from merged .env

5. **Create metadata**
   - Write `~/.claude/sessions/metadata/{session-name}.json`
   - Record creation timestamp, workspace path, agent name

6. **Launch Claude Code**
   - Set environment variables from .env
   - Change to workspace directory
   - Execute `claude` CLI (spawn child process)
   - Parent process exits, Claude Code runs independently

**Rollback on failure:**
- If any step fails, clean up partially created files
- Remove workspace directory if it was created
- Remove launch script if it was created
- Remove metadata if it was created
- Display clear error message to user

### Session Resume Workflow

**Command:** `claude-daemon resume my-project`

**Steps:**

1. **Locate session metadata**
   - Check if `~/.claude/sessions/metadata/my-project.json` exists
   - If not found, display error: "Session 'my-project' not found"
   - List available sessions as suggestion

2. **Validate workspace still exists**
   - Read workspace path from metadata
   - Check if directory exists
   - If missing, prompt user:
     - "Workspace directory not found. Delete session metadata? [y/N]"
     - If yes: clean up metadata and launch script
     - If no: exit with error

3. **Update metadata**
   - Update `lastAccessedAt` timestamp
   - Write back to metadata file

4. **Launch Claude Code**
   - Read environment variables from metadata
   - Set environment variables in current process
   - Change to workspace directory
   - Execute `claude` CLI (spawn child process)
   - Parent process exits

**Session name resolution:**
- Exact match: `claude-daemon resume my-project`
- Fuzzy match (optional): `claude-daemon resume my-proj` → suggests "my-project"
- Partial match with multiple results → show list and ask user to clarify

## Implementation Architecture

### New Files to Create

```
daemon/
  session-manager.ts          # Core session lifecycle management
  session-launcher.ts         # Launches Claude Code CLI with environment

lib/
  session-storage.ts          # Read/write session metadata and scripts
  session-validator.ts        # Validate session names, paths, conflicts

bin/
  cli.js                      # Update existing CLI with new commands

tools/
  SessionLauncher.ts          # CLI tool for launching sessions
  SessionResume.ts            # CLI tool for resuming sessions
  SessionList.ts              # CLI tool for listing sessions
  SessionDelete.ts            # CLI tool for deleting sessions
```

### Core Classes

```typescript
// daemon/session-manager.ts
class SessionManager {
  constructor(
    private agentRegistry: AgentDefinitionRegistry,
    private sessionsDir: string  // ~/.claude/sessions
  )

  async createSession(options: CreateSessionOptions): Promise<Session>
  async resumeSession(sessionName: string): Promise<void>
  async listSessions(filters?: SessionFilters): Promise<Session[]>
  async deleteSession(sessionName: string, deleteWorkspace: boolean): Promise<void>
  async getSession(sessionName: string): Promise<Session | null>
}

// lib/session-storage.ts
class SessionStorage {
  async saveMetadata(session: Session): Promise<void>
  async loadMetadata(sessionName: string): Promise<SessionMetadata | null>
  async deleteMetadata(sessionName: string): Promise<void>
  async listAllMetadata(): Promise<SessionMetadata[]>

  async createLaunchScript(session: Session): Promise<string>
  async deleteLaunchScript(sessionName: string): Promise<void>
}

// daemon/session-launcher.ts
class SessionLauncher {
  async launch(session: Session): Promise<void>
  private setEnvironment(env: Record<string, string>): void
  private spawnClaudeCLI(workspacePath: string): ChildProcess
}
```

### Integration with Existing System

- `daemon/main.ts` instantiates `SessionManager` alongside existing services
- Web UI gets new API endpoints via `web/api/sessions-api.ts`
- Session creation/deletion events can be logged to daemon for tracking
- Reuses existing `AgentDefinitionRegistry` for agent configs
- Reuses existing `config.ts` for path management

### Data Flow

```
CLI Command → SessionManager → SessionStorage → Filesystem
                            ↓
                      SessionLauncher → Claude Code CLI
```

## Security Considerations

1. **Environment Variable Storage**
   - `.env` files stored with 0600 permissions (owner-only read/write)
   - API tokens never logged or displayed in plain text
   - Launch scripts have 0700 permissions (owner-only execute)

2. **Workspace Isolation**
   - Each session has dedicated workspace directory
   - No shared state between sessions
   - Environment variables scoped to session process only

3. **Metadata Protection**
   - Metadata files stored with 0600 permissions
   - Contains sensitive information (API tokens, proxy settings)
   - Only accessible by owner

4. **Script Execution**
   - Launch scripts validated before execution
   - No arbitrary code injection possible
   - Scripts generated from trusted templates only

## Error Handling

1. **Agent Not Found**
   - Display available agents
   - Suggest closest match (fuzzy search)

2. **Session Name Conflict**
   - Suggest alternative names with timestamp suffix
   - Allow user to override with --force

3. **Workspace Directory Missing**
   - Prompt to clean up orphaned metadata
   - Offer to recreate workspace from agent config

4. **Claude CLI Not Found**
   - Check if Claude Code is installed
   - Display installation instructions

5. **Permission Errors**
   - Check directory permissions
   - Suggest running with appropriate privileges

## Future Enhancements

1. **Session Status Tracking**
   - Detect if Claude Code is currently running in session
   - Show "running" vs "stopped" status in list command
   - Use PID tracking or lock files

2. **Session Templates**
   - Save current session as template
   - Create new sessions from templates
   - Share templates between users

3. **Session Migration**
   - Move session to different workspace
   - Update all references automatically

4. **Web UI Integration**
   - View sessions in web dashboard
   - Launch sessions from browser
   - Real-time session status updates

5. **Session Groups**
   - Organize sessions into projects
   - Launch multiple related sessions together
   - Shared environment variables across group

## Testing Strategy

1. **Unit Tests**
   - SessionManager methods
   - SessionStorage read/write operations
   - SessionValidator validation logic

2. **Integration Tests**
   - Full session creation workflow
   - Resume existing session
   - Delete session with workspace cleanup

3. **Platform Tests**
   - Test on Linux, macOS, Windows
   - Verify launch scripts work on each platform
   - Test path handling (Unix vs Windows)

4. **Edge Cases**
   - Session name conflicts
   - Missing workspace directories
   - Corrupted metadata files
   - Permission errors

## Documentation Updates

1. **README.md**
   - Add session launcher section
   - Include usage examples
   - Document all CLI commands

2. **CLAUDE.md**
   - Update with session management commands
   - Add troubleshooting section

3. **User Guide**
   - Step-by-step tutorial for creating sessions
   - Best practices for session management
   - Common workflows and patterns
