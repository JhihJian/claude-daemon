/**
 * session-manager.ts
 * Core session lifecycle management
 *
 * Orchestrates:
 * - Session creation (from agent or existing directory)
 * - Session resumption
 * - Session listing and filtering
 * - Session deletion with cleanup
 */

import { join, resolve } from 'path';
import { homedir, platform } from 'os';
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import { SessionStorage, SessionMetadata } from '../lib/session-storage.ts';
import { SessionValidator, ValidationError } from '../lib/session-validator.ts';
import { SessionError } from '../lib/errors.ts';
import { createLogger } from '../lib/logger.ts';

const logger = createLogger('SessionManager');

// ============================================================================
// Types
// ============================================================================

export interface CreateSessionOptions {
  sessionName?: string;
  agentName?: string;
  directory?: string;
  workspaceRoot?: string;
  environment?: Record<string, string>;
  httpProxy?: string;
  httpsProxy?: string;
  apiUrl?: string;
  apiToken?: string;
}

export interface SessionFilters {
  agentName?: string;
  recent?: boolean;
  recentDays?: number;
}

export interface SessionInfo extends SessionMetadata {
  scriptPath: string;
  workspaceExists: boolean;
}

// ============================================================================
// SessionManager Class
// ============================================================================

export class SessionManager {
  private storage: SessionStorage;
  private agentConfigsDir: string;

  constructor(
    private paiDir?: string,
    agentConfigsDir?: string
  ) {
    const baseDir = paiDir || process.env.PAI_DIR || join(homedir(), '.claude');
    this.agentConfigsDir = agentConfigsDir || join(baseDir, 'agent-configs');
    this.storage = new SessionStorage(baseDir);

    logger.info('SessionManager initialized', {
      paiDir: baseDir,
      agentConfigsDir: this.agentConfigsDir,
    });
  }

  /**
   * Create a new session
   */
  async createSession(options: CreateSessionOptions): Promise<SessionInfo> {
    logger.info('Creating new session', options);

    // Get existing session names for validation
    const existingSessions = await this.storage.listAllMetadata();
    const existingNames = existingSessions.map(s => s.sessionName);

    // Validate options
    await SessionValidator.validateLaunchOptions({
      ...options,
      agentConfigsDir: this.agentConfigsDir,
      existingSessionNames: existingNames,
    });

    // Generate session name if not provided
    const sessionName = options.sessionName || this.generateSessionName(options.agentName);

    // Validate session name
    SessionValidator.validateSessionName(sessionName);
    SessionValidator.validateSessionUniqueness(sessionName, existingNames);

    // Determine workspace path
    const workspacePath = await this.determineWorkspacePath(sessionName, options);

    // Prepare environment variables
    const environment = this.prepareEnvironment(options);

    // Create session metadata
    const metadata: SessionMetadata = {
      sessionName,
      agentName: options.agentName || null,
      workspacePath,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      environment,
      platform: platform(),
    };

    try {
      // Create workspace if using agent
      if (options.agentName) {
        await this.setupWorkspaceFromAgent(workspacePath, options.agentName, environment);
      } else if (options.directory) {
        // Validate existing directory
        SessionValidator.validateDirectoryExists(options.directory);
        // Create .claude directory in existing workspace
        await this.setupWorkspaceFromDirectory(workspacePath, environment);
      }

      // Save metadata
      await this.storage.saveMetadata(metadata);

      // Create launch script
      const scriptPath = await this.storage.createLaunchScript(metadata);

      logger.info('Session created successfully', { sessionName, workspacePath });

      return {
        ...metadata,
        scriptPath,
        workspaceExists: true,
      };
    } catch (error) {
      // Rollback on failure
      await this.rollbackSession(sessionName, workspacePath, options.agentName !== undefined);
      throw error;
    }
  }

