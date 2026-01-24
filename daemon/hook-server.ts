#!/usr/bin/env bun
/**
 * Hook Server - 接收 Hook 推送的数据
 *
 * 守护进程的一部分，监听 Unix Socket，接收来自 Hook 的事件数据
 */

import { createServer, Server, Socket } from 'net';
import { existsSync, unlinkSync } from 'fs';
import { createHookLogger } from '../lib/logger.ts';

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

  constructor(socketPath: string = '/tmp/claude-daemon.sock') {
    this.socketPath = socketPath;
    this.eventHandlers = new Map();
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
      const event: HookEvent = JSON.parse(message);

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

          resolve();
        });
      } else {
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
