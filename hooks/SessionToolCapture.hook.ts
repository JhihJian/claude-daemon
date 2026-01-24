#!/usr/bin/env bun
/**
 * SessionToolCapture.hook.ts
 * 在每次工具调用后记录操作
 *
 * Hook 类型: PostToolUse
 * 触发时机: 每次工具调用后
 * 职责: 捕获工具名称、输入、输出、成功状态
 */

import { appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============================================================================
// 1. 读取 Hook 输入
// ============================================================================

const input = await Bun.stdin.text();
const event = JSON.parse(input);

// 调试：记录实际接收到的事件结构
console.error('[SessionToolCapture] Received event:', JSON.stringify(event, null, 2));

// ============================================================================
// 2. 核心逻辑
// ============================================================================

try {
  const paiDir = process.env.PAI_DIR || join(homedir(), '.claude');
  const sessionId = event.session_id;
  const timestamp = new Date().toISOString();
  const yearMonth = timestamp.slice(0, 7);

  // 2.1 定位会话文件
  const sessionFile = join(paiDir, 'SESSIONS/raw', yearMonth, `session-${sessionId}.jsonl`);

  // 2.2 检查文件是否存在
  if (!existsSync(sessionFile)) {
    console.error(`[SessionToolCapture] Session file not found: ${sessionFile}`);
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 2.3 构建工具事件
  const toolEvent = {
    event_type: 'tool_use',
    session_id: sessionId,
    timestamp: timestamp,
    tool_name: event.tool_name,

    // 工具输入（完整保留）
    tool_input: event.tool_input || {},

    // 工具输出（截断到 5000 字符）
    // PostToolUse hook 可能不包含 tool_output，使用 result 或其他字段
    tool_output: truncateOutput(event.tool_output || event.result || event.output || '', 5000),

    // 状态
    // PostToolUse hook 可能不包含 tool_use_status，尝试其他可能的字段
    success: event.tool_use_status === 'success' || event.success === true || event.status === 'success',
    status: event.tool_use_status || event.status || 'unknown',

    // 额外信息
    duration_ms: event.duration_ms || null,

    // 调试：保留原始事件的所有字段（可选）
    _raw_event_keys: Object.keys(event),
  };

  // 2.4 追加到 JSONL 文件
  // 使用 appendFileSync 保证原子性
  appendFileSync(sessionFile, JSON.stringify(toolEvent) + '\n');

  // 2.5 可选：提取文件修改信息
  if (event.tool_name === 'Edit' || event.tool_name === 'Write') {
    const filePath = event.tool_input?.file_path;
    if (filePath) {
      console.error(`[SessionToolCapture] File modified: ${filePath}`);
    }
  }

} catch (error) {
  console.error('[SessionToolCapture] Error:', error);
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
 * 截断输出到指定长度
 */
function truncateOutput(output: any, maxLength: number): any {
  if (typeof output === 'string') {
    if (output.length > maxLength) {
      return output.slice(0, maxLength) + '\n... (truncated)';
    }
    return output;
  }

  // 如果是对象，转为 JSON 后截断
  if (typeof output === 'object' && output !== null) {
    const json = JSON.stringify(output);
    if (json.length > maxLength) {
      return json.slice(0, maxLength) + '... (truncated)';
    }
    return output;
  }

  return output;
}
