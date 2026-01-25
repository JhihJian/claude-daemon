/**
 * cleanup-service.ts
 * 清理服务 - 定期清理和维护数据
 */

import { existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';
import { config } from '../lib/config.ts';
import { createHookLogger } from '../lib/logger.ts';

const logger = createHookLogger('CleanupService');

export interface CleanupOptions {
  maxAgeDays?: number;      // 最大保留天数
  maxSizeGB?: number;       // 最大存储大小（GB）
  dryRun?: boolean;         // 试运行模式
}

export interface CleanupResult {
  filesDeleted: number;
  bytesFreed: number;
  errors: string[];
  duration: number;
}

export class CleanupService {
  private cfg = config.get();

  /**
   * 执行清理
   */
  async cleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    const startTime = Date.now();
    const {
      maxAgeDays = 90,
      maxSizeGB = 5,
      dryRun = false,
    } = options;

    logger.info('Starting cleanup', {
      maxAgeDays,
      maxSizeGB,
      dryRun,
    });

    const result: CleanupResult = {
      filesDeleted: 0,
      bytesFreed: 0,
      errors: [],
      duration: 0,
    };

    try {
      // 1. 清理过期的原始事件文件
      await this.cleanupOldRawFiles(maxAgeDays, dryRun, result);

      // 2. 清理过期的摘要文件
      await this.cleanupOldSummaries(maxAgeDays, dryRun, result);

      // 3. 如果存储超过限制，清理最旧的数据
      const currentSize = this.getDirectorySize(this.cfg.sessionsDir);
      const maxSizeBytes = maxSizeGB * 1024 * 1024 * 1024;

      if (currentSize > maxSizeBytes) {
        logger.warn('Storage limit exceeded', {
          currentGB: (currentSize / (1024 * 1024 * 1024)).toFixed(2),
          maxGB: maxSizeGB,
        });

        await this.cleanupBySize(maxSizeBytes, currentSize, dryRun, result);
      }

      // 4. 清理空目录
      await this.cleanupEmptyDirectories(dryRun, result);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Cleanup failed', { error: errorMsg });
      result.errors.push(errorMsg);
    }

    result.duration = Date.now() - startTime;

    logger.info('Cleanup completed', {
      filesDeleted: result.filesDeleted,
      bytesFreed: Math.round(result.bytesFreed / (1024 * 1024)),
      duration: result.duration,
      dryRun,
    });

    return result;
  }

  /**
   * 清理过期的原始事件文件
   */
  private async cleanupOldRawFiles(
    maxAgeDays: number,
    dryRun: boolean,
    result: CleanupResult
  ): Promise<void> {
    const rawDir = this.cfg.rawDir;
    if (!existsSync(rawDir)) return;

    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const months = readdirSync(rawDir);

    for (const month of months) {
      const monthDir = join(rawDir, month);
      const files = readdirSync(monthDir);

      for (const file of files) {
        if (!file.startsWith('session-') || !file.endsWith('.jsonl')) continue;

        const filePath = join(monthDir, file);
        const stats = statSync(filePath);

        if (stats.mtimeMs < cutoffTime) {
          logger.debug('Deleting old raw file', { file: filePath });

          if (!dryRun) {
            unlinkSync(filePath);
          }

          result.filesDeleted++;
          result.bytesFreed += stats.size;
        }
      }
    }
  }

  /**
   * 清理过期的摘要文件
   */
  private async cleanupOldSummaries(
    maxAgeDays: number,
    dryRun: boolean,
    result: CleanupResult
  ): Promise<void> {
    const summariesDir = this.cfg.summariesDir;
    if (!existsSync(summariesDir)) return;

    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const months = readdirSync(summariesDir);

    for (const month of months) {
      const monthDir = join(summariesDir, month);
      const files = readdirSync(monthDir);

      for (const file of files) {
        if (!file.startsWith('summary-') || !file.endsWith('.json')) continue;

        const filePath = join(monthDir, file);
        const stats = statSync(filePath);

        if (stats.mtimeMs < cutoffTime) {
          logger.debug('Deleting old summary', { file: filePath });

          if (!dryRun) {
            unlinkSync(filePath);
          }

          result.filesDeleted++;
          result.bytesFreed += stats.size;
        }
      }
    }
  }

  /**
   * 按大小清理（删除最旧的文件直到满足大小限制）
   */
  private async cleanupBySize(
    maxSizeBytes: number,
    currentSize: number,
    dryRun: boolean,
    result: CleanupResult
  ): Promise<void> {
    const targetSize = maxSizeBytes * 0.8; // 清理到 80%
    const bytesToFree = currentSize - targetSize;

    logger.info('Cleaning up by size', {
      bytesToFree: Math.round(bytesToFree / (1024 * 1024)),
    });

    // 收集所有文件及其修改时间
    const files = this.collectAllFiles(this.cfg.rawDir);

    // 按修改时间排序（最旧的在前）
    files.sort((a, b) => a.mtime - b.mtime);

    let bytesFreed = 0;

    for (const file of files) {
      if (bytesFreed >= bytesToFree) break;

      logger.debug('Deleting file to free space', { file: file.path });

      if (!dryRun) {
        unlinkSync(file.path);
      }

      result.filesDeleted++;
      result.bytesFreed += file.size;
      bytesFreed += file.size;
    }
  }

  /**
   * 清理空目录
   */
  private async cleanupEmptyDirectories(dryRun: boolean, result: CleanupResult): Promise<void> {
    const checkAndRemove = (dirPath: string): boolean => {
      if (!existsSync(dirPath)) return true;

      const files = readdirSync(dirPath);

      // 递归检查子目录
      for (const file of files) {
        const filePath = join(dirPath, file);
        const stats = statSync(filePath);

        if (stats.isDirectory()) {
          const isEmpty = checkAndRemove(filePath);
          if (isEmpty && !dryRun) {
            try {
              rmdirSync(filePath);
              logger.debug('Removed empty directory', { dir: filePath });
            } catch (error) {
              // 忽略错误
            }
          }
        }
      }

      // 检查当前目录是否为空
      const currentFiles = readdirSync(dirPath);
      return currentFiles.length === 0;
    };

    checkAndRemove(this.cfg.rawDir);
    checkAndRemove(this.cfg.summariesDir);
  }

  /**
   * 收集所有文件
   */
  private collectAllFiles(dirPath: string): FileInfo[] {
    const files: FileInfo[] = [];

    const traverse = (path: string) => {
      if (!existsSync(path)) return;

      const items = readdirSync(path);

      for (const item of items) {
        const itemPath = join(path, item);
        const stats = statSync(itemPath);

        if (stats.isFile()) {
          files.push({
            path: itemPath,
            size: stats.size,
            mtime: stats.mtimeMs,
          });
        } else if (stats.isDirectory()) {
          traverse(itemPath);
        }
      }
    };

    traverse(dirPath);
    return files;
  }

  /**
   * 计算目录大小
   */
  private getDirectorySize(dirPath: string): number {
    let size = 0;

    const traverse = (path: string) => {
      if (!existsSync(path)) return;

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
    return size;
  }
}

interface FileInfo {
  path: string;
  size: number;
  mtime: number;
}
