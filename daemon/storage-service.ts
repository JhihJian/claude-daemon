/**
 * storage-service.ts
 * 存储服务 - 统一管理数据持久化
 */

import { appendFileSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { appendFile, writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { config } from '../lib/config.ts';
import { createHookLogger } from '../lib/logger.ts';
import { FileSystemError, safeJSONParse } from '../lib/errors.ts';
import type { SessionRecord } from './session-registry.ts';

const logger = createHookLogger('StorageService');

export interface SessionEvent {
  event_type: string;
  session_id: string;
  timestamp: string;
  data: any;
}

export class StorageService {
  private cfg = config.get();
  private writeLocks = new Map<string, Promise<void>>();

  constructor() {
    this.ensureDirectories();
  }

  /**
   * 确保所有必需的目录存在
   */
  private ensureDirectories(): void {
    const dirs = [
      this.cfg.rawDir,
      this.cfg.analysisDir,
      this.cfg.summariesDir,
      this.cfg.indexDir,
      join(this.cfg.analysisDir, 'by-type'),
      join(this.cfg.analysisDir, 'by-directory'),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
    }
  }

  /**
   * 保存事件到 JSONL 文件
   */
  async saveEvent(event: SessionEvent): Promise<void> {
    try {
      const yearMonth = config.getYearMonth();
      const rawDir = join(this.cfg.rawDir, yearMonth);

      // 确保月份目录存在
      if (!existsSync(rawDir)) {
        mkdirSync(rawDir, { recursive: true, mode: 0o700 });
      }

      const sessionFile = config.getSessionFilePath(event.session_id, yearMonth);

      // 追加到 JSONL 文件
      appendFileSync(sessionFile, JSON.stringify(event) + '\n', { mode: 0o600 });

      logger.debug('Event saved', {
        sessionId: event.session_id,
        eventType: event.event_type,
        file: sessionFile,
      });
    } catch (error) {
      throw new FileSystemError(
        `Failed to save event: ${error instanceof Error ? error.message : String(error)}`,
        config.getSessionFilePath(event.session_id, config.getYearMonth()),
        'append'
      );
    }
  }

  /**
   * 读取会话的所有事件
   */
  async readSessionEvents(sessionId: string, yearMonth?: string): Promise<SessionEvent[]> {
    try {
      const ym = yearMonth || config.getYearMonth();
      const sessionFile = config.getSessionFilePath(sessionId, ym);

      if (!existsSync(sessionFile)) {
        return [];
      }

      const content = readFileSync(sessionFile, 'utf-8');
      const lines = content.trim().split('\n');

      return lines
        .map(line => safeJSONParse<SessionEvent>(line, null as any, 'session event'))
        .filter(event => event !== null);
    } catch (error) {
      logger.error('Failed to read session events', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
      return [];
    }
  }

  /**
   * 保存会话摘要
   */
  async saveSummary(sessionId: string, summary: any): Promise<void> {
    try {
      const yearMonth = config.getYearMonth();
      const summaryDir = join(this.cfg.summariesDir, yearMonth);

      if (!existsSync(summaryDir)) {
        mkdirSync(summaryDir, { recursive: true, mode: 0o700 });
      }

      const summaryFile = config.getSummaryFilePath(sessionId, yearMonth);
      writeFileSync(summaryFile, JSON.stringify(summary, null, 2), { mode: 0o600 });

      logger.debug('Summary saved', { sessionId, file: summaryFile });
    } catch (error) {
      throw new FileSystemError(
        `Failed to save summary: ${error instanceof Error ? error.message : String(error)}`,
        config.getSummaryFilePath(sessionId, config.getYearMonth()),
        'write'
      );
    }
  }

  /**
   * 读取会话摘要
   */
  async readSummary(sessionId: string, yearMonth?: string): Promise<any | null> {
    try {
      const ym = yearMonth || config.getYearMonth();
      const summaryFile = config.getSummaryFilePath(sessionId, ym);

      if (!existsSync(summaryFile)) {
        return null;
      }

      const content = readFileSync(summaryFile, 'utf-8');
      return safeJSONParse(content, null, 'session summary');
    } catch (error) {
      logger.error('Failed to read summary', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
      return null;
    }
  }

  /**
   * 更新类型索引
   */
  async updateTypeIndex(sessionType: string, sessionData: any): Promise<void> {
    try {
      const typeIndexPath = config.getTypeIndexPath(sessionType);
      const typeDir = join(this.cfg.analysisDir, 'by-type', sessionType);

      if (!existsSync(typeDir)) {
        mkdirSync(typeDir, { recursive: true, mode: 0o700 });
      }

      // 读取现有索引
      let sessions: any[] = [];
      if (existsSync(typeIndexPath)) {
        const content = readFileSync(typeIndexPath, 'utf-8');
        sessions = safeJSONParse<any[]>(content, [], 'type index');
      }

      // 添加新会话
      sessions.push(sessionData);

      // 按时间倒序排序
      sessions.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // 写回文件
      writeFileSync(typeIndexPath, JSON.stringify(sessions, null, 2), { mode: 0o600 });

      logger.debug('Type index updated', { sessionType, count: sessions.length });
    } catch (error) {
      logger.error('Failed to update type index', {
        error: error instanceof Error ? error.message : String(error),
        sessionType,
      });
    }
  }

  /**
   * 更新目录索引
   */
  async updateDirectoryIndex(workingDirectory: string, sessionData: any): Promise<void> {
    try {
      // Base64 编码目录路径
      const dirHash = Buffer.from(workingDirectory)
        .toString('base64')
        .replace(/\//g, '_')
        .replace(/\+/g, '-')
        .replace(/=/g, '');

      const dirIndexDir = join(this.cfg.analysisDir, 'by-directory', dirHash);

      if (!existsSync(dirIndexDir)) {
        mkdirSync(dirIndexDir, { recursive: true, mode: 0o700 });
      }

      // 保存原始路径
      const pathFile = join(dirIndexDir, 'path.txt');
      if (!existsSync(pathFile)) {
        writeFileSync(pathFile, workingDirectory, { mode: 0o600 });
      }

      // 更新索引
      const indexFile = join(dirIndexDir, 'sessions.json');
      let sessions: any[] = [];

      if (existsSync(indexFile)) {
        const content = readFileSync(indexFile, 'utf-8');
        sessions = safeJSONParse<any[]>(content, [], 'directory index');
      }

      sessions.push(sessionData);

      // 按时间倒序排序
      sessions.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      writeFileSync(indexFile, JSON.stringify(sessions, null, 2), { mode: 0o600 });

      logger.debug('Directory index updated', { workingDirectory, count: sessions.length });
    } catch (error) {
      logger.error('Failed to update directory index', {
        error: error instanceof Error ? error.message : String(error),
        workingDirectory,
      });
    }
  }

  /**
   * 更新全局元数据
   */
  async updateGlobalMetadata(summary: any): Promise<void> {
    try {
      if (!existsSync(this.cfg.indexDir)) {
        mkdirSync(this.cfg.indexDir, { recursive: true, mode: 0o700 });
      }

      const metadataFile = config.getMetadataPath();

      // 读取现有元数据
      let metadata: any = {
        total_sessions: 0,
        sessions_by_type: {},
        sessions_by_directory: {},
        sessions_by_hostname: {},
        last_updated: null,
      };

      if (existsSync(metadataFile)) {
        const content = readFileSync(metadataFile, 'utf-8');
        metadata = safeJSONParse(content, metadata, 'global metadata');
      }

      if (!metadata.sessions_by_type) {
        metadata.sessions_by_type = {};
      }
      if (!metadata.sessions_by_directory) {
        metadata.sessions_by_directory = {};
      }
      if (!metadata.sessions_by_hostname) {
        metadata.sessions_by_hostname = {};
      }

      // 更新统计
      metadata.total_sessions += 1;
      metadata.sessions_by_type[summary.session_type] =
        (metadata.sessions_by_type[summary.session_type] || 0) + 1;

      if (summary.working_directory) {
        metadata.sessions_by_directory[summary.working_directory] =
          (metadata.sessions_by_directory[summary.working_directory] || 0) + 1;
      }

      if (summary.hostname) {
        metadata.sessions_by_hostname[summary.hostname] =
          (metadata.sessions_by_hostname[summary.hostname] || 0) + 1;
      }

      metadata.last_updated = new Date().toISOString();

      // 写回文件
      writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), { mode: 0o600 });

      logger.debug('Global metadata updated', { totalSessions: metadata.total_sessions });
    } catch (error) {
      logger.error('Failed to update global metadata', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Archive a session record
   * Uses async API with write locks for concurrency safety
   */
  async archiveSession(session: SessionRecord): Promise<void> {
    try {
      const yearMonth = new Date(session.start_time).toISOString().slice(0, 7); // YYYY-MM
      const archivePath = join(
        this.cfg.sessionsDir,
        'archive',
        yearMonth,
        'sessions.jsonl'
      );

      await this.ensureDirectoryAsync(dirname(archivePath));
      await this.writeWithLock(archivePath, JSON.stringify(session) + '\n');

      logger.debug('Session archived', {
        sessionId: session.session_id,
        agent: session.agent_name,
        file: archivePath,
      });
    } catch (error) {
      logger.error('Failed to archive session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: session.session_id,
      });
      throw error;
    }
  }

  /**
   * Query archived sessions with filters
   */
  async queryArchive(filters: {
    agentName?: string;
    workingDirectory?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<SessionRecord[]> {
    try {
      const archiveDir = join(this.cfg.sessionsDir, 'archive');

      if (!existsSync(archiveDir)) {
        return [];
      }

      const results: SessionRecord[] = [];
      const yearMonths = this.getYearMonthsInRange(filters.startDate, filters.endDate);

      for (const yearMonth of yearMonths) {
        const archivePath = join(archiveDir, yearMonth, 'sessions.jsonl');

        if (!existsSync(archivePath)) {
          continue;
        }

        const content = await readFile(archivePath, 'utf-8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
          if (!line) continue;

          const session = safeJSONParse<SessionRecord>(line, null as any, 'archived session');
          if (!session) continue;

          // Apply filters
          if (filters.agentName && session.agent_name !== filters.agentName) {
            continue;
          }

          if (filters.workingDirectory && session.working_directory !== filters.workingDirectory) {
            continue;
          }

          if (filters.startDate && session.start_time < filters.startDate) {
            continue;
          }

          if (filters.endDate && session.start_time > filters.endDate) {
            continue;
          }

          results.push(session);
        }
      }

      // Sort by start time descending
      results.sort((a, b) =>
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      );

      // Apply limit
      if (filters.limit && results.length > filters.limit) {
        return results.slice(0, filters.limit);
      }

      return results;
    } catch (error) {
      logger.error('Failed to query archive', {
        error: error instanceof Error ? error.message : String(error),
        filters,
      });
      return [];
    }
  }

  /**
   * Write to file with lock to prevent concurrent write conflicts
   */
  private async writeWithLock(filePath: string, content: string): Promise<void> {
    const existingLock = this.writeLocks.get(filePath) ?? Promise.resolve();

    const newLock = existingLock
      .then(async () => {
        await appendFile(filePath, content, { mode: 0o600 });
      })
      .catch(async (error) => {
        // If file doesn't exist, create it
        if (error.code === 'ENOENT') {
          await this.ensureDirectoryAsync(dirname(filePath));
          await writeFile(filePath, content, { mode: 0o600 });
        } else {
          throw error;
        }
      });

    this.writeLocks.set(filePath, newLock);
    await newLock;
  }

  /**
   * Ensure directory exists (async version)
   */
  private async ensureDirectoryAsync(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Get year-month strings in range for querying
   */
  private getYearMonthsInRange(startDate?: string, endDate?: string): string[] {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const yearMonths: string[] = [];
    const current = new Date(start);

    while (current <= end) {
      yearMonths.push(current.toISOString().slice(0, 7));
      current.setMonth(current.getMonth() + 1);
    }

    return yearMonths;
  }
}
