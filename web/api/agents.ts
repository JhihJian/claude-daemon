/**
 * Agents API
 * Agent Registry and Message Broker HTTP API
 *
 * Exposes Agent operations via HTTP for the web interface.
 * Uses direct reference to HookServer instead of Socket connection.
 */

import { join } from 'path';
import type { HookServer } from '../../daemon/hook-server';
import type { AgentRegistry } from '../../daemon/agent-registry';
import type { MessageBroker } from '../../daemon/message-broker';

/**
 * Agent types
 */
export type AgentType = 'master' | 'worker';
export type AgentStatus = 'idle' | 'busy' | 'error' | 'disconnected';

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
export type MessageType = 'task' | 'progress' | 'result' | 'error' | 'control';

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
 * Agents API class
 */
export class AgentsAPI {
  private hookServer?: HookServer;

  constructor(hookServer?: HookServer) {
    this.hookServer = hookServer;
  }

  /**
   * Set HookServer reference (for late binding)
   */
  setHookServer(hookServer: HookServer): void {
    this.hookServer = hookServer;
  }

  /**
   * Get AgentRegistry instance
   */
  private getRegistry(): AgentRegistry | null {
    return this.hookServer?.getAgentRegistry() || null;
  }

  /**
   * Get MessageBroker instance
   */
  private getBroker(): MessageBroker | null {
    return this.hookServer?.getMessageBroker() || null;
  }

  /**
   * Check if Daemon components are available
   */
  isAvailable(): boolean {
    return this.getRegistry() !== null;
  }

  // ============================================================
  // Agent Operations
  // ============================================================

  /**
   * Get all agents
   */
  async getAllAgents(): Promise<AgentInfo[]> {
    const registry = this.getRegistry();
    if (!registry) {
      return [];
    }

    const agents = registry.getAll();

    // Add uptime calculation
    return agents.map((agent: any) => ({
      ...agent,
      uptime: Date.now() - agent.createdAt,
    }));
  }

  /**
   * Get agent by session ID
   */
  async getAgent(sessionId: string): Promise<AgentInfo | null> {
    const registry = this.getRegistry();
    if (!registry) {
      return null;
    }

    const agent = registry.get(sessionId);
    return agent || null;
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
    const registry = this.getRegistry();
    if (!registry) {
      return [];
    }

    const queryOptions: any = {};
    if (filters?.type) queryOptions.type = filters.type;
    if (filters?.status) queryOptions.status = filters.status;
    if (filters?.parentId) queryOptions.parentId = filters.parentId;
    if (filters?.config) queryOptions.agentConfig = filters.config;

    const agents = registry.query(queryOptions);

    // Add uptime calculation
    return agents.map((agent: any) => ({
      ...agent,
      uptime: Date.now() - agent.createdAt,
    }));
  }

  /**
   * Get available (idle) workers
   */
  async getAvailableWorkers(): Promise<AgentInfo[]> {
    return this.listAgents({ type: 'worker', status: 'idle' });
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(sessionId: string, status: AgentStatus): Promise<boolean> {
    const registry = this.getRegistry();
    if (!registry) {
      return false;
    }

    const updated = registry.updateStatus(sessionId, status);
    return !!updated;
  }

  /**
   * Unregister agent
   */
  async unregisterAgent(sessionId: string): Promise<boolean> {
    const registry = this.getRegistry();
    if (!registry) {
      return false;
    }

    return registry.unregister(sessionId);
  }

  // ============================================================
  // Message Operations
  // ============================================================

  /**
   * Get messages for an agent
   */
  async getMessages(sessionId: string, unreadOnly: boolean = false): Promise<AgentMessage[]> {
    const broker = this.getBroker();
    if (!broker) {
      return [];
    }

    if (unreadOnly) {
      return broker.getUnreadMessages(sessionId);
    } else {
      return broker.getMessages(sessionId);
    }
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
    const broker = this.getBroker();
    if (!broker) {
      return [];
    }

    const queryOptions: any = {};
    if (params.type) queryOptions.type = params.type;
    if (params.status) queryOptions.status = params.status;
    if (params.limit) queryOptions.limit = params.limit;
    if (params.since) queryOptions.since = params.since;

    return broker.query(queryOptions);
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
    const broker = this.getBroker();
    if (!broker) {
      return null;
    }

    return broker.send({
      from: params.from,
      to: params.to,
      type: params.type,
      content: params.content,
      metadata: params.metadata,
      replyTo: params.replyTo,
    });
  }

  /**
   * Mark messages as read
   */
  async markMessagesRead(sessionId: string, messageIds: string[]): Promise<boolean> {
    const broker = this.getBroker();
    if (!broker) {
      return false;
    }

    let allMarked = true;
    for (const id of messageIds) {
      const marked = broker.markAsRead(id);
      if (!marked) allMarked = false;
    }
    return allMarked;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    const broker = this.getBroker();
    if (!broker) {
      return false;
    }

    return broker.deleteMessage(messageId);
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

      if (agent.type === 'worker' && agent.status === 'idle') {
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
    this.paiDir = paiDir || process.env.PAI_DIR || join(process.env.HOME || '', '.claude');
    this.agentConfigsDir = join(process.env.PWD || process.cwd(), 'agent-configs');
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
    const { readdirSync, existsSync } = require('fs');
    const { join } = require('path');

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
        const configPath = join(this.agentConfigsDir, dir.name, '.claude');
        const hasClaudeMd = existsSync(join(configPath, 'CLAUDE.md'));
        const hasConfig = existsSync(join(configPath, 'config.json'));

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
    const { readFileSync, existsSync } = require('fs');
    const { join } = require('path');

    const configPath = join(this.agentConfigsDir, name, '.claude');

    if (!existsSync(configPath)) {
      return null;
    }

    const claudeMdPath = join(configPath, 'CLAUDE.md');
    const configJsonPath = join(configPath, 'config.json');

    const result: any = {
      name,
    };

    if (existsSync(claudeMdPath)) {
      result.claudeMd = readFileSync(claudeMdPath, 'utf-8');
    }

    if (existsSync(configJsonPath)) {
      result.config = JSON.parse(readFileSync(configJsonPath, 'utf-8'));
    }

    return result;
  }
}
