结合 claude-daemon 的多 Agent 协作方案

  看完 claude-daemon 的架构后，我发现这确实提供了一个更可靠的基础！让我提出一个改进方案。

● Read 1 file (ctrl+o to expand)

● 🎯 改进方案：基于 claude-daemon 的多 Agent 协作架构

  核心洞察

  claude-daemon 提供了原方案缺失的关键能力：

  1. ✅ 合法的扩展机制 - Claude Code Hooks 是官方支持的
  2. ✅ 结构化事件流 - 不需要解析 PTY 输出
  3. ✅ 中心化协调 - Daemon 可以作为消息中枢
  4. ✅ 实时通信 - 已有 WebSocket 广播能力

---
  📐 新架构设计

  ┌─────────────────────────────────────────────────────────────────┐
  │                    Browser (claude-code-web)                     │
  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
  │  │sessions.html │  │terminal.html │  │   Agent Dashboard      │ │
  │  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘ │
  │         └──────────────────┴──────────────────────┘              │
  │                          │ WebSocket                             │
  └──────────────────────────┼───────────────────────────────────────┘
                             │
  ┌──────────────────────────┼───────────────────────────────────────┐
  │                    Express Server (claude-code-web)               │
  │  ┌────────────────────────────────────────────────────────────┐  │
  │  │                  SessionManager (PTY 管理)                  │  │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │  │
  │  │  │Session 1 │  │Session 2 │  │Session 3 │  │Session 4 │   │  │
  │  │  │(PTY)     │  │(PTY)     │   │  │
  │  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │  │
  │  └───────┼─────────────┼─────────────┼─────────────┼──────────┘  │
  └──────────┼─────────────┼─────────────┼─────────────┼─────────────┘
             │             │             │             │
             │ Hooks       │ Hooks       │ Hooks       │ Hooks
             ▼             ▼             ▼             ▼
  ┌─────────────────────────────────┐
  │              Claude Daemon (协调中枢)                             │
  ├─────────────────────────────────────────────────────────────────┤
  │  [Hook Server] ← Unix Socket 接收 Hook 事件                      │
  │       ↓                                                          │
  │  [Event Queue] ← 事件队列                                        │
  │       ↓                                                          │
  │  [Agent Coordinator] ← 新增：Agent 协调器                        │
  │       ↓                                                          │
  │  [Message Router] ← 新增：消息路由                               │
  │       ↓                                                          │
  │  [Storage Service] ← 存储服务                                    │
  │                                                                  │
  │  [WebSocket Broadcast] ← 实时推送                                │
  └─────────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                      Storage Layer                               │
  │  - Session Events (JSONL)                                        │
  │  - Agent Messages (JSONL) ← 新增                                 │
  │  - Agent Registry (JSON) ← 新增                                  │
  └─────────────────────────────────────────────────────────────────┘

