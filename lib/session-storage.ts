/**
 * session-storage.ts
 * Session metadata and launch script storage
 *
 * Handles:
 * - Reading/writing session metadata files
 * - Creating/deleting launch scripts
 * - Platform-specific script generation
 */

import { join } from 'path';
import { homedir, platform } from 'os';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  chmodSync,
} from 'fs';
import { FileSystemError, safeJSONParse } from './errors.ts';
import { createLogger } from './logger.ts';

const logger = createLogger('SessionStorage');

// ============================================================================
// Types
// ============================================================================

export interface SessionMetadata {
  sessionName: string;
  agentName: string | null;
  workspacePath: string;
  createdAt: string;
  lastAccessedAt: string;
  environment: Record<string, string>;
  platform: string;
}

export interface Session {
  metadata: SessionMetadata;
  scriptPath: string;
}

// ============================================================================
// SessionStorage Class
// ============================================================================

export class SessionStorage {
  private sessionsDir: string;
  private metadataDir: string;
  private scriptsDir: string;
  private currentPlatform: string;

  constructor(paiDir?: string) {
    const baseDir = paiDir || process.env.PAI_DIR || join(homedir(), '.claude');
    this.sessionsDir = join(baseDir, 'sessions');
    this.metadataDir = join(this.sessionsDir, 'metadata');
    this.scriptsDir = join(this.sessionsDir, 'scripts');
    this.currentPlatform = platform();

    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    for (const dir of [this.sessionsDir, this.metadataDir, this.scriptsDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        logger.debug(`Created directory: ${dir}`);
      }
    }
  }

  /**
   * Save session metadata
   */
  async saveMetadata(metadata: SessionMetadata): Promise<void> {
    const metadataPath = this.getMetadataPath(metadata.sessionName);

    try {
      const content = JSON.stringify(metadata, null, 2);
      writeFileSync(metadataPath, content, { mode: 0o600 });
      logger.info(`Saved metadata for session: ${metadata.sessionName}`);
    } catch (error) {
      throw new FileSystemError(
        `Failed to save metadata: ${error instanceof Error ? error.message : String(error)}`,
        metadataPath,
        'write'
      );
    }
  }

  /**
   * Load session metadata
   */
  async loadMetadata(sessionName: string): Promise<SessionMetadata | null> {
    const metadataPath = this.getMetadataPath(sessionName);

    if (!existsSync(metadataPath)) {
      return null;
    }

    try {
      const content = readFileSync(metadataPath, 'utf-8');
      return safeJSONParse<SessionMetadata>(content, null as any, `metadata-${sessionName}`);
    } catch (error) {
      throw new FileSystemError(
        `Failed to load metadata: ${error instanceof Error ? error.message : String(error)}`,
        metadataPath,
        'read'
      );
    }
  }

  /**
   * Delete session metadata
   */
  async deleteMetadata(sessionName: string): Promise<void> {
    const metadataPath = this.getMetadataPath(sessionName);

    if (existsSync(metadataPath)) {
      try {
        unlinkSync(metadataPath);
        logger.info(`Deleted metadata for session: ${sessionName}`);
      } catch (error) {
        throw new FileSystemError(
          `Failed to delete metadata: ${error instanceof Error ? error.message : String(error)}`,
          metadataPath,
          'delete'
        );
      }
    }
  }

  /**
   * List all session metadata
   */
  async listAllMetadata(): Promise<SessionMetadata[]> {
    if (!existsSync(this.metadataDir)) {
      return [];
    }

    const files = readdirSync(this.metadataDir);
    const sessions: SessionMetadata[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const sessionName = file.replace('.json', '');
        const metadata = await this.loadMetadata(sessionName);
        if (metadata) {
          sessions.push(metadata);
        }
      }
    }

