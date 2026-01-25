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

      // 提取用户消息
      if (entry.type === 'user' && entry.message?.content) {
        userMessages.push(entry.message.content);
      }

      // 提取助手回复
      if (entry.type === 'assistant' && entry.message?.content) {
        const content = entry.message.content;
        if (Array.isArray(content)) {
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
