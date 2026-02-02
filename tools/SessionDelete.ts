#!/usr/bin/env bun
/**
 * SessionDelete.ts
 * CLI tool for deleting sessions
 *
 * Usage:
 *   claude-daemon sessions delete <session-name> [options]
 */

import { parseArgs } from 'util';
import { existsSync } from 'fs';
import { SessionManager } from '../daemon/session-manager.ts';
import { SessionValidator } from '../lib/session-validator.ts';
import { SessionError } from '../lib/errors.ts';
import { createLogger } from '../lib/logger.ts';

const logger = createLogger('SessionDelete');

// ============================================================================
// CLI Interface
// ============================================================================

interface DeleteArgs {
  withWorkspace?: boolean;
  force?: boolean;
  help?: boolean;
}

function printUsage(): void {
  console.log(`
Usage: claude-daemon sessions delete <session-name> [options]

Delete a Claude Code session.

Arguments:
  <session-name>       Name of the session to delete

Options:
  --with-workspace     Also delete the workspace directory
  --force              Skip confirmation prompts
  --help               Show this help message

Examples:
  # Delete session metadata and launch script (preserve workspace)
  claude-daemon sessions delete my-project

  # Delete session and workspace directory
  claude-daemon sessions delete my-project --with-workspace

  # Delete without confirmation
  claude-daemon sessions delete my-project --with-workspace --force

Notes:
  - By default, only metadata and launch script are deleted
  - Workspace directory is preserved unless --with-workspace is specified
  - If workspace has uncommitted git changes, a warning will be shown
  - Use --force to skip all confirmation prompts
`);
}

function parseArguments(): { sessionName: string; args: DeleteArgs } {
  const positionals = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

  if (positionals.length === 0) {
    console.error('Error: Session name is required\n');
    printUsage();
    process.exit(1);
  }

  try {
    const { values } = parseArgs({
      options: {
        'with-workspace': { type: 'boolean' },
        force: { type: 'boolean' },
        help: { type: 'boolean' },
      },
      allowPositionals: true,
    });

    return {
      sessionName: positionals[0],
      args: {
        withWorkspace: values['with-workspace'] as boolean | undefined,
        force: values.force as boolean | undefined,
        help: values.help as boolean | undefined,
      },
    };
  } catch (error) {
    console.error(`Error parsing arguments: ${error instanceof Error ? error.message : String(error)}`);
    printUsage();
    process.exit(1);
  }
}

// ============================================================================
// Confirmation Helpers
// ============================================================================

async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} [y/N]: `);

  return new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      const answer = data.toString().trim().toLowerCase();
      resolve(answer === 'y' || answer === 'yes');
    });
  });
}

// ============================================================================
// Main Function
// ============================================================================

async function main(): Promise<void> {
  const { sessionName, args } = parseArguments();

  // Show help if requested
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  try {
    const manager = new SessionManager();

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

    // Display session info
    console.log(`\nDeleting session: ${sessionInfo.sessionName}`);
    console.log(`  Agent:     ${sessionInfo.agentName || 'none'}`);
    console.log(`  Workspace: ${sessionInfo.workspacePath}`);
    console.log(`  Created:   ${new Date(sessionInfo.createdAt).toLocaleString()}`);

    // Check if workspace exists
    const workspaceExists = existsSync(sessionInfo.workspacePath);

    console.log('\n⚠️  This will remove:');
    console.log(`  - Launch script: ${sessionInfo.scriptPath}`);
    console.log(`  - Metadata: ~/.claude/sessions/metadata/${sessionName}.json`);

    if (args.withWorkspace) {
      if (workspaceExists) {
        console.log(`  - Workspace directory: ${sessionInfo.workspacePath}`);

        // Check for uncommitted git changes
        const isGitClean = await SessionValidator.validateGitClean(sessionInfo.workspacePath);
        if (!isGitClean) {
          console.log('\n⚠️  WARNING: Workspace has uncommitted git changes!');
        }
      } else {
        console.log(`  - Workspace directory: (already missing)`);
      }
    } else {
      console.log(`  - Workspace directory: (will be preserved)`);
    }

    // Confirm deletion unless --force is specified
    if (!args.force) {
      console.log('');
      const confirmed = await confirm('Proceed with deletion?');

      if (!confirmed) {
        console.log('\nDeletion cancelled');
        process.exit(0);
      }
    }

    // Delete the session
    console.log('\nDeleting session...');
    await manager.deleteSession(sessionName, args.withWorkspace || false);

    // Display success message
    console.log('\n✓ Session deleted successfully');

    if (args.withWorkspace && workspaceExists) {
      console.log('  - Workspace directory deleted');
    } else if (!args.withWorkspace && workspaceExists) {
      console.log(`  - Workspace preserved at: ${sessionInfo.workspacePath}`);
    }

  } catch (error) {
    if (error instanceof SessionError) {
      console.error(`\n✗ Session Error: ${error.message}`);

      if (error.code === 'SESSION_NOT_FOUND') {
        console.log('\nUse "claude-daemon sessions list" to see available sessions');
      } else if (error.code === 'WORKSPACE_DELETE_FAILED') {
        console.log('\nThe workspace directory could not be deleted.');
        console.log('You may need to delete it manually or check permissions.');
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
  } finally {
    // Close stdin to allow process to exit
    process.stdin.pause();
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
