#!/usr/bin/env bun
/**
 * SessionToolCapture.hook.ts
 * 在每次工具调用后记录操作
 *
 * Hook 类型: PostToolUse
 * 触发时机: 每次工具调用后
 * 职责: 捕获工具名称、输入、输出、成功状态，推送到守护进程
 */

import { connect } from 'net';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============================================================================
// 1. 读取 Hook 输入
// ============================================================================

const input = await Bun.stdin.text();
const event = JSON.parse(input);

// ============================================================================
// 2. 核心逻辑
// ============================================================================

try {
  const paiDir = process.env.PAI_DIR || join(homedir(), '.claude');
  const sessionId = event.session_id;
  const timestamp = new Date().toISOString();

  // 2.1 构建工具事件
  const toolEvent = {
    hook_name: 'SessionToolCapture',
    event_type: 'tool_use',
    session_id: sessionId,
    timestamp: timestamp,
    data: {
      tool_name: event.tool_name,
      tool_input: event.tool_input || {},
      tool_output: truncateOutput(event.tool_output || event.result || event.output || '', 5000),
      success: event.tool_use_status === 'success' || event.success === true || event.status === 'success',
      status: event.tool_use_status || event.status || 'unknown',
      duration_ms: event.duration_ms || null,
    },
  };

  // 2.2 尝试推送到守护进程
  const pushed = await pushToDaemon(toolEvent);

  // 2.3 如果推送失败，回退到文件写入
  if (!pushed) {
    fallbackToFile(toolEvent, paiDir);
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
 * 推送事件到守护进程
 */
async function pushToDaemon(event: any): Promise<boolean> {
  return new Promise((resolve) => {
    const socketPath = '/tmp/claude-daemon.sock';
    const timeout = 2000; // 2 秒超时

    const client = connect(socketPath);
    let responded = false;

    // 设置超时
    const timer = setTimeout(() => {
      if (!responded) {
        responded = true;
        client.destroy();
        resolve(false);
      }
    }, timeout);

    client.on('connect', () => {
      // 发送事件（以换行符结尾）
      client.write(JSON.stringify(event) + '\n');
    });

    client.on('data', (data) => {
      if (!responded) {
        responded = true;
        clearTimeout(timer);
        client.end();

        try {
          const response = JSON.parse(data.toString());
          resolve(response.success === true);
        } catch {
          resolve(false);
        }
      }
    });

    client.on('error', () => {
      if (!responded) {
        responded = true;
        clearTimeout(timer);
        resolve(false);
      }
    });
  });
}

/**
 * 回退到文件写入
 */
function fallbackToFile(event: any, paiDir: string): void {
  try {
    const yearMonth = event.timestamp.slice(0, 7);
    const rawDir = join(paiDir, 'SESSIONS/raw', yearMonth);
    const sessionFile = join(rawDir, `session-${event.session_id}.jsonl`);

    // 确保目录存在
    if (!existsSync(rawDir)) {
      mkdirSync(rawDir, { recursive: true });
    }

    // 转换事件格式为存储格式
    const storageEvent = {
      event_type: event.event_type,
      session_id: event.session_id,
      timestamp: event.timestamp,
      ...event.data,
    };

    // 追加到文件
    appendFileSync(sessionFile, JSON.stringify(storageEvent) + '\n');
  } catch (error) {
    console.error('[SessionToolCapture] Fallback write failed:', error);
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
