#!/usr/bin/env bun
/**
 * OpenAI Proxy Plugin
 * 为 Claude Code 提供 OpenAI API 兼容的代理服务
 */

import type { Plugin, PluginContext, PluginHealth } from '../../daemon/plugin-interface.ts';
import { ProcessManager } from './process-manager.ts';
import { HTTPServer } from './http-server.ts';

export default class OpenAIProxyPlugin implements Plugin {
  name = 'openai-proxy';
  version = '1.0.0';
  description = 'OpenAI API compatible proxy for Claude Code';
  author = 'Claude Daemon Team';

  private context?: PluginContext;
  private processManager?: ProcessManager;
  private httpServer?: HTTPServer;

  async onLoad(context: PluginContext): Promise<void> {
    this.context = context;
    const config = context.config.config || {};

    context.logger.info('Loading OpenAI Proxy Plugin...', {
      port: config.port || 3002,
      host: config.host || '127.0.0.1',
    });

    // 初始化进程管理器
    this.processManager = new ProcessManager(context.logger, {
      maxProcesses: config.maxProcesses || 10,
      processTimeout: config.processTimeout || 300000,
    });

    // 初始化 HTTP 服务器
    this.httpServer = new HTTPServer(
      config.port || 3002,
      config.host || '127.0.0.1',
      this.processManager,
      context.logger
    );

    // 启动 HTTP 服务器
    await this.httpServer.start();

    context.logger.info('OpenAI Proxy Plugin loaded successfully', {
      port: config.port || 3002,
    });
  }

  async onUnload(): Promise<void> {
    this.context?.logger.info('Unloading OpenAI Proxy Plugin...');

    // 停止 HTTP 服务器
    if (this.httpServer) {
      await this.httpServer.stop();
    }

    // 清理所有进程
    if (this.processManager) {
      await this.processManager.cleanup();
    }

    this.context?.logger.info('OpenAI Proxy Plugin unloaded');
  }

  async healthCheck(): Promise<PluginHealth> {
    const healthy = this.httpServer?.isRunning() && this.processManager !== undefined;

    return {
      healthy,
      message: healthy ? 'Plugin is running' : 'Plugin is not running',
      details: {
        httpServer: this.httpServer?.isRunning() || false,
        activeProcesses: this.processManager?.getActiveCount() || 0,
      },
    };
  }
}
