#!/usr/bin/env bun
/**
 * SessionLauncher.ts
 * CLI tool for launching new sessions
 *
 * Usage:
 *   claude-daemon launch --agent <agent-name> [options]
 *   claude-daemon launch --dir <directory> [options]
 */

import { parseArgs } from 'util';
import { SessionManager } from '../daemon/session-manager.ts';
import { ValidationError } from '../lib/session-validator.ts';
import { SessionError } from '../lib/errors.ts';
import { createLogger } from '../lib/logger.ts';

const logger = createLogger('SessionLauncher');

// ============================================================================
// CLI Interface
// ============================================================================

interface LaunchArgs {
  agent?: string;
  dir?: string;
  session?: string;
  workspaceRoot?: string;
  httpProxy?: string;
  httpsProxy?: string;
  apiUrl?: string;
  apiToken?: string;
  help?: boolean;
}

function printUsage(): void {
  console.log(`
Usage: claude-daemon launch [options]

Create and launch a new Claude Code session with agent configuration.

Options:
  --agent <name>           Agent name to use (from agent-configs/)
  --dir <path>             Use existing directory (mutually exclusive with --agent)
  --session <name>         Custom session name (default: auto-generated)
  --workspace-root <path>  Root directory for new workspaces (default: current directory)

Environment Variables (optional):
  --http-proxy <url>       HTTP proxy URL
  --https-proxy <url>      HTTPS proxy URL
  --api-url <url>          Anthropic API base URL
  --api-token <token>      Anthropic API authentication token

  --help                   Show this help message

Examples:
  # Launch with agent (creates new directory)
  claude-daemon launch --agent coding-assistant

  # Launch with custom session name
  claude-daemon launch --agent coding-assistant --session my-project

  # Launch from existing directory
  claude-daemon launch --dir /path/to/existing/project

  # Launch with proxy settings
  claude-daemon launch --agent coding-assistant \\
    --http-proxy http://proxy:8080 \\
    --https-proxy https://proxy:8080

  # Launch with custom API settings
  claude-daemon launch --agent coding-assistant \\
    --api-url https://api.anthropic.com \\
    --api-token sk-ant-xxx
`);
}

function parseArguments(): LaunchArgs {
  try {
    const { values } = parseArgs({
      options: {
        agent: { type: 'string' },
        dir: { type: 'string' },
        session: { type: 'string' },
        'workspace-root': { type: 'string' },
        'http-proxy': { type: 'string' },
        'https-proxy': { type: 'string' },
        'api-url': { type: 'string' },
        'api-token': { type: 'string' },
        help: { type: 'boolean' },
      },
      allowPositionals: false,
    });

    return {
      agent: values.agent as string | undefined,
      dir: values.dir as string | undefined,
      session: values.session as string | undefined,
      workspaceRoot: values['workspace-root'] as string | undefined,
      httpProxy: values['http-proxy'] as string | undefined,
      httpsProxy: values['https-proxy'] as string | undefined,
      apiUrl: values['api-url'] as string | undefined,
      apiToken: values['api-token'] as string | undefined,
      help: values.help as boolean | undefined,
    };
  } catch (error) {
    console.error(`Error parsing arguments: ${error instanceof Error ? error.message : String(error)}`);
    printUsage();
    process.exit(1);
  }
}

// ============================================================================
// Main Function
// ============================================================================

async function main(): Promise<void> {
  const args = parseArguments();

  // Show help if requested
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // Validate required options
  if (!args.agent && !args.dir) {
    console.error('Error: Either --agent or --dir must be specified\n');
    printUsage();
    process.exit(1);
  }

  try {
    const manager = new SessionManager();

    console.log('Creating new session...\n');

    // Create session
    const sessionInfo = await manager.createSession({
      sessionName: args.session,
      agentName: args.agent,
      directory: args.dir,
      workspaceRoot: args.workspaceRoot,
      httpProxy: args.httpProxy,
      httpsProxy: args.httpsProxy,
      apiUrl: args.apiUrl,
      apiToken: args.apiToken,
    });

    // Display success message
    console.log('✓ Session created successfully!\n');
    console.log(`Session Name:    ${sessionInfo.sessionName}`);
    console.log(`Agent:           ${sessionInfo.agentName || 'none'}`);
    console.log(`Workspace:       ${sessionInfo.workspacePath}`);
    console.log(`Launch Script:   ${sessionInfo.scriptPath}`);
    console.log(`Created:         ${new Date(sessionInfo.createdAt).toLocaleString()}`);

    if (Object.keys(sessionInfo.environment).length > 0) {
      console.log(`\nEnvironment Variables:`);
      for (const key of Object.keys(sessionInfo.environment)) {
        // Don't display sensitive values
        if (key.toLowerCase().includes('token') || key.toLowerCase().includes('password')) {
          console.log(`  ${key}: [hidden]`);
        } else {
          console.log(`  ${key}: ${sessionInfo.environment[key]}`);
        }
      }
    }

    console.log('\nTo resume this session later, run:');
    console.log(`  claude-daemon resume ${sessionInfo.sessionName}`);
    console.log('\nOr execute the launch script directly:');
    console.log(`  ${sessionInfo.scriptPath}`);

    console.log('\nLaunching Claude Code CLI...\n');

    // Resume the session (which launches Claude CLI)
    await manager.resumeSession(sessionInfo.sessionName);

  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(`\n✗ Validation Error: ${error.message}`);
      if (error.context?.field) {
        console.error(`  Field: ${error.context.field}`);
      }
    } else if (error instanceof SessionError) {
      console.error(`\n✗ Session Error: ${error.message}`);
      if (error.context) {
        console.error(`  Context: ${JSON.stringify(error.context, null, 2)}`);
      }
    } else {
      console.error(`\n✗ Unexpected Error: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        logger.error('Stack trace', { stack: error.stack });
      }
    }
    process.exit(1);
  }
}

// ============================================================================
// Entry Point
// ============================================================================

if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
