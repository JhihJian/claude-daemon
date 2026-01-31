#!/usr/bin/env bun
/**
 * SessionRecorder.hook.ts (推送模式)
 * 会话启动时记录上下文信息并推送到守护进程
 */

import { connect } from 'net';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { hostname } from 'os';
import { config } from '../lib/config.ts';

const DAEMON_SOCKET = '/tmp/claude-daemon.sock';
const PUSH_TIMEOUT = 2000;

// 读取 Hook 输入 - 添加错误处理
let input: string;
let event: any;

try {
  input = await Bun.stdin.text();

  // 处理空输入
  if (!input || input.trim() === '') {
    console.error('[SessionRecorder] Warning: Empty stdin received, skipping');
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  event = JSON.parse(input);

  // 验证必需字段
  if (!event.session_id) {
    console.error('[SessionRecorder] Warning: Missing session_id in input');
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }
} catch (error) {
  console.error('[SessionRecorder] Error parsing input:', error instanceof Error ? error.message : String(error));
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

const sessionId = event.session_id;
const timestamp = new Date().toISOString();
const workingDir = process.cwd();

// 获取 Git 信息
const gitInfo = await getGitInfoQuick(workingDir);

// 构建事件数据
const hookEvent = {
  hook_name: 'SessionRecorder',
  event_type: 'session_start',
  session_id: sessionId,
  timestamp: timestamp,
  data: {
    working_directory: workingDir,
    git_repo: gitInfo.repo,
    git_branch: gitInfo.branch,
    git_commit: gitInfo.commit,
    git_remote: gitInfo.remote,
    platform: process.platform,
    user: process.env.USER || process.env.USERNAME || 'unknown',
    hostname: hostname(),
    bun_version: Bun.version,
    node_version: process.version,
    shell: process.env.SHELL || 'unknown',
    terminal: process.env.TERM || 'unknown',
    claude_version: event.claude_version || 'unknown',
  }
};

// 推送到守护进程
const pushed = await pushToDaemon(hookEvent);

if (!pushed) {
  // 回退到文件模式
  await fallbackToFileMode(hookEvent);
}

// 输出决策
console.log(JSON.stringify({ continue: true }));
process.exit(0);

// ============================================================================
// 辅助函数
// ============================================================================

async function pushToDaemon(event: any): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(DAEMON_SOCKET);
    let responseReceived = false;

    const timeout = setTimeout(() => {
      if (!responseReceived) {
        socket.destroy();
        resolve(false);
      }
    }, PUSH_TIMEOUT);

    socket.on('connect', () => {
      socket.write(JSON.stringify(event) + '\n');
    });

    socket.on('data', (data) => {
      responseReceived = true;
      clearTimeout(timeout);

      try {
        const response = JSON.parse(data.toString());
        socket.end();
        resolve(response.success === true);
      } catch {
        socket.end();
        resolve(false);
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });

    socket.on('timeout', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(false);
    });
  });
}

async function fallbackToFileMode(event: any): Promise<void> {
  try {
    const cfg = config.get();
    const yearMonth = config.getYearMonth();
    const rawDir = join(cfg.rawDir, yearMonth);

    mkdirSync(rawDir, { recursive: true, mode: 0o700 });

    const sessionFile = config.getSessionFilePath(event.session_id, yearMonth);
    appendFileSync(sessionFile, JSON.stringify(event) + '\n', { mode: 0o600 });
  } catch (error) {
    console.error('[SessionRecorder] Fallback failed:', error);
  }
}

async function getGitInfoQuick(dir: string): Promise<{
  repo: string | null;
  branch: string | null;
  commit: string | null;
  remote: string | null;
}> {
  const timeout = 1000;

  async function execGit(args: string[]): Promise<string | null> {
    try {
      const proc = Bun.spawn(['git', ...args], {
        cwd: dir,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const timer = setTimeout(() => proc.kill(), timeout);
      const output = await new Response(proc.stdout).text();
      clearTimeout(timer);
      await proc.exited;

      return proc.exitCode === 0 ? output.trim() : null;
    } catch {
      return null;
    }
  }

  const [repo, branch, commit, remote] = await Promise.all([
    execGit(['rev-parse', '--show-toplevel']),
    execGit(['rev-parse', '--abbrev-ref', 'HEAD']),
    execGit(['rev-parse', '--short', 'HEAD']),
    execGit(['remote', 'get-url', 'origin']),
  ]);

  return { repo, branch, commit, remote };
}
