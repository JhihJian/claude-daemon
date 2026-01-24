#!/usr/bin/env bun
/**
 * SessionAnalyzer.hook.ts
 * 在会话结束时分析和分类会话
 *
 * Hook 类型: Stop
 * 触发时机: Claude Code 会话结束时
 * 职责: 读取会话事件流、分类、提取关键信息、创建索引
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { createHookLogger } from '../lib/logger.ts';
import {
  hookErrorHandler,
  safeJSONParse,
  validateRequired,
  FileSystemError
} from '../lib/errors.ts';
import { config } from '../lib/config.ts';

// ============================================================================
// 类型定义
// ============================================================================

type SessionType =
  | 'coding'      // 编码：主要是代码编辑
  | 'debugging'   // 调试：测试和错误修复
  | 'research'    // 研究：代码搜索和阅读
  | 'writing'     // 写作：文档编写
  | 'git'         // Git：版本控制操作
  | 'refactoring' // 重构：代码结构调整
  | 'mixed';      // 混合：无明显模式

// ============================================================================
// 初始化
// ============================================================================

const logger = createHookLogger('SessionAnalyzer');
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
  const yearMonth = config.getYearMonth();

  logger.info('Analyzing session', { sessionId });

  // 2.2 定位会话文件
  const sessionFile = config.getSessionFilePath(sessionId, yearMonth);

  if (!existsSync(sessionFile)) {
    logger.warn('Session file not found', { sessionFile, sessionId });
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 2.3 读取所有事件
  const events = readSessionEvents(sessionFile);

  if (events.length === 0) {
    logger.warn('No events found in session', { sessionId });
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 2.3 提取会话元数据
  const sessionStart = events.find(e => e.event_type === 'session_start');
  const toolEvents = events.filter(e => e.event_type === 'tool_use');

  // 2.4 分析会话类型
  const sessionType = classifySessionType(toolEvents);

  // 2.5 提取关键信息
  const filesModified = extractModifiedFiles(toolEvents);
  const toolUsage = analyzeToolUsage(toolEvents);
  const successRate = calculateSuccessRate(toolEvents);

  // 2.5.1 提取对话内容（从transcript）
  const conversation = extractConversation(event.transcript_path, sessionId);

  // 2.6 生成摘要
  const summary = {
    session_id: sessionId,
    timestamp: timestamp,

    // 会话上下文
    working_directory: sessionStart?.working_directory || 'unknown',
    git_repo: sessionStart?.git_repo || null,
    git_branch: sessionStart?.git_branch || null,

    // 主机和用户信息
    hostname: sessionStart?.hostname || 'unknown',
    user: sessionStart?.user || 'unknown',
    platform: sessionStart?.platform || 'unknown',

    // 会话分类
    session_type: sessionType,

    // 统计信息
    duration_seconds: calculateDuration(events),
    total_tools: toolEvents.length,
    success_rate: successRate,

    // 关键信息
    files_modified: filesModified,
    tool_usage: toolUsage,

    // 对话内容
    conversation: conversation,

    // 生成的摘要文本
    summary_text: generateSummaryText(sessionType, toolEvents, filesModified),
  };

  // 2.7 保存摘要
  const summaryDir = join(cfg.summariesDir, yearMonth);
  try {
    mkdirSync(summaryDir, { recursive: true });
  } catch (error) {
    throw new FileSystemError(
      `Failed to create summary directory: ${summaryDir}`,
      summaryDir,
      'mkdir'
    );
  }

  const summaryFile = config.getSummaryFilePath(sessionId, yearMonth);
  try {
    writeFileSync(summaryFile, JSON.stringify(summary, null, 2), { mode: 0o600 });
    logger.debug('Summary file created', { summaryFile });
  } catch (error) {
    throw new FileSystemError(
      `Failed to write summary file: ${summaryFile}`,
      summaryFile,
      'write'
    );
  }

  // 2.8 创建索引
  createTypeIndex(sessionType, sessionId, summary);
  createDirectoryIndex(sessionStart?.working_directory, sessionId, summary);

  // 2.9 更新全局元数据
  updateGlobalMetadata(summary);

  logger.perf('SessionAnalyzer', startTime);
  logger.info('Session analyzed successfully', {
    sessionId,
    sessionType,
    toolCount: toolEvents.length,
    successRate,
  });

} catch (error) {
  hookErrorHandler('SessionAnalyzer')(error);
}

// ============================================================================
// 3. 输出决策
// ============================================================================

console.log(JSON.stringify({ continue: true }));
process.exit(0);

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 读取会话文件中的所有事件
 */
function readSessionEvents(filePath: string): any[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    return lines.map(line => safeJSONParse(line, {}, 'session event')).filter(e => Object.keys(e).length > 0);
  } catch (error) {
    logger.error('Error reading session file', {
      error: error instanceof Error ? error.message : String(error),
      filePath,
    });
    return [];
  }
}

