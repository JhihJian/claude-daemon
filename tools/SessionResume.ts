#!/usr/bin/env bun
/**
 * SessionResume.ts
 * CLI tool for resuming existing sessions
 *
 * Usage:
 *   claude-daemon resume <session-name>
 */

import { SessionManager } from '../daemon/session-manager.ts';
import { SessionError } from '../lib/errors.ts';
import { createLogger } from '../lib/logger.ts';

const logger = createLogger('SessionResume');

// ============================================================================
// CLI Interface
// ============================================================================

function printUsage(): void {
  console.log(`
Usage: claude-daemon resume <session-name>

Resume an existing Claude Code session.

Arguments:
  <session-name>    Name of the session to resume

Options:
  --help            Show this help message

Examples:
  # Resume a session by name
  claude-daemon resume my-project

  # Resume a session with auto-generated name
  claude-daemon resume coding-assistant-20260202-143022

Notes:
  - The session must exist (use 'claude-daemon sessions list' to see all sessions)
  - The workspace directory must still exist
  - You can also run the launch script directly: ~/.claude/sessions/scripts/<session-name>.sh
`);
}

// ============================================================================
// Main Function
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Show help if requested
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Validate arguments
  if (args.length === 0) {
    console.error('Error: Session name is required\n');
    printUsage();
    process.exit(1);
  }

  const sessionName = args[0];

  try {
    const manager = new SessionManager();

    console.log(`Resuming session: ${sessionName}\n`);

    // Get session info
    const sessionInfo = await manager.getSession(sessionName);

    if (!sessionInfo) {
      console.error(`✗ Session "${sessionName}" not found\n`);
      console.log('Available sessions:');

      const allSessions = await manager.listSessions();
      if (allSessions.length === 0) {
        console.log('  (no sessions found)');
      } else {
        for (const session of allSessions.slice(0, 10)) {
          console.log(`  - ${session.sessionName}`);
        }
        if (allSessions.length > 10) {
          console.log(`  ... and ${allSessions.length - 10} more`);
        }
      }

      console.log('\nUse "claude-daemon sessions list" to see all sessions');
      process.exit(1);
    }

    // Check if workspace exists
    if (!sessionInfo.workspaceExists) {
      console.error(`✗ Workspace directory not found: ${sessionInfo.workspacePath}\n`);
      console.log('The workspace directory has been moved or deleted.');
      console.log('\nOptions:');
      console.log('  1. Restore the workspace directory');
      console.log(`  2. Delete the session metadata: claude-daemon sessions delete ${sessionName}`);
      process.exit(1);
    }

    // Display session info
    console.log('Session Information:');
    console.log(`  Name:            ${sessionInfo.sessionName}`);
    console.log(`  Agent:           ${sessionInfo.agentName || 'none'}`);
    console.log(`  Workspace:       ${sessionInfo.workspacePath}`);
    console.log(`  Created:         ${new Date(sessionInfo.createdAt).toLocaleString()}`);
    console.log(`  Last Accessed:   ${new Date(sessionInfo.lastAccessedAt).toLocaleString()}`);
    console.log(`  Platform:        ${sessionInfo.platform}`);

    if (Object.keys(sessionInfo.environment).length > 0) {
      console.log(`\n  Environment Variables:`);
      for (const key of Object.keys(sessionInfo.environment)) {
        // Don't display sensitive values
        if (key.toLowerCase().includes('token') || key.toLowerCase().includes('password')) {
          console.log(`    ${key}: [hidden]`);
        } else {
          console.log(`    ${key}: ${sessionInfo.environment[key]}`);
        }
      }
    }

    console.log('\nLaunching Claude Code CLI...\n');

    // Resume the session
    await manager.resumeSession(sessionName);

  } catch (error) {
    if (error instanceof SessionError) {
      console.error(`\n✗ Session Error: ${error.message}`);

      if (error.code === 'SESSION_NOT_FOUND') {
        console.log('\nUse "claude-daemon sessions list" to see available sessions');
      } else if (error.code === 'WORKSPACE_NOT_FOUND') {
        console.log('\nThe workspace directory has been moved or deleted.');
        console.log('Options:');
        console.log('  1. Restore the workspace directory');
        console.log(`  2. Delete the session: claude-daemon sessions delete ${sessionName}`);
      }

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
