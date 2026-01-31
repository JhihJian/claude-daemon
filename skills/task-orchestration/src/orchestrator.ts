/**
 * orchestrator.ts - Intelligent task orchestration
 *
 * Analyzes tasks and selects the best execution mode and agent allocation.
 */

import { daemonClient } from "./daemon-client.js";
import { parallelIndependentExecute } from "./parallel-mode.js";
import { distributedTaskExecute } from "./distributed-mode.js";
import type {
  TaskDefinition,
  AgentConfig,
  ExecutionMode,
  TaskAnalysis,
  OrchestrationDecision,
  CollectedResults,
} from "./types.js";

export interface OrchestratorOptions {
  preferParallel?: boolean;
  minAgentsForParallel?: number;
  minAgentsForDistributed?: number;
  defaultTimeout?: number;
  onProgress?: (message: string) => void;
}

/**
 * Task Orchestrator - analyzes tasks and coordinates execution
 */
export class Orchestrator {
  private options: RequiredOrchestratorOptions;

  constructor(options: OrchestratorOptions = {}) {
    this.options = {
      preferParallel: false,
      minAgentsForParallel: 2,
      minAgentsForDistributed: 2,
      defaultTimeout: 300000,
      onProgress: () => {},
      ...options,
    };
  }

  /**
   * Main orchestration entry point
   */
  async orchestrate(task: TaskDefinition): Promise<CollectedResults> {
    this.log(`Starting orchestration for task: ${task.id}`);

    // Step 1: Analyze the task
    this.log("Analyzing task characteristics...");
    const analysis = this.analyzeTask(task);
    this.log(`Task complexity: ${analysis.complexity}, Type: ${analysis.type}`);

    // Step 2: Get available agents
    this.log("Fetching available agents...");
    const availableAgents = await this.getAvailableAgents();
    this.log(`Found ${availableAgents.length} available agents`);

    if (availableAgents.length === 0) {
      throw new Error("No agents available for task execution");
    }

    // Step 3: Make orchestration decision
    this.log("Determining execution strategy...");
    const decision = this.selectMode(task, analysis, availableAgents);
    this.log(`Selected mode: ${decision.mode}`);
    this.log(`Allocated ${decision.agentAllocations.length} agents`);

    // Step 4: Execute according to decision
    this.log("Starting task execution...");
    const results = await this.executeByDecision(task, decision, availableAgents);

    this.log(`Execution complete. Success: ${results.successCount}/${results.totalAgents}`);

    return results;
  }

  /**
   * Analyze task characteristics
   */
  analyzeTask(task: TaskDefinition): TaskAnalysis {
    const description = task.description.toLowerCase();

    // Determine complexity
    let complexity: TaskAnalysis["complexity"] = "medium";
    const complexityIndicators = {
      high: ["comprehensive", "detailed", "thorough", "extensive", "complete", "full"],
      low: ["quick", "simple", "basic", "brief", "summary", "check"],
    };

    for (const word of complexityIndicators.high) {
      if (description.includes(word)) {
        complexity = "high";
        break;
      }
    }
    if (complexity === "medium") {
      for (const word of complexityIndicators.low) {
        if (description.includes(word)) {
          complexity = "low";
          break;
        }
      }
    }

    // Determine required capabilities
    const capabilities = this.inferCapabilities(description);

    // Check if task can be decomposed
    const canDecompose = complexity !== "low" && this.hasDecomposableStructure(description);

    // Generate suggested subtasks if decomposable
    let suggestedSubtasks: string[] | undefined;
    if (canDecompose) {
      suggestedSubtasks = this.generateSubtaskSuggestions(task);
    }

    // Estimate duration based on complexity and description length
    const baseDuration = complexity === "high" ? 60000 :
                         complexity === "medium" ? 30000 : 10000;
    const lengthFactor = Math.min(2, task.description.length / 500);
    const estimatedDuration = baseDuration * (1 + lengthFactor);

    // Recommend mode
    let recommendedMode: ExecutionMode = "parallel_independent";
    if (canDecompose && capabilities.length > 2) {
      recommendedMode = "distributed_task";
    }

    return {
      complexity,
      type: task.type,
      canDecompose,
      suggestedSubtasks,
      estimatedDuration,
      requiredCapabilities: capabilities,
      recommendedMode,
    };
  }

  /**
   * Infer required capabilities from task description
   */
  private inferCapabilities(description: string): string[] {
    const capabilityMap: Record<string, string[]> = {
      "code-analysis": ["code", "analyze", "review", "audit", "examine"],
      "security": ["security", "vulnerability", "auth", "permission", "injection"],
      "testing": ["test", "coverage", "unit", "integration", "mock"],
      "documentation": ["document", "readme", "comment", "docstring", "guide"],
      "refactoring": ["refactor", "cleanup", "optimize", "improve", "restructure"],
      "debugging": ["debug", "fix", "error", "issue", "problem", "bug"],
      "architecture": ["architecture", "design", "structure", "pattern"],
      "performance": ["performance", "optimize", "speed", "latency", "cache"],
    };

    const capabilities: string[] = [];
    const lower = description.toLowerCase();

    for (const [capability, keywords] of Object.entries(capabilityMap)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        capabilities.push(capability);
      }
    }

