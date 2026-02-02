#!/usr/bin/env bun
/**
 * SessionList.ts
 * CLI tool for listing sessions
 *
 * Usage:
 *   claude-daemon sessions list [options]
 */

import { parseArgs } from 'util';
import { SessionManager } from '../daemon/session-manager.ts';
import { SessionError } from '../lib/errors.ts';
import { createLogger } from '../lib/logger.ts';

const logger = createLogger('SessionList');

// ============================================================================
// CLI Interface
// ============================================================================

interface ListArgs {
  agent?: string;
  recent?: boolean;
  full?: boolean;
  help?: boolean;
}

function printUsage(): void {
  console.log(`
Usage: claude-daemon sessions list [options]

List all Claude Code sessions.

Options:
  --agent <name>    Filter by agent name
  --recent          Show only recently accessed sessions (last 7 days)
  --full            Show full paths (no truncation)
  --help            Show this help message

Examples:
  # List all sessions
  claude-daemon sessions list

  # List sessions for a specific agent
  claude-daemon sessions list --agent coding-assistant

  # List recently accessed sessions
  claude-daemon sessions list --recent

  # List with full paths
  claude-daemon sessions list --full
`);
}

function parseArguments(): ListArgs {
  try {
    const { values } = parseArgs({
      options: {
        agent: { type: 'string' },
        recent: { type: 'boolean' },
        full: { type: 'boolean' },
        help: { type: 'boolean' },
      },
      allowPositionals: false,
    });

    return {
      agent: values.agent as string | undefined,
      recent: values.recent as boolean | undefined,
      full: values.full as boolean | undefined,
      help: values.help as boolean | undefined,
    };
  } catch (error) {
    console.error(`Error parsing arguments: ${error instanceof Error ? error.message : String(error)}`);
    printUsage();
    process.exit(1);
  }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months !== 1 ? 's' : ''} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  }
}

function padRight(str: string, length: number): string {
  return str + ' '.repeat(Math.max(0, length - str.length));
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

  try {
    const manager = new SessionManager();

    // Get sessions with filters
    const sessions = await manager.listSessions({
      agentName: args.agent,
      recent: args.recent,
      recentDays: 7,
    });

    if (sessions.length === 0) {
      if (args.agent) {
        console.log(`No sessions found for agent: ${args.agent}`);
      } else if (args.recent) {
        console.log('No recently accessed sessions found (last 7 days)');
      } else {
        console.log('No sessions found');
      }
      console.log('\nCreate a new session with:');
      console.log('  claude-daemon launch --agent <agent-name>');
      process.exit(0);
    }

    // Display header
    console.log('\nActive Sessions:\n');

    // Calculate column widths
    const nameWidth = args.full ? 50 : 30;
    const agentWidth = 20;
    const statusWidth = 10;
    const workspaceWidth = args.full ? 60 : 35;
    const lastAccessedWidth = 20;

    // Print table header
    const header = [
      padRight('NAME', nameWidth),
      padRight('AGENT', agentWidth),
      padRight('STATUS', statusWidth),
      padRight('WORKSPACE', workspaceWidth),
      padRight('LAST ACCESSED', lastAccessedWidth),
    ].join('  ');
    console.log(header);
    console.log('-'.repeat(header.length));

    // Print sessions
    for (const session of sessions) {
      const name = args.full ? session.sessionName : truncate(session.sessionName, nameWidth);
      const agent = truncate(session.agentName || 'none', agentWidth);
      const status = session.workspaceExists ? 'active' : 'missing';
      const workspace = args.full
        ? session.workspacePath
        : truncate(session.workspacePath.replace(process.env.HOME || '', '~'), workspaceWidth);
      const lastAccessed = formatRelativeTime(session.lastAccessedAt);

      const row = [
        padRight(name, nameWidth),
        padRight(agent, agentWidth),
        padRight(status, statusWidth),
        padRight(workspace, workspaceWidth),
        padRight(lastAccessed, lastAccessedWidth),
      ].join('  ');

      console.log(row);
    }

    // Print summary
    console.log(`\nTotal: ${sessions.length} session${sessions.length !== 1 ? 's' : ''}`);

    // Show filter info if applied
    if (args.agent) {
      console.log(`Filtered by agent: ${args.agent}`);
    }
    if (args.recent) {
      console.log('Showing only recently accessed sessions (last 7 days)');
    }

    // Show helpful commands
    console.log('\nCommands:');
    console.log('  Resume a session:  claude-daemon resume <session-name>');
    console.log('  Delete a session:  claude-daemon sessions delete <session-name>');
    console.log('  Session details:   claude-daemon sessions info <session-name>');

  } catch (error) {
    if (error instanceof SessionError) {
      console.error(`\n✗ Session Error: ${error.message}`);
      if (error.context) {
        logger.debug('Error context', error.context);
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
