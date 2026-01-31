/**
 * daemon-client.ts - Client for Daemon Socket API
 *
 * Provides methods to communicate with the claude-daemon Unix Socket
 * for Agent operations and messaging.
 */

import { connect, Socket } from "net";
import { readFileSync, existsSync } from "fs";
import { AgentConfig, AgentExecutionResult } from "./types.js";

const DAEMON_SOCKET = process.env.DAEMON_SOCKET || "/tmp/claude-daemon.sock";
const SESSION_ID = process.env.SESSION_ID || "";

interface DaemonResponse {
  success: boolean;
  agent?: any;
  agents?: any[];
  message?: any;
  messages?: any[];
  error?: string;
}

/**
 * Daemon Client - communicates with claude-daemon Unix Socket
 */
export class DaemonClient {
  private socketPath: string;
  private timeout: number;

  constructor(socketPath: string = DAEMON_SOCKET, timeout: number = 5000) {
    this.socketPath = socketPath;
    this.timeout = timeout;
  }

  /**
   * Send request to Daemon and get response
   */
  private async sendRequest(data: any): Promise<DaemonResponse> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.socketPath);

      socket.on("connect", () => {
        socket.write(JSON.stringify(data) + "\n");
      });

      let responseData = "";
      socket.on("data", (chunk) => {
        responseData += chunk.toString();
      });

      socket.on("end", () => {
        try {
          const response = JSON.parse(responseData.trim());
          if (response.success === false) {
            reject(new Error(response.error || "Request failed"));
          } else {
            resolve(response);
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error}`));
        }
      });

      socket.on("error", (error) => {
        reject(new Error(`Socket error: ${error.message}`));
      });

      socket.setTimeout(this.timeout);
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      });
    });
  }

  /**
   * Check if Daemon socket is available
   */
  isAvailable(): boolean {
    return existsSync(this.socketPath);
  }

  // ===== Agent Operations =====

  /**
   * Register current agent
   */
  async registerAgent(config: {
    type: string;
    label: string;
    workingDir?: string;
    parentId?: string;
  }): Promise<any> {
    const sessionId = SESSION_ID;
    if (!sessionId) {
      throw new Error("SESSION_ID environment variable not set");
    }

    const response = await this.sendRequest({
      action: "register_agent",
      session_id: sessionId,
      type: config.type,
      label: config.label,
      working_dir: config.workingDir || process.cwd(),
      parent_id: config.parentId,
    });

    return response.agent;
  }

  /**
   * Unregister current agent
   */
  async unregisterAgent(): Promise<boolean> {
    const sessionId = SESSION_ID;
    if (!sessionId) {
      throw new Error("SESSION_ID environment variable not set");
    }

    const response = await this.sendRequest({
      action: "unregister_agent",
      session_id: sessionId,
    });

    return response.success;
  }

  /**
   * Update agent status
   */
  async updateStatus(status: string): Promise<any> {
    const sessionId = SESSION_ID;
    if (!sessionId) {
      throw new Error("SESSION_ID environment variable not set");
    }

    const response = await this.sendRequest({
      action: "update_agent_status",
      session_id: sessionId,
      status,
    });

    return response.agent;
  }

  /**
   * Send heartbeat
   */
  async heartbeat(): Promise<any> {
    const sessionId = SESSION_ID;
    if (!sessionId) {
      throw new Error("SESSION_ID environment variable not set");
    }

    const response = await this.sendRequest({
      action: "agent_heartbeat",
      session_id: sessionId,
    });

    return response.agent;
  }

  /**
   * Get agent info
   */
  async getAgent(sessionId: string): Promise<any> {
    const response = await this.sendRequest({
      action: "get_agent",
      session_id: sessionId,
    });

    return response.agent;
  }

  /**
   * List agents with optional filters
   */
  async listAgents(filters?: {
    type?: string;
    status?: string;
    parentId?: string;
    config?: string;
  }): Promise<any[]> {
    const data: any = {
      action: "list_agents",
    };

    if (filters?.type) data.type = filters.type;
    if (filters?.status) data.status = filters.status;
    if (filters?.parentId) data.parent_id = filters.parentId;
    if (filters?.config) data.config = filters.config;

    const response = await this.sendRequest(data);
    return response.agents || [];
  }

  /**
   * Get all agents
   */
  async getAllAgents(): Promise<any[]> {
    const response = await this.sendRequest({
      action: "get_all_agents",
    });

    return response.agents || [];
  }

  /**
   * Get available worker agents
   */
  async getAvailableWorkers(): Promise<AgentConfig[]> {
    const agents = await this.listAgents({ type: "worker", status: "idle" });

    return agents.map((agent: any) => ({
      sessionId: agent.sessionId,
      label: agent.label,
      agentConfig: agent.agentConfig,
      capabilities: agent.metadata?.capabilities || [],
      modelInfo: agent.metadata?.modelInfo,
    }));
  }

  // ===== Message Operations =====

  /**
   * Send message to an agent
   */
  async sendMessage(params: {
    to: string;
    type: string;
    content: string;
    metadata?: Record<string, any>;
    replyTo?: string;
  }): Promise<any> {
    const sessionId = SESSION_ID;
    if (!sessionId) {
      throw new Error("SESSION_ID environment variable not set");
    }

    const response = await this.sendRequest({
      action: "send_message",
      from: sessionId,
      to: params.to,
      type: params.type,
      content: params.content,
      metadata: params.metadata,
      reply_to: params.replyTo,
    });

    return response.message;
  }

  /**
   * Get messages for current agent
   */
  async getMessages(unreadOnly: boolean = false): Promise<any[]> {
    const sessionId = SESSION_ID;
    if (!sessionId) {
      throw new Error("SESSION_ID environment variable not set");
    }

    const response = await this.sendRequest({
      action: "get_messages",
      session_id: sessionId,
      unread_only: unreadOnly,
    });

    return response.messages || [];
  }

  /**
   * Mark messages as read
   */
  async markMessagesRead(messageIds: string[]): Promise<boolean> {
    const sessionId = SESSION_ID;
    if (!sessionId) {
      throw new Error("SESSION_ID environment variable not set");
    }

    const response = await this.sendRequest({
      action: "mark_messages_read",
      session_id: sessionId,
      message_ids: messageIds,
    });

    return response.success;
  }

  /**
   * Query messages
   */
  async queryMessages(params: {
    type?: string;
    status?: string;
    limit?: number;
    since?: number;
  }): Promise<any[]> {
    const data: any = {
      action: "query_messages",
    };

    if (params.type) data.type = params.type;
    if (params.status) data.status = params.status;
    if (params.limit) data.limit = params.limit;
    if (params.since) data.since = params.since;

    const response = await this.sendRequest(data);
    return response.messages || [];
  }

  // ===== Task Operations =====

  /**
   * Report task completion
   */
  async reportTaskCompletion(report: {
    taskId: string;
    status: "success" | "failed" | "partial";
    result: string;
    error?: string;
    duration?: number;
  }): Promise<boolean> {
    const sessionId = SESSION_ID;
    if (!sessionId) {
      throw new Error("SESSION_ID environment variable not set");
    }

    const response = await this.sendRequest({
      action: "task_completion",
      session_id: sessionId,
      report: {
        task_id: report.taskId,
        status: report.status,
        result: report.result,
        error: report.error,
        duration: report.duration || 0,
      },
    });

    return response.success;
  }

  /**
   * Wait for task completion messages
   */
  async waitForTaskCompletion(
    taskIds: string[],
    timeout: number = 60000
  ): Promise<AgentExecutionResult[]> {
    const startTime = Date.now();
    const results: AgentExecutionResult[] = [];
    const completedTaskIds = new Set<string>();

    while (Date.now() - startTime < timeout) {
      const messages = await this.getMessages(true);

      for (const message of messages) {
        if (message.type === "result" && message.metadata?.report) {
          const report = message.metadata.report;
          const taskKey = `${message.from}:${report.task_id}`;

          if (!completedTaskIds.has(taskKey) && taskIds.includes(report.task_id)) {
            completedTaskIds.add(taskKey);

            // Get agent info for label
            const agent = await this.getAgent(message.from);

            results.push({
              agentId: message.from,
              agentLabel: agent?.label || message.from,
              taskId: report.task_id,
              status: report.status,
              result: report.result || "",
              error: report.error,
              duration: report.duration || 0,
              timestamp: message.timestamp,
            });

            // Mark as read
            await this.markMessagesRead([message.id]);
          }
        }
      }

      // Check if all tasks completed
      if (completedTaskIds.size >= taskIds.length) {
        break;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return results;
  }
}

// Default client instance
export const daemonClient = new DaemonClient();
