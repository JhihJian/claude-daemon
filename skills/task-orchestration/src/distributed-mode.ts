/**
 * distributed-mode.ts - Distributed task execution mode
 *
 * Decomposes a large task into subtasks and distributes them
 * across multiple worker agents.
 */

import { v4 as uuidv4 } from "uuid";
import { daemonClient } from "./daemon-client.js";
import type {
  TaskDefinition,
  AgentConfig,
  SubTask,
  AgentExecutionResult,
  CollectedResults,
} from "./types.js";

/**
 * Subtask decomposition strategy
 */
export interface SubtaskStrategy {
  decompose(task: TaskDefinition, availableAgents: number): SubTask[];
}

/**
 * Default subtask decomposition - by task type
 */
class DefaultSubtaskStrategy implements SubtaskStrategy {
  decompose(task: TaskDefinition, availableAgents: number): SubTask[] {
    const subtasks: SubTask[] = [];
    const agentCount = Math.max(1, availableAgents);

    switch (task.type) {
      case "analysis":
        return this.decomposeAnalysis(task, agentCount);

      case "code_review":
        return this.decomposeCodeReview(task, agentCount);

      case "testing":
        return this.decomposeTesting(task, agentCount);

      case "documentation":
        return this.decomposeDocumentation(task, agentCount);

      default:
        return this.decomposeGeneric(task, agentCount);
    }
  }

  private decomposeAnalysis(task: TaskDefinition, count: number): SubTask[] {
    const subtasks: SubTask[] = [];
    const aspects = [
      "Architecture and design patterns",
      "Code quality and maintainability",
      "Security considerations",
      "Performance optimization",
      "Dependencies and integrations",
    ];

    const perAgent = Math.ceil(aspects.length / count);

    for (let i = 0; i < count; i++) {
      const start = i * perAgent;
      const end = Math.min(start + perAgent, aspects.length);

      if (start < aspects.length) {
        const assignedAspects = aspects.slice(start, end);
        subtasks.push({
          id: uuidv4(),
          parentTaskId: task.id,
          description: `Analyze the following aspects: ${assignedAspects.join(", ")}\n\nOriginal task: ${task.description}`,
          assignedAgent: "", // Will be assigned later
          status: "pending",
        });
      }
    }

    return subtasks;
  }

  private decomposeCodeReview(task: TaskDefinition, count: number): SubTask[] {
    const subtasks: SubTask[] = [];
    const areas = [
      "Functionality and logic correctness",
      "Error handling and edge cases",
      "Code style and conventions",
      "Testing coverage",
      "Documentation completeness",
    ];

    const perAgent = Math.ceil(areas.length / count);

    for (let i = 0; i < count; i++) {
      const start = i * perAgent;
      const end = Math.min(start + perAgent, areas.length);

      if (start < areas.length) {
        const assignedAreas = areas.slice(start, end);
        subtasks.push({
          id: uuidv4(),
          parentTaskId: task.id,
          description: `Review the following areas: ${assignedAreas.join(", ")}\n\nOriginal task: ${task.description}`,
          assignedAgent: "",
          status: "pending",
        });
      }
    }

    return subtasks;
  }

  private decomposeTesting(task: TaskDefinition, count: number): SubTask[] {
    const subtasks: SubTask[] = [];
    const testTypes = [
      "Unit tests for individual functions",
      "Integration tests for component interactions",
      "End-to-end tests for user workflows",
      "Edge case and error condition tests",
      "Performance and load tests",
    ];

    const perAgent = Math.ceil(testTypes.length / count);

    for (let i = 0; i < count; i++) {
      const start = i * perAgent;
      const end = Math.min(start + perAgent, testTypes.length);

      if (start < testTypes.length) {
        const assignedTypes = testTypes.slice(start, end);
        subtasks.push({
          id: uuidv4(),
          parentTaskId: task.id,
          description: `Create/implement tests for: ${assignedTypes.join(", ")}\n\nOriginal task: ${task.description}`,
          assignedAgent: "",
          status: "pending",
        });
      }
    }

    return subtasks;
  }

  private decomposeDocumentation(task: TaskDefinition, count: number): SubTask[] {
    const subtasks: SubTask[] = [];
    const sections = [
      "API documentation and references",
      "Usage examples and tutorials",
      "Architecture and design documentation",
      "Setup and deployment guides",
    ];

    const perAgent = Math.ceil(sections.length / count);

    for (let i = 0; i < count; i++) {
      const start = i * perAgent;
      const end = Math.min(start + perAgent, sections.length);

      if (start < sections.length) {
        const assignedSections = sections.slice(start, end);
        subtasks.push({
          id: uuidv4(),
          parentTaskId: task.id,
          description: `Document: ${assignedSections.join(", ")}\n\nOriginal task: ${task.description}`,
          assignedAgent: "",
          status: "pending",
        });
      }
    }

    return subtasks;
  }

  private decomposeGeneric(task: TaskDefinition, count: number): SubTask[] {
    // For generic tasks, split by logical parts or create sequential subtasks
    const subtasks: SubTask[] = [];

    for (let i = 0; i < count; i++) {
      subtasks.push({
        id: uuidv4(),
        parentTaskId: task.id,
        description: `Part ${i + 1}/${count}: ${task.description}`,
        assignedAgent: "",
        status: "pending",
      });
    }

    return subtasks;
  }
}

/**
 * Execute task in distributed mode across multiple agents
 */