    return capabilities.length > 0 ? capabilities : ["general"];
  }

  /**
   * Check if task has decomposable structure
   */
  private hasDecomposableStructure(description: string): string {
    const decomposableIndicators = [
      "multiple",
      "various",
      "several",
      "different aspects",
      "comprehensive",
      "thorough",
      "each of",
      "following",
    ];

    const lower = description.toLowerCase();
    return decomposableIndicators.some((indicator) => lower.includes(indicator)) ? "true" : "";
  }

  /**
   * Generate suggested subtasks
   */
  private generateSubtaskSuggestions(task: TaskDefinition): string[] {
    const suggestions: string[] = [];

    switch (task.type) {
      case "analysis":
        suggestions.push(
          "Analyze code architecture and design patterns",
          "Review error handling and edge cases",
          "Examine security considerations",
          "Evaluate performance characteristics",
          "Check dependencies and integrations"
        );
        break;

      case "code_review":
        suggestions.push(
          "Review code functionality and logic",
          "Check error handling completeness",
          "Evaluate code style and conventions",
          "Assess testing coverage",
          "Review documentation quality"
        );
        break;

      case "testing":
        suggestions.push(
          "Create unit tests for core functions",
          "Add integration tests for components",
          "Implement edge case tests",
          "Add performance benchmarks",
          "Test error conditions"
        );
        break;

      case "documentation":
        suggestions.push(
          "Document API interfaces and contracts",
          "Create usage examples and tutorials",
          "Document architecture decisions",
          "Add setup and deployment guides",
          "Document configuration options"
        );
        break;

      default:
        suggestions.push(
          "Analyze requirements and constraints",
          "Examine current implementation",
          "Identify improvement opportunities",
          "Propose solution approach",
          "Document findings and recommendations"
        );
    }

    return suggestions;
  }

  /**
   * Select execution mode and allocate agents
   */
  selectMode(
    task: TaskDefinition,
    analysis: TaskAnalysis,
    availableAgents: AgentConfig[]
  ): OrchestrationDecision {
    const agentCount = availableAgents.length;

    // Decision logic
    let selectedMode: ExecutionMode;

    // Priority 1: Use analysis recommendation if we have enough agents
    if (analysis.recommendedMode === "distributed_task" &&
        agentCount >= this.options.minAgentsForDistributed &&
        analysis.canDecompose) {
      selectedMode = "distributed_task";
    }
    // Priority 2: Use parallel mode if we have multiple agents
    else if (agentCount >= this.options.minAgentsForParallel) {
      selectedMode = this.options.preferParallel ? "parallel_independent"
                                                  : analysis.recommendedMode;
    }
    // Fallback: Use single agent (not supported yet, would use parallel with 1 agent)
    else {
      selectedMode = "parallel_independent";
    }

    // Allocate agents based on mode
    const agentAllocations = this.allocateAgents(
      selectedMode,
      task,
      analysis,
      availableAgents
    );

    // Calculate estimated duration
    const estimatedDuration = this.calculateEstimatedDuration(
      selectedMode,
      analysis,
      agentCount
    );

    // Generate reasoning
    const reasoning = this.generateDecisionReasoning(
      selectedMode,
      analysis,
      agentCount
    );

    return {
      mode: selectedMode,
      reasoning,
      agentAllocations,
      estimatedDuration,
    };
  }

  /**
   * Allocate agents to tasks
   */
  private allocateAgents(
    mode: ExecutionMode,
    task: TaskDefinition,
    analysis: TaskAnalysis,
    availableAgents: AgentConfig[]
  ): Array<{ agentId: string; task: TaskDefinition }> {
    if (mode === "parallel_independent") {
      // All agents get the same task
      return availableAgents.map((agent) => ({
        agentId: agent.sessionId,
        task: { ...task },
      }));
    } else {
      // Distributed mode - agents would get subtasks
      // This is handled in distributed-mode.ts
      return availableAgents.map((agent) => ({
        agentId: agent.sessionId,
        task: { ...task },
      }));
    }
  }

  /**
   * Calculate estimated duration for the execution
   */
  private calculateEstimatedDuration(
    mode: ExecutionMode,
    analysis: TaskAnalysis,
    agentCount: number
  ): number {
    const baseDuration = analysis.estimatedDuration;

    if (mode === "parallel_independent") {
      // All agents work simultaneously, return the max time
      return baseDuration;
    } else {
      // Distributed mode: divide work, but add coordination overhead
      const coordinationOverhead = 5000; // 5s overhead
      const perAgentTime = baseDuration / agentCount;
      return perAgentTime + coordinationOverhead;
    }
  }

  /**
   * Generate human-readable reasoning for the decision
   */
  private generateDecisionReasoning(
    mode: ExecutionMode,
    analysis: TaskAnalysis,
    agentCount: number
  ): string {
    let reasoning = "";

    reasoning += `Task complexity: ${analysis.complexity}. `;
    reasoning += `Available agents: ${agentCount}. `;

    if (mode === "parallel_independent") {
      reasoning += "Selected parallel independent mode because: ";
      if (!analysis.canDecompose) {
        reasoning += "the task is not easily decomposable. ";
      }
      if (agentCount <= 3) {
        reasoning += "parallel execution provides diverse perspectives. ";
      } else {
        reasoning += "multiple agents can provide comprehensive coverage. ";
      }
    } else {
      reasoning += "Selected distributed task mode because: ";
      reasoning += "the task can be decomposed into subtasks. ";
      reasoning += "distributing work will reduce overall execution time. ";
    }

    if (analysis.requiredCapabilities.length > 0) {
      reasoning += `Required capabilities: ${analysis.requiredCapabilities.join(", ")}.`;
    }

    return reasoning;
  }

  /**
   * Execute task according to decision
   */
  private async executeByDecision(
    task: TaskDefinition,
    decision: OrchestrationDecision,
    agents: AgentConfig[]
  ): Promise<CollectedResults> {
    if (decision.mode === "parallel_independent") {
      return parallelIndependentExecute({
        task,
        agents,
        timeout: this.options.defaultTimeout,
        onProgress: (completed, total) => {
          this.log(`Progress: ${completed}/${total} agents completed`);
        },
      });
    } else {
      return distributedTaskExecute({
        task,
        agents,
        timeout: this.options.defaultTimeout,
        onProgress: (subtask, index, total) => {
          this.log(`Subtask ${index + 1}/${total}: ${subtask.status}`);
        },
      });
    }
  }

  /**
   * Get available agents from daemon
   */
  private async getAvailableAgents(): Promise<AgentConfig[]> {
    try {
      return await daemonClient.getAvailableWorkers();
    } catch (error) {
      this.log(`Failed to get available agents: ${error}`);
      return [];
    }
  }

  /**
   * Monitor ongoing task execution
   */
  async monitorExecution(taskIds: string[]): Promise<void> {
    // Poll for updates
    const startTime = Date.now();
    const timeout = this.options.defaultTimeout;

    while (Date.now() - startTime < timeout) {
      const messages = await daemonClient.getMessages(true);
      const taskMessages = messages.filter((m) =>
        m.metadata?.task_id && taskIds.includes(m.metadata.task_id)
      );

      // Check completion status
      const completedCount = taskMessages.filter((m) => m.type === "result").length;
      const progressCount = taskMessages.filter((m) => m.type === "progress").length;

      if (progressCount > 0) {
        this.log(`Progress: ${completedCount}/${taskIds.length} completed, ${progressCount} in progress`);
      }

      if (completedCount >= taskIds.length) {
        this.log("All tasks completed!");
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  /**
   * Handle task failure with retry logic
   */
  async handleFailure(
    task: TaskDefinition,
    failedResults: AgentExecutionResult[],
    availableAgents: AgentConfig[]
  ): Promise<CollectedResults | null> {
    this.log(`Handling ${failedResults.length} failed tasks`);

    // Check if we have any agents left for retry
    if (availableAgents.length === 0) {
      this.log("No agents available for retry");
      return null;
    }

    // Simple retry: reassign failed tasks to available agents
    const retryCount = Math.min(failedResults.length, availableAgents.length);
    this.log(`Retrying ${retryCount} failed tasks`);

    // Create new task definitions for retries
    const retryTasks = failedResults.slice(0, retryCount).map((r) => ({
      ...task,
      id: `${task.id}-retry-${r.agentId.slice(0, 8)}`,
    }));

    // Execute retries
    try {
      return await parallelIndependentExecute({
        task: task,
        agents: availableAgents.slice(0, retryCount),
        timeout: this.options.defaultTimeout,
      });
    } catch (error) {
      this.log(`Retry failed: ${error}`);
      return null;
    }
  }

  /**
   * Log progress message
   */
  private log(message: string): void {
    this.options.onProgress(message);
  }
}

type RequiredOrchestratorOptions = Required<OrchestratorOptions>;

/**
 * Create a default orchestrator instance
 */
export function createOrchestrator(options?: OrchestratorOptions): Orchestrator {
  return new Orchestrator(options);
}

/**
 * Quick orchestration function
 */
export async function orchestrateTask(
  task: TaskDefinition,
  options?: OrchestratorOptions
): Promise<CollectedResults> {
  const orchestrator = new Orchestrator(options);
  return orchestrator.orchestrate(task);
}
