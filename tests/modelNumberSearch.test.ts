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
import { extractCivitaiModelId } from '../src/components/BrowseTab';

describe('extractCivitaiModelId', () => {
  it('extracts pure numeric string model IDs', () => {
    expect(extractCivitaiModelId('123456')).toBe(123456);
    expect(extractCivitaiModelId('  987654  ')).toBe(987654);
    expect(extractCivitaiModelId('1')).toBe(1);
    expect(extractCivitaiModelId('1337420')).toBe(1337420);
  });

  it('extracts hash-prefixed numeric model IDs', () => {
    expect(extractCivitaiModelId('#123456')).toBe(123456);
    expect(extractCivitaiModelId('#42')).toBe(42);
  });

  it('extracts model IDs from full CivitAI URLs', () => {
    expect(extractCivitaiModelId('https://civitai.com/models/123456')).toBe(123456);
    expect(extractCivitaiModelId('https://civitai.com/models/123456/cyberrealistic-v4')).toBe(123456);
    expect(extractCivitaiModelId('http://civitai.com/models/789012?modelVersionId=456')).toBe(789012);
    expect(extractCivitaiModelId('civitai.com/models/999888')).toBe(999888);
    expect(extractCivitaiModelId('models/555123')).toBe(555123);
  });

  it('returns null for general search queries and non-ID text', () => {
    expect(extractCivitaiModelId('flux anime lora')).toBeNull();
    expect(extractCivitaiModelId('sdxl 1.0')).toBeNull();
    expect(extractCivitaiModelId('anima')).toBeNull();
    expect(extractCivitaiModelId('v1.5')).toBeNull();
    expect(extractCivitaiModelId('')).toBeNull();
    expect(extractCivitaiModelId(undefined)).toBeNull();
    expect(extractCivitaiModelId('0')).toBeNull();
    expect(extractCivitaiModelId('-100')).toBeNull();
  });
});
