#!/usr/bin/env bun
/**
 * 守护进程主入口（集成 Hook Server）
 *
 * 演示如何接收 Hook 推送的数据并统一处理
 */

import { HookServer, HookEvent } from './hook-server.ts';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../lib/config.ts';
import { createHookLogger } from '../lib/logger.ts';

const logger = createHookLogger('ClaudeDaemon');

class ClaudeDaemon {
  private hookServer: HookServer;
  private running = false;

  constructor() {
    this.hookServer = new HookServer();
    this.setupEventHandlers();
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 处理会话启动事件
    this.hookServer.on('session_start', async (event: HookEvent) => {
      logger.info('Session started', {
        sessionId: event.session_id,
        workingDir: event.data.working_directory,
        user: event.data.user,
        hostname: event.data.hostname,
      });

      // 保存到文件
      await this.saveEvent(event);

      // 可以做更多事情...
      // - 发送桌面通知
      // - 记录到数据库
      // - 实时统计
    });

    // 处理工具使用事件
    this.hookServer.on('tool_use', async (event: HookEvent) => {
      logger.info('Tool used', {
        sessionId: event.session_id,
        toolName: event.data.tool_name,
        success: event.data.success,
      });

      await this.saveEvent(event);

      // 实时监控
      if (event.data.success === false) {
        logger.warn('Tool execution failed', {
          toolName: event.data.tool_name,
          sessionId: event.session_id,
        });

        // 可以发送告警
        // await this.sendAlert('Tool execution failed');
      }
    });

    // 处理会话结束事件
    this.hookServer.on('session_end', async (event: HookEvent) => {
      logger.info('Session ended', {
        sessionId: event.session_id,
      });

      await this.saveEvent(event);

      // 触发会话分析
      await this.analyzeSession(event.session_id);
    });
  }

  /**
   * 保存事件到存储
   */
  private async saveEvent(event: HookEvent): Promise<void> {
    try {
      const cfg = config.get();
      const yearMonth = config.getYearMonth();
      const rawDir = join(cfg.rawDir, yearMonth);

      // 确保目录存在
      mkdirSync(rawDir, { recursive: true });

      // 写入 JSONL 文件
      const sessionFile = config.getSessionFilePath(event.session_id, yearMonth);
      appendFileSync(sessionFile, JSON.stringify(event) + '\n', { mode: 0o600 });

      logger.debug('Event saved', {
        sessionId: event.session_id,
        eventType: event.event_type,
      });
    } catch (error) {
      logger.error('Failed to save event', {
        error: error instanceof Error ? error.message : String(error),
        event,
      });
    }
  }

  /**
   * 分析会话（示例）
   */
  private async analyzeSession(sessionId: string): Promise<void> {
    logger.info('Analyzing session', { sessionId });

    // 这里可以调用现有的 SessionAnalyzer 逻辑
    // 或者实现新的实时分析
  }

  /**
   * 启动守护进程
   */
  async start(): Promise<void> {
    this.running = true;

    logger.info('Starting Claude Daemon...');

    // 1. 启动 Hook Server
    await this.hookServer.start();
    logger.info('Hook server started');

    // 2. 启动其他服务...
    // - 定时任务
    // - 健康检查
    // - 资源监控

    // 3. 设置信号处理
    this.setupSignalHandlers();

    logger.info('Claude Daemon started successfully');
    logger.info('Waiting for hook events...');

    // 保持进程运行
    process.stdin.resume();
  }

  /**
   * 优雅关闭
   */
  private async shutdown(): Promise<void> {
    logger.info('Shutting down...');

    this.running = false;

    // 停止 Hook Server
    await this.hookServer.stop();

    logger.info('Shutdown complete');
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
}

// 启动守护进程
if (import.meta.main) {
  const daemon = new ClaudeDaemon();

  daemon.start().catch((error) => {
    console.error('[ClaudeDaemon] Fatal error:', error);
    process.exit(1);
  });
}
