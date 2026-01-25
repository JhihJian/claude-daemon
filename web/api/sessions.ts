/**
 * Sessions API
 * 会话查询 API 封装
 */

import { SessionQuery } from '../../tools/SessionQuery';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

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
}

export class SessionsAPI {
  private query: SessionQuery;
  private paiDir: string;

  constructor(paiDir?: string) {
    this.paiDir = paiDir || process.env.PAI_DIR || join(homedir(), '.claude');
    this.query = new SessionQuery(this.paiDir);
  }

  /**
   * 获取最近的会话
   */
  getRecent(limit: number = 10): SessionSummary[] {
    return this.query.queryRecent({ limit });
  }

  /**
   * 按类型查询
   */
  getByType(type: string): SessionSummary[] {
    return this.query.queryByType(type as SessionType);
  }

  /**
   * 按目录查询
   */
  getByDirectory(directory: string): SessionSummary[] {
    return this.query.queryByDirectory(directory);
  }

  /**
   * 按主机名查询
   */
  getByHostname(hostname: string): SessionSummary[] {
    return this.query.queryByHostname(hostname);
  }

  /**
   * 按 ID 查询单个会话
   */
  getById(sessionId: string): SessionSummary | null {
    // 查找会话摘要文件
    const summariesDir = join(this.paiDir, 'SESSIONS/analysis/summaries');

    // 遍历所有月份目录
    if (!existsSync(summariesDir)) {
      return null;
    }

    const monthDirs = readdirSync(summariesDir);

    for (const monthDir of monthDirs) {
      const summaryFile = join(summariesDir, monthDir, `summary-${sessionId}.json`);

      if (existsSync(summaryFile)) {
        const summary = JSON.parse(readFileSync(summaryFile, 'utf-8'));
        return summary;
      }
    }

    return null;
  }

  /**
   * 搜索会话（支持多条件）
   */
  search(params: {
    type?: SessionType;
    directory?: string;
    hostname?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): SessionSummary[] {
    let results: SessionSummary[] = [];

    if (params.type) {
      results = this.getByType(params.type);
    } else if (params.directory) {
      results = this.getByDirectory(params.directory);
    } else if (params.hostname) {
      results = this.getByHostname(params.hostname);
    } else {
      results = this.getRecent(params.limit || 100);
    }

    // 应用日期过滤
    if (params.start_date) {
      const startDate = new Date(params.start_date);
      results = results.filter(s => new Date(s.timestamp) >= startDate);
    }

    if (params.end_date) {
      const endDate = new Date(params.end_date);
      results = results.filter(s => new Date(s.timestamp) <= endDate);
    }

    // 应用限制
    if (params.limit && results.length > params.limit) {
      results = results.slice(0, params.limit);
    }

    return results;
  }
}
