# End-to-End Test Plan

## Overview

This document describes the end-to-end testing plan for the Agent Collaboration Network implementation.

## Test Environment Setup

### Prerequisites

- Bun runtime installed
- Node.js installed (for web UI)
- Unix-like OS (Linux/macOS) or Windows with WSL
- Two terminal windows or tmux sessions

### Directory Structure

```
claude-daemon/
├── daemon/           # Daemon source
├── agent-configs/    # Agent configuration packages
├── skills/           # Orchestration skill
└── test/             # Test scripts
```

## Test Procedures

### Test 1: Daemon Startup

**Objective**: Verify Daemon starts correctly and creates the Unix socket.

**Steps**:
```bash
cd G:/1_Github/claude-daemon
bun run daemon/main.ts
```

**Expected Results**:
- Daemon starts without errors
- Socket created at `/tmp/claude-daemon.sock`
- Log shows "Hook server started"
- Log shows "Waiting for hook events..."

### Test 2: Agent Registration (Master)

**Objective**: Verify Master Agent can register with the Daemon.

**Steps**:
```bash
# In a new terminal
export AGENT_TYPE=master
export AGENT_CONFIG=master-agent
export AGENT_LABEL="Master-001"
export DAEMON_SOCKET=/tmp/claude-daemon.sock
export SESSION_ID=master-$(uuidgen)
export ANTHROPIC_API_KEY=your-api-key

claude --dangerously-skip-permissions
```

**Expected Results**:
- AgentStatus.hook.ts executes automatically
- Agent appears in `/api/agents` list
- Agent status is "idle"
- Agent type is "master"

### Test 3: Agent Registration (Workers)

**Objective**: Verify multiple Worker Agents can register.

**Steps**:
```bash
# Terminal 3 - Worker 1
export AGENT_TYPE=worker
export AGENT_CONFIG=analyzer-agent
export AGENT_LABEL="Analyzer-001"
export AGENT_PARENT_ID=<master-session-id>
export DAEMON_SOCKET=/tmp/claude-daemon.sock
export SESSION_ID=worker-1-$(uuidgen)
export ANTHROPIC_API_KEY=your-api-key

claude --dangerously-skip-permissions

# Terminal 4 - Worker 2 (repeat with different IDs)
# Terminal 5 - Worker 3 (repeat with different IDs)
```

**Expected Results**:
- All workers register successfully
- All workers appear in agent list with type "worker"
- All workers show parentId pointing to master

### Test 4: Parallel Independent Mode

**Objective**: Verify parallel task execution across multiple agents.

**Steps**:
1. In Master Agent session, request: "Analyze the claude-daemon project architecture"
2. Master Agent should use orchestration skill
3. Verify workers receive tasks via AgentMessaging hook
4. Workers complete and report via TaskCompletion hook
5. Master Agent collects results

**Expected Results**:
- All workers receive identical task
- Each worker produces independent analysis
- Master Agent aggregates results
- Consensus analysis shows agreement percentage
- Results summary includes all agent outputs

### Test 5: Distributed Task Mode

**Objective**: Verify task decomposition and distribution.

**Steps**:
1. In Master Agent session, request: "Comprehensive review of this codebase including security, performance, and documentation"
2. Master Agent should select distributed mode
3. Task is decomposed into subtasks
4. Each worker gets different subtask
5. Results are combined

**Expected Results**:
- Task decomposed into 3+ subtasks
- Each worker assigned different subtask
- Subtasks completed independently
- Final summary combines all subtask results
- No redundant work across workers

### Test 6: Message Passing

**Objective**: Verify message system works end-to-end.

**Steps**:
1. Send message from Master to Worker via API:
```bash
echo '{"action":"send_message","from":"master-id","to":"worker-id","type":"task","content":"Test message"}' | nc -U /tmp/claude-daemon.sock
```
2. Query messages:
```bash
echo '{"action":"get_messages","session_id":"worker-id"}' | nc -U /tmp/claude-daemon.sock
```

**Expected Results**:
- Message sent successfully
- Message appears in worker's queue
- Worker can retrieve message
- Message can be marked as read

### Test 7: Agent Heartbeat

**Objective**: Verify heartbeat mechanism detects disconnected agents.

**Steps**:
1. Note active agents
2. Force kill a worker agent (Ctrl+C)
3. Wait 6 minutes (heartbeat timeout + margin)
4. Check agent status

**Expected Results**:
- Killed agent shows as "disconnected"
- Agent removed from active workers after timeout
- Orchestration skips disconnected agents

### Test 8: Result Consensus

**Objective**: Verify consensus analysis works correctly.

**Steps**:
1. Run parallel mode task with 3 workers
2. Provide same task to all workers
3. Check consensus in results

**Expected Results**:
- Consensus percentage calculated
- Common themes identified
- Agreement score between 0-1
- Consensus details included in summary

### Test 9: Web UI Integration

**Objective**: Verify web UI displays agent information.

**Steps**:
1. Start web UI: `cd G:/1_Github/claude-daemon && bun run web/server.ts`
2. Open http://127.0.0.1:3000/agents.html
3. Verify agent list displays
4. Click on agent to view details
5. Send message via UI

**Expected Results**:
- All agents shown in dashboard
- Agent details page shows correct info
- Messages tab displays agent messages
- Send message button works

### Test 10: Config Package Management

**Objective**: Verify agent config packages work.

**Steps**:
1. List configs: `curl http://127.0.0.1:3000/api/configs`
2. View specific config: `curl http://127.0.0.1:3000/api/configs/analyzer-agent`
3. Verify config contents are correct

**Expected Results**:
- Both master-agent and analyzer-agent listed
- Config includes CLAUDE.md content
- Config includes parsed config.json
- Capabilities and type correctly shown

## Cleanup

After testing:

1. Stop all agents (Ctrl+C in each terminal)
2. Stop Daemon
3. Remove socket: `rm -f /tmp/claude-daemon.sock`
4. Clear agent registry: `rm -rf ~/.claude/AGENT_REGISTRY`
5. Clear messages: `rm -rf ~/.claude/AGENT_MESSAGES`

## Success Criteria

All tests pass if:
- [ ] Daemon starts and creates socket
- [ ] Agents can register and unregister
- [ ] Parallel mode produces results from all agents
- [ ] Distributed mode decomposes and assigns subtasks
- [ ] Messages are delivered and received
- [ ] Heartbeat detects disconnections
- [ ] Consensus analysis produces meaningful output
- [ ] Web UI displays correct information
- [ ] Config packages are loaded correctly

## Known Limitations

1. Heartbeat timeout is 5 minutes - may need adjustment for testing
2. WebSocket reconnection has 5s delay
3. No authentication on Daemon socket (localhost only)
4. Config upload requires manual file placement

## Test Execution Checklist

- [ ] Set up test environment
- [ ] Start Daemon
- [ ] Start Master Agent
- [ ] Start 3 Worker Agents
- [ ] Run parallel mode test
- [ ] Run distributed mode test
- [ ] Test message passing
- [ ] Test Web UI
- [ ] Verify consensus calculation
- [ ] Cleanup test environment
