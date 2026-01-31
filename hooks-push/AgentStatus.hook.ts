#!/usr/bin/env bun
/**
 * AgentStatus.hook.ts
 *
 * 在会话开始时自动注册Agent，在会话结束时注销Agent
 * 通过环境变量或启动参数识别Agent类型和配置
 *
 * 触发时机：
 * - SessionStart: 会话启动时注册Agent
 * - SessionEnd: 会话结束时注销Agent
 *
 * 期望的输入（通过环境变量传递）：
 * - AGENT_TYPE: "master" | "worker"
 * - AGENT_CONFIG: 配置包名称
 * - AGENT_LABEL: 显示名称（可选）
 * - AGENT_PARENT_ID: 父Agent的sessionId（可选，仅worker需要）
 */

import { connect } from "net";

const DAEMON_SOCKET = process.env.DAEMON_SOCKET || "/tmp/claude-daemon.sock";

interface HookEvent {
  event_type: "session_start" | "session_end";
  session_id: string;
  working_dir: string;
  timestamp: number;
}

interface DaemonResponse {
  success: boolean;
  agent?: any;
  error?: string;
}

/**
 * 发送请求到Daemon
 */
async function sendToDaemon(action: string, data: Record<string, any>): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const socket = connect(DAEMON_SOCKET);

    socket.on("connect", () => {
      const payload = JSON.stringify({
        action,
        ...data,
      });
      socket.write(payload + "\n");
    });

    socket.on("data", (chunk) => {
      try {
        const response = JSON.parse(chunk.toString().trim());
        socket.end();
        resolve(response);
      } catch (e) {
        socket.end();
        reject(e);
      }
    });

    socket.on("error", (err) => {
      reject(err);
    });

    socket.setTimeout(5000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Daemon timeout"));
    });
  });
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
      console.error('[AgentStatus] Warning: Empty stdin received, skipping');
      console.log(JSON.stringify({ continue: true }));
      process.exit(0);
    }

    event = JSON.parse(input);

    // 验证必需字段
    if (!event.session_id) {
      console.error('[AgentStatus] Warning: Missing session_id in input');
      console.log(JSON.stringify({ continue: true }));
      process.exit(0);
    }
  } catch (e) {
    console.error('[AgentStatus] Error parsing input:', e instanceof Error ? e.message : String(e));
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 读取Agent配置环境变量
  const agentType = process.env.AGENT_TYPE || "master";
  const agentConfig = process.env.AGENT_CONFIG || "default";
  const agentLabel = process.env.AGENT_LABEL || `${agentType}-${event.session_id.slice(0, 8)}`;
  const agentParentId = process.env.AGENT_PARENT_ID;

  try {
    if (event.event_type === "session_start") {
      // 注册Agent
      const result = await sendToDaemon("register_agent", {
        session_id: event.session_id,
        type: agentType,
        label: agentLabel,
        config: agentConfig,
        working_dir: event.working_dir,
        parent_id: agentParentId,
      });

      if (result.success) {
        // 输出注册信息（注入到上下文）
        console.log(`\n✅ Agent Registered: ${agentLabel} (${agentType})`);
        console.log(`   Session ID: ${event.session_id}`);
        console.log(`   Config: ${agentConfig}`);
        if (agentParentId) {
          console.log(`   Parent: ${agentParentId}`);
        }
      } else {
        console.error(`❌ Failed to register agent: ${result.error}`);
      }
    } else if (event.event_type === "session_end") {
      // 注销Agent
      const result = await sendToDaemon("unregister_agent", {
        session_id: event.session_id,
      });

      if (result.success) {
        console.log(`\n👋 Agent Unregistered: ${event.session_id}`);
      } else {
        console.error(`❌ Failed to unregister agent: ${result.error}`);
      }
    }

    // 输出继续执行标志
    console.log(JSON.stringify({ continue: true }));
  } catch (e) {
    console.error("Hook error:", e);
    console.log(JSON.stringify({ continue: true })); // 即使失败也继续
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
