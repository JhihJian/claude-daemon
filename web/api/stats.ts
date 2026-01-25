/**
 * Stats API
 * 统计分析 API 封装
 */

import { SessionStats } from '../../tools/SessionStats';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

type SessionType = 'coding' | 'debugging' | 'research' | 'writing' | 'git' | 'refactoring' | 'mixed';

interface Stats {
  total_sessions: number;
  total_duration_hours: number;
  avg_session_duration_minutes: number;
  by_type: Record<string, number>;
  by_directory: Record<string, number>;
}

interface TimelineData {
  date: string;
  count: number;
  by_type: Record<string, number>;
}

export class StatsAPI {
  private stats: SessionStats;
  private paiDir: string;

  constructor(paiDir?: string) {
    this.paiDir = paiDir || process.env.PAI_DIR || join(homedir(), '.claude');
    this.stats = new SessionStats(this.paiDir);
  }

  /**
   * 获取全局统计
   */
  getGlobalStats(): Stats {
    return this.stats.getGlobalStats();
  }

  /**
   * 获取类型分布
   */
  getTypeDistribution(): Record<SessionType, number> {
    return this.stats.getTypeDistribution();
  }

  /**
   * 获取最活跃目录
   */
  getTopDirectories(limit: number = 10): Array<{ directory: string; count: number }> {
    return this.stats.getTopDirectories(limit);
  }

  /**
   * 获取时间线数据（最近 N 天的会话统计）
   */
  getTimeline(days: number = 30): TimelineData[] {
    const summariesDir = join(this.paiDir, 'SESSIONS/analysis/summaries');

    if (!existsSync(summariesDir)) {
      return [];
    }

    // 获取最近 N 天的日期范围
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);

    // 初始化每天的计数器
    const timeline: Map<string, TimelineData> = new Map();

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      timeline.set(dateStr, {
        date: dateStr,
        count: 0,
        by_type: {},
      });
    }

    // 遍历所有月份目录
    const monthDirs = readdirSync(summariesDir);

    for (const monthDir of monthDirs) {
      const monthPath = join(summariesDir, monthDir);
      const summaryFiles = readdirSync(monthPath);

      for (const file of summaryFiles) {
        if (!file.endsWith('.json')) continue;

        const filePath = join(monthPath, file);
        const summary = JSON.parse(readFileSync(filePath, 'utf-8'));

        const sessionDate = new Date(summary.timestamp);
        const dateStr = sessionDate.toISOString().split('T')[0];

        // 只统计指定范围内的数据
        if (timeline.has(dateStr)) {
          const data = timeline.get(dateStr)!;
          data.count++;

          const type = summary.session_type || 'mixed';
          data.by_type[type] = (data.by_type[type] || 0) + 1;
        }
      }
    }

    return Array.from(timeline.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 获取工具使用统计
   */
  getToolUsageStats(): Record<string, number> {
    const summariesDir = join(this.paiDir, 'SESSIONS/analysis/summaries');

    if (!existsSync(summariesDir)) {
      return {};
    }

    const toolUsage: Record<string, number> = {};
    const monthDirs = readdirSync(summariesDir);

    for (const monthDir of monthDirs) {
      const monthPath = join(summariesDir, monthDir);
      const summaryFiles = readdirSync(monthPath);

      for (const file of summaryFiles) {
        if (!file.endsWith('.json')) continue;

        const filePath = join(monthPath, file);
        const summary = JSON.parse(readFileSync(filePath, 'utf-8'));

        if (summary.tool_usage) {
          for (const [tool, count] of Object.entries(summary.tool_usage)) {
            toolUsage[tool] = (toolUsage[tool] || 0) + (count as number);
          }
        }
      }
    }

    return toolUsage;
  }

  /**
   * 获取主机统计
   */
  getHostStats(): Array<{ hostname: string; count: number }> {
    const summariesDir = join(this.paiDir, 'SESSIONS/analysis/summaries');

    if (!existsSync(summariesDir)) {
      return [];
    }

    const hostCounts: Record<string, number> = {};
    const monthDirs = readdirSync(summariesDir);

    for (const monthDir of monthDirs) {
      const monthPath = join(summariesDir, monthDir);
      const summaryFiles = readdirSync(monthPath);

      for (const file of summaryFiles) {
        if (!file.endsWith('.json')) continue;

        const filePath = join(monthPath, file);
        const summary = JSON.parse(readFileSync(filePath, 'utf-8'));

        if (summary.hostname) {
          hostCounts[summary.hostname] = (hostCounts[summary.hostname] || 0) + 1;
        }
      }
    }

    return Object.entries(hostCounts)
      .map(([hostname, count]) => ({ hostname, count }))
      .sort((a, b) => b.count - a.count);
  }
}
