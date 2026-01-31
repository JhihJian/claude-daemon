/**
 * index.ts - Main entry point for task-orchestration skill
 *
 * Exports all public APIs for the skill.
 */

// Core orchestrator
export {
  Orchestrator,
  createOrchestrator,
  orchestrateTask,
} from "./orchestrator.js";

// Execution modes
export {
  parallelIndependentExecute,
  createParallelAssignments,
} from "./parallel-mode.js";

export {
  distributedTaskExecute,
  createDistributedAssignments,
  DefaultSubtaskStrategy,
} from "./distributed-mode.js";

// Result collection
export {
  ResultCollector,
  createCollector,
} from "./collector.js";

// Daemon client
export {
  DaemonClient,
  daemonClient,
} from "./daemon-client.js";

// Types
export type {
  // Core types
  AgentConfig,
  TaskDefinition,
  TaskType,
  ExecutionMode,

  // Execution types
  TaskExecutionRequest,
  SubTask,
  AgentTaskAssignment,
  AgentExecutionResult,
  CollectedResults,

  // Orchestration types
  OrchestrationDecision,
  TaskAnalysis,

  // Collector types
  CollectorOptions,

  // Subtask types
  SubtaskStrategy,
} from "./types.js";
