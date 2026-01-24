#!/usr/bin/env bun
/**
 * SessionQuery.ts
 * 会话查询工具
 *
 * 提供灵活的会话查询接口，支持按类型、目录、时间范围查询
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============================================================================
// 类型定义
// ============================================================================

type SessionType =
  | 'coding'
  | 'debugging'
  | 'research'
  | 'writing'
  | 'git'
  | 'refactoring'
  | 'mixed';

interface SessionSummary {
  session_id: string;
  timestamp: string;
  working_directory: string;
  git_repo: string | null;
  git_branch: string | null;
  hostname: string;
  user: string;
  platform: string;
  session_type: SessionType;
  duration_seconds: number;
  total_tools: number;
  success_rate: number;
  files_modified: string[];
  tool_usage: Record<string, number>;
  summary_text: string;
  conversation?: {
    user_messages: string[];
    assistant_responses: string[];
    message_count: number;
  };
}

interface QueryOptions {
  // 按类型过滤
  type?: SessionType;

  // 按目录过滤
  directory?: string;

  // 按时间范围过滤
  start_date?: string;  // ISO 8601
  end_date?: string;

  // 限制结果数量
  limit?: number;

  // 排序
  sort_by?: 'timestamp' | 'duration' | 'tools';
  sort_order?: 'asc' | 'desc';
}

// ============================================================================
// SessionQuery 类
// ============================================================================

export class SessionQuery {
  private paiDir: string;

  constructor(paiDir?: string) {
    this.paiDir = paiDir || process.env.PAI_DIR || join(homedir(), '.claude');
  }

  /**
   * 按类型查询会话
   */
  queryByType(type: SessionType, options?: QueryOptions): SessionSummary[] {
    const typeDir = join(this.paiDir, 'SESSIONS/analysis/by-type', type);
    const indexFile = join(typeDir, 'sessions.json');

    if (!existsSync(indexFile)) {
      return [];
    }

    const sessions = JSON.parse(readFileSync(indexFile, 'utf-8'));
    return this.applyFilters(sessions, options);
  }

  /**
   * 按目录查询会话
   */
  queryByDirectory(directory: string, options?: QueryOptions): SessionSummary[] {
    const dirHash = this.encodePath(directory);
    const dirIndexDir = join(this.paiDir, 'SESSIONS/analysis/by-directory', dirHash);
    const indexFile = join(dirIndexDir, 'sessions.json');

    if (!existsSync(indexFile)) {
      return [];
    }

    const sessions = JSON.parse(readFileSync(indexFile, 'utf-8'));
    return this.applyFilters(sessions, options);
  }

  /**
   * 按主机名查询会话
   */
  queryByHostname(hostname: string, options?: QueryOptions): SessionSummary[] {
    const allSessions = this.getRecentSessions(1000); // 获取所有会话
    const filtered = allSessions.filter(s => s.hostname === hostname);
    return this.applyFilters(filtered, options);
  }

  /**
   * 按时间范围查询会话
   */
  queryByTimeRange(startDate: string, endDate: string, options?: QueryOptions): SessionSummary[] {
    const allSessions: SessionSummary[] = [];

    // 遍历所有月份目录
    const summariesDir = join(this.paiDir, 'SESSIONS/analysis/summaries');

    if (!existsSync(summariesDir)) {
      return [];
    }

    const months = readdirSync(summariesDir);

    for (const month of months) {
      const monthDir = join(summariesDir, month);

      if (!existsSync(monthDir)) continue;

      const files = readdirSync(monthDir);

      for (const file of files) {
        if (file.startsWith('summary-') && file.endsWith('.json')) {
          const summaryPath = join(monthDir, file);
          const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));

          // 时间范围过滤
          if (summary.timestamp >= startDate && summary.timestamp <= endDate) {
            allSessions.push(summary);
          }
        }
      }
    }

    return this.applyFilters(allSessions, options);
  }

  /**
   * 获取最近的会话
   */
  getRecentSessions(limit: number = 10): SessionSummary[] {
    const now = new Date().toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    return this.queryByTimeRange(monthAgo, now, {
      limit,
      sort_by: 'timestamp',
      sort_order: 'desc',
    });
  }

  /**
   * 应用过滤和排序
   */
  private applyFilters(
    sessions: SessionSummary[],
    options?: QueryOptions
  ): SessionSummary[] {
    let filtered = [...sessions];

    // 时间范围过滤
    if (options?.start_date) {
      filtered = filtered.filter(s => s.timestamp >= options.start_date!);
    }
    if (options?.end_date) {
      filtered = filtered.filter(s => s.timestamp <= options.end_date!);
    }

    // 排序
    if (options?.sort_by) {
      filtered.sort((a, b) => {
        const aVal = a[options.sort_by!] as any;
        const bVal = b[options.sort_by!] as any;
        const order = options.sort_order === 'asc' ? 1 : -1;
        return (aVal > bVal ? 1 : -1) * order;
      });
    }

    // 限制数量
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * 编码路径为 Base64
   */
  private encodePath(path: string): string {
    return Buffer.from(path)
      .toString('base64')
      .replace(/\//g, '_')
      .replace(/\+/g, '-')
      .replace(/=/g, '');
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const sessionQuery = new SessionQuery();

// ============================================================================
// CLI 入口（如果直接运行）
// ============================================================================

if (import.meta.main) {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'type':
      const sessions = sessionQuery.queryByType(arg as SessionType, { limit: 20 });
      console.log(JSON.stringify(sessions, null, 2));
      break;

    case 'dir':
      const dirSessions = sessionQuery.queryByDirectory(arg);
      console.log(JSON.stringify(dirSessions, null, 2));
      break;

    case 'host':
    case 'hostname':
      const hostSessions = sessionQuery.queryByHostname(arg, { limit: 20 });
      console.log(JSON.stringify(hostSessions, null, 2));
      break;

    case 'recent':
      const limit = arg ? parseInt(arg, 10) : 10;
      const recentSessions = sessionQuery.getRecentSessions(limit);
      console.log(JSON.stringify(recentSessions, null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  bun SessionQuery.ts type <type>');
      console.log('  bun SessionQuery.ts dir <directory>');
      console.log('  bun SessionQuery.ts host <hostname>');
      console.log('  bun SessionQuery.ts recent [limit]');
  }
}
