/**
 * agent-definition-registry.ts
 * Loads and manages agent configuration definitions from disk
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { createHookLogger } from '../lib/logger.ts';
import { config } from '../lib/config.ts';

const logger = createHookLogger('AgentDefinitionRegistry');

/**
 * Agent configuration definition
 */
export interface AgentDefinition {
  name: string;
  description: string;
  version?: string;
  claudeMd?: string;
  configJson?: any;
  environment?: Record<string, string>;
  skills?: string[];
  mcpServers?: string[];
  configPath: string;
}

/**
 * Agent Definition Registry
 * Loads agent configurations from agent-configs/ directory
 */
export class AgentDefinitionRegistry {
  private agents: Map<string, AgentDefinition> = new Map();
  private agentConfigsDir: string;

  constructor(agentConfigsDir?: string) {
    // Use provided path or default to agent-configs/ in project root
    this.agentConfigsDir = agentConfigsDir || join(process.cwd(), 'agent-configs');
  }

  /**
   * Initialize and load all agent configurations
   */
  async initialize(): Promise<void> {
    logger.info('Loading agent configurations...', { dir: this.agentConfigsDir });

    if (!existsSync(this.agentConfigsDir)) {
      logger.warn('Agent configs directory not found', { dir: this.agentConfigsDir });
      // Create default agent
      this.createDefaultAgent();
      return;
    }

    const entries = readdirSync(this.agentConfigsDir, { withFileTypes: true });
    let loadedCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }

      try {
        const agentDef = this.loadAgentDefinition(entry.name);
        if (agentDef) {
          this.agents.set(agentDef.name, agentDef);
          loadedCount++;
          logger.debug('Loaded agent config', { name: agentDef.name });
        }
      } catch (error) {
        logger.error(`Failed to load agent config: ${entry.name}`, error);
      }
    }

    // Always ensure default agent exists
    if (!this.agents.has('default')) {
      this.createDefaultAgent();
    }

    logger.info(`Loaded ${loadedCount} agent configuration(s)`);
  }

  /**
   * Load a single agent definition from disk
   */
  private loadAgentDefinition(agentName: string): AgentDefinition | null {
    const agentDir = join(this.agentConfigsDir, agentName);

    // Support both structures:
    // 1. agent-configs/name/.claude/ (current structure)
    // 2. agent-configs/name/ (design document structure)
    const claudeSubdir = join(agentDir, '.claude');
    const configDir = existsSync(claudeSubdir) ? claudeSubdir : agentDir;

    const configJsonPath = join(configDir, 'config.json');
    const claudeMdPath = join(configDir, 'CLAUDE.md');
    const envPath = join(configDir, '.env');

    // config.json is required
    if (!existsSync(configJsonPath)) {
      logger.warn(`Skipping ${agentName}: missing config.json`);
      return null;
    }

    try {
      // Load config.json
      const configContent = readFileSync(configJsonPath, 'utf-8');
      const configJson = JSON.parse(configContent);

      // Validate required fields
      if (!configJson.name || !configJson.description) {
        logger.error(`Invalid config.json for ${agentName}: missing name or description`);
        return null;
      }

      // Load CLAUDE.md (optional)
      let claudeMd: string | undefined;
      if (existsSync(claudeMdPath)) {
        claudeMd = readFileSync(claudeMdPath, 'utf-8');
      }

      // Load .env (optional)
      let environment: Record<string, string> | undefined;
      if (existsSync(envPath)) {
        environment = this.loadEnvFile(envPath);
      }

      const agentDef: AgentDefinition = {
        name: configJson.name,
        description: configJson.description,
        version: configJson.version,
        claudeMd,
        configJson,
        environment,
        skills: configJson.skills || [],
        mcpServers: configJson.mcpServers || [],
        configPath: configDir,
      };

      return agentDef;
    } catch (error) {
      logger.error(`Failed to parse config for ${agentName}`, error);
      return null;
    }
  }

  /**
   * Load environment variables from .env file
   */
  private loadEnvFile(envPath: string): Record<string, string> {
    try {
      // Check file permissions (should be 0600 for security)
      const stats = statSync(envPath);
      const mode = stats.mode & 0o777;
      if (mode !== 0o600) {
        logger.warn(`Insecure .env file permissions: ${mode.toString(8)}`, { path: envPath });
      }

      const content = readFileSync(envPath, 'utf-8');
      const env: Record<string, string> = {};

      for (const line of content.split('\n')) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        // Parse KEY=VALUE
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();

          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          env[key] = value;
        }
      }

      logger.debug('Loaded environment variables', {
        path: envPath,
        count: Object.keys(env).length
      });

      return env;
    } catch (error) {
      logger.error('Failed to load .env file', { path: envPath, error });
      return {};
    }
  }

  /**
   * Create a default agent definition
   */
  private createDefaultAgent(): void {
    const defaultAgent: AgentDefinition = {
      name: 'default',
      description: 'Default agent configuration with no customizations',
      version: '1.0.0',
      skills: [],
      mcpServers: [],
      configPath: '',
    };

    this.agents.set('default', defaultAgent);
    logger.info('Created default agent configuration');
  }

  /**
   * Get agent definition by name
   */
  get(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  /**
   * List all agent names
   */
  listAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get all agent definitions
   */
  getAll(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /**
   * Reload a specific agent configuration from disk
   */
  async reload(agentName: string): Promise<boolean> {
    try {
      const agentDef = this.loadAgentDefinition(agentName);
      if (agentDef) {
        this.agents.set(agentDef.name, agentDef);
        logger.info('Reloaded agent configuration', { name: agentName });
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Failed to reload agent: ${agentName}`, error);
      return false;
    }
  }

  /**
   * Reload all agent configurations
   */
  async reloadAll(): Promise<void> {
    this.agents.clear();
    await this.initialize();
  }
}
