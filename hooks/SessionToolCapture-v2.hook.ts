#!/usr/bin/env bun
/**
 * SessionToolCapture-v2.hook.ts
 * 从 transcript 读取完整的工具输出
 *
 * Hook 类型: PostToolUse
 * 触发时机: 工具调用完成后
 * 职责: 记录工具调用的输入、输出和状态
 */

import { appendFileSync, existsSync, readFileSync } from 'fs';
import { createHookLogger } from '../lib/logger.ts';
import {
  hookErrorHandler,
  withTimeout,
  safeJSONParse,
  validateRequired,
  FileSystemError
} from '../lib/errors.ts';
import { config } from '../lib/config.ts';

// ============================================================================
// 初始化
// ============================================================================

const logger = createHookLogger('SessionToolCapture');
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
  const toolName = validateRequired(event.tool_name, 'tool_name');
  const timestamp = new Date().toISOString();
  const yearMonth = config.getYearMonth();

  // 2.2 定位会话文件
  const sessionFile = config.getSessionFilePath(sessionId, yearMonth);

  if (!existsSync(sessionFile)) {
    logger.warn('Session file not found', { sessionFile, sessionId });
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 2.3 提取工具输出和成功状态
  let toolOutput = '';
  let toolSuccess = false;

  // 优先从 tool_response 字段获取（直接可用）
  if (event.tool_response) {
    const response = event.tool_response;

    // 合并 stdout 和 stderr
    const stdout = response.stdout || '';
    const stderr = response.stderr || '';
    toolOutput = stdout + (stderr ? '\n[stderr]\n' + stderr : '');

    // 判断成功：没有中断且没有错误
    toolSuccess = !response.interrupted && !response.is_error;

    logger.debug('Tool output from tool_response', {
      toolName,
      outputLength: toolOutput.length,
      success: toolSuccess,
    });
  }
  // 备用方案：从 transcript 读取
  else if (event.transcript_path && existsSync(event.transcript_path)) {
    try {
      const result = await withTimeout(
        readToolResultFromTranscript(event.transcript_path, event.tool_use_id),
        cfg.hookTimeout,
        'readToolResultFromTranscript'
      );
      toolOutput = result.output;
      toolSuccess = result.success;

      logger.debug('Tool output from transcript', {
        toolName,
        outputLength: toolOutput.length,
        success: toolSuccess,
      });
    } catch (error) {
      logger.warn('Failed to read from transcript', {
        error: error instanceof Error ? error.message : String(error),
        transcriptPath: event.transcript_path,
      });
    }
  }

  // 2.4 构建工具事件
  const toolEvent = {
    event_type: 'tool_use',
    session_id: sessionId,
    timestamp: timestamp,
    tool_name: toolName,
    tool_use_id: event.tool_use_id,

    // 工具输入
    tool_input: event.tool_input || {},

    // 工具输出（截断到配置的最大长度）
    tool_output: truncateOutput(toolOutput, cfg.maxOutputLength),

    // 状态
    success: toolSuccess,

    // 额外信息
    duration_ms: event.duration_ms || null,
  };

  // 2.5 追加到 JSONL 文件
  try {
    appendFileSync(sessionFile, JSON.stringify(toolEvent) + '\n');
  } catch (error) {
    throw new FileSystemError(
      `Failed to append to session file: ${sessionFile}`,
      sessionFile,
      'append'
    );
  }

  // 2.6 提取文件修改信息
  if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = event.tool_input?.file_path;
    if (filePath) {
      logger.info('File modified', { filePath, toolName });
    }
  }

  // 2.7 记录性能
  logger.perf('SessionToolCapture', startTime);

} catch (error) {
  hookErrorHandler('SessionToolCapture')(error);
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
 * 从 transcript 读取工具结果
 */
async function readToolResultFromTranscript(
  transcriptPath: string,
  toolUseId: string
): Promise<{ output: string; success: boolean }> {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      const entry = safeJSONParse<any>(line, null, 'transcript line');
      if (!entry) continue;

      // 查找 tool_result 消息
      if (entry.type === 'message' && entry.role === 'user') {
        for (const block of entry.content || []) {
          if (block.type === 'tool_result' && block.tool_use_id === toolUseId) {
            // 提取输出
            let output = '';
            if (typeof block.content === 'string') {
              output = block.content;
            } else if (Array.isArray(block.content)) {
              output = block.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n');
            }

            return {
              output,
              success: !block.is_error,
            };
          }
        }
      }
    }

    return { output: '', success: false };
  } catch (error) {
    logger.error('Error reading transcript', {
      error: error instanceof Error ? error.message : String(error),
      transcriptPath,
    });
    return { output: '', success: false };
  }
}

/**
 * 截断输出到指定长度
 */
function truncateOutput(output: any, maxLength: number): any {
  if (typeof output === 'string') {
    if (output.length > maxLength) {
      return output.slice(0, maxLength) + '\n... (truncated)';
    }
    return output;
  }

  if (typeof output === 'object' && output !== null) {
    const json = JSON.stringify(output);
    if (json.length > maxLength) {
      return json.slice(0, maxLength) + '... (truncated)';
    }
    return output;
  }

  return output;
}