  /**
   * Resume an existing session
   */
  async resumeSession(sessionName: string): Promise<void> {
    logger.info('Resuming session', { sessionName });

    // Load metadata
    const metadata = await this.storage.loadMetadata(sessionName);
    if (!metadata) {
      throw new SessionError(
        `Session "${sessionName}" not found`,
        'SESSION_NOT_FOUND',
        false,
        { sessionName }
      );
    }

    // Validate workspace still exists
    if (!existsSync(metadata.workspacePath)) {
      throw new SessionError(
        `Workspace directory not found: ${metadata.workspacePath}`,
        'WORKSPACE_NOT_FOUND',
        true,
        { workspacePath: metadata.workspacePath }
      );
    }

    // Update last accessed timestamp
    await this.storage.updateLastAccessed(sessionName);

    // Launch Claude Code CLI
    await this.launchClaudeCLI(metadata);

    logger.info('Session resumed successfully', { sessionName });
  }

  /**
   * List all sessions with optional filters
   */
  async listSessions(filters?: SessionFilters): Promise<SessionInfo[]> {
    const allMetadata = await this.storage.listAllMetadata();
    let filtered = allMetadata;

    // Apply filters
    if (filters?.agentName) {
      filtered = filtered.filter(m => m.agentName === filters.agentName);
    }

    if (filters?.recent) {
      const daysAgo = filters.recentDays || 7;
      const cutoffDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(m => new Date(m.lastAccessedAt) >= cutoffDate);
    }

    // Sort by last accessed (most recent first)
    filtered.sort((a, b) =>
      new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
    );

    // Map to SessionInfo
    return filtered.map(metadata => ({
      ...metadata,
      scriptPath: this.getScriptPath(metadata.sessionName),
      workspaceExists: existsSync(metadata.workspacePath),
    }));
  }

  /**
   * Get session information
   */
  async getSession(sessionName: string): Promise<SessionInfo | null> {
    const metadata = await this.storage.loadMetadata(sessionName);
    if (!metadata) {
      return null;
    }

    return {
      ...metadata,
      scriptPath: this.getScriptPath(sessionName),
      workspaceExists: existsSync(metadata.workspacePath),
    };
  }

