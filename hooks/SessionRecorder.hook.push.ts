#!/usr/bin/env bun
/**
 * SessionRecorder.hook.ts (推送模式版本)
 *
 * 改造说明：
 * - 原来：Hook 自己处理所有逻辑，写入文件
 * - 现在：Hook 只收集数据，推送给守护进程
 */

import { connect } from 'net';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { hostname } from 'os';
import { config } from '../lib/config.ts';

// ============================================================================
// 配置
// ============================================================================

const DAEMON_SOCKET = '/tmp/claude-daemon.sock';
const PUSH_TIMEOUT = 2000; // 2 秒超时

// ============================================================================
// 1. 读取 Hook 输入
// ============================================================================

const input = await Bun.stdin.text();
const event = JSON.parse(input);

// ============================================================================
// 2. 收集数据
// ============================================================================

const sessionId = event.session_id;
const timestamp = new Date().toISOString();
const workingDir = process.cwd();

// 获取 Git 信息（简化版，快速执行）
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
    claude_version: event.claude_version || 'unknown',
  }
};

// ============================================================================
// 3. 推送数据到守护进程
// ============================================================================

const pushed = await pushToDaemon(hookEvent);

if (!pushed) {
  // 守护进程不可用，回退到文件模式
  console.error('[SessionRecorder] Daemon unavailable, falling back to file mode');
  await fallbackToFileMode(hookEvent);
}

// ============================================================================
// 4. 输出决策
// ============================================================================

console.log(JSON.stringify({ continue: true }));
process.exit(0);

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 推送数据到守护进程
 */
async function pushToDaemon(event: any): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(DAEMON_SOCKET);
    let responseReceived = false;

    // 设置超时
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        socket.destroy();
        resolve(false);
      }
    }, PUSH_TIMEOUT);

    socket.on('connect', () => {
      // 发送 JSON 数据（以换行符结尾）
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

    socket.on('error', (error) => {
      clearTimeout(timeout);
      // 连接失败（守护进程可能未运行）
      resolve(false);
    });

    socket.on('timeout', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * 回退模式：直接写入文件
 * 当守护进程不可用时使用
 */
async function fallbackToFileMode(event: any): Promise<void> {
  try {
    const cfg = config.get();
    const yearMonth = config.getYearMonth();
    const rawDir = join(cfg.rawDir, yearMonth);

    // 创建目录
    mkdirSync(rawDir, { recursive: true });

    // 写入文件
    const sessionFile = config.getSessionFilePath(event.session_id, yearMonth);
    appendFileSync(sessionFile, JSON.stringify(event) + '\n', { mode: 0o600 });
  } catch (error) {
    console.error('[SessionRecorder] Fallback failed:', error);
  }
}

/**
 * 快速获取 Git 信息（超时 1 秒）
 */
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

  // 并行执行所有 git 命令
  const [repo, branch, commit, remote] = await Promise.all([
    execGit(['rev-parse', '--show-toplevel']),
    execGit(['rev-parse', '--abbrev-ref', 'HEAD']),
    execGit(['rev-parse', '--short', 'HEAD']),
    execGit(['remote', 'get-url', 'origin']),
  ]);

  return { repo, branch, commit, remote };
}