/**
 * 从 transcript 提取对话内容
 */
function extractConversation(transcriptPath: string | undefined, sessionId: string): any {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    logger.debug('Transcript not found', { transcriptPath, sessionId });
    return {
      user_messages: [],
      assistant_responses: [],
      message_count: 0
    };
  }

  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    const userMessages: string[] = [];
    const assistantResponses: string[] = [];

    for (const line of lines) {
      const entry = safeJSONParse<any>(line, null, 'transcript line');
      if (!entry) continue;

      // 提取用户消息
      if (entry.type === 'user' && entry.message?.content) {
        userMessages.push(entry.message.content);
      }

      // 提取助手回复
      if (entry.type === 'assistant' && entry.message?.content) {
        const content = entry.message.content;
        if (Array.isArray(content)) {
          // 提取 text 类型的内容
          const textContent = content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');
          if (textContent) {
            assistantResponses.push(textContent);
          }
        }
      }
    }

    logger.debug('Conversation extracted', {
      userMessages: userMessages.length,
      assistantResponses: assistantResponses.length,
    });

    return {
      user_messages: userMessages,
      assistant_responses: assistantResponses,
      message_count: userMessages.length + assistantResponses.length
    };
  } catch (error) {
    logger.error('Error reading transcript', {
      error: error instanceof Error ? error.message : String(error),
      transcriptPath,
    });
    return {
      user_messages: [],
      assistant_responses: [],
      message_count: 0
    };
  }
}

/**
 * 分类会话类型
 */
function classifySessionType(toolEvents: any[]): SessionType {
  if (toolEvents.length === 0) return 'mixed';

  // 统计工具使用次数
  const toolCounts: Record<string, number> = {};
  const bashCommands: string[] = [];

  for (const event of toolEvents) {
    const toolName = event.tool_name;
    toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;

    // 收集 Bash 命令
    if (toolName === 'Bash' && event.tool_input?.command) {
      bashCommands.push(event.tool_input.command);
    }
  }

  const editCount = (toolCounts['Edit'] || 0) + (toolCounts['Write'] || 0);
  const readCount = toolCounts['Read'] || 0;
  const searchCount = (toolCounts['Grep'] || 0) + (toolCounts['Glob'] || 0);
  const bashCount = toolCounts['Bash'] || 0;

  // Git 操作检测
  const gitCommandCount = bashCommands.filter(cmd =>
    cmd.includes('git ') || cmd.startsWith('git')
  ).length;

  if (gitCommandCount > bashCount * 0.5) {
    return 'git';
  }

  // 测试/调试检测
  const testCommandCount = bashCommands.filter(cmd =>
    cmd.includes('test') || cmd.includes('npm test') ||
    cmd.includes('pytest') || cmd.includes('jest')
  ).length;

  if (testCommandCount > 0 && readCount > editCount) {
    return 'debugging';
  }

  // 编码检测
  if (editCount > toolEvents.length * 0.4) {
    return 'coding';
  }

  // 研究检测
  if (searchCount > toolEvents.length * 0.3 && readCount > editCount) {
    return 'research';
  }

  // 文档编写检测
  const mdWriteCount = toolEvents.filter(e =>
    (e.tool_name === 'Write' || e.tool_name === 'Edit') &&
    e.tool_input?.file_path?.endsWith('.md')
  ).length;

  if (mdWriteCount > editCount * 0.5) {
    return 'writing';
  }

  // 默认为混合类型
  return 'mixed';
}

/**
 * 提取修改的文件列表
 */
function extractModifiedFiles(toolEvents: any[]): string[] {
  const files = new Set<string>();

  for (const event of toolEvents) {
    if (event.tool_name === 'Edit' || event.tool_name === 'Write') {
      const filePath = event.tool_input?.file_path;
      if (filePath) {
        files.add(filePath);
      }
    }
  }

  return Array.from(files);
}

/**
 * 分析工具使用情况
 */
function analyzeToolUsage(toolEvents: any[]): Record<string, number> {
  const usage: Record<string, number> = {};

  for (const event of toolEvents) {
    const toolName = event.tool_name;
    usage[toolName] = (usage[toolName] || 0) + 1;
  }

  return usage;
}

/**
 * 计算成功率
 */
function calculateSuccessRate(toolEvents: any[]): number {
  if (toolEvents.length === 0) return 0;

  const successCount = toolEvents.filter(e => e.success === true).length;
  return Math.round((successCount / toolEvents.length) * 100);
}

/**
 * 计算会话持续时间（秒）
 */
function calculateDuration(events: any[]): number {
  if (events.length < 2) return 0;

  const startTime = new Date(events[0].timestamp).getTime();
  const endTime = new Date(events[events.length - 1].timestamp).getTime();

  return Math.round((endTime - startTime) / 1000);
}

