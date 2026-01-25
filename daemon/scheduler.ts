/**
 * scheduler.ts
 * 定时任务调度器 - 管理所有定时任务
 */

import { createHookLogger } from '../lib/logger.ts';

const logger = createHookLogger('Scheduler');

export interface ScheduledTask {
  name: string;
  interval: number; // 毫秒
  handler: () => Promise<void>;
  enabled: boolean;
}

export class Scheduler {
  private tasks: Map<string, ScheduledTaskInfo> = new Map();
  private running = false;

  /**
   * 注册定时任务
   */
  register(task: ScheduledTask): void {
    if (this.tasks.has(task.name)) {
      logger.warn('Task already registered', { taskName: task.name });
      return;
    }

    this.tasks.set(task.name, {
      ...task,
      timer: undefined,
      lastRun: null,
      nextRun: null,
      runCount: 0,
      errorCount: 0,
    });

    logger.info('Task registered', {
      name: task.name,
      interval: task.interval,
      enabled: task.enabled,
    });
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.running) {
      logger.warn('Scheduler already running');
      return;
    }

    this.running = true;

    for (const [name, taskInfo] of this.tasks.entries()) {
      if (taskInfo.enabled) {
        this.startTask(name, taskInfo);
      }
    }

    logger.info('Scheduler started', { taskCount: this.tasks.size });
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (!this.running) {
      logger.warn('Scheduler not running');
      return;
    }

    this.running = false;

    for (const [name, taskInfo] of this.tasks.entries()) {
      this.stopTask(name, taskInfo);
    }

    logger.info('Scheduler stopped');
  }

  /**
   * 启动单个任务
   */
  private startTask(name: string, taskInfo: ScheduledTaskInfo): void {
    taskInfo.nextRun = Date.now() + taskInfo.interval;

    taskInfo.timer = setInterval(async () => {
      await this.runTask(name, taskInfo);
    }, taskInfo.interval);

    logger.debug('Task started', {
      name,
      interval: taskInfo.interval,
      nextRun: new Date(taskInfo.nextRun).toISOString(),
    });
  }

  /**
   * 停止单个任务
   */
  private stopTask(name: string, taskInfo: ScheduledTaskInfo): void {
    if (taskInfo.timer) {
      clearInterval(taskInfo.timer);
      taskInfo.timer = undefined;
    }

    logger.debug('Task stopped', { name });
  }

  /**
   * 执行任务
   */
  private async runTask(name: string, taskInfo: ScheduledTaskInfo): Promise<void> {
    const startTime = Date.now();

    try {
      logger.debug('Running task', { name });

      await taskInfo.handler();

      taskInfo.lastRun = Date.now();
      taskInfo.nextRun = taskInfo.lastRun + taskInfo.interval;
      taskInfo.runCount++;

      const duration = Date.now() - startTime;

      logger.debug('Task completed', {
        name,
        duration,
        runCount: taskInfo.runCount,
      });
    } catch (error) {
      taskInfo.errorCount++;

      logger.error('Task failed', {
        name,
        error: error instanceof Error ? error.message : String(error),
        errorCount: taskInfo.errorCount,
      });
    }
  }

  /**
   * 手动触发任务
   */
  async trigger(name: string): Promise<void> {
    const taskInfo = this.tasks.get(name);

    if (!taskInfo) {
      throw new Error(`Task not found: ${name}`);
    }

    logger.info('Manually triggering task', { name });
    await this.runTask(name, taskInfo);
  }

  /**
   * 启用/禁用任务
   */
  setEnabled(name: string, enabled: boolean): void {
    const taskInfo = this.tasks.get(name);

    if (!taskInfo) {
      throw new Error(`Task not found: ${name}`);
    }

    if (taskInfo.enabled === enabled) {
      return;
    }

    taskInfo.enabled = enabled;

    if (this.running) {
      if (enabled) {
        this.startTask(name, taskInfo);
      } else {
        this.stopTask(name, taskInfo);
      }
    }

    logger.info('Task enabled state changed', { name, enabled });
  }

  /**
   * 获取任务状态
   */
  getStatus(): TaskStatus[] {
    return Array.from(this.tasks.entries()).map(([name, taskInfo]) => ({
      name,
      enabled: taskInfo.enabled,
      interval: taskInfo.interval,
      lastRun: taskInfo.lastRun ? new Date(taskInfo.lastRun).toISOString() : null,
      nextRun: taskInfo.nextRun ? new Date(taskInfo.nextRun).toISOString() : null,
      runCount: taskInfo.runCount,
      errorCount: taskInfo.errorCount,
    }));
  }
}

// 内部类型
interface ScheduledTaskInfo extends ScheduledTask {
  timer?: NodeJS.Timer;
  lastRun: number | null;
  nextRun: number | null;
  runCount: number;
  errorCount: number;
}

// 导出类型
export interface TaskStatus {
  name: string;
  enabled: boolean;
  interval: number;
  lastRun: string | null;
  nextRun: string | null;
  runCount: number;
  errorCount: number;
}
