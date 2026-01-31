/**
 * types.ts - Shared types for task orchestration skill
 */

// Agent configuration for task execution
export interface AgentConfig {
  sessionId: string;
  label: string;
  agentConfig: string;
  capabilities: string[];
  modelInfo?: {
    provider: string;
    model: string;
  };
}

// Task definition for execution
export interface TaskDefinition {
  id: string;
  description: string;
  type: TaskType;
  priority: 'low' | 'medium' | 'high';
  estimatedDuration?: number;
  metadata?: Record<string, any>;
}

export type TaskType =
  | 'analysis'
  | 'code_review'
  | 'refactoring'
  | 'testing'
  | 'documentation'
  | 'general';

// Execution modes
export type ExecutionMode = 'parallel_independent' | 'distributed_task';

// Task execution request
export interface TaskExecutionRequest {
  task: TaskDefinition;
  mode: ExecutionMode;
  agents: AgentConfig[];
  timeout?: number;
}

// Subtask for distributed mode
export interface SubTask {
  id: string;
  parentTaskId: string;
  description: string;
  assignedAgent: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// Agent task assignment
export interface AgentTaskAssignment {
  agentId: string;
  task: TaskDefinition;
  subTasks?: SubTask[];
}

// Execution result from an agent
export interface AgentExecutionResult {
  agentId: string;
  agentLabel: string;
  taskId: string;
  status: 'success' | 'failed' | 'partial';
  result: string;
  error?: string;
  duration: number;
  timestamp: number;
}

// Collected results summary
export interface CollectedResults {
  mode: ExecutionMode;
  totalAgents: number;
  successCount: number;
  failedCount: number;
  partialCount: number;
  results: AgentExecutionResult[];
  summary: string;
  consensus?: {
    hasConsensus: boolean;
    agreement: number; // 0-1
    details: string;
  };
}

// Orchestration decision
export interface OrchestrationDecision {
  mode: ExecutionMode;
  reasoning: string;
  agentAllocations: AgentTaskAssignment[];
  estimatedDuration: number;
}

// Task analysis result
export interface TaskAnalysis {
  complexity: 'low' | 'medium' | 'high';
  type: TaskType;
  canDecompose: boolean;
  suggestedSubtasks?: string[];
  estimatedDuration: number;
  requiredCapabilities: string[];
  recommendedMode: ExecutionMode;
}