export async function distributedTaskExecute(params: {
  task: TaskDefinition;
  agents: AgentConfig[];
  strategy?: SubtaskStrategy;
  timeout?: number;
  onProgress?: (subtask: SubTask, index: number, total: number) => void;
}): Promise<CollectedResults> {
  const { task, agents, strategy = new DefaultSubtaskStrategy(), timeout = 300000, onProgress } = params;

  if (agents.length === 0) {
    throw new Error("At least one agent is required for distributed execution");
  }

  // Decompose task into subtasks
  const subtasks = strategy.decompose(task, agents.length);

  // Assign subtasks to agents
  const assignments: Array<{ agentId: string; subtask: SubTask }> = [];

  for (let i = 0; i < Math.min(subtasks.length, agents.length); i++) {
    subtasks[i].assignedAgent = agents[i].sessionId;
    assignments.push({
      agentId: agents[i].sessionId,
      subtask: subtasks[i],
    });
  }

  // Send subtasks to agents
  for (const assignment of assignments) {
    await daemonClient.sendMessage({
      to: assignment.agentId,
      type: "task",
      content: formatSubtaskMessage(assignment.subtask),
      metadata: {
        task_id: assignment.subtask.id,
        parent_task_id: task.id,
        subtask_index: assignments.indexOf(assignment),
        mode: "distributed_task",
      },
    });

    assignment.subtask.status = "in_progress";
    assignment.subtask.startedAt = Date.now();

    if (onProgress) {
      onProgress(assignment.subtask, assignments.indexOf(assignment), assignments.length);
    }
  }

  // Wait for all subtasks to complete
  const subtaskIds = assignments.map((a) => a.subtask.id);
  const startTime = Date.now();

  const results = await daemonClient.waitForTaskCompletion(subtaskIds, timeout);

  const actualDuration = Date.now() - startTime;

  // Map results back to subtasks
  for (const result of results) {
    const assignment = assignments.find((a) => a.subtask.id === result.taskId);
    if (assignment) {
      assignment.subtask.status = result.status === "success" ? "completed" : "failed";
      assignment.subtask.completedAt = result.timestamp;
      assignment.subtask.result = result.result;
      assignment.subtask.error = result.error;
    }
  }

  // Analyze results
  const successCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const partialCount = results.filter((r) => r.status === "partial").length;

  // Combine results
  const combinedResult = combineSubtaskResults(subtasks, results);

  return {
    mode: "distributed_task",
    totalAgents: assignments.length,
    successCount,
    failedCount,
    partialCount,
    results,
    summary: combinedResult,
  };
}

/**
 * Format subtask message for agent
 */
function formatSubtaskMessage(subtask: SubTask): string {
  return `Please complete the following subtask:

Subtask ID: ${subtask.id}
Parent Task ID: ${subtask.parentTaskId}
Description: ${subtask.description}

Please use the TaskCompletion hook to report your results when done.`;
}

/**
 * Combine subtask results into a coherent summary
 */
function combineSubtaskResults(
  subtasks: SubTask[],
  results: AgentExecutionResult[]
): string {
  let summary = `## Distributed Execution Results\n\n`;
  summary += `**Parent Task ID:** ${subtasks[0]?.parentTaskId || "unknown"}\n`;
  summary += `**Mode:** Distributed Task\n`;
  summary += `**Total Subtasks:** ${subtasks.length}\n\n`;

  summary += `### Subtask Summary\n`;

  for (let i = 0; i < subtasks.length; i++) {
    const subtask = subtasks[i];
    const result = results.find((r) => r.taskId === subtask.id);

    summary += `\n#### Subtask ${i + 1}: ${subtask.id.slice(0, 8)}\n`;
    summary += `- Status: ${subtask.status}\n`;
    summary += `- Assigned: ${subtask.assignedAgent}\n`;

    if (subtask.startedAt) {
      summary += `- Started: ${new Date(subtask.startedAt).toLocaleString()}\n`;
    }
    if (subtask.completedAt) {
      summary += `- Completed: ${new Date(subtask.completedAt).toLocaleString()}\n`;
    }

    if (result) {
      summary += `\n**Result:**\n${result.result.slice(0, 500)}${result.result.length > 500 ? "..." : ""}\n`;
    }
  }

  // Add combined insights section
  summary += `\n### Combined Analysis\n`;

  const successCount = results.filter((r) => r.status === "success").length;
  if (successCount === subtasks.length) {
    summary += `All subtasks completed successfully. The task has been fully distributed and executed across multiple agents.\n`;
  } else {
    summary += `Some subtasks failed or were only partially completed. Please review individual subtask results above.\n`;
  }

  return summary;
}

/**
 * Create agent task assignments for distributed mode
 */
export function createDistributedAssignments(
  task: TaskDefinition,
  agents: AgentConfig[],
  strategy?: SubtaskStrategy
): Array<{ agentId: string; subtask: SubTask }> {
  const subtaskStrategy = strategy || new DefaultSubtaskStrategy();
  const subtasks = subtaskStrategy.decompose(task, agents.length);
  const assignments: Array<{ agentId: string; subtask: SubTask }> = [];

  for (let i = 0; i < Math.min(subtasks.length, agents.length); i++) {
    subtasks[i].assignedAgent = agents[i].sessionId;
    assignments.push({
      agentId: agents[i].sessionId,
      subtask: subtasks[i],
    });
  }

  return assignments;
}
