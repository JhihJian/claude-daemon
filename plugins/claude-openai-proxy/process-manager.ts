/**
 * Process Manager
 * 管理 Claude Code 进程池
 */

import type { Logger } from '../../lib/logger.ts';
import { spawn, type ChildProcess } from 'child_process';

export interface ProcessConfig {
  maxProcesses: number;
  processTimeout: number;
}

export interface ClaudeProcess {
  id: string;
  sessionId: string;
  process: ChildProcess;
  status: 'starting' | 'ready' | 'busy' | 'error';
  createdAt: number;
  lastActiveAt: number;
}

export class ProcessManager {
  private processes: Map<string, ClaudeProcess>;
  private config: ProcessConfig;
  private logger: Logger;

  constructor(logger: Logger, config: ProcessConfig) {
    this.logger = logger;
    this.config = config;
    this.processes = new Map();
  }

  /**
   * 创建新进程
   */
  async createProcess(sessionId: string, systemMessage?: string): Promise<ClaudeProcess> {
    if (this.processes.size >= this.config.maxProcesses) {
      throw new Error('Max processes limit reached');
    }

    const processId = `proc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.info('Creating Claude Code process', { processId, sessionId });

    // 启动 Claude Code 进程 (使用 stream-json 格式)
    const childProcess = spawn('claude', [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose'
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const claudeProcess: ClaudeProcess = {
      id: processId,
      sessionId,
      process: childProcess,
      status: 'starting',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    this.processes.set(sessionId, claudeProcess);

    // 等待进程就绪
    await this.waitForReady(claudeProcess);

    // 如果有 system message，发送它
    if (systemMessage) {
      await this.sendMessage(sessionId, systemMessage);
    }

    claudeProcess.status = 'ready';
    this.logger.info('Process ready', { processId, sessionId });

    return claudeProcess;
  }

  /**
   * 获取进程
   */
  getProcess(sessionId: string): ClaudeProcess | undefined {
    return this.processes.get(sessionId);
  }

  /**
   * 发送消息到进程
   */
  async sendMessage(sessionId: string, message: string): Promise<void> {
    const claudeProcess = this.processes.get(sessionId);

    if (!claudeProcess) {
      throw new Error(`Process not found: ${sessionId}`);
    }

    claudeProcess.status = 'busy';
    claudeProcess.lastActiveAt = Date.now();

    // 构造 stream-json 格式的消息
    const jsonMessage = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: message,
      },
    });

    return new Promise((resolve, reject) => {
      claudeProcess.process.stdin?.write(jsonMessage + '\n', (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 监听进程输出
   */
  onOutput(sessionId: string, callback: (chunk: string) => void): void {
    const claudeProcess = this.processes.get(sessionId);

    if (!claudeProcess) {
      throw new Error(`Process not found: ${sessionId}`);
    }

    let buffer = '';

    claudeProcess.process.stdout?.on('data', (data) => {
      const dataStr = data.toString();
      this.logger.info('Received stdout data', { sessionId, length: dataStr.length });

      buffer += dataStr;
      const lines = buffer.split('\n');

      // 保留最后一个不完整的行
      buffer = lines.pop() || '';

      // 处理每一行 JSON
      for (const line of lines) {
        if (!line.trim()) continue;

        this.logger.info('Processing line', { sessionId, line: line.substring(0, 100) });

        try {
          const json = JSON.parse(line);
          this.logger.info('Parsed JSON', { sessionId, type: json.type });

          // 只处理 assistant 消息
          if (json.type === 'assistant' && json.message?.content) {
            this.logger.info('Found assistant message', { sessionId, contentCount: json.message.content.length });
            for (const content of json.message.content) {
              if (content.type === 'text' && content.text) {
                this.logger.info('Calling callback with text', { sessionId, textLength: content.text.length });
                callback(content.text);
              }
            }
          }
        } catch (error) {
          this.logger.error('Failed to parse JSON output', { line, error });
        }
      }
    });

    // Also log stderr for debugging
    claudeProcess.process.stderr?.on('data', (data) => {
      this.logger.info('Received stderr data', { sessionId, data: data.toString().substring(0, 200) });
    });
  }

  /**
   * 销毁进程
   */
  async destroyProcess(sessionId: string): Promise<void> {
    const claudeProcess = this.processes.get(sessionId);

    if (!claudeProcess) {
      return;
    }

    this.logger.info('Destroying process', { sessionId });

    claudeProcess.process.kill();
    this.processes.delete(sessionId);
  }

  /**
   * 清理所有进程
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up all processes', { count: this.processes.size });

    for (const [sessionId] of this.processes) {
      await this.destroyProcess(sessionId);
    }
  }

  /**
   * 获取活跃进程数量
   */
  getActiveCount(): number {
    return this.processes.size;
  }

  /**
   * 等待进程就绪
   */
  private async waitForReady(claudeProcess: ClaudeProcess): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if process exits immediately (startup failure)
      const exitHandler = (code: number) => {
        reject(new Error(`Process exited with code ${code}`));
      };

      claudeProcess.process.once('exit', exitHandler);

      // Wait a short time to ensure process started successfully
      setTimeout(() => {
        claudeProcess.process.off('exit', exitHandler);

        // Check if process is still running
        if (claudeProcess.process.exitCode === null) {
          resolve();
        } else {
          reject(new Error(`Process failed to start (exit code: ${claudeProcess.process.exitCode})`));
        }
      }, 500);
    });
  }
}
