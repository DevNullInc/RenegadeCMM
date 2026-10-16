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
import { isVersionEarlyAccess, isModelEarlyAccessOrGated } from '../src/components/BrowseTab';
import { CivitAIModel, CivitAIModelVersion } from '../src/types/civitai';

describe('Early Access and Gated Model Filtering', () => {
  describe('isVersionEarlyAccess', () => {
    it('returns false for undefined, null, or empty versions', () => {
      expect(isVersionEarlyAccess(undefined)).toBe(false);
      expect(isVersionEarlyAccess(null)).toBe(false);
      expect(isVersionEarlyAccess({})).toBe(false);
    });

    it('identifies versions where canDownload is explicitly false', () => {
      const version: Partial<CivitAIModelVersion> = {
        id: 101,
        name: 'v1.0 (Early Access)',
        canDownload: false,
      };
      expect(isVersionEarlyAccess(version)).toBe(true);
    });

    it('identifies versions where availability is EarlyAccess', () => {
      const version: Partial<CivitAIModelVersion> = {
        id: 102,
        name: 'Supporter Tier Only',
        availability: 'EarlyAccess',
      };
      expect(isVersionEarlyAccess(version)).toBe(true);
    });

    it('identifies versions where status is EarlyAccess', () => {
      const version: Partial<CivitAIModelVersion> = {
        id: 103,
        name: 'Preview',
        status: 'EarlyAccess',
      };
      expect(isVersionEarlyAccess(version)).toBe(true);
    });

    it('identifies active early access when earlyAccessEndsAt is in the future', () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const version: Partial<CivitAIModelVersion> = {
        id: 104,
        name: 'Timed Early Access',
        earlyAccessEndsAt: futureDate,
      };
      expect(isVersionEarlyAccess(version)).toBe(true);
    });

    it('returns false when earlyAccessEndsAt has expired in the past', () => {
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const version: Partial<CivitAIModelVersion> = {
        id: 105,
        name: 'Unlocked Model',
        earlyAccessEndsAt: pastDate,
        canDownload: true,
      };
      expect(isVersionEarlyAccess(version)).toBe(false);
    });

    it('returns false for standard unlocked versions', () => {
      const version: Partial<CivitAIModelVersion> = {
        id: 106,
        name: 'Public Release',
        canDownload: true,
        availability: 'Public',
      };
      expect(isVersionEarlyAccess(version)).toBe(false);
    });
  });

  describe('isModelEarlyAccessOrGated', () => {
    it('returns false for null or undefined models', () => {
      expect(isModelEarlyAccessOrGated(undefined)).toBe(false);
      expect(isModelEarlyAccessOrGated(null)).toBe(false);
    });

    it('identifies model with earlyAccess flag', () => {
      const model = {
        id: 201,
        name: 'Locked Model',
        earlyAccess: true,
      } as CivitAIModel;
      expect(isModelEarlyAccessOrGated(model)).toBe(true);
    });

    it('identifies model with mode or availability EarlyAccess', () => {
      const model1 = {
        id: 202,
        name: 'Tiered Model',
        mode: 'EarlyAccess',
      } as CivitAIModel;
      expect(isModelEarlyAccessOrGated(model1)).toBe(true);

      const model2 = {
        id: 203,
        name: 'Avail Model',
        availability: 'EarlyAccess',
      } as any;
      expect(isModelEarlyAccessOrGated(model2)).toBe(true);
    });

    it('identifies model whose primary version is in Early Access', () => {
      const model = {
        id: 204,
        name: 'Model with Locked Primary Version',
        modelVersions: [
          {
            id: 301,
            name: 'v2.0 Early Access',
            canDownload: false,
          },
        ],
      } as any;
      expect(isModelEarlyAccessOrGated(model)).toBe(true);
    });

    it('returns false when primary version is unlocked and no model flags are set', () => {
      const model = {
        id: 205,
        name: 'Fully Public Model',
        modelVersions: [
          {
            id: 302,
            name: 'v1.0 Public',
            canDownload: true,
            availability: 'Public',
          },
        ],
      } as any;
      expect(isModelEarlyAccessOrGated(model)).toBe(false);
    });
  });
});
