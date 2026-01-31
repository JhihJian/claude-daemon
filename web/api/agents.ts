/**
 * Agents API
 * Agent Registry and Message Broker HTTP API
 *
 * Exposes Agent operations via HTTP for the web interface.
 */

import { connect } from "net";
import { existsSync } from "fs";

const DAEMON_SOCKET = process.env.DAEMON_SOCKET || "/tmp/claude-daemon.sock";

interface DaemonResponse {
  success: boolean;
  agent?: any;
  agents?: any[];
  message?: any;
  messages?: any[];
  error?: string;
}

/**
 * Agent types
 */
export type AgentType = "master" | "worker";
export type AgentStatus = "idle" | "busy" | "error" | "disconnected";

/**
 * Agent info structure
 */
export interface AgentInfo {
  sessionId: string;
  type: AgentType;
  label: string;
  status: AgentStatus;
  agentConfig: string;
  workingDir: string;
  parentId?: string;
  createdAt: number;
  lastHeartbeat: number;
  metadata?: Record<string, any>;
  uptime?: number;
}

/**
 * Message types
 */
export type MessageType = "task" | "progress" | "result" | "error" | "control";

/**
 * Agent message structure
 */
export interface AgentMessage {
  id: string;
  type: MessageType;
  from: string;
  to: string;
  timestamp: number;
  content: string;
  status: string;
  metadata?: Record<string, any>;
  replyTo?: string;
}

/**
 * Send request to Daemon via Unix Socket
 */