/**
 * 生成摘要文本
 */
function generateSummaryText(
  sessionType: SessionType,
  toolEvents: any[],
  filesModified: string[]
): string {
  const toolCount = toolEvents.length;
  const fileCount = filesModified.length;

  let summary = `${sessionType} session with ${toolCount} tool operations`;

  if (fileCount > 0) {
    summary += `, modified ${fileCount} file(s)`;
  }

  return summary;
}

/**
 * 创建类型索引
 */
function createTypeIndex(
  sessionType: SessionType,
  sessionId: string,
  summary: any
): void {
  try {
    const typeIndexPath = config.getTypeIndexPath(sessionType);
    const typeDir = join(cfg.analysisDir, 'by-type', sessionType);
    mkdirSync(typeDir, { recursive: true });

    // 读取现有索引
    let sessions: any[] = [];
    if (existsSync(typeIndexPath)) {
      const content = readFileSync(typeIndexPath, 'utf-8');
      sessions = safeJSONParse<any[]>(content, [], 'type index');
    }

    // 添加新会话
    sessions.push({
      session_id: sessionId,
      timestamp: summary.timestamp,
      working_directory: summary.working_directory,
      duration_seconds: summary.duration_seconds,
      total_tools: summary.total_tools,
      success_rate: summary.success_rate,
      summary_text: summary.summary_text,
    });

    // 按时间倒序排序
    sessions.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 写回文件
    writeFileSync(typeIndexPath, JSON.stringify(sessions, null, 2), { mode: 0o600 });

    logger.debug('Type index updated', { sessionType, sessionCount: sessions.length });
  } catch (error) {
    logger.error('Error creating type index', {
      error: error instanceof Error ? error.message : String(error),
      sessionType,
    });
  }
}

/**
 * 创建目录索引
 */
function createDirectoryIndex(
  workingDirectory: string | undefined,
  sessionId: string,
  summary: any
): void {
  if (!workingDirectory) return;

  try {
    // Base64 编码目录路径
    const dirHash = Buffer.from(workingDirectory).toString('base64')
      .replace(/\//g, '_')
      .replace(/\+/g, '-')
      .replace(/=/g, '');

    const dirIndexDir = join(cfg.analysisDir, 'by-directory', dirHash);
    mkdirSync(dirIndexDir, { recursive: true });

    // 保存原始路径
    const pathFile = join(dirIndexDir, 'path.txt');
    if (!existsSync(pathFile)) {
      writeFileSync(pathFile, workingDirectory, { mode: 0o600 });
    }

    // 读取现有索引
    const indexFile = join(dirIndexDir, 'sessions.json');
    let sessions: any[] = [];
    if (existsSync(indexFile)) {
      const content = readFileSync(indexFile, 'utf-8');
      sessions = safeJSONParse<any[]>(content, [], 'directory index');
    }

    // 添加新会话
    sessions.push({
      session_id: sessionId,
      timestamp: summary.timestamp,
      session_type: summary.session_type,
      duration_seconds: summary.duration_seconds,
      total_tools: summary.total_tools,
      files_modified: summary.files_modified,
      summary_text: summary.summary_text,
    });

    // 按时间倒序排序
    sessions.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 写回文件
    writeFileSync(indexFile, JSON.stringify(sessions, null, 2), { mode: 0o600 });

    logger.debug('Directory index updated', { workingDirectory, sessionCount: sessions.length });
  } catch (error) {
    logger.error('Error creating directory index', {
      error: error instanceof Error ? error.message : String(error),
      workingDirectory,
    });
  }
}

/**
 * 更新全局元数据索引
 */
function updateGlobalMetadata(summary: any): void {
  try {
    mkdirSync(cfg.indexDir, { recursive: true });

    const metadataFile = config.getMetadataPath();

    // 读取现有元数据
    let metadata: any = {
      total_sessions: 0,
      sessions_by_type: {},
      sessions_by_directory: {},
      last_updated: null,
    };

    if (existsSync(metadataFile)) {
      const content = readFileSync(metadataFile, 'utf-8');
      metadata = safeJSONParse(content, metadata, 'global metadata');
    }

    // 更新统计
    metadata.total_sessions += 1;
    metadata.sessions_by_type[summary.session_type] =
      (metadata.sessions_by_type[summary.session_type] || 0) + 1;

    if (summary.working_directory) {
      metadata.sessions_by_directory[summary.working_directory] =
        (metadata.sessions_by_directory[summary.working_directory] || 0) + 1;
    }

    metadata.last_updated = new Date().toISOString();

    // 写回文件
    writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), { mode: 0o600 });

    logger.debug('Global metadata updated', {
      totalSessions: metadata.total_sessions,
    });

  } catch (error) {
    logger.error('Error updating global metadata', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
