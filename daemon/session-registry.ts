/**
 * session-registry.ts
 * Tracks active Claude sessions with their agent configurations
 * Includes persistence and process lifecycle management
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { createHookLogger } from '../lib/logger.ts';
import { config } from '../lib/config.ts';
import type { StorageService } from './storage-service.ts';

const logger = createHookLogger('SessionRegistry');

/**
 * Session status
 */
export type SessionStatus = 'active' | 'terminated' | 'crashed';

/**
 * Session record
 */
export interface SessionRecord {
  session_id: string;
  agent_name: string;
  pid: number;
  status: SessionStatus;
  start_time: string;
  end_time?: string;
  working_directory: string;
  git_repo?: string;
  git_branch?: string;
  environment?: Record<string, string>;
}

/**
 * Session Registry
 * Manages active sessions with persistence and process tracking
 */
export class SessionRegistry {
  private activeSessions = new Map<string, SessionRecord>();
  private readonly statePath: string;
  private operationLock = Promise.resolve();

  constructor(private storage: StorageService) {
    const cfg = config.get();
    this.statePath = join(cfg.sessionsDir, 'active-sessions.json');
  }

  /**
   * Initialize and restore persisted active sessions
   * Verifies that processes are still alive
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.statePath)) {
      logger.info('No persisted sessions to restore');
      return;
    }

    try {
      const content = await readFile(this.statePath, 'utf-8');
      const savedSessions: SessionRecord[] = JSON.parse(content);

      logger.info(`Restoring ${savedSessions.length} persisted session(s)...`);

      for (const session of savedSessions) {
        // Verify process is still running
        if (this.isProcessAlive(session.pid)) {
          this.activeSessions.set(session.session_id, session);
          logger.info('Restored active session', {
            sessionId: session.session_id,
            pid: session.pid,
            agent: session.agent_name,
          });
        } else {
          // Process no longer exists, archive as crashed
          logger.warn('Session process terminated, archiving', {
            sessionId: session.session_id,
            pid: session.pid,
          });
          session.status = 'crashed';
          session.end_time = new Date().toISOString();
          await this.storage.archiveSession(session);
        }
      }

      // Save cleaned state
      await this.persistState();

      logger.info(`Restored ${this.activeSessions.size} active session(s)`);
    } catch (error) {
      logger.error('Failed to restore active sessions', error);
    }
  }

  /**
   * Register a new session
   */
  async register(session: SessionRecord): Promise<void> {
    await this.withLock(async () => {
      this.activeSessions.set(session.session_id, session);
      await this.persistState();

      logger.info('Session registered', {
        sessionId: session.session_id,
        agent: session.agent_name,
        pid: session.pid,
        workingDir: session.working_directory,
      });
    });
  }

  /**
   * Unregister a session and archive it
   */
  async unregister(sessionId: string): Promise<SessionRecord | null> {
    return await this.withLock(async () => {
      const session = this.activeSessions.get(sessionId);

      if (!session) {
        logger.warn('Attempted to unregister unknown session', { sessionId });
        return null;
      }

      this.activeSessions.delete(sessionId);

      // Archive the session
      session.end_time = new Date().toISOString();
      session.status = 'terminated';
      await this.storage.archiveSession(session);

      // Persist updated state
      await this.persistState();

      logger.info('Session unregistered and archived', {
        sessionId: session.session_id,
        agent: session.agent_name,
        duration: this.calculateDuration(session),
      });

      return session;
    });
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): SessionRecord | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActive(): SessionRecord[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get active session count
   */
  getActiveCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get sessions by agent name
   */
  getByAgent(agentName: string): SessionRecord[] {
    return this.getActive().filter(s => s.agent_name === agentName);
  }

  /**
   * Check if a process is alive
   */
  private isProcessAlive(pid: number): boolean {
    try {
      // Send signal 0 to check if process exists
      // This doesn't actually send a signal, just checks permissions
      process.kill(pid, 0);
      return true;
    } catch (error: any) {
      // ESRCH means process doesn't exist
      // EPERM means process exists but we don't have permission (still alive)
      if (error.code === 'EPERM') {
        return true;
      }
      return false;
    }
  }

  /**
   * Persist active sessions state to disk
   */
  private async persistState(): Promise<void> {
    try {
      const sessions = Array.from(this.activeSessions.values());
      await writeFile(
        this.statePath,
        JSON.stringify(sessions, null, 2),
        { mode: 0o600 }
      );

      logger.debug('Persisted active sessions state', {
        count: sessions.length,
      });
    } catch (error) {
      logger.error('Failed to persist active sessions state', error);
      throw error;
    }
  }

  /**
   * Execute operation with lock to ensure serial execution
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previousLock = this.operationLock;
    let resolve: () => void;

    this.operationLock = new Promise<void>((r) => {
      resolve = r;
    });

    try {
      await previousLock;
      return await operation();
    } finally {
      resolve!();
    }
  }

  /**
   * Calculate session duration in seconds
   */
  private calculateDuration(session: SessionRecord): number {
    const start = new Date(session.start_time).getTime();
    const end = session.end_time ? new Date(session.end_time).getTime() : Date.now();
    return Math.floor((end - start) / 1000);
  }

  /**
   * Clean up stale sessions (for scheduled task)
   */
  async cleanupStaleSessions(): Promise<number> {
    let cleaned = 0;

    await this.withLock(async () => {
      for (const [sessionId, session] of this.activeSessions.entries()) {
        if (!this.isProcessAlive(session.pid)) {
          logger.warn('Detected stale session, archiving', {
            sessionId,
            pid: session.pid,
          });

          this.activeSessions.delete(sessionId);
          session.status = 'crashed';
          session.end_time = new Date().toISOString();
          await this.storage.archiveSession(session);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        await this.persistState();
      }
    });

    return cleaned;
  }
}
