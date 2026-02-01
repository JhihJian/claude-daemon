/**
 * session-launcher.ts
 * Launches Claude CLI sessions with agent configurations
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { EventEmitter } from 'events';
import { createHookLogger } from '../lib/logger.ts';
import type { AgentDefinitionRegistry } from './agent-definition-registry.ts';
import type { SessionRegistry, SessionRecord } from './session-registry.ts';

const logger = createHookLogger('SessionLauncher');

/**
 * Launch result
 */
export interface LaunchResult {
  success: boolean;
  session_id?: string;
  pid?: number;
  error?: string;
  warning?: string;
}

/**
 * Session Launcher
 * Launches Claude CLI sessions with agent configurations
 */
export class SessionLauncher {
  private readonly REGISTRATION_TIMEOUT = 5000; // 5 seconds

  constructor(
    private agentRegistry: AgentDefinitionRegistry,
    private sessionRegistry: SessionRegistry,
    private eventBus: EventEmitter
  ) {}

  /**
   * Launch a new Claude CLI session with agent configuration
   */
  async launchSession(
    agentName: string,
    workingDirectory: string
  ): Promise<LaunchResult> {
    // Validate agent exists
    const agent = this.agentRegistry.get(agentName);
    if (!agent) {
      logger.error('Agent not found', { agentName });
      return { success: false, error: `Agent '${agentName}' not found` };
    }

    // Validate working directory
    if (!existsSync(workingDirectory)) {
      logger.error('Working directory not found', { workingDirectory });
      return { success: false, error: 'Working directory not found' };
    }

    // Prepare environment variables
    const env = {
      ...process.env,
      ...agent.environment,
      CLAUDE_AGENT_CONFIG: agentName,
    };

    logger.info('Launching Claude CLI session', {
      agent: agentName,
      workingDir: workingDirectory,
    });

    return new Promise<LaunchResult>((resolve) => {
      // Spawn Claude CLI process
      const child = spawn('claude', ['--dangerously-skip-permissions'], {
        cwd: workingDirectory,
        env,
        detached: true,
        stdio: 'ignore',
      });

      let resolved = false;

      // Handle spawn errors
      child.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          logger.error('Failed to spawn Claude CLI', error);
          resolve({
            success: false,
            error: `Failed to launch: ${error.message}`,
          });
        }
      });

      // Process successfully spawned
      child.on('spawn', () => {
        const pid = child.pid!;

        logger.info('Claude CLI process spawned', { pid });

        // Detach child process so it runs independently
        child.unref();

        // Wait for session registration event
        this.waitForRegistration(pid)
          .then((sessionId) => {
            if (!resolved) {
              resolved = true;
              logger.info('Session registered successfully', {
                sessionId,
                pid,
                agent: agentName,
              });
              resolve({
                success: true,
                session_id: sessionId,
                pid,
              });
            }
          })
          .catch((error) => {
            if (!resolved) {
              resolved = true;
              logger.warn('Session launched but registration not confirmed', {
                pid,
                error: error.message,
              });
              resolve({
                success: true,
                pid,
                warning: 'Session launched but registration not confirmed',
              });
            }
          });
      });

      // Process exited unexpectedly
      child.on('exit', (code, signal) => {
        if (!resolved) {
          resolved = true;
          logger.error('Claude CLI process exited unexpectedly', {
            code,
            signal,
          });
          resolve({
            success: false,
            error: `Process exited: code=${code}, signal=${signal}`,
          });
        }
      });
    });
  }

  /**
   * Wait for session registration event
   */
  private waitForRegistration(pid: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.eventBus.off('session_registered', handler);
        reject(new Error('Registration timeout'));
      }, this.REGISTRATION_TIMEOUT);

      const handler = (session: SessionRecord) => {
        if (session.pid === pid) {
          clearTimeout(timeout);
          this.eventBus.off('session_registered', handler);
          resolve(session.session_id);
        }
      };

      this.eventBus.on('session_registered', handler);
    });
  }

  /**
   * Terminate a running session
   */
  async terminateSession(sessionId: string): Promise<boolean> {
    const session = this.sessionRegistry.get(sessionId);
    if (!session) {
      logger.warn('Cannot terminate unknown session', { sessionId });
      return false;
    }

    try {
      // Send SIGTERM to the process
      process.kill(session.pid, 'SIGTERM');
      logger.info('Sent SIGTERM to session', {
        sessionId,
        pid: session.pid,
      });
      return true;
    } catch (error) {
      logger.error('Failed to terminate session', {
        sessionId,
        pid: session.pid,
        error,
      });
      return false;
    }
  }
}
