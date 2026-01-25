/**
 * health-monitor.ts
 * 健康监控服务 - 检查系统健康状态
 */

import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from '../lib/config.ts';
import { createHookLogger } from '../lib/logger.ts';

const logger = createHookLogger('HealthMonitor');

export interface HealthStatus {
  healthy: boolean;
  timestamp: string;
  checks: {
    directories: CheckResult;
    storage: CheckResult;
    hooks: CheckResult;
    indexes: CheckResult;
  };
  issues: string[];
}

export interface CheckResult {
  passed: boolean;
  message: string;
  details?: any;
}

export class HealthMonitor {
  private cfg = config.get();

  /**
   * 执行完整的健康检查
   */
  async check(): Promise<HealthStatus> {
    logger.info('Running health check...');

    const issues: string[] = [];

    // 检查目录结构
    const dirCheck = await this.checkDirectories();
    if (!dirCheck.passed) {
      issues.push(dirCheck.message);
    }

    // 检查存储使用
    const storageCheck = await this.checkStorage();
    if (!storageCheck.passed) {
      issues.push(storageCheck.message);
    }

    // 检查 Hooks
    const hooksCheck = await this.checkHooks();
    if (!hooksCheck.passed) {
      issues.push(hooksCheck.message);
    }

    // 检查索引完整性
    const indexesCheck = await this.checkIndexes();
    if (!indexesCheck.passed) {
      issues.push(indexesCheck.message);
    }

    const healthy = issues.length === 0;

    const status: HealthStatus = {
      healthy,
      timestamp: new Date().toISOString(),
      checks: {
        directories: dirCheck,
        storage: storageCheck,
        hooks: hooksCheck,
        indexes: indexesCheck,
      },
      issues,
    };

    if (healthy) {
      logger.info('Health check passed ✓');
    } else {
      logger.warn('Health check failed', { issueCount: issues.length });
      issues.forEach(issue => logger.warn(`  - ${issue}`));
    }

    return status;
  }

  /**
   * 检查目录结构
   */
  private async checkDirectories(): Promise<CheckResult> {
    const requiredDirs = [
      this.cfg.sessionsDir,
      this.cfg.rawDir,
      this.cfg.analysisDir,
      this.cfg.summariesDir,
      this.cfg.indexDir,
    ];

    const missingDirs: string[] = [];

    for (const dir of requiredDirs) {
      if (!existsSync(dir)) {
        missingDirs.push(dir);
      }
    }

    if (missingDirs.length > 0) {
      return {
        passed: false,
        message: `Missing directories: ${missingDirs.length}`,
        details: { missingDirs },
      };
    }

    return {
      passed: true,
      message: 'All directories exist',
    };
  }

  /**
   * 检查存储使用情况
   */
  private async checkStorage(): Promise<CheckResult> {
    try {
      const usage = this.getDirectorySize(this.cfg.sessionsDir);
      const usageMB = Math.round(usage / (1024 * 1024));
      const usageGB = (usage / (1024 * 1024 * 1024)).toFixed(2);

      // 警告阈值：1GB
      const warningThreshold = 1024 * 1024 * 1024;

      if (usage > warningThreshold) {
        return {
          passed: false,
          message: `Storage usage high: ${usageGB}GB`,
          details: { usageMB, usageGB },
        };
      }

      return {
        passed: true,
        message: `Storage usage: ${usageMB}MB`,
        details: { usageMB, usageGB },
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Failed to check storage',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  /**
   * 检查 Hooks 是否正确配置
   */
  private async checkHooks(): Promise<CheckResult> {
    const hooksDir = join(this.cfg.paiDir, 'hooks');
    const requiredHooks = [
      'SessionRecorder.hook.ts',
      'SessionToolCapture-v2.hook.ts',
      'SessionAnalyzer.hook.ts',
    ];

    const missingHooks: string[] = [];

    for (const hook of requiredHooks) {
      const hookPath = join(hooksDir, hook);
      if (!existsSync(hookPath)) {
        missingHooks.push(hook);
      }
    }

    if (missingHooks.length > 0) {
      return {
        passed: false,
        message: `Missing hooks: ${missingHooks.length}`,
        details: { missingHooks },
      };
    }

    return {
      passed: true,
      message: 'All hooks present',
    };
  }

  /**
   * 检查索引完整性
   */
  private async checkIndexes(): Promise<CheckResult> {
    const metadataFile = config.getMetadataPath();

    if (!existsSync(metadataFile)) {
      return {
        passed: false,
        message: 'Global metadata index missing',
      };
    }

    try {
      // 验证索引文件可以被解析
      const content = Bun.file(metadataFile).text();
      await content;

      return {
        passed: true,
        message: 'Indexes intact',
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Index file corrupted',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  /**
   * 计算目录大小
   */
  private getDirectorySize(dirPath: string): number {
    let size = 0;

    try {
      const traverse = (path: string) => {
        const stats = statSync(path);

        if (stats.isFile()) {
          size += stats.size;
        } else if (stats.isDirectory()) {
          const files = readdirSync(path);
          for (const file of files) {
            traverse(join(path, file));
          }
        }
      };

      traverse(dirPath);
    } catch (error) {
      logger.error('Error calculating directory size', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return size;
  }
}
