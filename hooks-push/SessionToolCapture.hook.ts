#!/usr/bin/env bun
/**
 * SessionToolCapture.hook.ts (推送模式)
 * 工具调用完成后推送数据到守护进程
 */

import { connect } from 'net';
import { appendFileSync, existsSync, readFileSync } from 'fs';
import { config } from '../lib/config.ts';
import { safeJSONParse } from '../lib/errors.ts';

const DAEMON_SOCKET = '/tmp/claude-daemon.sock';
const PUSH_TIMEOUT = 2000;

// 读取 Hook 输入
const input = await Bun.stdin.text();
const event = JSON.parse(input);

const sessionId = event.session_id;
const toolName = event.tool_name;
const timestamp = new Date().toISOString();

// 提取工具输出和成功状态
let toolOutput = '';
let toolSuccess = false;

if (event.tool_response) {
  const response = event.tool_response;
  const stdout = response.stdout || '';
  const stderr = response.stderr || '';
  toolOutput = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
  toolSuccess = !response.interrupted && !response.is_error;
} else if (event.transcript_path && existsSync(event.transcript_path)) {
  const result = await readToolResultFromTranscript(
    event.transcript_path,
    event.tool_use_id
  );
  toolOutput = result.output;
  toolSuccess = result.success;
}

// 构建事件数据
const hookEvent = {
  hook_name: 'SessionToolCapture',
  event_type: 'tool_use',
  session_id: sessionId,
  timestamp: timestamp,
  data: {
    tool_name: toolName,
    tool_use_id: event.tool_use_id,
    tool_input: event.tool_input || {},
    tool_output: truncateOutput(toolOutput, 5000),
    success: toolSuccess,
    duration_ms: event.duration_ms || null,
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
  });
}

async function fallbackToFileMode(event: any): Promise<void> {
  try {
    const yearMonth = config.getYearMonth();
    const sessionFile = config.getSessionFilePath(event.session_id, yearMonth);

    if (existsSync(sessionFile)) {
      appendFileSync(sessionFile, JSON.stringify(event) + '\n', { mode: 0o600 });
    }
  } catch (error) {
    console.error('[SessionToolCapture] Fallback failed:', error);
  }
}

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

      if (entry.type === 'message' && entry.role === 'user') {
        for (const block of entry.content || []) {
          if (block.type === 'tool_result' && block.tool_use_id === toolUseId) {
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
  } catch {
    return { output: '', success: false };
  }
}

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
