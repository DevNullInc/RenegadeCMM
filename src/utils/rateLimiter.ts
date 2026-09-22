/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { logger } from './logger';

export class RateLimiter {
  private maxRequestsPerSec: number;
  private tokens: number;
  private lastRefill: number;
  private lastReleaseTime: number = 0;
  private minIntervalMs: number;
  private queue: Array<() => void> = [];
  private isProcessing = false;

  constructor(requestsPerSecond = 3, minIntervalMs = 150) {
    this.maxRequestsPerSec = Math.max(1, requestsPerSecond);
    this.tokens = this.maxRequestsPerSec;
    this.lastRefill = Date.now();
    this.minIntervalMs = minIntervalMs;
  }

  setRateLimit(requestsPerSecond: number, minIntervalMs?: number) {
    this.maxRequestsPerSec = Math.max(1, requestsPerSecond);
    this.tokens = Math.min(this.tokens, this.maxRequestsPerSec);
    if (minIntervalMs !== undefined) {
      this.minIntervalMs = minIntervalMs;
    }
  }

  private refillTokens() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec > 0) {
      this.tokens = Math.min(
        this.maxRequestsPerSec,
        this.tokens + elapsedSec * this.maxRequestsPerSec
      );
      this.lastRefill = now;
    }
  }

  async acquireToken(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      this.refillTokens();
      const now = Date.now();
      const timeSinceLast = now - this.lastReleaseTime;
      const pacingWait = Math.max(0, this.minIntervalMs - timeSinceLast);

      if (this.tokens >= 1 && pacingWait === 0) {
        this.tokens -= 1;
        this.lastReleaseTime = Date.now();
        const next = this.queue.shift();
        if (next) next();
      } else {
        const tokenWaitMs = this.tokens < 1
          ? Math.ceil((1 - this.tokens) * (1000 / this.maxRequestsPerSec))
          : 0;
        const waitMs = Math.max(pacingWait, tokenWaitMs, 25);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    this.isProcessing = false;
  }

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 4,
    initialBackoffMs = 1200
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        await this.acquireToken();
        return await fn();
      } catch (err: any) {
        attempt++;
        const status = err?.response?.status;
        const isRateLimited = status === 429 || status === 503 || status === 502 || status === 520 || status === 524 || status === 408;
        // Node's http client marks a response stream cut short as "aborted"
        // (code ECONNABORTED). CivitAI/Cloudflare occasionally reset a large body
        // after sending the 200 headers, which logs as "GET /models failed
        // (status 200): aborted". Treat it as transient like a rate limit instead of
        // letting one bad response wipe the entire browse grid.
        const isAborted =
          err?.code === 'ECONNABORTED' ||
          err?.code === 'ETIMEDOUT' ||
          err?.code === 'ECONNRESET' ||
          (typeof err?.message === 'string' && /aborted|timeout|reset/i.test(err.message));
        const retryable = isRateLimited || isAborted;

        if (!retryable || attempt > maxRetries) {
          throw err;
        }

        // Check Retry-After header if present
        const retryAfterHeader = err?.response?.headers?.['retry-after'];
        let backoffMs = initialBackoffMs * Math.pow(2, attempt - 1);

        if (retryAfterHeader) {
          const parsedSec = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedSec)) {
            backoffMs = parsedSec * 1000;
          }
        }

        // Add jitter (50-400ms) and cap backoff at 30 seconds
        const jitter = Math.random() * 350 + 50;
        const totalWait = Math.min(backoffMs + jitter, 30000);

        logger.warn(
          `CivitAI/API throttled or returned transient error (Status ${status || err?.code}). Retrying attempt ${attempt}/${maxRetries} in ${Math.round(
            totalWait
          )}ms...`
        );

        await new Promise((r) => setTimeout(r, totalWait));
      }
    }
  }
}
