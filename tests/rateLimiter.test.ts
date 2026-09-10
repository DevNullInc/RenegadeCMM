/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/utils/rateLimiter';

describe('RateLimiter', () => {
  it('should acquire tokens within rate limits', async () => {
    const limiter = new RateLimiter(5);
    const start = Date.now();
    await limiter.acquireToken();
    await limiter.acquireToken();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});
