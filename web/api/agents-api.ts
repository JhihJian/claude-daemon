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
   * List all active agent sessions (for the agents dashboard)
   */
  async listAgents(): Promise<any[]> {
    const activeSessions = this.sessionRegistry.getActive();

    return activeSessions.map(session => {
      const agent = this.agentRegistry.get(session.agent_name);
      const agentType = agent?.configJson?.agentType || 'worker';
      const startTime = new Date(session.start_time).getTime();
      const uptime = Date.now() - startTime;

      return {
        sessionId: session.session_id,
        label: session.agent_name,
        type: agentType,
        status: session.status === 'active' ? 'idle' : 'disconnected',
        agentConfig: session.agent_name,
        uptime: uptime,
        createdAt: startTime,
        lastHeartbeat: Date.now(), // TODO: Track actual heartbeats
        workingDirectory: session.working_directory,
        gitRepo: session.git_repo,
        gitBranch: session.git_branch,
        pid: session.pid,
      };
    });
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

  /**
   * List all agent configuration packages (for configs page)
   */
  async listAgentConfigs(): Promise<any[]> {
    const agents = this.agentRegistry.getAll();

    return agents.map(agent => ({
      name: agent.name,
      path: agent.configPath || 'built-in',
      hasClaudeMd: !!agent.claudeMd,
      hasConfig: !!agent.configJson,
      description: agent.description,
      version: agent.version,
    }));
  }

  /**
   * Get detailed agent configuration (for configs page)
   */
  async getAgentConfig(name: string): Promise<any | null> {
    const agent = this.agentRegistry.get(name);
    if (!agent) {
      return null;
    }

    return {
      name: agent.name,
      path: agent.configPath || 'built-in',
      hasClaudeMd: !!agent.claudeMd,
      hasConfig: !!agent.configJson,
      description: agent.description,
      version: agent.version,
      claudeMd: agent.claudeMd,
      config: agent.configJson,
      skills: agent.skills || [],
      mcpServers: agent.mcpServers || [],
    };
  }
}
