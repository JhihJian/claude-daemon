# Task Orchestration Skill

Master Agent skill for orchestrating multi-agent collaboration in the claude-daemon ecosystem.

## Overview

This skill enables a Master Agent to coordinate multiple Worker Agents for collaborative task execution. It provides two execution modes:

- **Parallel Independent Mode**: Same task executed by multiple agents simultaneously for diverse perspectives
- **Distributed Task Mode**: Large task decomposed into subtasks and distributed across agents

## Installation

```bash
cd skills/task-orchestration
bun install
```

## Usage

### As a Master Agent

The Master Agent uses this skill to coordinate worker agents:

```typescript
import { orchestrateTask } from "./skills/task-orchestration/src/index.ts";

// Define a task
const task = {
  id: "task-001",
  description: "Analyze the architecture of this codebase",
  type: "analysis" as const,
  priority: "high" as const,
};

// Orchestrate execution
const results = await orchestrateTask(task, {
  onProgress: (msg) => console.log(msg),
});

console.log(results.summary);
```

### Environment Variables

Required when using the skill:

- `DAEMON_SOCKET`: Path to claude-daemon Unix socket (default: `/tmp/claude-daemon.sock`)
- `SESSION_ID`: Current agent's session ID

## Execution Modes

### Parallel Independent Mode

Use when you want diverse perspectives on the same task:

- Each agent receives the identical task
- Agents work independently with their own configurations
- Results are analyzed for consensus
- Best for: analysis, code review, diverse model comparison

```typescript
import { parallelIndependentExecute } from "./skills/task-orchestration/src/index.ts";

const results = await parallelIndependentExecute({
  task: myTask,
  agents: availableAgents,
  timeout: 300000,
  onProgress: (completed, total) => {
    console.log(`${completed}/${total} agents completed`);
  },
});
```

### Distributed Task Mode

Use when a task can be decomposed into subtasks:

- Task is automatically decomposed by type
- Subtasks assigned to different agents
- Results are combined into comprehensive report
- Best for: comprehensive analysis, multi-faceted tasks

```typescript
import { distributedTaskExecute } from "./skills/task-orchestration/src/index.ts";

const results = await distributedTaskExecute({
  task: myTask,
  agents: availableAgents,
  timeout: 300000,
  onProgress: (subtask, index, total) => {
    console.log(`Subtask ${index + 1}/${total}: ${subtask.status}`);
  },
});
```

## API Reference

### `orchestrateTask(task, options)`

Main entry point for intelligent orchestration.

**Parameters:**
- `task: TaskDefinition` - Task to execute
- `options?: OrchestratorOptions` - Configuration options

**Returns:** `Promise<CollectedResults>`

### `parallelIndependentExecute(params)`

Execute task in parallel on multiple agents.

**Parameters:**
- `task: TaskDefinition` - Task to execute
- `agents: AgentConfig[]` - Available agents
- `timeout?: number` - Timeout in milliseconds (default: 300000)
- `onProgress?: (completed, total) => void` - Progress callback

**Returns:** `Promise<CollectedResults>`

### `distributedTaskExecute(params)`

Execute decomposed task across multiple agents.

**Parameters:**
- `task: TaskDefinition` - Task to execute
- `agents: AgentConfig[]` - Available agents
- `strategy?: SubtaskStrategy` - Custom decomposition strategy
- `timeout?: number` - Timeout in milliseconds (default: 300000)
- `onProgress?: (subtask, index, total) => void` - Progress callback

**Returns:** `Promise<CollectedResults>`

## Task Types

Supported task types:

- `analysis` - Code/architecture analysis
- `code_review` - Code review and audit
- `refactoring` - Code refactoring
- `testing` - Test creation and coverage
- `documentation` - Documentation writing
- `general` - General purpose tasks

## Result Structure

```typescript
interface CollectedResults {
  mode: ExecutionMode;
  totalAgents: number;
  successCount: number;
  failedCount: number;
  partialCount: number;
  results: AgentExecutionResult[];
  summary: string;
  consensus?: {
    hasConsensus: boolean;
    agreement: number;  // 0-1
    details: string;
  };
}
```

## Integration with Daemon

This skill communicates with the claude-daemon via Unix Socket:

- Agent operations: register, unregister, heartbeat
- Message operations: send, receive, mark as read
- Task operations: report completion, wait for results

## Agent Configuration Packages

Worker agents should be configured with:

1. **Agent config package** (`~/.claude/agent-configs/<name>/`)
   - `.claude/` directory
   - `CLAUDE.md` with agent instructions
   - `config.json` with basic settings

2. **Runtime environment variables**
   - `AGENT_TYPE=worker`
   - `AGENT_CONFIG=<package-name>`
   - `SESSION_ID=<unique-id>`

## Example Workflow

1. Master Agent receives task request
2. Master Agent calls `orchestrateTask()`
3. Orchestrator analyzes task and available agents
4. Task execution starts in selected mode
5. Worker agents receive task messages via AgentMessaging hook
6. Workers complete tasks and call TaskCompletion hook
7. Master Agent collects and aggregates results
8. Comprehensive report returned to user

## Testing

```bash
bun test
```

## License

MIT
