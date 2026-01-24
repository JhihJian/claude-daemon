#!/usr/bin/env bun
/**
 * SessionRecorder.hook.ts
 * 在会话开始时记录上下文信息
 *
 * Hook 类型: SessionStart
 * 触发时机: Claude Code 会话开始时
 * 职责: 捕获启动目录、Git 信息、初始化会话文件
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { hostname } from 'os';
import { createHookLogger } from '../lib/logger.ts';
import {
  hookErrorHandler,
  withTimeout,
  safeExecute,
  validateRequired,
  FileSystemError
} from '../lib/errors.ts';
import { config } from '../lib/config.ts';

// ============================================================================
// 初始化
// ============================================================================

const logger = createHookLogger('SessionRecorder');
const cfg = config.get();

// ============================================================================
// 1. 读取 Hook 输入
// ============================================================================

const input = await Bun.stdin.text();
const event = JSON.parse(input);

// ============================================================================
// 2. 核心逻辑
// ============================================================================

try {
  const startTime = Date.now();

  // 2.1 验证必需字段
  const sessionId = validateRequired(event.session_id, 'session_id');
  const timestamp = new Date().toISOString();

  // 2.2 获取启动目录
  const workingDir = process.cwd();
  logger.info('Session started', { sessionId, workingDir });

  // 2.3 获取 Git 信息（带超时）
  const gitInfo = await safeExecute(
    () => getGitInfo(workingDir, cfg.gitTimeout),
    { repo: null, branch: null, commit: null, remote: null },
    'getGitInfo'
  );

  // 2.4 创建存储目录
  const yearMonth = config.getYearMonth();
  const rawDir = join(cfg.rawDir, yearMonth);

  try {
    mkdirSync(rawDir, { recursive: true });
  } catch (error) {
    throw new FileSystemError(
      `Failed to create directory: ${rawDir}`,
      rawDir,
      'mkdir'
    );
  }

  // 2.5 构建会话元数据
  const sessionMeta = {
    event_type: 'session_start',
    session_id: sessionId,
    timestamp: timestamp,

    // 工作上下文
    working_directory: workingDir,
    git_repo: gitInfo.repo,
    git_branch: gitInfo.branch,
    git_commit: gitInfo.commit,
    git_remote: gitInfo.remote,

    // 环境信息
    platform: process.platform,
    cwd_at_start: workingDir,
    user: process.env.USER || process.env.USERNAME || 'unknown',
    hostname: hostname(),

    // 运行时信息
    bun_version: Bun.version,
    node_version: process.version,
    shell: process.env.SHELL || 'unknown',
    terminal: process.env.TERM || 'unknown',

    // 元数据
    claude_version: event.claude_version || 'unknown',
  };

  // 2.6 写入会话文件（JSONL 格式）
  const sessionFile = config.getSessionFilePath(sessionId, yearMonth);

  try {
    writeFileSync(sessionFile, JSON.stringify(sessionMeta) + '\n', { mode: 0o600 });
    logger.debug('Session file created', { sessionFile });
  } catch (error) {
    throw new FileSystemError(
      `Failed to write session file: ${sessionFile}`,
      sessionFile,
      'write'
    );
  }

  // 2.7 记录性能
  logger.perf('SessionRecorder', startTime);
  logger.info('Session recorded successfully', {
    sessionId,
    hostname: hostname(),
    user: sessionMeta.user,
    gitRepo: gitInfo.repo || 'none',
  });

} catch (error) {
  // 错误处理：永远不阻塞 Claude Code
  hookErrorHandler('SessionRecorder')(error);
}

// ============================================================================
// 3. 输出决策（必须）
// ============================================================================

console.log(JSON.stringify({ continue: true }));
process.exit(0);

// ============================================================================
// 辅助函数
// ============================================================================

interface GitInfo {
  repo: string | null;
  branch: string | null;
  commit: string | null;
  remote: string | null;
}

/**
 * 获取所有 Git 信息（带超时）
 */
async function getGitInfo(dir: string, timeout: number): Promise<GitInfo> {
  const commands = {
    repo: ['git', 'rev-parse', '--show-toplevel'],
    branch: ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
    commit: ['git', 'rev-parse', '--short', 'HEAD'],
    remote: ['git', 'remote', 'get-url', 'origin'],
  };

  const results = await Promise.all(
    Object.entries(commands).map(async ([key, cmd]) => {
      try {
        const result = await withTimeout(
          execGitCommand(cmd, dir),
          timeout,
          `git ${cmd[1]}`
        );
        return [key, result];
      } catch (error) {
        logger.debug(`Git command failed: ${cmd.join(' ')}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return [key, null];
      }
    })
  );

  return Object.fromEntries(results) as GitInfo;
}

/**
 * 执行 Git 命令
 */
async function execGitCommand(cmd: string[], dir: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(cmd, {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (proc.exitCode === 0) {
      return output.trim();
    }
    return null;
  } catch {
    return null;
  }
}