    return sessions;
  }

  /**
   * Create launch script for session
   */
  async createLaunchScript(metadata: SessionMetadata): Promise<string> {
    const scriptPath = this.getScriptPath(metadata.sessionName);
    const scriptContent = this.generateScriptContent(metadata);

    try {
      writeFileSync(scriptPath, scriptContent, { mode: 0o700 });
      logger.info(`Created launch script: ${scriptPath}`);
      return scriptPath;
    } catch (error) {
      throw new FileSystemError(
        `Failed to create launch script: ${error instanceof Error ? error.message : String(error)}`,
        scriptPath,
        'write'
      );
    }
  }

  /**
   * Delete launch script
   */
  async deleteLaunchScript(sessionName: string): Promise<void> {
    const scriptPath = this.getScriptPath(sessionName);

    if (existsSync(scriptPath)) {
      try {
        unlinkSync(scriptPath);
        logger.info(`Deleted launch script for session: ${sessionName}`);
      } catch (error) {
        throw new FileSystemError(
          `Failed to delete launch script: ${error instanceof Error ? error.message : String(error)}`,
          scriptPath,
          'delete'
        );
      }
    }
  }

  /**
   * Update last accessed timestamp
   */
  async updateLastAccessed(sessionName: string): Promise<void> {
    const metadata = await this.loadMetadata(sessionName);
    if (metadata) {
      metadata.lastAccessedAt = new Date().toISOString();
      await this.saveMetadata(metadata);
    }
  }

  /**
   * Check if session exists
   */
  sessionExists(sessionName: string): boolean {
    return existsSync(this.getMetadataPath(sessionName));
  }

  /**
   * Get metadata file path
   */
  private getMetadataPath(sessionName: string): string {
    return join(this.metadataDir, `${sessionName}.json`);
  }

  /**
   * Get script file path
   */
  private getScriptPath(sessionName: string): string {
    const extension = this.currentPlatform === 'win32' ? 'ps1' : 'sh';
    return join(this.scriptsDir, `${sessionName}.${extension}`);
  }

  /**
   * Generate launch script content
   */
  private generateScriptContent(metadata: SessionMetadata): string {
    if (this.currentPlatform === 'win32') {
      return this.generateWindowsScript(metadata);
    } else {
      return this.generateUnixScript(metadata);
    }
  }

  /**
   * Generate Unix shell script
   */
  private generateUnixScript(metadata: SessionMetadata): string {
    const lines: string[] = [
      '#!/bin/bash',
      `# Session: ${metadata.sessionName}`,
      `# Agent: ${metadata.agentName || 'none'}`,
      `# Created: ${metadata.createdAt}`,
      '',
      '# Set session-specific environment variables',
    ];

    // Add environment variables
    for (const [key, value] of Object.entries(metadata.environment)) {
      // Escape single quotes in value
      const escapedValue = value.replace(/'/g, "'\\''");
      lines.push(`export ${key}='${escapedValue}'`);
    }

    lines.push('');
    lines.push('# Change to workspace directory');
    lines.push(`cd "${metadata.workspacePath}"`);
    lines.push('');
    lines.push('# Launch Claude Code CLI');
    lines.push('exec claude');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate Windows PowerShell script
   */
  private generateWindowsScript(metadata: SessionMetadata): string {
    const lines: string[] = [
      `# Session: ${metadata.sessionName}`,
      `# Agent: ${metadata.agentName || 'none'}`,
      `# Created: ${metadata.createdAt}`,
      '',
      '# Set session-specific environment variables',
    ];

    // Add environment variables
    for (const [key, value] of Object.entries(metadata.environment)) {
      // Escape double quotes in value
      const escapedValue = value.replace(/"/g, '`"');
      lines.push(`$env:${key} = "${escapedValue}"`);
    }

    lines.push('');
    lines.push('# Change to workspace directory');
    lines.push(`Set-Location "${metadata.workspacePath}"`);
    lines.push('');
    lines.push('# Launch Claude Code CLI');
    lines.push('claude');
    lines.push('');

    return lines.join('\r\n');
  }

  /**
   * Get sessions directory path
   */
  getSessionsDir(): string {
    return this.sessionsDir;
  }

  /**
   * Get metadata directory path
   */
  getMetadataDir(): string {
    return this.metadataDir;
  }

  /**
   * Get scripts directory path
   */
  getScriptsDir(): string {
    return this.scriptsDir;
  }
}

/**
 * Default instance
 */
export const sessionStorage = new SessionStorage();
