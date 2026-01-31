#!/usr/bin/env bun
/**
 * Hook Server - 接收 Hook 推送的数据
 *
 * 守护进程的一部分，监听 IPC 连接，接收来自 Hook 的事件数据
 * 支持 Unix Socket (Linux/macOS) 和 Named Pipes (Windows)
 */

import { createServer, Server, Socket } from 'net';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createHookLogger } from '../lib/logger.ts';

const logger = createHookLogger('HookServer');

/**
 * 获取平台特定的 IPC 路径
 *
 * Note: Bun v1.3.5 has a bug with Windows named pipes that causes crashes.
 * As a workaround, we use TCP sockets on localhost for Windows.
 */
function getIPCPath(name: string = 'claude-daemon'): string {
  if (process.platform === 'win32') {
    // Windows: Use TCP socket on localhost as workaround for Bun named pipe bug
    // Port 39281 = "CLAUDE" in phone keypad
    return '127.0.0.1:39281';
  } else {
    // Unix: 使用 Unix Socket
    return `/tmp/${name}.sock`;
  }
}

export interface HookEvent {
  hook_name: string;
  event_type: string;
  session_id: string;
  timestamp: string;
  data: any;
}

export interface IPCCommand {
  command: string;
  sessionId?: string;
  data?: any;
}

export interface IPCResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export type CommandHandler = (request: IPCCommand) => Promise<IPCResponse>;

export class HookServer {
  private server?: Server;
  private socketPath: string;
  private eventHandlers: Map<string, (event: HookEvent) => Promise<void>>;
  private commandHandlers: Map<string, CommandHandler>;

  constructor(socketPath?: string) {
    // 如果没有提供路径，使用平台特定的默认路径
    this.socketPath = socketPath || getIPCPath('claude-daemon');
    this.eventHandlers = new Map();
    this.commandHandlers = new Map();

    logger.info('HookServer initialized', {
      platform: process.platform,
      socketPath: this.socketPath,
      ipcType: process.platform === 'win32' ? 'Named Pipe' : 'Unix Socket'
    });
  }

  /**
   * 注册事件处理器
   */
  on(eventType: string, handler: (event: HookEvent) => Promise<void>): void {
    this.eventHandlers.set(eventType, handler);
  }

  /**
   * 注册命令处理器
   */
  registerCommand(commandName: string, handler: CommandHandler): void {
    this.commandHandlers.set(commandName, handler);
    logger.debug(`Registered command: ${commandName}`);
  }

  /**
   * 取消注册命令处理器
   */
  unregisterCommand(commandName: string): void {
    this.commandHandlers.delete(commandName);
    logger.debug(`Unregistered command: ${commandName}`);
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    const isWindows = process.platform === 'win32';

    // 清理旧的 socket 文件 (仅 Unix)
    if (!isWindows && existsSync(this.socketPath)) {
      logger.info('Removing old socket file', { socketPath: this.socketPath });
      unlinkSync(this.socketPath);
    }

    this.server = createServer((socket: Socket) => {
      this.handleConnection(socket);
    });

    return new Promise((resolve, reject) => {
      if (isWindows) {
        // Windows: Listen on TCP port
        const [host, portStr] = this.socketPath.split(':');
        const port = parseInt(portStr, 10);
        this.server!.listen(port, host, () => {
          logger.info(`Hook server started (TCP Socket)`, {
            host,
            port,
            platform: process.platform
          });
          resolve();
        });
      } else {
        // Unix: Listen on Unix socket
        this.server!.listen(this.socketPath, () => {
          logger.info(`Hook server started (Unix Socket)`, {
            socketPath: this.socketPath,
            platform: process.platform
          });
          resolve();
        });
      }

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
      const parsed = JSON.parse(message);

      // 区分 IPC 命令和 Hook 事件
      if ('command' in parsed) {
        // 处理 IPC 命令
        await this.handleCommand(parsed as IPCCommand, socket);
      } else {
        // 处理 Hook 事件
        await this.handleEvent(parsed as HookEvent, socket);
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
   * 处理 Hook 事件
   */
  private async handleEvent(event: HookEvent, socket: Socket): Promise<void> {
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
  }

  /**
   * 处理 IPC 命令
   */
  private async handleCommand(command: IPCCommand, socket: Socket): Promise<void> {
    logger.debug('Received command', {
      command: command.command,
      sessionId: command.sessionId,
    });

    // 查找对应的命令处理器
    const handler = this.commandHandlers.get(command.command);

    if (handler) {
      const response = await handler(command);
      socket.write(JSON.stringify(response) + '\n');
    } else {
      logger.warn('No handler for command', { command: command.command });
      socket.write(JSON.stringify({
        success: false,
        error: `Unknown command: ${command.command}`
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

          // 清理 socket 文件 (仅 Unix)
          if (process.platform !== 'win32' && existsSync(this.socketPath)) {
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
