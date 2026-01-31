# Agent Configuration Packages

This directory contains configuration packages for different types of agents in the collaboration network.

## Directory Structure

```
agent-configs/
├── master-agent/
│   └── .claude/
│       ├── CLAUDE.md        # Master Agent system prompt
│       └── config.json      # Master Agent configuration
├── analyzer-agent/
│   └── .claude/
│       ├── CLAUDE.md        # Analyzer Agent system prompt
│       └── config.json      # Analyzer Agent configuration
└── README.md               # This file
```

## Available Agent Types

### Master Agent (`master-agent`)

The orchestrator that coordinates multiple Worker Agents.

**Capabilities:**
- Task analysis and decomposition
- Agent discovery and coordination
- Result aggregation and reporting
- Execution mode selection

**Usage:**
```bash
export AGENT_TYPE=master
export AGENT_CONFIG=master-agent
export AGENT_LABEL="Master-001"
claude-code
```

### Analyzer Agent (`analyzer-agent`)

A Worker Agent specializing in code and architecture analysis.

**Capabilities:**
- Code analysis and review
- Architecture assessment
- Security evaluation
- Performance analysis
- Dependency review

**Usage:**
```bash
export AGENT_TYPE=worker
export AGENT_CONFIG=analyzer-agent
export AGENT_LABEL="Analyzer-001"
export AGENT_PARENT_ID="<master-session-id>"
claude-code
```

## Creating Custom Agent Configs

To create a new agent type:

1. **Create directory structure:**
   ```bash
   mkdir -p agent-configs/my-agent/.claude
   ```

2. **Create `CLAUDE.md`** with the agent's system prompt and instructions

3. **Create `config.json`** with agent metadata:
   ```json
   {
     "name": "my-agent",
     "description": "Description of my agent",
     "version": "1.0.0",
     "agentType": "worker",
     "capabilities": ["capability1", "capability2"],
     "hooks": {
       "session_start": ["AgentStatus.hook.ts"],
       "session_end": ["AgentStatus.hook.ts"],
       "tool_call_end": ["AgentMessaging.hook.ts"]
     }
   }
   ```

4. **Install to user's claude directory:**
   ```bash
   cp -r agent-configs/my-agent ~/.claude/agents/
   ```

## Configuration Fields

### `config.json`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier for the agent type |
| `description` | string | Human-readable description |
| `version` | string | Semantic version |
| `agentType` | "master" \| "worker" | Type of agent |
| `capabilities` | string[] | List of agent capabilities |
| `hooks` | object | Hooks to enable |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENT_TYPE` | "master" or "worker" |
| `AGENT_CONFIG` | Name of config package |
| `AGENT_LABEL` | Human-readable label |
| `AGENT_PARENT_ID` | Session ID of parent (for workers) |
| `SESSION_ID` | Unique session identifier |
| `DAEMON_SOCKET` | Path to Daemon socket |

## Installation

Agent configs should be installed to:

```
~/.claude/agents/<agent-name>/.claude/
```

## Usage Example

1. **Start the Daemon:**
   ```bash
   cd claude-daemon
   bun run daemon/index.ts
   ```

2. **Start a Master Agent:**
   ```bash
   export AGENT_TYPE=master
   export AGENT_CONFIG=master-agent
   export AGENT_LABEL="Master-001"
   export DAEMON_SOCKET=/tmp/claude-daemon.sock
   export SESSION_ID=master-$(uuidgen)
   claude-code
   ```

3. **Start Worker Agents** (in separate terminals):
   ```bash
   export AGENT_TYPE=worker
   export AGENT_CONFIG=analyzer-agent
   export AGENT_LABEL="Analyzer-001"
   export AGENT_PARENT_ID=<master-session-id>
   export DAEMON_SOCKET=/tmp/claude-daemon.sock
   export SESSION_ID=worker-$(uuidgen)
   claude-code
   ```

4. **Use the Master Agent** to orchestrate tasks across workers.
