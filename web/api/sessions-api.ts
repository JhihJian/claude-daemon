/**
 * Sessions API
 * Handles session management, launching, and archive queries
 */

import type { AgentDefinitionRegistry } from '../../daemon/agent-definition-registry.ts';
import type { SessionRegistry, SessionRecord } from '../../daemon/session-registry.ts';
import type { SessionLauncher, LaunchResult } from '../../daemon/session-launcher.ts';
import type { StorageService } from '../../daemon/storage-service.ts';

export class SessionsAPI {
  constructor(
    private agentRegistry: AgentDefinitionRegistry,
    private sessionRegistry: SessionRegistry,
    private sessionLauncher: SessionLauncher,
    private storage: StorageService
  ) {}

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<SessionRecord[]> {
    return this.sessionRegistry.getActive();
  }

  /**
   * Get a specific active session
   */
  async getActiveSession(sessionId: string): Promise<SessionRecord | null> {
    const session = this.sessionRegistry.get(sessionId);
    return session || null;
  }

  /**
   * Launch a new session with agent configuration
   */
  async launchSession(params: {
    agentName: string;
    workingDirectory: string;
  }): Promise<LaunchResult> {
    return await this.sessionLauncher.launchSession(
      params.agentName,
      params.workingDirectory
    );
  }

  /**
   * Terminate an active session
   */
  async terminateSession(sessionId: string): Promise<boolean> {
    return await this.sessionLauncher.terminateSession(sessionId);
  }

  /**
   * Query archived sessions
   */
  async queryArchive(filters: {
    agentName?: string;
    workingDirectory?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<SessionRecord[]> {
    return await this.storage.queryArchive(filters);
  }

  /**
   * Get a specific archived session
   */
  async getArchivedSession(sessionId: string): Promise<SessionRecord | null> {
    // Query archive for this specific session
    const results = await this.storage.queryArchive({ limit: 1000 });
    const session = results.find(s => s.session_id === sessionId);
    return session || null;
  }

  /**
   * Get sessions by agent name (active + recent archived)
   */
  async getSessionsByAgent(agentName: string, limit: number = 50): Promise<{
    active: SessionRecord[];
    archived: SessionRecord[];
  }> {
    const active = this.sessionRegistry.getByAgent(agentName);
    const archived = await this.storage.queryArchive({ agentName, limit });

    return { active, archived };
  }
}
