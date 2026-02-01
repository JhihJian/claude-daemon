/**
 * Agents API
 * Handles agent configuration management
 */

import type { AgentDefinitionRegistry, AgentDefinition } from '../../daemon/agent-definition-registry.ts';
import type { SessionRegistry } from '../../daemon/session-registry.ts';

export class AgentsAPI {
  constructor(
    private agentRegistry: AgentDefinitionRegistry,
    private sessionRegistry: SessionRegistry
  ) {}

  /**
   * List all agent configurations
   */
  async listAgents(): Promise<AgentDefinition[]> {
    return this.agentRegistry.getAll();
  }

  /**
   * Get a specific agent configuration
   */
  async getAgent(name: string): Promise<AgentDefinition | null> {
    const agent = this.agentRegistry.get(name);
    return agent || null;
  }

  /**
   * Reload an agent configuration from disk
   */
  async reloadAgent(name: string): Promise<{ success: boolean; error?: string }> {
    const success = await this.agentRegistry.reload(name);
    if (success) {
      return { success: true };
    } else {
      return { success: false, error: 'Failed to reload agent configuration' };
    }
  }

  /**
   * Reload all agent configurations
   */
  async reloadAll(): Promise<{ success: boolean; count: number }> {
    await this.agentRegistry.reloadAll();
    const count = this.agentRegistry.listAgents().length;
    return { success: true, count };
  }

  /**
   * Get agent with usage statistics
   */
  async getAgentWithStats(name: string): Promise<{
    agent: AgentDefinition | null;
    activeSessions: number;
    totalSessions?: number;
  } | null> {
    const agent = this.agentRegistry.get(name);
    if (!agent) {
      return null;
    }

    const activeSessions = this.sessionRegistry.getByAgent(name).length;

    return {
      agent,
      activeSessions,
    };
  }

  /**
   * Get environment variable keys (not values) for an agent
   */
  async getAgentEnvironmentKeys(name: string): Promise<{
    keys: string[];
    count: number;
  } | null> {
    const agent = this.agentRegistry.get(name);
    if (!agent || !agent.environment) {
      return null;
    }

    const keys = Object.keys(agent.environment);
    return { keys, count: keys.length };
  }
}
