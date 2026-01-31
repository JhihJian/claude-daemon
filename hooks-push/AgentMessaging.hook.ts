#!/usr/bin/env bun
/**
 * AgentMessaging.hook.ts
 *
 * 在每次工具调用后检查是否有新消息，并注入到Agent上下文中
 *
 * 触发时机：tool_call_end
 *
 * 通过Daemon的Socket API查询消息队列
 * 如果有未读消息，格式化输出到stdout，Claude会看到这些内容
 */

import { connect } from "net";
import { join } from "path";

// 获取平台特定的 IPC 路径
// Note: Bun v1.3.5 has a bug with Windows named pipes that causes crashes.
// As a workaround, we use TCP sockets on localhost for Windows.
function getIPCPath(): string {
  if (process.platform === 'win32') {
    return '127.0.0.1:39281';  // TCP socket on localhost
  } else {
    return '/tmp/claude-daemon.sock';  // Unix socket
  }
}

const DAEMON_SOCKET = process.env.DAEMON_SOCKET || getIPCPath();
const SESSION_ID = process.env.SESSION_ID || "";

interface HookEvent {
  event_type: string;
  session_id: string;
  timestamp: number;
}

interface AgentMessage {
  id: string;
  type: string;
  from: string;
  to: string;
  timestamp: number;
  content: string;
  status: string;
}

interface DaemonResponse {
  success: boolean;
  messages?: AgentMessage[];
  error?: string;
}

/**
 * 查询Daemon获取消息
 */
async function fetchMessages(sessionId: string): Promise<AgentMessage[]> {
  return new Promise((resolve) => {
    const socket = connect(DAEMON_SOCKET);

    socket.on("connect", () => {
      socket.write(JSON.stringify({
        action: "get_messages",
        session_id: sessionId,
        unread_only: true,
      }) + "\n");
    });

    let responseData = "";
    socket.on("data", (chunk) => {
      responseData += chunk.toString();
    });

    socket.on("end", () => {
      try {
        const response: DaemonResponse = JSON.parse(responseData.trim());
        resolve(response.messages || []);
      } catch {
        resolve([]);
      }
    });

    socket.on("error", () => {
      resolve([]);
    });

    socket.setTimeout(3000);
    socket.on("timeout", () => {
      socket.destroy();
      resolve([]);
    });
  });
}

/**
 * 标记消息为已读
 */
async function markMessagesAsRead(sessionId: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;

  return new Promise((resolve) => {
    const socket = connect(DAEMON_SOCKET);

    socket.on("connect", () => {
      socket.write(JSON.stringify({
        action: "mark_messages_read",
        session_id: sessionId,
        message_ids: messageIds,
      }) + "\n");
    });

    socket.on("data", () => {
      socket.end();
      resolve();
    });

    socket.on("error", () => {
      resolve();
    });

    socket.setTimeout(3000);
    socket.on("timeout", () => {
      socket.destroy();
      resolve();
    });
  });
}

/**
 * 格式化消息显示
 */
function formatMessage(message: AgentMessage): string {
  const lines: string[] = [];

  lines.push("┌" + "─".repeat(60));
  lines.push(`│ 📬 新消息来自: ${message.from}`);
  lines.push(`│ 类型: ${message.type}`);
  lines.push(`│ 时间: ${new Date(message.timestamp).toLocaleString()}`);
  lines.push("├" + "─".repeat(60));
  lines.push(`│ ${message.content.split("\n").join("\n│ ")}`);
  lines.push("└" + "─".repeat(60));

  return lines.join("\n");
}

/**
 * 主处理逻辑
 */
async function main() {
  // 读取输入 - 添加错误处理
  let input: string;
  let event: HookEvent;

  try {
    input = await Bun.stdin.text();

    // 处理空输入
    if (!input || input.trim() === '') {
      console.log(JSON.stringify({ continue: true }));
      process.exit(0);
    }

    event = JSON.parse(input);
  } catch {
    // 忽略解析错误，继续执行
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  const sessionId = event.session_id || SESSION_ID;
  if (!sessionId) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  try {
    // 查询未读消息
    const messages = await fetchMessages(sessionId);

    if (messages.length > 0) {
      // 输出消息分隔符
      console.log("\n");
      console.log("╔" + "═".repeat(60));
      console.log("║ 🔔 您有新的Agent消息");
      console.log("╚" + "═".repeat(60));
      console.log();

      // 输出每条消息
      for (const message of messages) {
        console.log(formatMessage(message));
        console.log();
      }

      // 标记为已读
      const messageIds = messages.map(m => m.id);
      await markMessagesAsRead(sessionId, messageIds);
    }

    // 输出继续执行标志
    console.log(JSON.stringify({ continue: true }));
  } catch (error) {
    console.error("AgentMessaging hook error:", error);
    console.log(JSON.stringify({ continue: true }));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
