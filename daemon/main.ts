#!/usr/bin/env bun
/**
 * 守护进程主入口
 * Claude Code Daemon - 完整实现（支持插件系统）
 */

import { EventEmitter } from 'events';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { HookServer, HookEvent } from './hook-server.ts';
import { EventQueue, QueuedEvent } from './event-queue.ts';
import { StorageService } from './storage-service.ts';
import { SessionAnalyzer } from './session-analyzer.ts';
import { Scheduler } from './scheduler.ts';
import { HealthMonitor } from './health-monitor.ts';
import { CleanupService } from './cleanup-service.ts';
import { PluginManager } from './plugin-manager.ts';
import { createHookLogger } from '../lib/logger.ts';
import { config } from '../lib/config.ts';
import WebServer from '../web/server.ts';

const logger = createHookLogger('ClaudeDaemon');

class ClaudeDaemon {
  private hookServer: HookServer;
  private eventQueue: EventQueue;
  private storage: StorageService;
  private analyzer: SessionAnalyzer;
  private scheduler: Scheduler;
  private healthMonitor: HealthMonitor;
  private cleanupService: CleanupService;
  private pluginManager: PluginManager;
  private eventBus: EventEmitter;
  private webServer?: WebServer;
  private running = false;
  private startTime?: number;
  private webPort?: number;
  private webHost?: string;
  private webEnabled = false;

  constructor() {
    // 初始化事件总线
    this.eventBus = new EventEmitter();
    this.eventBus.setMaxListeners(100); // 增加监听器限制

    // 初始化服务
    this.hookServer = new HookServer();
    this.eventQueue = new EventQueue();
    this.storage = new StorageService();
    this.analyzer = new SessionAnalyzer(this.storage);
    this.scheduler = new Scheduler();
    this.healthMonitor = new HealthMonitor();
    this.cleanupService = new CleanupService();

    // 初始化插件管理器（传入 HookServer 以便插件可以注册 IPC 命令）
    this.pluginManager = new PluginManager(this.storage, this.eventBus, this.hookServer);

    // 设置 Hook 事件处理器
    this.setupHookHandlers();

    // 设置事件队列处理器
    this.setupQueueHandlers();

    // 设置定时任务
    this.setupScheduledTasks();

    // 注册 IPC 命令
    this.setupIPCCommands();
  }

