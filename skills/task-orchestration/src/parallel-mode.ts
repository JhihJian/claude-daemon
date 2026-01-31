/**
 * parallel-mode.ts - Parallel independent execution mode
 *
 * Executes the same task on multiple agents in parallel.
 * Each agent works independently with its own configuration.
 */

import { v4 as uuidv4 } from "uuid";
import { daemonClient } from "./daemon-client.js";
import type {
  TaskDefinition,
  AgentConfig,
  AgentExecutionResult,
  CollectedResults,
} from "./types.js";

/**
 * Execute task in parallel on multiple agents
 *
 * Each agent receives the same task and completes it independently.
 * Results are collected and analyzed for consensus.
 */
export async function parallelIndependentExecute(params: {
  task: TaskDefinition;
  agents: AgentConfig[];
  timeout?: number;
  onProgress?: (completed: number, total: number) => void;
}): Promise<CollectedResults> {
  const { task, agents, timeout = 300000, onProgress } = params;

  if (agents.length === 0) {
    throw new Error("At least one agent is required for parallel execution");
  }

  // Generate unique task IDs for each agent
  const taskAssignments = agents.map((agent) => ({
    agentId: agent.sessionId,
    taskId: `${task.id}-${uuidv4().slice(0, 8)}`,
  }));

  // Send tasks to all agents
  for (const assignment of taskAssignments) {
    await daemonClient.sendMessage({
      to: assignment.agentId,
      type: "task",
      content: formatTaskMessage(task),
      metadata: {
        task_id: assignment.taskId,
        original_task_id: task.id,
        mode: "parallel_independent",
      },
    });
  }

  // Wait for all agents to complete
  const taskIds = taskAssignments.map((a) => a.taskId);
  const startTime = Date.now();

  const results = await daemonClient.waitForTaskCompletion(taskIds, timeout);

  const actualDuration = Date.now() - startTime;

  // Report progress
  if (onProgress) {
    onProgress(results.length, agents.length);
  }

  // Analyze results
  const successCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const partialCount = results.filter((r) => r.status === "partial").length;

  // Check for consensus among successful results
  const successfulResults = results.filter((r) => r.status === "success");
  const consensus = successfulResults.length > 1
    ? analyzeConsensus(successfulResults)
    : undefined;

  return {
    mode: "parallel_independent",
    totalAgents: agents.length,
    successCount,
    failedCount,
    partialCount,
    results,
    summary: generateParallelSummary(results, task, actualDuration),
    consensus,
  };
}

/**
 * Format task message for agent
 */
function formatTaskMessage(task: TaskDefinition): string {
  return `Please complete the following task:

Task ID: ${task.id}
Description: ${task.description}
Type: ${task.type}
Priority: ${task.priority}

${task.metadata ? JSON.stringify(task.metadata, null, 2) : ""}

Please use the TaskCompletion hook to report your results when done.`;
}

/**
 * Analyze consensus among multiple results
 */
function analyzeConsensus(results: AgentExecutionResult[]): CollectedResults["consensus"] {
  if (results.length < 2) {
    return undefined;
  }

  // Simple similarity check based on common keywords
  const texts = results.map((r) => r.result.toLowerCase());
  const allWords = new Set<string>();
  texts.forEach((t) => {
    t.split(/\s+/).forEach((w) => {
      if (w.length > 3) allWords.add(w);
    });
  });

  // Count how many results contain each word
  const wordCounts = new Map<string, number>();
  texts.forEach((t) => {
    const words = new Set(t.split(/\s+/).filter((w) => w.length > 3));
    words.forEach((w) => {
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    });
  });

  // Calculate agreement ratio
  const commonWords = Array.from(wordCounts.entries())
    .filter(([_, count]) => count >= results.length)
    .map(([word]) => word);

  const agreement = commonWords.length / Math.max(allWords.size, 1);
  const hasConsensus = agreement > 0.5;

  return {
    hasConsensus,
    agreement: Math.min(agreement, 1),
    details: `${commonWords.length} common concepts identified out of ${allWords.size} total. Agreement: ${(agreement * 100).toFixed(1)}%`,
  };
}

/**
 * Generate summary for parallel execution
 */
function generateParallelSummary(
  results: AgentExecutionResult[],
  task: TaskDefinition,
  duration: number
): string {
  const successCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const partialCount = results.filter((r) => r.status === "partial").length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  let summary = `## Parallel Execution Results\n\n`;
  summary += `**Task:** ${task.description}\n`;
  summary += `**Mode:** Parallel Independent\n`;
  summary += `**Total Agents:** ${results.length}\n\n`;

  summary += `### Results Summary\n`;
  summary += `- ✅ Success: ${successCount}\n`;
  summary += `- ❌ Failed: ${failedCount}\n`;
  summary += `- ⚠️ Partial: ${partialCount}\n\n`;

  summary += `### Performance\n`;
  summary += `- Total Duration: ${(duration / 1000).toFixed(1)}s\n`;
  summary += `- Avg Agent Duration: ${(avgDuration / 1000).toFixed(1)}s\n\n`;

  if (successCount > 0) {
    summary += `### Successful Results\n`;
    results
      .filter((r) => r.status === "success")
      .forEach((r, i) => {
        summary += `\n#### ${r.agentLabel}\n`;
        summary += `${r.result.slice(0, 500)}${r.result.length > 500 ? "..." : ""}\n`;
      });
  }

  return summary;
}

/**
 * Create agent task assignments for parallel mode
 */
export function createParallelAssignments(
  task: TaskDefinition,
  agents: AgentConfig[]
): Array<{ agentId: string; task: TaskDefinition }> {
  return agents.map((agent) => ({
    agentId: agent.sessionId,
    task: { ...task }, // Same task for all agents
  }));
}
