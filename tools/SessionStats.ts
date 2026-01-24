#!/usr/bin/env bun
/**
 * SessionStats.ts
 * 会话统计分析工具
 *
 * 提供统计分析和可视化数据
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============================================================================
// 类型定义
// ============================================================================

type SessionType = 'coding' | 'debugging' | 'research' | 'writing' | 'git' | 'refactoring' | 'mixed';

interface Stats {
  total_sessions: number;
  total_duration_hours: number;
  avg_session_duration_minutes: number;
  by_type: Record<string, number>;
  by_directory: Record<string, number>;
}

// ============================================================================
// SessionStats 类
// ============================================================================

export class SessionStats {
  private paiDir: string;

  constructor(paiDir?: string) {
    this.paiDir = paiDir || process.env.PAI_DIR || join(homedir(), '.claude');
  }

  /**
   * 获取全局统计
   */
  getGlobalStats(): Stats {
    const metadataFile = join(this.paiDir, 'SESSIONS/index/metadata.json');

    if (!existsSync(metadataFile)) {
      return this.emptyStats();
    }

    const metadata = JSON.parse(readFileSync(metadataFile, 'utf-8'));

    return {
      total_sessions: metadata.total_sessions || 0,
      total_duration_hours: 0, // 需要遍历所有会话计算
      avg_session_duration_minutes: 0,
      by_type: metadata.sessions_by_type || {},
      by_directory: metadata.sessions_by_directory || {},
    };
  }

  /**
   * 获取类型分布
   */
  getTypeDistribution(): Record<SessionType, number> {
    const metadataFile = join(this.paiDir, 'SESSIONS/index/metadata.json');

    if (!existsSync(metadataFile)) {
      return {} as Record<SessionType, number>;
    }

    const metadata = JSON.parse(readFileSync(metadataFile, 'utf-8'));
    return metadata.sessions_by_type || {};
  }

  /**
   * 获取最活跃的目录
   */
  getTopDirectories(limit: number = 10): Array<{ directory: string; count: number }> {
    const metadataFile = join(this.paiDir, 'SESSIONS/index/metadata.json');

    if (!existsSync(metadataFile)) {
      return [];
    }

    const metadata = JSON.parse(readFileSync(metadataFile, 'utf-8'));
    const byDir = metadata.sessions_by_directory || {};

    return Object.entries(byDir)
      .map(([directory, count]) => ({ directory, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private emptyStats(): Stats {
    return {
      total_sessions: 0,
      total_duration_hours: 0,
      avg_session_duration_minutes: 0,
      by_type: {},
      by_directory: {},
    };
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const sessionStats = new SessionStats();

// ============================================================================
// CLI 入口
// ============================================================================

if (import.meta.main) {
  const command = process.argv[2];

  switch (command) {
    case 'global':
      const stats = sessionStats.getGlobalStats();
      console.log(JSON.stringify(stats, null, 2));
      break;

    case 'types':
      const types = sessionStats.getTypeDistribution();
      console.log(JSON.stringify(types, null, 2));
      break;

    case 'dirs':
      const limit = process.argv[3] ? parseInt(process.argv[3], 10) : 10;
      const dirs = sessionStats.getTopDirectories(limit);
      console.log(JSON.stringify(dirs, null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  bun SessionStats.ts global');
      console.log('  bun SessionStats.ts types');
      console.log('  bun SessionStats.ts dirs [limit]');
  }
}
