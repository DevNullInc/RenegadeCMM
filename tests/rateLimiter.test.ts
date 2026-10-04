/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * Licensed under the Business Source License 1.1 (BUSL-1.1).
 * Single-user evaluation model with fully functional features.
 * Commercial enterprise license required for organizations with > 5 persons.
 * Inquiries: licensing@renegadeinc.net
 * Converts to GNU General Public License v3.0 or later (GPL-3.0-or-later) after 4 years.
 * See LICENSE for full terms and conditions.
 */
import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/utils/rateLimiter';

describe('RateLimiter', () => {
  it('should acquire tokens within rate limits', async () => {
    const limiter = new RateLimiter(5, 50);
    const start = Date.now();
    await limiter.acquireToken();
    await limiter.acquireToken();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('should retry on 429 rate limit with backoff and succeed', async () => {
    const limiter = new RateLimiter(10, 10);
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        const err: any = new Error('Rate limit');
        err.response = { status: 429 };
        throw err;
      }
      return 'success';
    };

    const result = await limiter.executeWithRetry(fn, 3, 50);
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });
});