---
  🔧 实现方案

  阶段 1：扩展 claude-daemon（核心协调能力）

  1.1 新增 Agent Coordinator

  文件: daemon/agent-coordinator.ts

  /**
   * Agent Coordinator - 管理 Agent 间协作
      */
    export class AgentCoordinator {

    private agents: Map<string, AgentInfo> = new Map();
    private messageQueue: Map<string, Message[]> = new Map();
    
    interface AgentInfo {
      sessionId: string;
      type: 'parent' | 'subagent';
      parentId?: string;
      label: string;
      status: 'active' | 'idle' | 'busy';
      workingDir: string;
      createdAt: number;
      lastActivity: number;
    }
    
    interface Message {
      id: string;
      from: string;
      to: string;
      content: string;
      timestamp: number;
      status: 'pending' | 'delivered' | 'read';
    }
    
    // 注册 Agent
    registerAgent(sessionId: string, info: Partial<AgentInfo>): void {
      this.agents.set(sessionId, {
        sessionId,
        type: info.type || 'parent',
        parentId: info.parentId,
        label: info.label || `Agent-${sessionId.slice(0, 8)}`,
        status: 'active',
        workingDir: info.workingDir || process.cwd(),
        createdAt: Date.now(),
        lastActivity: Date.now(),
      });
    
      this.messageQueue.set(sessionId, []);
    }
    
    // 发送消息
    sendMessage(from: string, to: string, content: string): string {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
      const message: Message = {
        id: messageId,
        from,
        to,
        content,
        timestamp: Date.now(),
        status: 'pending',
      };
    
      // 权限检查
      if (!this.checkPermission(from, to)) {
        throw new Error('Permission denied');
      }
    
      // 加入目标队列
      const queue = this.messageQueue.get(to);
      if (queue) {
        queue.push(message);
      }
    
      return messageId;
    }
    
    // 获取待处理消息
    getMessages(sessionId: string): Message[] {
      return this.messageQueue.get(sessionId) || [];
    }
    
    // 标记消息已读
    markAsRead(sessionId: string, messageId: string): void {
      const queue = this.messageQueue.get(sessionId);
      if (queue) {
        const msg = queue.find(m => m.id === messageId);
        if (msg) msg.status = 'read';
      }
    }
    
    // 权限检查
    private checkPermission(from: string, to: string): boolean {
      const sender = this.agents.get(from);
      const receiver = this.agents.get(to);
    
      if (!sender || !receiver) return false;
    
      // 子 Agent 只能与父 Agent 通信
      if (sender.type === 'subagent') {
        return sender.parentId === to;
      }
    
      // 父 Agent 可以与子 Agent 通信
      if (receiver.type === 'subagent') {
        return receiver.parentId === from;
      }
    
      // 父 Agent 之间默认允许（可配置）
      return true;
    }
    
    // 获取所有 Agent
    getAllAgents(): AgentInfo[] {
      return Array.from(this.agents.values());
    }
    
    // 注销 Agent
    unregisterAgent(sessionId: string): void {
      this.agents.delete(sessionId);
      this.messageQueue.delete(sessionId);
    }
  }

  1.2 新增自定义 Hook：AgentMessenger

  文件: hooks-push/AgentMessenger.hook.ts

  #!/usr/bin/env bun
  /**
   * AgentMessenger.hook.ts
   * 在每次工具调用后检查是否有来自其他 Agent 的消息
      */

  import { connect } from 'net';

  const DAEMON_SOCKET = '/tmp/claude-daemon.sock';
  const input = await Bun.stdin.text();
  const event = JSON.parse(input);

  // 查询是否有新消息
  const messages = await queryMessages(event.session_id);

  if (messages && messages.length > 0) {
    // 将消息注入到 Claude 的上下文中
    console.log('\n━━━━━━━━━━━━━━━━');
    console.log('📬 You have new messages from other agents:');
    console.log('━━━━━━━━━━━━━━━━\n');

    for (const msg of messages) {
      console.log(`From: ${msg.from}`);
      console.log(`Time: ${new Date(msg.timestamp).toLocaleString()}`);
      console.log(`Message:\n${msg.content}\n`);
    
      // 标记为已读
      await markAsRead(event.session_id, msg.id);
    }
    
    console.log('━━━━━━━━\n');
  }

  // 输出决策
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);

  // ============================================================================
  // 辅助函数
  // ============================================================================

  async function queryMessages(sessionId: string): Promise<any[]> {
    return new Promise((resolve) => {
      const socket = connect(DAEMON_SOCKET);

      socket.on('connect', () => {
        socket.write(JSON.stringify({
          action: 'get_messages',
          session_id: sessionId,
        }) + '\n');
      });
    
      socket.on('data', (data) => {
        try {
          const response = JSON.parse(data.toString());
          socket.end();
          resolve(response.messages || []);
        } catch {
          socket.end();
          resolve([]);
        }
      });
    
      socket.on('error', () => resolve([]));
      socket.on('timeout', () => {
        socket.destroy();
        resolve([]);
      });
    });
  }

  async function markAsRead(sessionId: string, messageId: string): Promise<void> {
    return new Promise((resolve) => {
      const socket = connect(DAEMON_SOCKET);

      socket.on('connect', () => {
        socket.write(JSON.stringify({
          action: 'mark_read',
          session_id: sessionId,
          message_id: messageId,
        }) + '\n');
      });
    
      socket.on('data', () => {
        socket.end();
        resolve();
      });
    
      socket.on('error', () => resolve());
    });
  }

  1.3 扩展 Hook Server 支持新动作

  修改: daemon/hook-server.ts

  // 在 handleMessage 中添加新的动作处理
  private async handleMessage(message: string, socket: Socket): Promise<void> {
    try {
      const data = JSON.parse(message);

      // 原有的事件处理
      if (data.event_type) {
        // ... 现有逻辑
      }
    
      // 新增：Agent 协调动作
      if (data.action) {
        const result = await this.handleAgentAction(data);
        socket.write(JSON.stringify(result) + '\n');
        return;
      }
    } catch (error) {
      // ... 错误处理
    }
  }

  private async handleAgentAction(data: any): Promise<any> {
    const { action, session_id } = data;

    switch (action) {
      case 'get_messages':
        return {
          success: true,
          messages: this.agentCoordinator.getMessages(session_id),
        };
    
      case 'send_message':
        const messageId = this.agentCoordinator.sendMessage(
          session_id,
          data.to_session_id,
          data.content
        );
        return { success: true, message_id: messageId };
    
      case 'mark_read':
        this.agentCoordinator.markAsRead(session_id, data.message_id);
        return { success: true };
    
      case 'list_agents':
        return {
          success: true,
          agents: this.agentCoordinator.getAllAgents(),
        };
    
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

---
  阶段 2：扩展 claude-code-web（Web 界面集成）

  2.1 添加 Agent 管理 API

  新增: routes/agents.js

  const express = require('express');
  const { connect } = require('net');
  const router = express.Router();

  const DAEMON_SOCKET = '/tmp/claude-daemon.sock';

  // 查询所有 Agent
  router.get('/', async (req, res) => {
    try {
      const agents = await queryDaemon({ action: 'list_agents' });
      res.json({ agents });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 发送消息
  router.post('/:fromId/send', async (req, res) => {
    const { toSessionId, content } = req.body;

    try {
      const result = await queryDaemon({
        action: 'send_message',
        session_id: req.params.fromId,
        to_session_id: toSessionId,
        content,
      });
    
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 辅助函数：查询 Daemon
  function queryDaemon(data) {
    return new Promise((resolve, reject) => {
      const socket = connect(DAEMON_SOCKET);

      socket.on('connect', () => {
        socket.write(JSON.stringify(data) + '\n');
      });
    
      socket.on('data', (response) => {
        try {
          const result = JSON.parse(response.toString());
          socket.end();
          resolve(result);
        } catch (error) {
          socket.end();
          reject(error);
        }
      });
    
      socket.on('error', reject);
      socket.setTimeout(5000);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Daemon timeout'));
      });
    });
  }

  module.exports = router;

  2.2 Agent 控制面板

  新增: public/agent-dashboard.html

  <!DOCTYPE html>
  <html>
  <head>
    <title>Agent Dashboard</title>
    <style>
      .agent-card {
        border: 2px solid #ddd;
        padding: 15px;
        margin: 10px;
        border-radius: 8px;
        background: #f9f9f9;
      }
      .agent-card.active { border-color: #4CAF50; }
      .agent-card.busy { border-color: #FF9800; }
      .message-box {
        background: #fff;
        border: 1px solid #ccc;
        padding: 10px;
        margin-top: 10px;
        border-radius: 4px;
      }
    </style>
  </head>
  <body>
    <h1>🤖 Agent Collaboration Dashboard</h1>

    <div id="agents-container"></div>
    
    <script>
      let agents = [];
    
      async function loadAgents() {
        const response = await fetch('/api/agents');
        const data = await response.json();
        agents = data.agents;
        renderAgents();
      }
    
      function renderAgents() {
        const container = document.getElementById('agents-container');
        container.innerHTML = agents.map(agent => `
          <div class="agent-card ${agent.status}">
            <h3>${agent.label}</h3>
            <p><strong>Session ID:</strong> ${agent.sessionId}</p>
            <p><strong>Type:</strong> ${agent.type}</p>
            <p><strong>Status:</strong> ${agent.status}</p>
            <p><strong>Working Dir:</strong> ${agent.workingDir}</p>
            <p><strong>Last Activity:</strong> ${new Date(agent.lastActivity).toLocaleString()}</p>
    
            ${agent.type === 'parent' ? `
              <button onclick="sendMessageTo('${agent.sessionId}')">
                📤 Send Message
              </button>
              <button onclick="openTerminal('${agent.sessionId}')">
                🖥️ Open Terminal
              </button>
            ` : ''}
          </div>
        `).join('');
      }
    
      async function  = prompt('Message content:');
        const fromId = prompt('From which session? (Enter session ID)');
        if (!fromId || !content) return;
    
        await fetch(`/api/agents/${fromId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toSessionId: sessionId,
            content,
          }),
        });
    
        alert('Message sent!');
      }
    
      function openTerminal(sessionId) {
        window.open(`/terminal.html?sessionId=${sessionId}`, '_blank');
      }
    
      // 定期刷新
      setInterval(loadAgents, 3000);
      loadAgents();
    </script>
  </body>
  </html>

---
  🎯 方案优势

  相比原方案的改进
  ┌──────────────┬───────────────────────────┬───────────────────────────────┐
  │     方面     │          原方案           │            新方案             │
  ├──────────────┼───────────────────────────┼───────────────────────────────┤
  │ 消息传递     │ ❌ PTY 输出解析（不可靠） │ ✅ Hook + Unix Socket（可靠） │
  ├──────────────┼───────────────────────────┼───────────────────────────────┤
  │ 任务完成检测 │ ❌ 特殊标记（易误判）     │ ✅ Hook 事件（精确）          │
  ├──────────────┼───────────────────────────┼───────────────────────────────┤
  │ 系统提示词   │ ❌ 无法注入               │ ✅ 通过 Hook 输出注入         │
  ├──────────────┼───────────────────────────┼───────────────────────────────┤
  │ 可维护性     │ ❌ 脆弱                   │ ✅ 稳定                       │
  ├──────────────┼───────────────────────────┼───────────────────────────────┤
  │ 扩展性       │ ⚠️ 有限                   │ ✅ 良好                       │
  └──────────────┴───────────────────────────┴───────────────────────────────┘
  核心创新点

  1. Hook 作为通信桥梁

    - 不依赖 PTY 输出解析
    - 结构化数据传输
    - 可靠的事件触发
  2. Daemon 作为协调中枢

    - 中心化消息路由
    - 统一的 Agent 注册表
    - 实时状态同步
  3. 消息注入机制

    - 通过 Hook 的 stdout 注入消息
    - Claude 会看到并理解这些消息
    - 不需要修改 Claude Code 本身