  /**
   * Delete a session
   */
  async deleteSession(
    sessionName: string,
    deleteWorkspace: boolean = false
  ): Promise<void> {
    logger.info('Deleting session', { sessionName, deleteWorkspace });

    const metadata = await this.storage.loadMetadata(sessionName);
    if (!metadata) {
      throw new SessionError(
        `Session "${sessionName}" not found`,
        'SESSION_NOT_FOUND',
        false,
        { sessionName }
      );
    }

    // Check for uncommitted git changes if deleting workspace
    if (deleteWorkspace && existsSync(metadata.workspacePath)) {
      const isClean = await SessionValidator.validateGitClean(metadata.workspacePath);
      if (!isClean) {
        logger.warn('Workspace has uncommitted git changes', {
          sessionName,
          workspacePath: metadata.workspacePath,
        });
      }
    }

    // Delete metadata
    await this.storage.deleteMetadata(sessionName);

    // Delete launch script
    await this.storage.deleteLaunchScript(sessionName);

    // Delete workspace if requested
    if (deleteWorkspace && existsSync(metadata.workspacePath)) {
      try {
        rmSync(metadata.workspacePath, { recursive: true, force: true });
        logger.info('Workspace deleted', { workspacePath: metadata.workspacePath });
      } catch (error) {
        logger.error('Failed to delete workspace', {
          workspacePath: metadata.workspacePath,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new SessionError(
          `Failed to delete workspace: ${error instanceof Error ? error.message : String(error)}`,
          'WORKSPACE_DELETE_FAILED',
          false,
          { workspacePath: metadata.workspacePath }
        );
      }
    }

    logger.info('Session deleted successfully', { sessionName });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Generate session name from agent name
   */
  private generateSessionName(agentName?: string): string {
    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .slice(0, 15);

    if (agentName) {
      return `${agentName}-${timestamp}`;
    }
    return `session-${timestamp}`;
  }

  /**
   * Determine workspace path
   */
  private async determineWorkspacePath(
    sessionName: string,
    options: CreateSessionOptions
  ): Promise<string> {
    if (options.directory) {
      // Use existing directory
      return resolve(options.directory);
    }

    // Create new directory
    const workspaceRoot = options.workspaceRoot || process.cwd();

    // Create workspace root if it doesn't exist
    if (!existsSync(workspaceRoot)) {
      mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 });
      logger.debug('Created workspace root', { workspaceRoot });
    }

    return resolve(join(workspaceRoot, sessionName));
  }

  /**
   * Prepare environment variables
   */
  private prepareEnvironment(options: CreateSessionOptions): Record<string, string> {
    const env: Record<string, string> = { ...options.environment };

    if (options.httpProxy) {
      env.http_proxy = options.httpProxy;
    }
    if (options.httpsProxy) {
      env.https_proxy = options.httpsProxy;
    }
    if (options.apiUrl) {
      env.ANTHROPIC_BASE_URL = options.apiUrl;
    }
    if (options.apiToken) {
      env.ANTHROPIC_AUTH_TOKEN = options.apiToken;
    }

    return env;
  }

  /**
   * Setup workspace from agent configuration
   */
  private async setupWorkspaceFromAgent(
    workspacePath: string,
    agentName: string,
    environment: Record<string, string>
  ): Promise<void> {
    const agentDir = join(this.agentConfigsDir, agentName);

    // Create workspace directory
    if (!existsSync(workspacePath)) {
      mkdirSync(workspacePath, { recursive: true, mode: 0o700 });
    }

    // Create .claude directory
    const claudeDir = join(workspacePath, '.claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true, mode: 0o700 });
    }

    // Copy CLAUDE.md
    const claudeMdSrc = join(agentDir, 'CLAUDE.md');
    const claudeMdDest = join(claudeDir, 'CLAUDE.md');
    if (existsSync(claudeMdSrc)) {
      cpSync(claudeMdSrc, claudeMdDest);
    }

    // Copy config.json if exists
    const configSrc = join(agentDir, 'config.json');
    const configDest = join(claudeDir, 'config.json');
    if (existsSync(configSrc)) {
      cpSync(configSrc, configDest);
    }

    // Write .env file
    await this.writeEnvFile(join(claudeDir, '.env'), environment);

    logger.debug('Workspace setup from agent', { workspacePath, agentName });
  }

  /**
   * Setup workspace from existing directory
   */
  private async setupWorkspaceFromDirectory(
    workspacePath: string,
    environment: Record<string, string>
  ): Promise<void> {
    // Create .claude directory
    const claudeDir = join(workspacePath, '.claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true, mode: 0o700 });
    }

    // Write .env file
    await this.writeEnvFile(join(claudeDir, '.env'), environment);

    logger.debug('Workspace setup from directory', { workspacePath });
  }

  /**
   * Write environment variables to .env file
   */
  private async writeEnvFile(
    envPath: string,
    environment: Record<string, string>
  ): Promise<void> {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(environment)) {
      // Escape quotes in value
      const escapedValue = value.replace(/"/g, '\\"');
      lines.push(`${key}="${escapedValue}"`);
    }

    writeFileSync(envPath, lines.join('\n') + '\n', { mode: 0o600 });
  }

  /**
   * Launch Claude Code CLI
   */
  private async launchClaudeCLI(metadata: SessionMetadata): Promise<void> {
    // Prepare environment
    const env = { ...process.env, ...metadata.environment };

    // Spawn Claude CLI
    const child = spawn('claude', [], {
      cwd: metadata.workspacePath,
      env,
      stdio: 'inherit',
      detached: false,
    });

    child.on('error', (error) => {
      throw new SessionError(
        `Failed to launch Claude Code CLI: ${error.message}`,
        'LAUNCH_FAILED',
        false,
        { error: error.message }
      );
    });
  }

  /**
   * Rollback session creation on failure
   */
  private async rollbackSession(
    sessionName: string,
    workspacePath: string,
    createdWorkspace: boolean
  ): Promise<void> {
    logger.warn('Rolling back session creation', { sessionName });

    try {
      // Delete metadata if exists
      await this.storage.deleteMetadata(sessionName);

      // Delete launch script if exists
      await this.storage.deleteLaunchScript(sessionName);

      // Delete workspace if we created it
      if (createdWorkspace && existsSync(workspacePath)) {
        rmSync(workspacePath, { recursive: true, force: true });
      }
    } catch (error) {
      logger.error('Rollback failed', {
        sessionName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get script path for session
   */
  private getScriptPath(sessionName: string): string {
    const extension = platform() === 'win32' ? 'ps1' : 'sh';
    return join(this.storage.getScriptsDir(), `${sessionName}.${extension}`);
  }
}

/**
 * Default instance
 */
export const sessionManager = new SessionManager();
