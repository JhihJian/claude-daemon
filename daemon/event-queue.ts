/**
 * event-queue.ts
 * 事件队列 - 处理并发事件，确保顺序执行
 */

import { createHookLogger } from '../lib/logger.ts';

const logger = createHookLogger('EventQueue');

export interface QueuedEvent {
  id: string;
  type: string;
  data: any;
  timestamp: number;
}

export class EventQueue {
  private queue: QueuedEvent[] = [];
  private processing = false;
  private handlers: Map<string, (event: QueuedEvent) => Promise<void>>;
  private maxQueueSize: number;

  constructor(maxQueueSize: number = 1000) {
    this.handlers = new Map();
    this.maxQueueSize = maxQueueSize;
  }

  /**
   * 注册事件处理器
   */
  on(eventType: string, handler: (event: QueuedEvent) => Promise<void>): void {
    this.handlers.set(eventType, handler);
  }

  /**
   * 添加事件到队列
   */
  async enqueue(event: QueuedEvent): Promise<void> {
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn('Queue is full, dropping oldest events', {
        queueSize: this.queue.length,
        maxSize: this.maxQueueSize,
      });

      // 删除最老的事件
      this.queue.shift();
    }

    this.queue.push(event);

    logger.debug('Event enqueued', {
      eventId: event.id,
      eventType: event.type,
      queueSize: this.queue.length,
    });

    // 如果没有在处理，启动处理
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * 处理队列中的事件
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const event = this.queue.shift();

      if (!event) continue;

      try {
        const handler = this.handlers.get(event.type);

        if (handler) {
          await handler(event);
        } else {
          logger.warn('No handler for event type', { eventType: event.type });
        }
      } catch (error) {
        logger.error('Error processing event', {
          error: error instanceof Error ? error.message : String(error),
          eventId: event.id,
          eventType: event.type,
        });
      }
    }

    this.processing = false;
  }

  /**
   * 获取队列状态
   */
  getStatus(): { queueSize: number; processing: boolean } {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
    };
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = [];
    logger.info('Queue cleared');
  }
}
