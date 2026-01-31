#!/usr/bin/env bun
/**
 * Hook Server - 接收 Hook 推送的数据
 *
 * 守护进程的一部分，监听 Unix Socket，接收来自 Hook 的事件数据
 * 扩展支持Agent操作（注册、注销、状态更新等）
 */

import { createServer, Server, Socket } from 'net';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHookLogger } from '../lib/logger.ts';
import { AgentRegistry } from './agent-registry.ts';
import { MessageBroker } from './message-broker.ts';
import type { AgentInfo } from './types/agent-types';
import type { TaskCompletionReport } from './types/message-types';

const logger = createHookLogger('HookServer');

export interface HookEvent {
  hook_name: string;
  event_type: string;
  session_id: string;
  timestamp: string;
  data: any;
}

export class HookServer {
  private server?: Server;
  private socketPath: string;
  private eventHandlers: Map<string, (event: HookEvent) => Promise<void>>;
  private agentRegistry: AgentRegistry;
  private messageBroker: MessageBroker;

  constructor(socketPath: string = '/tmp/claude-daemon.sock') {
    this.socketPath = socketPath;
    this.eventHandlers = new Map();
    this.agentRegistry = new AgentRegistry();
    this.messageBroker = new MessageBroker();
    this.setupAgentEventHandlers();
    this.setupMessageHandlers();
  }

  /**
   * 设置Agent事件处理器
   */
  private setupAgentEventHandlers(): void {
    this.agentRegistry.on("event", (event) => {
      logger.debug('Agent event', {
        type: event.type,
        sessionId: event.agent.sessionId,
        label: event.agent.label,
        status: event.agent.status
      });
    });
  }

  /**
   * 设置消息处理器
   */
  private setupMessageHandlers(): void {
    this.messageBroker.on("message", (message) => {
      logger.debug("New message", {
        from: message.from,
        to: message.to,
        type: message.type,
        id: message.id,
      });
    });
  }

  /**
   * 获取AgentRegistry实例（供外部访问）
   */
  getAgentRegistry(): AgentRegistry {
    return this.agentRegistry;
  }

  /**
   * 获取MessageBroker实例（供外部访问）
   */
  getMessageBroker(): MessageBroker {
    return this.messageBroker;
  }

