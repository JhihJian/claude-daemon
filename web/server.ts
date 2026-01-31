#!/usr/bin/env bun
/**
 * Web UI Server
 * Claude Code 会话历史可视化界面
 *
 * 使用 Bun 内置 Web 服务器提供 RESTful API 和静态文件服务
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { connect } from 'net';
import { SessionsAPI } from './api/sessions';
import { StatsAPI } from './api/stats';
import { createHookLogger } from '../lib/logger';

const logger = createHookLogger('WebServer');

// ============================================================================
// Web Server 类
// ============================================================================

export class WebServer {
  private port: number;
  private hostname: string;
  private sessionsAPI: SessionsAPI;
  private statsAPI: StatsAPI;
  private server: any;
  private wsClients: Set<any> = new Set();
  private daemonSocketPath = '/tmp/claude-daemon.sock';

  constructor(port: number = 3000, hostname: string = '127.0.0.1') {
    this.port = port;
    this.hostname = hostname;
    this.sessionsAPI = new SessionsAPI();
    this.statsAPI = new StatsAPI();
  }

  /**
   * 启动 Web 服务器
   */
  async start(): Promise<void> {
    this.server = Bun.serve({
      port: this.port,
      hostname: this.hostname,

      fetch: async (req, server) => {
        const url = new URL(req.url);
        const path = url.pathname;

        // CORS 头（仅本地开发）
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        };

        // 处理 OPTIONS 预检请求
        if (req.method === 'OPTIONS') {
          return new Response(null, { headers: corsHeaders });
        }

        try {
          // WebSocket 升级
          if (path === '/ws' && req.headers.get('upgrade') === 'websocket') {
            if (server.upgrade(req)) {
              return undefined;
            }
            return new Response('WebSocket upgrade failed', { status: 400 });
          }

          // API 路由
          if (path.startsWith('/api/')) {
            const response = await this.handleAPIRequest(path, url);
            return new Response(JSON.stringify(response.data), {
              status: response.status,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            });
          }

          // 静态文件服务
          return this.serveStaticFile(path);

        } catch (error: any) {
          logger.error('Request error', { path, error: error.message });
          return new Response(
            JSON.stringify({ error: error.message }),
            {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }
      },

      // WebSocket 处理
      websocket: {
        open: (ws) => {
          this.wsClients.add(ws);
          logger.info('WebSocket client connected', {
            clients: this.wsClients.size,
          });
          ws.send(JSON.stringify({ type: 'connected', message: 'Welcome!' }));
        },

        message: (ws, message) => {
          logger.debug('WebSocket message received', { message });
        },

        close: (ws) => {
          this.wsClients.delete(ws);
          logger.info('WebSocket client disconnected', {
            clients: this.wsClients.size,
          });
        },

        error: (ws, error) => {
          logger.error('WebSocket error', { error });
        },
      },
    });

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`🌐 Web UI Server started`);
    logger.info(`   URL: http://${this.hostname}:${this.port}`);
    logger.info(`   WebSocket: ws://${this.hostname}:${this.port}/ws`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      logger.info('Web server stopped');
    }
  }

  /**
   * 处理 API 请求
   */
  private async handleAPIRequest(
    path: string,
    url: URL
  ): Promise<{ status: number; data: any }> {
    const segments = path.split('/').filter(Boolean);

    // /api/sessions/*
    if (segments[1] === 'sessions') {
      if (segments[2] === 'recent') {
        const limit = parseInt(url.searchParams.get('limit') || '10');
        return {
          status: 200,
          data: this.sessionsAPI.getRecent(limit),
        };
      }

      if (segments[2] === 'active' && segments[3]) {
        const activeDetail = await this.requestDaemon('active_session', { sessionId: segments[3] });
        return {
          status: activeDetail.success ? 200 : 404,
          data: activeDetail.success ? activeDetail.data : null,
        };
      }
      if (segments[2] === 'active') {
        const active = await this.requestDaemon('active_sessions');
        return {
          status: active.success ? 200 : 503,
          data: active.success ? active.data : [],
        };
      }

      if (segments[2] === 'by-type') {
        const type = url.searchParams.get('type');
        if (!type) {
          return { status: 400, data: { error: 'Missing type parameter' } };
        }
        return {
          status: 200,
          data: this.sessionsAPI.getByType(type),
        };
      }

      if (segments[2] === 'by-directory') {
        const directory = url.searchParams.get('directory');
        if (!directory) {
          return { status: 400, data: { error: 'Missing directory parameter' } };
        }
        return {
          status: 200,
          data: this.sessionsAPI.getByDirectory(directory),
        };
      }

      if (segments[2] === 'by-host') {
        const hostname = url.searchParams.get('hostname');
        if (!hostname) {
          return { status: 400, data: { error: 'Missing hostname parameter' } };
        }
        return {
          status: 200,
          data: this.sessionsAPI.getByHostname(hostname),
        };
      }

      if (segments[2] && !['recent', 'active', 'by-type', 'by-directory', 'by-host'].includes(segments[2])) {
        // /api/sessions/{id}
        const sessionId = segments[2];
        return {
          status: 200,
          data: this.sessionsAPI.getById(sessionId),
        };
      }
    }

    // /api/stats/*
    if (segments[1] === 'stats') {
      if (segments[2] === 'global') {
        return {
          status: 200,
          data: this.statsAPI.getGlobalStats(),
        };
      }

      if (segments[2] === 'types') {
        return {
          status: 200,
          data: this.statsAPI.getTypeDistribution(),
        };
      }

      if (segments[2] === 'directories') {
        const limit = parseInt(url.searchParams.get('limit') || '10');
        return {
          status: 200,
          data: this.statsAPI.getTopDirectories(limit),
        };
      }

      if (segments[2] === 'timeline') {
        const days = parseInt(url.searchParams.get('days') || '30');
        return {
          status: 200,
          data: this.statsAPI.getTimeline(days),
        };
      }
    }

    // /api/health
    if (path === '/api/health') {
      return {
        status: 200,
        data: {
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
      };
    }

    return {
      status: 404,
      data: { error: 'API endpoint not found' },
    };
  }

  private async requestDaemon(command: string, data?: Record<string, unknown>): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!existsSync(this.daemonSocketPath)) {
      return { success: false, error: 'Daemon socket not found' };
    }

    return new Promise((resolve) => {
      const client = connect(this.daemonSocketPath);
      let buffer = '';
      let settled = false;

      const finish = (response: { success: boolean; data?: any; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(response);
        client.end();
      };

      client.on('error', (error) => finish({ success: false, error: error.message }));
      client.on('connect', () => {
        client.write(JSON.stringify({ command, data }) + '\n');
      });
      client.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            finish(parsed);
            return;
          } catch (error) {
            finish({ success: false, error: error instanceof Error ? error.message : 'Failed to parse response' });
            return;
          }
        }
      });
      client.on('end', () => {
        if (!settled) {
          finish({ success: false, error: 'No response from daemon' });
        }
      });
    });
  }

  /**
   * 提供静态文件服务
   */
  private serveStaticFile(path: string): Response {
    // 默认路径
    if (path === '/') {
      path = '/index.html';
    }

    const publicDir = join(__dirname, 'public');
    const filePath = join(publicDir, path);

    try {
      const file = Bun.file(filePath);

      // 检查文件是否存在
      if (!file.exists) {
        return new Response('Not Found', { status: 404 });
      }

      // 获取 MIME 类型
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };

      const ext = path.substring(path.lastIndexOf('.'));
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      return new Response(file, {
        headers: {
          'Content-Type': mimeType,
        },
      });
    } catch (error: any) {
      logger.error('Static file error', { path, error: error.message });
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * 广播 WebSocket 消息
   */
  broadcast(data: any): void {
    const message = JSON.stringify(data);
    for (const client of this.wsClients) {
      try {
        client.send(message);
      } catch (error: any) {
        logger.error('WebSocket broadcast error', { error: error.message });
      }
    }
  }

  /**
   * 获取服务器状态
   */
  getStatus() {
    return {
      running: !!this.server,
      port: this.port,
      hostname: this.hostname,
      wsClients: this.wsClients.size,
    };
  }
}

// ============================================================================
// CLI 入口
// ============================================================================

if (import.meta.main) {
  const port = parseInt(process.env.WEB_PORT || '3000');
  const hostname = process.env.WEB_HOST || '127.0.0.1';

  const server = new WebServer(port, hostname);

  server.start().catch((error) => {
    console.error('[WebServer] Fatal error:', error);
    process.exit(1);
  });

  // 优雅关闭
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT');
    await server.stop();
    process.exit(0);
  });
}

export default WebServer;
