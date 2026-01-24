#!/usr/bin/env bun
/**
 * Claude Daemon - 守护进程原型
 * 展示守护线程应该具备的核心功能
 */

import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

class ClaudeDaemon {
  private running = false;
  private healthCheckInterval?: NodeJS.Timer;
  private maintenanceInterval?: NodeJS.Timer;
  private paiDir: string;

  constructor() {
    this.paiDir = process.env.PAI_DIR || join(homedir(), '.claude');
  }

  async start() {
    this.running = true;
    console.log('[ClaudeDaemon] Starting...');

    // 设置信号处理
    this.setupSignalHandlers();

    // 启动健康检查（每 5 分钟）
    this.healthCheckInterval = setInterval(
      () => this.healthCheck(),
      5 * 60 * 1000
    );

    // 启动维护任务（每天凌晨 3 点）
    this.scheduleMaintenanceTasks();

    console.log('[ClaudeDaemon] Started successfully');
    console.log('[ClaudeDaemon] Press Ctrl+C to stop');

    // 首次健康检查
    await this.healthCheck();

    // 保持进程运行
    process.stdin.resume();
  }

  private setupSignalHandlers() {
    const shutdown = async (signal: string) => {
      console.log(`\n[ClaudeDaemon] Received ${signal}, shutting down gracefully...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  private async healthCheck() {
    console.log('[HealthCheck] Running...');

    const issues: string[] = [];

    // 检查会话目录
    const sessionsDir = join(this.paiDir, 'SESSIONS');
    if (!existsSync(sessionsDir)) {
      issues.push('Sessions directory missing');
    } else {
      // 检查磁盘空间
      const usage = this.getDirectorySize(sessionsDir);
      const usageMB = Math.round(usage / (1024 * 1024));
      console.log(`[HealthCheck] Storage usage: ${usageMB}MB`);

      if (usage > 1024 * 1024 * 1024) { // > 1GB
        issues.push(`Large storage usage: ${usageMB}MB - consider cleanup`);
      }
    }

    // 检查 Hooks 是否存在
    const hooks = [
      'SessionRecorder.hook.ts',
      'SessionToolCapture-v2.hook.ts',
      'SessionAnalyzer.hook.ts'
    ];

    for (const hook of hooks) {
      const hookPath = join(this.paiDir, 'hooks', hook);
      if (!existsSync(hookPath)) {
        issues.push(`Hook missing: ${hook}`);
      }
    }

    // 检查索引完整性
    const indexFile = join(this.paiDir, 'SESSIONS/index/metadata.json');
    if (!existsSync(indexFile)) {
      issues.push('Global metadata index missing');
    }

    if (issues.length > 0) {
      console.warn('[HealthCheck] Issues detected:');
      issues.forEach(issue => console.warn(`  - ${issue}`));
    } else {
      console.log('[HealthCheck] All systems healthy ✓');
    }
  }

  private scheduleMaintenanceTasks() {
    // 计算距离下一个凌晨 3 点的时间
    const now = new Date();
    const next3AM = new Date(now);
    next3AM.setHours(3, 0, 0, 0);

    if (next3AM <= now) {
      next3AM.setDate(next3AM.getDate() + 1);
    }

    const timeUntil3AM = next3AM.getTime() - now.getTime();

    console.log(`[Maintenance] Next scheduled: ${next3AM.toISOString()}`);

    setTimeout(() => {
      this.runMaintenance();

      // 之后每 24 小时执行一次
      this.maintenanceInterval = setInterval(
        () => this.runMaintenance(),
        24 * 60 * 60 * 1000
      );
    }, timeUntil3AM);
  }

  private async runMaintenance() {
    console.log('[Maintenance] Running scheduled maintenance...');

    // 1. 清理临时文件
    console.log('[Maintenance] Cleaning temporary files...');

    // 2. 压缩旧日志
    console.log('[Maintenance] Compressing old logs...');

    // 3. 重建索引
    console.log('[Maintenance] Rebuilding indexes...');

    console.log('[Maintenance] Completed ✓');
  }

  private getDirectorySize(dirPath: string): number {
    let size = 0;

    try {
      const traverse = (path: string) => {
        const stats = statSync(path);

        if (stats.isFile()) {
          size += stats.size;
        } else if (stats.isDirectory()) {
          const { readdirSync } = require('fs');
          const files = readdirSync(path);

          for (const file of files) {
            traverse(join(path, file));
          }
        }
      };

      traverse(dirPath);
    } catch (error) {
      console.error('[Error] Failed to calculate directory size:', error);
    }

    return size;
  }

  private async shutdown() {
    this.running = false;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
    }

    console.log('[ClaudeDaemon] Shutdown complete');
  }
}

// 启动守护进程
if (import.meta.main) {
  const daemon = new ClaudeDaemon();
  daemon.start().catch(error => {
    console.error('[ClaudeDaemon] Fatal error:', error);
    process.exit(1);
  });
}