  /**
   * 注册事件处理器
   */
  on(eventType: string, handler: (event: HookEvent) => Promise<void>): void {
    this.eventHandlers.set(eventType, handler);
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    // 清理旧的 socket 文件
    if (existsSync(this.socketPath)) {
      logger.info('Removing old socket file', { socketPath: this.socketPath });
      unlinkSync(this.socketPath);
    }

    this.server = createServer((socket: Socket) => {
      this.handleConnection(socket);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.socketPath, () => {
        logger.info('Hook server started', { socketPath: this.socketPath });
        resolve();
      });

      this.server!.on('error', (error) => {
        logger.error('Server error', error);
        reject(error);
      });
    });
  }

  /**
   * 处理客户端连接
   */
  private handleConnection(socket: Socket): void {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // 处理完整的 JSON 消息（以换行符分隔）
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留不完整的行

      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(line, socket);
        }
      }
    });

    socket.on('error', (error) => {
      logger.error('Socket error', error);
    });

    socket.on('end', () => {
      // 连接关闭，处理剩余数据
      if (buffer.trim()) {
        this.handleMessage(buffer, socket);
      }
    });
  }

  /**
   * 处理单个消息
   */
  private async handleMessage(message: string, socket: Socket): Promise<void> {
    try {
      const data = JSON.parse(message);

      // 检查是否为action操作（Agent操作）
      if (data.action) {
        await this.handleAgentAction(data, socket);
        return;
      }

      // 原有的Hook事件处理
      const event: HookEvent = data as HookEvent;

      logger.debug('Received event', {
        hookName: event.hook_name,
        eventType: event.event_type,
        sessionId: event.session_id,
      });

      // 查找对应的处理器
      const handler = this.eventHandlers.get(event.event_type);

      if (handler) {
        await handler(event);

        // 发送成功响应
        socket.write(JSON.stringify({ success: true }) + '\n');
      } else {
        logger.warn('No handler for event type', { eventType: event.event_type });
        socket.write(JSON.stringify({ success: false, error: 'No handler' }) + '\n');
      }
    } catch (error) {
      logger.error('Failed to process message', {
        error: error instanceof Error ? error.message : String(error),
        message: message.slice(0, 100),
      });

      socket.write(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }) + '\n');
    }
  }

  /**
   * 处理Agent相关操作
   */
  private async handleAgentAction(data: any, socket: Socket): Promise<void> {
    const { action, session_id, type, label, config, working_dir, parent_id, status } = data;

    try {
      let result: any = { success: false };

      switch (action) {
        case "register_agent": {
          const agent = this.agentRegistry.register({
            sessionId: session_id,
            type: type || "master",
            label: label || `${type}-${session_id.slice(0, 8)}`,
            agentConfig: config || "default",
            workingDir: working_dir || process.cwd(),
            parentId: parent_id,
          });
          result = { success: true, agent };
          break;
        }

        case "unregister_agent": {
          const unregistered = this.agentRegistry.unregister(session_id);
          result = { success: unregistered };
          break;
        }

        case "update_agent_status": {
          const updated = this.agentRegistry.updateStatus(session_id, status);
          result = { success: !!updated, agent: updated };
          break;
        }

        case "agent_heartbeat": {
          const updated = this.agentRegistry.heartbeat(session_id);
          result = { success: !!updated, agent: updated };
          break;
        }

        case "get_agent": {
          const agent = this.agentRegistry.get(session_id);
          result = { success: true, agent };
          break;
        }

        case "list_agents": {
          const query: any = {};
          if (data.type) query.type = data.type;
          if (data.status) query.status = data.status;
          if (data.parent_id) query.parentId = data.parent_id;
          if (data.config) query.agentConfig = data.config;

          const agents = this.agentRegistry.query(query);
          result = { success: true, agents };
          break;
        }

        case "get_all_agents": {
          const agents = this.agentRegistry.getAll();
          result = { success: true, agents };
          break;
        }

        // ===== 消息操作 =====
        case "send_message": {
          const message = this.messageBroker.send({
            from: data.from,
            to: data.to,
            type: data.type || "task",
            content: data.content,
            metadata: data.metadata,
            replyTo: data.reply_to,
          });
          result = { success: true, message };
          break;
        }

        case "get_messages": {
          const sessionId = data.session_id;
          const unreadOnly = data.unread_only;

          let messages;
          if (unreadOnly) {
            messages = this.messageBroker.getUnreadMessages(sessionId);
          } else {
            messages = this.messageBroker.getMessages(sessionId);
          }

          result = { success: true, messages };
          break;
        }

        case "mark_messages_read": {
          const messageIds = data.message_ids || [];
          let allMarked = true;

          for (const id of messageIds) {
            const marked = this.messageBroker.markAsRead(id);
            if (!marked) allMarked = false;
          }

          result = { success: allMarked };
          break;
        }

        case "query_messages": {
          const queryOptions: any = {};
          if (data.type) queryOptions.type = data.type;
          if (data.status) queryOptions.status = data.status;
          if (data.limit) queryOptions.limit = data.limit;
          if (data.since) queryOptions.since = data.since;

          const messages = this.messageBroker.query(queryOptions);
          result = { success: true, messages };
          break;
        }

        case "delete_message": {
          const deleted = this.messageBroker.deleteMessage(data.message_id);
          result = { success: deleted };
          break;
        }

        case "task_completion": {
          const report: TaskCompletionReport = {
            sessionId: data.session_id,
            taskId: data.report.task_id,
            status: data.report.status,
            result: data.report.result,
            error: data.report.error,
            duration: data.report.duration,
            timestamp: Date.now(),
          };

          // 保存任务结果
          await this.saveTaskResult(report);

          // 更新Agent状态为idle
          this.agentRegistry.updateStatus(data.session_id, "idle");

          // 如果有父Agent，发送消息通知
          const agent = this.agentRegistry.get(data.session_id);
          if (agent?.parentId) {
            this.messageBroker.send({
              from: data.session_id,
              to: agent.parentId,
              type: "result",
              content: `Task ${report.taskId} completed with status: ${report.status}`,
              metadata: { report },
            });
          }

          result = { success: true };
          break;
        }

        default:
          result = { success: false, error: "Unknown action" };
      }

      socket.write(JSON.stringify(result) + "\n");
    } catch (error) {
      socket.write(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }) + "\n");
    }
  }

  /**
   * 保存任务结果
   */
  private async saveTaskResult(report: TaskCompletionReport): Promise<void> {
    const taskDir = join(process.env.HOME || "", ".claude/AGENT_TASKS", report.taskId);
    mkdirSync(taskDir, { recursive: true });

    const resultFile = join(taskDir, `${report.sessionId}.md`);
    writeFileSync(resultFile, report.result, "utf-8");

    // 保存元数据
    const metaFile = join(taskDir, "meta.json");
    const meta = {
      taskId: report.taskId,
      sessionId: report.sessionId,
      status: report.status,
      error: report.error,
      duration: report.duration,
      timestamp: report.timestamp,
    };
    writeFileSync(metaFile, JSON.stringify(meta, null, 2), "utf-8");
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Hook server stopped');

          // 清理 socket 文件
          if (existsSync(this.socketPath)) {
            unlinkSync(this.socketPath);
          }

          // 清理Agent注册表
          this.agentRegistry.destroy();

          // 清理消息代理
          this.messageBroker.destroy();

          resolve();
        });
      } else {
        this.agentRegistry.destroy();
        this.messageBroker.destroy();
        resolve();
      }
    });
  }
}

// 测试代码
if (import.meta.main) {
  const server = new HookServer();

  // 注册测试处理器
  server.on('session_start', async (event) => {
    console.log('Session started:', event.session_id);
  });

  server.on('tool_use', async (event) => {
    console.log('Tool used:', event.data.tool_name);
  });

  // 启动服务器
  await server.start();

  console.log('Hook server is running. Press Ctrl+C to stop.');
  console.log('Test with:');
  console.log('  echo \'{"hook_name":"test","event_type":"session_start","session_id":"123","timestamp":"2024-01-01T00:00:00Z","data":{}}\' | nc -U /tmp/claude-daemon.sock');

  // 处理退出信号
  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  // 保持进程运行
  process.stdin.resume();
}
