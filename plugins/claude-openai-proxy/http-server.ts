/**
 * HTTP Server
 * 提供 OpenAI API 兼容的 HTTP 服务
 */

import type { Logger } from '../../lib/logger.ts';
import type { ProcessManager } from './process-manager.ts';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';

export class HTTPServer {
  private server?: Server;
  private port: number;
  private host: string;
  private processManager: ProcessManager;
  private logger: Logger;
  private running = false;

  constructor(port: number, host: string, processManager: ProcessManager, logger: Logger) {
    this.port = port;
    this.host = host;
    this.processManager = processManager;
    this.logger = logger;
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, this.host, () => {
        this.running = true;
        this.logger.info('HTTP server started', {
          host: this.host,
          port: this.port,
        });
        resolve();
      });

      this.server!.on('error', (error) => {
        this.logger.error('Server error', error);
        reject(error);
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.running = false;
          this.logger.info('HTTP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 检查服务器是否运行
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 路由
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      await this.handleChatCompletions(req, res);
    } else if (req.url === '/health' && req.method === 'GET') {
      this.handleHealth(req, res);
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * 处理聊天完成请求
   */
  private async handleChatCompletions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // 读取请求体
      const body = await this.readBody(req);
      const request = JSON.parse(body);

      const { messages, stream = true } = request;

      // 提取 sessionId（从 header 或生成）
      const sessionId = (req.headers['x-session-id'] as string) || `session-${Date.now()}`;

      // 提取 system message 和用户消息
      const systemMessage = messages.find((m: any) => m.role === 'system')?.content;
      const userMessage = messages[messages.length - 1].content;

      // 获取或创建进程
      let process = this.processManager.getProcess(sessionId);
      if (!process) {
        process = await this.processManager.createProcess(sessionId, systemMessage);
      }

      // 设置 SSE 响应
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // 监听进程输出
      this.processManager.onOutput(sessionId, (chunk) => {
        const sseData = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'claude-opus-4',
          choices: [
            {
              index: 0,
              delta: { content: chunk },
              finish_reason: null,
            },
          ],
        };

        res.write(`data: ${JSON.stringify(sseData)}\n\n`);
      });

      // 发送用户消息
      await this.processManager.sendMessage(sessionId, userMessage);

      // 发送结束标记 (等待足够长的时间让响应完成)
      setTimeout(() => {
        res.write('data: [DONE]\n\n');
        res.end();
      }, 30000);
    } catch (error) {
      this.logger.error('Error handling chat completions');
      this.logger.error(`Error type: ${error?.constructor?.name || typeof error}`);
      this.logger.error(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        this.logger.error(`Error stack: ${error.stack}`);
      }
      res.writeHead(500);
      res.end(JSON.stringify({
        error: {
          message: error instanceof Error ? error.message : 'Internal server error',
          type: 'internal_error',
        },
      }));
    }
  }

  /**
   * 处理健康检查
   */
  private handleHealth(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      activeProcesses: this.processManager.getActiveCount(),
    }));
  }

  /**
   * 读取请求体
   */
  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
  }
}
