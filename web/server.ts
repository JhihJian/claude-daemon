#!/usr/bin/env bun
/**
 * Web UI Server
 * Claude Code 会话历史可视化界面
 *
 * 使用 Bun 内置 Web 服务器提供 RESTful API 和静态文件服务
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { SessionsAPI } from './api/sessions';
import { StatsAPI } from './api/stats';
import { AgentsAPI, ConfigPackagesAPI } from './api/agents';
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
  private agentsAPI: AgentsAPI;
  private configPackagesAPI: ConfigPackagesAPI;
  private server: any;
  private wsClients: Set<any> = new Set();

  constructor(port: number = 3000, hostname: string = '127.0.0.1') {
    this.port = port;
    this.hostname = hostname;
    this.sessionsAPI = new SessionsAPI();
    this.statsAPI = new StatsAPI();
    this.agentsAPI = new AgentsAPI();
    this.configPackagesAPI = new ConfigPackagesAPI();
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

      if (segments[2] && segments[2] !== 'recent') {
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

    // ============================================================
    // /api/agents/*
    // ============================================================
    if (segments[1] === 'agents') {
      // GET /api/agents - Get all agents
      if (!segments[2] || segments[2] === 'list') {
        const type = url.searchParams.get('type') || undefined;
        const status = url.searchParams.get('status') || undefined;
        const parentId = url.searchParams.get('parentId') || undefined;
        const config = url.searchParams.get('config') || undefined;

        return {
          status: 200,
          data: await this.agentsAPI.listAgents({
            type: type as any,
            status: status as any,
            parentId: parentId || undefined,
            config: config || undefined,
          }),
        };
      }

      // GET /api/agents/stats - Get agent statistics
      if (segments[2] === 'stats') {
        return {
          status: 200,
          data: await this.agentsAPI.getStats(),
        };
      }

      // GET /api/agents/workers - Get available workers
      if (segments[2] === 'workers') {
        return {
          status: 200,
          data: await this.agentsAPI.getAvailableWorkers(),
        };
      }

      // GET /api/agents/:sessionId - Get specific agent
      if (segments[2] && segments[2] !== 'list' && segments[2] !== 'stats' && segments[2] !== 'workers') {
        const sessionId = segments[2];

        // GET agent details
        if (req.method === 'GET') {
          const agent = await this.agentsAPI.getAgent(sessionId);
          if (!agent) {
            return { status: 404, data: { error: 'Agent not found' } };
          }
          return { status: 200, data: agent };
        }

        // PUT update agent status
        if (req.method === 'PUT') {
          // Parse body for PUT request
          const body = await req.json().catch(() => ({}));
          const success = await this.agentsAPI.updateAgentStatus(sessionId, body.status);
          return {
            status: success ? 200 : 404,
            data: success ? { success: true } : { error: 'Failed to update agent' },
          };
        }

        // DELETE unregister agent
        if (req.method === 'DELETE') {
          const success = await this.agentsAPI.unregisterAgent(sessionId);
          return {
            status: success ? 200 : 404,
            data: success ? { success: true } : { error: 'Failed to unregister agent' },
          };
        }

        // POST send message to agent
        if (req.method === 'POST' && segments[3] === 'message') {
          const body = await req.json().catch(() => ({}));
          const message = await this.agentsAPI.sendMessage({
            from: body.from || 'system',
            to: sessionId,
            type: body.type || 'task',
            content: body.content || '',
            metadata: body.metadata,
            replyTo: body.replyTo,
          });
          return {
            status: 200,
            data: message,
          };
        }

        // GET messages for agent
        if (req.method === 'GET' && segments[3] === 'messages') {
          const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
          const messages = await this.agentsAPI.getMessages(sessionId, unreadOnly);
          return { status: 200, data: messages };
        }
      }
    }

    // ============================================================
    // /api/configs/*
    // ============================================================
    if (segments[1] === 'configs') {
      // GET /api/configs - Get all config packages
      if (!segments[2]) {
        return {
          status: 200,
          data: await this.configPackagesAPI.getConfigPackages(),
        };
      }

      // GET /api/configs/:name - Get specific config package
      if (segments[2]) {
        const config = await this.configPackagesAPI.getConfigPackage(segments[2]);
        if (!config) {
          return { status: 404, data: { error: 'Config package not found' } };
        }
        return { status: 200, data: config };
      }
    }

    return {
      status: 404,
      data: { error: 'API endpoint not found' },
    };
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
   * 广播 Agent 事件
   */
  broadcastAgentEvent(event: string, data: any): void {
    this.broadcast({
      type: 'agent_event',
      event,
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * 广播 Agent 注册事件
   */
  broadcastAgentRegistered(agent: any): void {
    this.broadcastAgentEvent('agent_registered', agent);
  }

  /**
   * 广播 Agent 更新事件
   */
  broadcastAgentUpdated(agent: any): void {
    this.broadcastAgentEvent('agent_updated', agent);
  }

  /**
   * 广播 Agent 注销事件
   */
  broadcastAgentUnregistered(sessionId: string): void {
    this.broadcastAgentEvent('agent_unregistered', { sessionId });
  }

  /**
   * 广播新消息事件
   */
  broadcastNewMessage(message: any): void {
    this.broadcastAgentEvent('new_message', message);
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
