import { describe, it, expect } from 'vitest';
import {
  normalizeBaseModel,
  isArchitectureMatch,
  extractSubType,
  extractModelFlavor,
  isFlavorMatch,
  resolveEffectiveModelType,
} from '../src/utils/modelUtils';

describe('Architecture & Base Model Update Matching', () => {
  it('correctly normalizes known architectures and flavors', () => {
    expect(normalizeBaseModel('Anima', 'v1.0')).toBe('anima');
    expect(normalizeBaseModel(undefined, 'Model Anima v2.0')).toBe('anima');
    expect(normalizeBaseModel('Illustrious', 'v1.0 (IL-XL)')).toBe('illustrious');
    expect(normalizeBaseModel('Pony', 'v6.0')).toBe('pony');
    expect(normalizeBaseModel('SDXL 1.0', 'v1.0')).toBe('sdxl');
    expect(normalizeBaseModel('SD 1.5', 'v1.5')).toBe('sd15');
    expect(normalizeBaseModel('Flux.1 D', 'v1.0')).toBe('flux');
    expect(normalizeBaseModel('NoobAI', 'v1.0')).toBe('noobai');
  });

  it('detects match for identical architectures and prevents cross-architecture updates', () => {
    const animaArch = normalizeBaseModel('Anima', 'v1.0');
    const illustriousArch = normalizeBaseModel('Illustrious', 'v1.0');
    const ponyArch = normalizeBaseModel('Pony', 'v1.0');
    const animaNewArch = normalizeBaseModel('Anima', 'v2.0');

    // Matching architecture
    expect(isArchitectureMatch(animaArch, animaNewArch)).toBe(true);

    // Cross-architecture updates should NOT match
    expect(isArchitectureMatch(animaArch, illustriousArch)).toBe(false);
    expect(isArchitectureMatch(animaArch, ponyArch)).toBe(false);
    expect(isArchitectureMatch(illustriousArch, ponyArch)).toBe(false);
  });

  it('evaluates model versions strictly targeting the installed base architecture', () => {
    const installed = {
      versionId: 101,
      baseModel: 'Anima',
      versionName: 'v1.0 (Anima)',
      date: new Date('2026-01-01').getTime(),
    };

    const remoteVersions = [
      {
        id: 104,
        name: 'v2.0 (Anima)',
        baseModel: 'Anima',
        publishedAt: '2026-06-01',
      },
      {
        id: 103,
        name: 'v1.0 (Illustrious)',
        baseModel: 'Illustrious',
        publishedAt: '2026-05-01',
      },
      {
        id: 102,
        name: 'v1.0 (Pony)',
        baseModel: 'Pony',
        publishedAt: '2026-04-01',
      },
      {
        id: 101,
        name: 'v1.0 (Anima)',
        baseModel: 'Anima',
        publishedAt: '2026-01-01',
      },
    ];

    const installedArch = normalizeBaseModel(installed.baseModel, installed.versionName);

    const matchingUpdates = remoteVersions.filter((v) => {
      const vArch = normalizeBaseModel(v.baseModel, v.name);
      const vDate = new Date(v.publishedAt).getTime();
      return (
        v.id !== installed.versionId &&
        isArchitectureMatch(vArch, installedArch) &&
        vDate > installed.date
      );
    });

    expect(matchingUpdates.length).toBe(1);
    expect(matchingUpdates[0].id).toBe(104);
    expect(matchingUpdates[0].name).toBe('v2.0 (Anima)');
  });

  describe('Multi-tool / ControlNet Subtype Isolation', () => {
    it('extracts specific sub-types accurately', () => {
      expect(extractSubType('bdsqlsz-canny')).toBe('canny');
      expect(extractSubType('2vXpSwA7-openpose-v2_1')).toBe('openpose');
      expect(extractSubType('2vXpSwA7-anytest_v4')).toBe('anytest');
      expect(extractSubType('abovzv-segment')).toBe('segment');
      expect(extractSubType('bdsqlsz-depth')).toBe('depth');
      expect(extractSubType('bdsqlsz-lineart')).toBe('lineart');
      expect(extractSubType('bdsqlsz-normal')).toBe('normal');
      expect(extractSubType('bdsqlsz-mlsdv2')).toBe('mlsd');
      expect(extractSubType('v1.0 (no subtype)')).toBe('');
    });

    it('isolates ControlNet sub-types so anytest and openpose are never marked as updates for canny', () => {
      const cannyFlavor = extractModelFlavor('SDXL 1.0', 'bdsqlsz-canny');
      const openposeFlavor = extractModelFlavor('SDXL 1.0', '2vXpSwA7-openpose-v2_1');
      const anytestFlavor = extractModelFlavor('SDXL 1.0', '2vXpSwA7-anytest_v4');
      const cannyV2Flavor = extractModelFlavor('SDXL 1.0', 'bdsqlsz-canny_v2');

      expect(cannyFlavor.baseArch).toBe('sdxl');
      expect(cannyFlavor.subType).toBe('canny');
      expect(openposeFlavor.subType).toBe('openpose');
      expect(anytestFlavor.subType).toBe('anytest');

      // Different subtypes should not match even if both are SDXL 1.0
      expect(isFlavorMatch(cannyFlavor, openposeFlavor)).toBe(false);
      expect(isFlavorMatch(cannyFlavor, anytestFlavor)).toBe(false);
      expect(isFlavorMatch(openposeFlavor, anytestFlavor)).toBe(false);

      // Same subtype and architecture matches
      expect(isFlavorMatch(cannyFlavor, cannyV2Flavor)).toBe(true);
    });

    it('correctly resolves effective model type for mislabeled ControlNet models', () => {
      expect(
        resolveEffectiveModelType('Checkpoint', 'ControlNetXL (CNXL)', [
          'bdsqlsz-canny',
          '2vXpSwA7-anytest_v4',
        ])
      ).toBe('Controlnet');

      expect(
        resolveEffectiveModelType('Other', 'AnyLoRA anime model', [
          'v1.0',
        ])
      ).toBe('LORA');

      expect(
        resolveEffectiveModelType('Checkpoint', 'Juggernaut XL', [
          'v9.0',
        ])
      ).toBe('Checkpoint');
    });
  });
});