  /**
   * 设置 Hook 事件处理器
   */
  private setupHookHandlers(): void {
    // 会话启动
    this.hookServer.on('session_start', async (event: HookEvent) => {
      await this.eventQueue.enqueue({
        id: `${event.session_id}-start`,
        type: 'session_start',
        data: event,
        timestamp: Date.now(),
      });
    });

    // 工具使用
    this.hookServer.on('tool_use', async (event: HookEvent) => {
      await this.eventQueue.enqueue({
        id: `${event.session_id}-tool-${Date.now()}`,
        type: 'tool_use',
        data: event,
        timestamp: Date.now(),
      });
    });

    // 会话结束
    this.hookServer.on('session_end', async (event: HookEvent) => {
      await this.eventQueue.enqueue({
        id: `${event.session_id}-end`,
        type: 'session_end',
        data: event,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * 设置事件队列处理器
   */
  private setupQueueHandlers(): void {
    // 处理会话启动
    this.eventQueue.on('session_start', async (event: QueuedEvent) => {
      const hookEvent = event.data as HookEvent;

      logger.info('Session started', {
        sessionId: hookEvent.session_id,
        workingDir: hookEvent.data.working_directory,
        user: hookEvent.data.user,
        hostname: hookEvent.data.hostname,
      });

      // 保存原始事件
      await this.storage.saveEvent({
        event_type: hookEvent.event_type,
        session_id: hookEvent.session_id,
        timestamp: hookEvent.timestamp,
        data: hookEvent.data,
      });

      // 通知分析器
      await this.analyzer.onSessionStart(hookEvent.session_id, hookEvent.data);
    });

    // 处理工具使用
    this.eventQueue.on('tool_use', async (event: QueuedEvent) => {
      const hookEvent = event.data as HookEvent;

      logger.debug('Tool used', {
        sessionId: hookEvent.session_id,
        toolName: hookEvent.data.tool_name,
        success: hookEvent.data.success,
      });

      // 保存原始事件
      await this.storage.saveEvent({
        event_type: hookEvent.event_type,
        session_id: hookEvent.session_id,
        timestamp: hookEvent.timestamp,
        data: hookEvent.data,
      });

      // 通知分析器
      await this.analyzer.onToolUse(hookEvent.session_id, hookEvent.data);

      // 实时监控失败
      if (hookEvent.data.success === false) {
        logger.warn('Tool execution failed', {
          toolName: hookEvent.data.tool_name,
          sessionId: hookEvent.session_id,
        });
      }
    });

    // 处理会话结束
    this.eventQueue.on('session_end', async (event: QueuedEvent) => {
      const hookEvent = event.data as HookEvent;

      logger.info('Session ended', {
        sessionId: hookEvent.session_id,
      });

      // 保存原始事件
      await this.storage.saveEvent({
        event_type: hookEvent.event_type,
        session_id: hookEvent.session_id,
        timestamp: hookEvent.timestamp,
        data: hookEvent.data,
      });

      // 触发分析
      const summary = await this.analyzer.onSessionEnd(
        hookEvent.session_id,
        hookEvent.data
      );

      if (summary) {
        logger.info('Session analysis completed', {
          sessionId: summary.session_id,
          type: summary.session_type,
          tools: summary.total_tools,
          duration: summary.duration_seconds,
        });

        // 通过 WebSocket 广播更新
        if (this.webServer) {
          this.webServer.broadcast({
            type: 'session_update',
            data: summary,
          });
        }
      }
    });
  }

  /**
   * 设置定时任务
   */
  private setupScheduledTasks(): void {
    // 健康检查 - 每 5 分钟
    this.scheduler.register({
      name: 'health-check',
      interval: 5 * 60 * 1000,
      enabled: true,
      handler: async () => {
        const status = await this.healthMonitor.check();

        if (!status.healthy) {
          logger.warn('Health check failed', {
            issues: status.issues.length,
          });
        }
      },
    });

    // 数据清理 - 每天凌晨 3 点（实际使用时可改为 cron）
    this.scheduler.register({
      name: 'cleanup',
      interval: 24 * 60 * 60 * 1000,
      enabled: true,
      handler: async () => {
        logger.info('Running scheduled cleanup...');

        const result = await this.cleanupService.cleanup({
          maxAgeDays: 90,
          maxSizeGB: 5,
          dryRun: false,
        });

        logger.info('Cleanup completed', {
          filesDeleted: result.filesDeleted,
          mbFreed: Math.round(result.bytesFreed / (1024 * 1024)),
          duration: result.duration,
        });
      },
    });

    // 活跃会话监控 - 每分钟
    this.scheduler.register({
      name: 'session-monitor',
      interval: 60 * 1000,
      enabled: true,
      handler: async () => {
        const activeSessions = this.analyzer.getActiveSessionsStatus();

        if (activeSessions.length > 0) {
          logger.debug('Active sessions', {
            count: activeSessions.length,
            sessions: activeSessions,
          });
        }
      },
    });
  }

  /**
   * 启动守护进程
   */
  async start(options?: { enableWebUI?: boolean; webPort?: number; webHost?: string }): Promise<void> {
    this.running = true;
    this.startTime = Date.now();
    this.webEnabled = Boolean(options?.enableWebUI);
    this.webPort = options?.webPort;
    this.webHost = options?.webHost;

    logger.info('Starting Claude Daemon...');

    // 1. 启动 Hook Server
    await this.hookServer.start();
    logger.info('✓ Hook server started');

    // 2. 启动调度器
    this.scheduler.start();
    logger.info('✓ Scheduler started');

    // 3. 加载插件
    await this.loadPlugins();

    // 4. 连接插件命令处理器到 Hook Server
    this.setupPluginCommandHandlers();

    // 4. 启动 Web UI（可选）
    if (this.webEnabled) {
      const port = this.webPort || 3000;
      const host = this.webHost || '127.0.0.1';
      this.webPort = port;
      this.webHost = host;
      this.webServer = new WebServer(port, host);
      await this.webServer.start();
      logger.info('✓ Web UI started');
    }

    // 5. 执行首次健康检查
    const health = await this.healthMonitor.check();
    if (health.healthy) {
      logger.info('✓ Initial health check passed');
    } else {
      logger.warn('⚠ Initial health check failed', {
        issues: health.issues,
      });
    }

    // 6. 设置信号处理
    this.setupSignalHandlers();

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🚀 Claude Daemon started successfully');
    logger.info('   Waiting for hook events...');
    if (this.webServer) {
      logger.info(`   Web UI: http://${this.webHost || '127.0.0.1'}:${this.webPort || 3000}`);
    }
    const plugins = this.pluginManager.listPlugins();
    if (plugins.length > 0) {
      logger.info(`   Plugins loaded: ${plugins.map(p => p.name).join(', ')}`);
    }
    logger.info('   Press Ctrl+C to stop');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 保持进程运行
    process.stdin.resume();
  }

  /**
   * 优雅关闭
   */
  private async shutdown(): Promise<void> {
    if (!this.running) return;

    logger.info('Shutting down gracefully...');

    this.running = false;

    // 1. 卸载所有插件
    try {
      await this.pluginManager.unloadAll();
      logger.info('✓ Plugins unloaded');
    } catch (error) {
      logger.error('Failed to unload plugins', error);
    }

    // 2. 停止 Web 服务器
    if (this.webServer) {
      await this.webServer.stop();
      logger.info('✓ Web server stopped');
    }

    // 3. 停止调度器
    this.scheduler.stop();
    logger.info('✓ Scheduler stopped');

    // 4. 停止 Hook Server
    await this.hookServer.stop();
    logger.info('✓ Hook server stopped');

    // 5. 等待队列清空
    const queueStatus = this.eventQueue.getStatus();
    if (queueStatus.queueSize > 0) {
      logger.info(`Waiting for ${queueStatus.queueSize} queued events to process...`);
      // 简单等待（实际可以更优雅）
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('✓ Shutdown complete');
  }

  /**
   * 设置信号处理
   */
  private setupSignalHandlers(): void {
    const handleSignal = async (signal: string) => {
      logger.info(`Received ${signal}`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGINT', () => handleSignal('SIGINT'));
  }

  /**
   * 设置插件命令处理器
   * 插件命令在加载时已自动注册到 Hook Server
   */
  private setupPluginCommandHandlers(): void {
    const plugins = this.pluginManager.listPlugins();

    if (plugins.length === 0) {
      return;
    }

    // 插件命令已在 PluginContext.registerIPCCommand() 中自动注册到 HookServer
    // 这里只需要记录日志
    logger.info('✓ Plugin command handlers connected');
  }

  /**
   * 注册内置 IPC 命令
   */
  private setupIPCCommands(): void {
    this.hookServer.registerCommand('status', async () => {
      const health = await this.healthMonitor.check();
      const queueStatus = this.eventQueue.getStatus();
      const plugins = this.pluginManager.listPlugins();
      const activeSessions = this.analyzer.getActiveSessionsSummary();
      const uptimeSeconds = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;

      return {
        success: true,
        data: {
          pid: process.pid,
          running: this.running,
          uptimeSeconds,
          web: {
            enabled: this.webEnabled,
            port: this.webPort,
            host: this.webHost,
          },
          queue: queueStatus,
          plugins,
          activeSessions,
          health,
        },
      };
    });

    this.hookServer.registerCommand('active_sessions', async () => {
      return {
        success: true,
        data: this.analyzer.getActiveSessionsSummary(),
      };
    });

    this.hookServer.registerCommand('active_session', async (request) => {
      const sessionId = request?.sessionId;
      if (!sessionId) {
        return { success: false, error: 'Missing sessionId' };
      }
      const session = this.analyzer.getActiveSessionById(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      return { success: true, data: session };
    });
  }

  /**
   * 加载插件
   */
  private async loadPlugins(): Promise<void> {
    try {
      const pluginConfigs = await this.loadPluginConfigs();

      if (pluginConfigs.length === 0) {
        logger.info('No plugins configured');
        return;
      }

      logger.info(`Loading ${pluginConfigs.length} plugin(s)...`);

      for (const pluginConfig of pluginConfigs) {
        try {
          await this.pluginManager.loadPlugin(pluginConfig);
          logger.info(`✓ Plugin loaded: ${pluginConfig.name}`);
        } catch (error) {
          logger.error(`✗ Failed to load plugin: ${pluginConfig.name}`);
          logger.error(`  Error type: ${error?.constructor?.name || typeof error}`);
          logger.error(`  Error message: ${error instanceof Error ? error.message : String(error)}`);
          if (error instanceof Error && error.stack) {
            logger.error(`  Stack trace: ${error.stack}`);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to load plugin configs', error);
    }
  }

  /**
   * 加载插件配置
   */
  private async loadPluginConfigs(): Promise<any[]> {
    const cfg = config.get();
    const configPath = join(cfg.paiDir, 'daemon-config.json');

    if (!existsSync(configPath)) {
      return [];
    }

    try {
      const configContent = readFileSync(configPath, 'utf-8');
      const daemonConfig = JSON.parse(configContent);
      return daemonConfig.plugins || [];
    } catch (error) {
      logger.error('Failed to parse daemon config', error);
      return [];
    }
  }

  /**
   * 获取守护进程状态
   */
  getStatus() {
    return {
      running: this.running,
      queue: this.eventQueue.getStatus(),
      activeSessions: this.analyzer.getActiveSessionsStatus(),
      scheduler: this.scheduler.getStatus(),
      plugins: this.pluginManager.listPlugins(),
    };
  }
}

// 启动守护进程
if (import.meta.main) {
  // 解析命令行参数
  const args = process.argv.slice(2);
  let enableWebUI = false;
  let webPort = 3001;  // 默认使用 3001 避免端口冲突
  let webHost = '127.0.0.1';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--web' || arg === '-w') {
      enableWebUI = true;
    } else if (arg === '--port' || arg === '-p') {
      const portValue = args[i + 1];
      if (portValue && !isNaN(parseInt(portValue))) {
        webPort = parseInt(portValue);
        i++; // 跳过下一个参数
      }
    } else if (arg === '--host' || arg === '-H') {
      const hostValue = args[i + 1];
      if (hostValue) {
        webHost = hostValue;
        i++; // 跳过下一个参数
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Claude Daemon - Background service for Claude Code session recording

Usage:
  bun daemon/main.ts [options]

Options:
  --web, -w           Enable Web UI
  --port, -p <port>   Web UI port (default: 3001)
  --host, -H <host>   Web UI host (default: 127.0.0.1)
  --help, -h          Show this help message

Examples:
  bun daemon/main.ts --web
  bun daemon/main.ts --web --port 8080
  bun daemon/main.ts --web --host 0.0.0.0
      `);
      process.exit(0);
    }
  }

  const daemon = new ClaudeDaemon();

  daemon.start({ enableWebUI, webPort, webHost }).catch((error) => {
    console.error('[ClaudeDaemon] Fatal error:', error);
    process.exit(1);
  });
}

export { ClaudeDaemon };
