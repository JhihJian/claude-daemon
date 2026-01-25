#!/usr/bin/env bun
/**
 * SessionAnalyzer.hook.ts (推送模式)
 * 会话结束时通知守护进程进行分析
 */

import { connect } from 'net';
import { existsSync, readFileSync } from 'fs';
import { safeJSONParse } from '../lib/errors.ts';

const DAEMON_SOCKET = '/tmp/claude-daemon.sock';
const PUSH_TIMEOUT = 2000;

// 读取 Hook 输入
const input = await Bun.stdin.text();
const event = JSON.parse(input);

const sessionId = event.session_id;
const timestamp = new Date().toISOString();

// 提取对话内容（如果有 transcript）
const conversation = extractConversation(event.transcript_path);

// 构建事件数据
const hookEvent = {
  hook_name: 'SessionAnalyzer',
  event_type: 'session_end',
  session_id: sessionId,
  timestamp: timestamp,
  data: {
    conversation,
  }
};

// 推送到守护进程
await pushToDaemon(hookEvent);

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

function extractConversation(transcriptPath: string | undefined): any {
  if (!transcriptPath || !existsSync(transcriptPath)) {
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

      if (entry.type === 'tool_use' || entry.type === 'tool_result') {
        continue;
      }

      // 提取用户消息
      if (entry.type === 'user') {
        const text = normalizeContent(entry.message?.content ?? entry.content ?? null);
        if (text) {
          userMessages.push(text);
        }
      }

      // 提取助手回复
      if (entry.type === 'assistant') {
        const text = normalizeContent(entry.message?.content ?? entry.content ?? null);
        if (text) {
          assistantResponses.push(text);
        }
      }
    }

    return {
      user_messages: userMessages,
      assistant_responses: assistantResponses,
      message_count: userMessages.length + assistantResponses.length
    };
  } catch {
    return {
      user_messages: [],
      assistant_responses: [],
      message_count: 0
    };
  }
}

function normalizeContent(content: any): string | null {
  if (!content) {
    return null;
  }

  if (typeof content === 'string') {
    return content.trim() ? content : null;
  }

  if (Array.isArray(content)) {
    const textContent = content
      .filter(item => item && item.type === 'text' && typeof item.text === 'string')
      .map(item => item.text)
      .join('\n')
      .trim();
    return textContent || null;
  }

  if (typeof content === 'object' && typeof content.text === 'string') {
    return content.text.trim() ? content.text : null;
  }

  return null;
}