async function sendDaemonRequest(data: any): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const socket = connect(DAEMON_SOCKET);

    socket.on("connect", () => {
      socket.write(JSON.stringify(data) + "\n");
    });

    let responseData = "";
    socket.on("data", (chunk) => {
      responseData += chunk.toString();
    });

    socket.on("end", () => {
      try {
        const response: DaemonResponse = JSON.parse(responseData.trim());
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

    socket.setTimeout(5000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

/**
 * Agents API class
 */
export class AgentsAPI {
  private socketPath: string;

  constructor(socketPath?: string) {
    this.socketPath = socketPath || DAEMON_SOCKET;
  }

  /**
   * Check if Daemon is available
   */
  isAvailable(): boolean {
    return existsSync(this.socketPath);
  }

  // ============================================================
  // Agent Operations
  // ============================================================

  /**
   * Get all agents
   */
  async getAllAgents(): Promise<AgentInfo[]> {
    const response = await sendDaemonRequest({
      action: "get_all_agents",
    });

    const agents: AgentInfo[] = response.agents || [];

    // Add uptime calculation
    return agents.map((agent) => ({
      ...agent,
      uptime: Date.now() - agent.createdAt,
    }));
  }

  /**
   * Get agent by session ID
   */
  async getAgent(sessionId: string): Promise<AgentInfo | null> {
    const response = await sendDaemonRequest({
      action: "get_agent",
      session_id: sessionId,
    });

    return response.agent || null;
  }

  /**
   * List agents with filters
   */
  async listAgents(filters?: {
    type?: AgentType;
    status?: AgentStatus;
    parentId?: string;
    config?: string;
  }): Promise<AgentInfo[]> {
    const data: any = {
      action: "list_agents",
    };

    if (filters?.type) data.type = filters.type;
    if (filters?.status) data.status = filters.status;
    if (filters?.parentId) data.parent_id = filters.parentId;
    if (filters?.config) data.config = filters.config;

    const response = await sendDaemonRequest(data);

    const agents: AgentInfo[] = response.agents || [];

    // Add uptime calculation
    return agents.map((agent) => ({
      ...agent,
      uptime: Date.now() - agent.createdAt,
    }));
  }

  /**
   * Get available (idle) workers
   */
  async getAvailableWorkers(): Promise<AgentInfo[]> {
    return this.listAgents({ type: "worker", status: "idle" });
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(sessionId: string, status: AgentStatus): Promise<boolean> {
    const response = await sendDaemonRequest({
      action: "update_agent_status",
      session_id: sessionId,
      status,
    });

    return response.success;
  }

  /**
   * Unregister agent
   */
  async unregisterAgent(sessionId: string): Promise<boolean> {
    const response = await sendDaemonRequest({
      action: "unregister_agent",
      session_id: sessionId,
    });

    return response.success;
  }

  // ============================================================
  // Message Operations
  // ============================================================

  /**
   * Get messages for an agent
   */
  async getMessages(sessionId: string, unreadOnly: boolean = false): Promise<AgentMessage[]> {
    const response = await sendDaemonRequest({
      action: "get_messages",
      session_id: sessionId,
      unread_only: unreadOnly,
    });

    return response.messages || [];
  }

  /**
   * Query messages with filters
   */
  async queryMessages(params: {
    type?: MessageType;
    status?: string;
    limit?: number;
    since?: number;
  }): Promise<AgentMessage[]> {
    const data: any = {
      action: "query_messages",
    };

    if (params.type) data.type = params.type;
    if (params.status) data.status = params.status;
    if (params.limit) data.limit = params.limit;
    if (params.since) data.since = params.since;

    const response = await sendDaemonRequest(data);

    return response.messages || [];
  }

  /**
   * Send message to an agent
   */
  async sendMessage(params: {
    from: string;
    to: string;
    type: MessageType;
    content: string;
    metadata?: Record<string, any>;
    replyTo?: string;
  }): Promise<AgentMessage | null> {
    const response = await sendDaemonRequest({
      action: "send_message",
      from: params.from,
      to: params.to,
      type: params.type,
      content: params.content,
      metadata: params.metadata,
      reply_to: params.replyTo,
    });

    return response.message || null;
  }

  /**
   * Mark messages as read
   */
  async markMessagesRead(sessionId: string, messageIds: string[]): Promise<boolean> {
    const response = await sendDaemonRequest({
      action: "mark_messages_read",
      session_id: sessionId,
      message_ids: messageIds,
    });

    return response.success;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    const response = await sendDaemonRequest({
      action: "delete_message",
      message_id: messageId,
    });

    return response.success;
  }

  // ============================================================
  // Statistics
  // ============================================================

  /**
   * Get agent statistics
   */
  async getStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    availableWorkers: number;
  }> {
    const agents = await this.getAllAgents();

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let availableWorkers = 0;

    for (const agent of agents) {
      byType[agent.type] = (byType[agent.type] || 0) + 1;
      byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;

      if (agent.type === "worker" && agent.status === "idle") {
        availableWorkers++;
      }
    }

    return {
      total: agents.length,
      byType,
      byStatus,
      availableWorkers,
    };
  }

  /**
   * Get agent heartbeat history (mock for now)
   */
  async getHeartbeatHistory(sessionId: string): Promise<Array<{
    timestamp: number;
    status: AgentStatus;
  }>> {
    // This would need to be implemented in the AgentRegistry
    // For now, return empty array
    return [];
  }
}

/**
 * Config packages API
 */
export class ConfigPackagesAPI {
  private paiDir: string;
  private agentConfigsDir: string;

  constructor(paiDir?: string) {
    this.paiDir = paiDir || process.env.PAI_DIR || require("os").homedir() + "/.claude";
    this.agentConfigsDir = paiDir
      ? paiDir + "/agent-configs"
      : require("path").join(__dirname, "../../agent-configs");
  }

  /**
   * Get all available config packages
   */
  async getConfigPackages(): Promise<Array<{
    name: string;
    path: string;
    hasClaudeMd: boolean;
    hasConfig: boolean;
  }>> {
    const { readdirSync, existsSync } = require("fs");
    const { join } = require("path");

    if (!existsSync(this.agentConfigsDir)) {
      return [];
    }

    const dirs = readdirSync(this.agentConfigsDir, { withFileTypes: true });
    const packages: Array<{
      name: string;
      path: string;
      hasClaudeMd: boolean;
      hasConfig: boolean;
    }> = [];

    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const configPath = join(this.agentConfigsDir, dir.name, ".claude");
        const hasClaudeMd = existsSync(join(configPath, "CLAUDE.md"));
        const hasConfig = existsSync(join(configPath, "config.json"));

        packages.push({
          name: dir.name,
          path: configPath,
          hasClaudeMd,
          hasConfig,
        });
      }
    }

    return packages;
  }

  /**
   * Get config package details
   */
  async getConfigPackage(name: string): Promise<{
    name: string;
    claudeMd?: string;
    config?: any;
  } | null> {
    const { readFileSync, existsSync } = require("fs");
    const { join } = require("path");

    const configPath = join(this.agentConfigsDir, name, ".claude");

    if (!existsSync(configPath)) {
      return null;
    }

    const claudeMdPath = join(configPath, "CLAUDE.md");
    const configJsonPath = join(configPath, "config.json");

    const result: any = {
      name,
    };

    if (existsSync(claudeMdPath)) {
      result.claudeMd = readFileSync(claudeMdPath, "utf-8");
    }

    if (existsSync(configJsonPath)) {
      result.config = JSON.parse(readFileSync(configJsonPath, "utf-8"));
    }

    return result;
  }
}
