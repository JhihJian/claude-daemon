#!/usr/bin/env bun
/**
 * SessionTracker Hook
 * Tracks session registration and unregistration with agent configuration
 *
 * Triggers: session_start, session_end
 * Sends: session_register, session_unregister events to daemon
 */

import { connect } from 'net';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const SOCKET_PATH = process.platform === 'win32'
  ? { host: '127.0.0.1', port: 39281 }
  : '/tmp/claude-daemon.sock';

const SOCKET_TIMEOUT = 2000;
const PAI_DIR = process.env.PAI_DIR || join(process.env.HOME || '', '.claude');

interface HookInput {
  event_type: 'session_start' | 'session_end';
  session_id: string;
  timestamp: string;
  data: any;
}

/**
 * Get git repository information
 */
function getGitInfo(workingDir: string): { repo?: string; branch?: string } {
  try {
    const repo = execSync('git rev-parse --show-toplevel', {
      cwd: workingDir,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: workingDir,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    return { repo: repo.split('/').pop(), branch };
  } catch {
    return {};
  }
}

/**
 * Send event to daemon via socket
 */
async function sendToDaemon(event: any): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = typeof SOCKET_PATH === 'string'
      ? connect(SOCKET_PATH)
      : connect(SOCKET_PATH.port, SOCKET_PATH.host);

    let timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, SOCKET_TIMEOUT);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.write(JSON.stringify(event) + '\n');
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Fallback: write to file if daemon is unavailable
 */
function writeToFile(event: any): void {
  const fallbackDir = join(PAI_DIR, 'SESSIONS', 'fallback');
  if (!existsSync(fallbackDir)) {
    mkdirSync(fallbackDir, { recursive: true, mode: 0o700 });
  }

  const fallbackFile = join(fallbackDir, 'session-tracker.jsonl');
  appendFileSync(fallbackFile, JSON.stringify(event) + '\n', { mode: 0o600 });
}

/**
 * Main hook logic
 */
async function main() {
  try {
    // Read input from stdin
    const input = await Bun.stdin.text();
    const hookInput: HookInput = JSON.parse(input);

    const agentName = process.env.CLAUDE_AGENT_CONFIG || 'default';
    const pid = process.pid;
    const workingDir = process.cwd();

    if (hookInput.event_type === 'session_start') {
      // Get git information
      const gitInfo = getGitInfo(workingDir);

      // Prepare session registration event
      const registerEvent = {
        event_type: 'session_register',
        session_id: hookInput.session_id,
        timestamp: hookInput.timestamp,
        data: {
          session_id: hookInput.session_id,
          agent_name: agentName,
          pid,
          start_time: hookInput.timestamp,
          working_directory: workingDir,
          git_repo: gitInfo.repo,
          git_branch: gitInfo.branch,
          environment: {
            CLAUDE_AGENT_CONFIG: agentName,
          },
        },
      };

      // Send to daemon
      const sent = await sendToDaemon(registerEvent);
      if (!sent) {
        writeToFile(registerEvent);
      }
    } else if (hookInput.event_type === 'session_end') {
      // Prepare session unregistration event
      const unregisterEvent = {
        event_type: 'session_unregister',
        session_id: hookInput.session_id,
        timestamp: hookInput.timestamp,
        data: {
          session_id: hookInput.session_id,
        },
      };

      // Send to daemon
      const sent = await sendToDaemon(unregisterEvent);
      if (!sent) {
        writeToFile(unregisterEvent);
      }
    }

    // Output success
    console.log(JSON.stringify({ continue: true }));
  } catch (error) {
    // Never fail - always allow session to continue
    console.error('[SessionTracker] Error:', error);
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
