/**
 * session-validator.ts
 * Session validation logic
 *
 * Validates:
 * - Session names (format, uniqueness)
 * - Paths (existence, validity)
 * - Options (mutual exclusivity)
 * - Agent configurations
 */

import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { SessionError, validatePath } from './errors.ts';
import { createLogger } from './logger.ts';

const logger = createLogger('SessionValidator');

// ============================================================================
// Custom Validation Errors
// ============================================================================

export class ValidationError extends SessionError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', false, { field });
    this.name = 'ValidationError';
  }
}

// ============================================================================
// SessionValidator Class
// ============================================================================

export class SessionValidator {
  private static readonly SESSION_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
  private static readonly MAX_SESSION_NAME_LENGTH = 100;

  /**
   * Validate session name format
   */
  static validateSessionName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Session name is required', 'sessionName');
    }

    if (name.length > this.MAX_SESSION_NAME_LENGTH) {
      throw new ValidationError(
        `Session name too long (max ${this.MAX_SESSION_NAME_LENGTH} characters)`,
        'sessionName'
      );
    }

    if (!this.SESSION_NAME_PATTERN.test(name)) {
      throw new ValidationError(
        'Session name must contain only alphanumeric characters, hyphens, and underscores',
        'sessionName'
      );
    }

    // Reserved names
    const reserved = ['scripts', 'metadata', 'sessions', 'raw', 'analysis'];
    if (reserved.includes(name.toLowerCase())) {
      throw new ValidationError(
        `Session name "${name}" is reserved`,
        'sessionName'
      );
    }

    logger.debug(`Session name validated: ${name}`);
  }

  /**
   * Validate session name uniqueness
   */
  static validateSessionUniqueness(
    name: string,
    existingNames: string[]
  ): void {
    if (existingNames.includes(name)) {
      throw new ValidationError(
        `Session "${name}" already exists. Choose a different name or delete the existing session.`,
        'sessionName'
      );
    }
  }

  /**
   * Validate directory path exists
   */
  static validateDirectoryExists(path: string, fieldName: string = 'directory'): void {
    validatePath(path, fieldName);

    if (!existsSync(path)) {
      throw new ValidationError(
        `Directory does not exist: ${path}`,
        fieldName
      );
    }

    try {
      const stats = statSync(path);
      if (!stats.isDirectory()) {
        throw new ValidationError(
          `Path is not a directory: ${path}`,
          fieldName
        );
      }
    } catch (error) {
      throw new ValidationError(
        `Cannot access directory: ${path}`,
        fieldName
      );
    }

    logger.debug(`Directory validated: ${path}`);
  }

  /**
   * Validate agent exists
   */
  static validateAgentExists(agentName: string, agentConfigsDir: string): void {
    if (!agentName || typeof agentName !== 'string') {
      throw new ValidationError('Agent name is required', 'agentName');
    }

    const agentDir = join(agentConfigsDir, agentName);

    if (!existsSync(agentDir)) {
      throw new ValidationError(
        `Agent "${agentName}" not found in ${agentConfigsDir}`,
        'agentName'
      );
    }

    // Check for required files
    const claudeMdPath = join(agentDir, 'CLAUDE.md');
    if (!existsSync(claudeMdPath)) {
      throw new ValidationError(
        `Agent "${agentName}" is missing CLAUDE.md file`,
        'agentName'
      );
    }

    logger.debug(`Agent validated: ${agentName}`);
  }

  /**
   * Validate mutually exclusive options
   */
  static validateMutuallyExclusive(
    options: Record<string, any>,
    exclusiveGroups: string[][]
  ): void {
    for (const group of exclusiveGroups) {
      const setOptions = group.filter(opt => options[opt] !== undefined && options[opt] !== null);

      if (setOptions.length > 1) {
        throw new ValidationError(
          `Options are mutually exclusive: ${setOptions.join(', ')}`,
          'options'
        );
      }
    }
  }

  /**
   * Validate workspace path is writable
   */
  static validateWorkspaceWritable(path: string): void {
    validatePath(path, 'workspacePath');

    try {
      // Check if we can create a directory here
      const testDir = join(path, '.test-' + Date.now());
      const fs = require('fs');
      fs.mkdirSync(testDir, { recursive: true });
      fs.rmdirSync(testDir);
    } catch (error) {
      throw new ValidationError(
        `Workspace path is not writable: ${path}`,
        'workspacePath'
      );
    }

    logger.debug(`Workspace path validated: ${path}`);
  }

  /**
   * Validate environment variable name
   */
  static validateEnvVarName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Environment variable name is required', 'envVarName');
    }

    // Environment variable names should be alphanumeric with underscores
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(name)) {
      throw new ValidationError(
        `Invalid environment variable name: ${name}`,
        'envVarName'
      );
    }
  }

  /**
   * Validate environment variables object
   */
  static validateEnvironment(env: Record<string, string>): void {
    if (typeof env !== 'object' || env === null) {
      throw new ValidationError('Environment must be an object', 'environment');
    }

    for (const [key, value] of Object.entries(env)) {
      this.validateEnvVarName(key);

      if (typeof value !== 'string') {
        throw new ValidationError(
          `Environment variable value must be a string: ${key}`,
          'environment'
        );
      }

      // Check for null bytes (security)
      if (value.includes('\0')) {
        throw new ValidationError(
          `Environment variable contains null bytes: ${key}`,
          'environment'
        );
      }
    }

    logger.debug(`Environment validated: ${Object.keys(env).length} variables`);
  }

  /**
   * Suggest alternative session name
   */
  static suggestSessionName(baseName: string, existingNames: string[]): string {
    let counter = 1;
    let suggestion = baseName;

    while (existingNames.includes(suggestion)) {
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      suggestion = `${baseName}-${timestamp}-${counter}`;
      counter++;
    }

    return suggestion;
  }

  /**
   * Validate git repository has no uncommitted changes
   */
  static async validateGitClean(workspacePath: string): Promise<boolean> {
    try {
      const { execSync } = require('child_process');
      const gitDir = join(workspacePath, '.git');

      if (!existsSync(gitDir)) {
        return true; // Not a git repo, no validation needed
      }

      const output = execSync('git status --porcelain', {
        cwd: workspacePath,
        encoding: 'utf-8',
        timeout: 3000,
      });

      return output.trim().length === 0;
    } catch (error) {
      // If git command fails, assume it's clean
      logger.warn('Failed to check git status', { error });
      return true;
    }
  }

  /**
   * Validate complete launch options
   */
  static async validateLaunchOptions(options: {
    sessionName?: string;
    agentName?: string;
    directory?: string;
    workspaceRoot?: string;
    environment?: Record<string, string>;
    agentConfigsDir: string;
    existingSessionNames: string[];
  }): Promise<void> {
    // Validate mutually exclusive options
    this.validateMutuallyExclusive(options, [
      ['agentName', 'directory']
    ]);

    // Validate session name if provided
    if (options.sessionName) {
      this.validateSessionName(options.sessionName);
      this.validateSessionUniqueness(options.sessionName, options.existingSessionNames);
    }

    // Validate agent if specified
    if (options.agentName) {
      this.validateAgentExists(options.agentName, options.agentConfigsDir);
    }

    // Validate directory if specified (must exist)
    if (options.directory) {
      this.validateDirectoryExists(options.directory, 'directory');
    }

    // Validate workspace root if specified (only check if it's a valid path, will be created if needed)
    if (options.workspaceRoot) {
      validatePath(options.workspaceRoot, 'workspaceRoot');
      // Don't check if it exists - it will be created if needed
    }

    // Validate environment variables
    if (options.environment) {
      this.validateEnvironment(options.environment);
    }

    logger.info('Launch options validated successfully');
  }
}

/**
 * Convenience functions
 */

export function validateSessionName(name: string): void {
  SessionValidator.validateSessionName(name);
}

export function validateAgentExists(agentName: string, agentConfigsDir: string): void {
  SessionValidator.validateAgentExists(agentName, agentConfigsDir);
}

export function validateDirectoryExists(path: string): void {
  SessionValidator.validateDirectoryExists(path);
}
