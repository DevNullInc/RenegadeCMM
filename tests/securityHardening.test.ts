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
import crypto from 'crypto';
import { encryptKey, decryptKey, isLegacyEncrypted, getMachineEntropy } from '../src/utils/secureStorage';
import { redactSecrets } from '../src/utils/logger';
import { sanitizeDownloadUrl, isCivitaiUrl, attachCivitaiToken } from '../src/services/downloadManager';
import { getSanitizedConfig } from '../src/utils/configSanitizer';
import { AppConfig } from '../src/types/app';

describe('Security Hardening & Machine-Bound Encryption', () => {
  describe('secureStorage', () => {
    it('should encrypt and decrypt keys accurately using machine-bound AES-256-GCM', () => {
      const secret = 'civitai_sec_token_987654321_abcdef';
      const encrypted = encryptKey(secret);

      expect(encrypted).toMatch(/^mb_gcm:/);
      expect(encrypted).not.toContain(secret);

      const decrypted = decryptKey(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('should identify machine-bound ciphertext as non-legacy', () => {
      const encrypted = encryptKey('test_secret');
      expect(isLegacyEncrypted(encrypted)).toBe(false);
    });

    it('should transparently decrypt legacy static-salt ciphertexts', () => {
      const legacySecret = 'legacy_secret_api_key_123';
      const legacyStaticKey = crypto.scryptSync('cmm-secret-salt-civitai', 'salt', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', legacyStaticKey, iv);
      let ciphertext = cipher.update(legacySecret, 'utf8', 'hex');
      ciphertext += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');
      const legacyFormat = `${iv.toString('hex')}:${authTag}:${ciphertext}`;

      expect(isLegacyEncrypted(legacyFormat)).toBe(true);

      const decrypted = decryptKey(legacyFormat);
      expect(decrypted).toBe(legacySecret);
    });

    it('should return machine entropy consistently', () => {
      const entropy1 = getMachineEntropy();
      const entropy2 = getMachineEntropy();
      expect(entropy1).toBe(entropy2);
      expect(entropy1.length).toBeGreaterThan(5);
    });

    it('should handle empty or missing inputs gracefully', () => {
      expect(encryptKey('')).toBe('');
      expect(decryptKey('')).toBe('');
      expect(decryptKey(undefined as any)).toBe('');
    });
  });

  describe('logger secret redaction', () => {
    it('should scrub query parameter tokens from log strings', () => {
      const input = 'Downloading model from https://civitai.com/api/download/models/123?token=secret12345&foo=bar';
      const scrubbed = redactSecrets(input);
      expect(scrubbed).not.toContain('secret12345');
      expect(scrubbed).toContain('token=[REDACTED]');
      expect(scrubbed).toContain('foo=bar');
    });

    it('should scrub Bearer authentication tokens', () => {
      const input = 'Sending request with Authorization: Bearer hf_abc123xyz789 to HuggingFace';
      const scrubbed = redactSecrets(input);
      expect(scrubbed).not.toContain('hf_abc123xyz789');
      expect(scrubbed).toContain('Bearer [REDACTED]');
    });

    it('should scrub JSON credential fields', () => {
      const input = JSON.stringify({
        civitai_api_key: 'top_secret_civitai_key',
        huggingface_token: 'top_secret_hf_token',
        other_setting: 'keep_me',
      });
      const scrubbed = redactSecrets(input);
      expect(scrubbed).not.toContain('top_secret_civitai_key');
      expect(scrubbed).not.toContain('top_secret_hf_token');
      expect(scrubbed).toContain('civitai_api_key":"[REDACTED]"');
      expect(scrubbed).toContain('huggingface_token":"[REDACTED]"');
      expect(scrubbed).toContain('keep_me');
    });
  });

  describe('downloadManager URL sanitization', () => {
    it('should strip ?token= from download URLs', () => {
      const url = 'https://civitai.com/api/download/models/456?token=my_secret_token';
      const clean = sanitizeDownloadUrl(url);
      expect(clean).toBe('https://civitai.com/api/download/models/456');
    });

    it('should strip &token= and preserve other query parameters', () => {
      const url = 'https://civitai.com/api/download/models/456?type=Model&token=my_secret_token&format=SafeTensor';
      const clean = sanitizeDownloadUrl(url);
      expect(clean).toBe('https://civitai.com/api/download/models/456?type=Model&format=SafeTensor');
    });

    it('should handle empty or clean URLs without alteration', () => {
      expect(sanitizeDownloadUrl('')).toBe('');
      expect(sanitizeDownloadUrl('https://civitai.com/api/download/models/123')).toBe('https://civitai.com/api/download/models/123');
    });

    it('should validate CivitAI domains strictly and reject spoofed substrings or plain HTTP', () => {
      expect(isCivitaiUrl('https://civitai.com/api/download/models/123')).toBe(true);
      expect(isCivitaiUrl('https://image.civitai.com/view/123')).toBe(true);
      expect(isCivitaiUrl('https://civitai.red/api/download/models/123')).toBe(true);
      expect(isCivitaiUrl('https://sub.civitai.red/download')).toBe(true);

      // Substring & spoofing attacks
      expect(isCivitaiUrl('https://attacker-civitai.com/api/download')).toBe(false);
      expect(isCivitaiUrl('https://civitai.com.attacker.com/model')).toBe(false);
      expect(isCivitaiUrl('https://evil.com/?target=civitai.com')).toBe(false);
      expect(isCivitaiUrl('https://notcivitai.com')).toBe(false);

      // Plain HTTP (insecure)
      expect(isCivitaiUrl('http://civitai.com/api/download/models/123')).toBe(false);

      // Invalid / empty
      expect(isCivitaiUrl('')).toBe(false);
      expect(isCivitaiUrl('not-a-url')).toBe(false);
      expect(isCivitaiUrl(undefined as any)).toBe(false);
    });

    it('should safely attach token only to verified CivitAI HTTPS endpoints', () => {
      const apiKey = 'test_api_key_12345';
      const civitaiUrl = 'https://civitai.com/api/download/models/123';
      const attached = attachCivitaiToken(civitaiUrl, apiKey);
      expect(attached).toBe('https://civitai.com/api/download/models/123?token=test_api_key_12345');

      // Preserve existing token if already present
      const alreadyHasToken = 'https://civitai.com/api/download/models/123?token=existing_token';
      expect(attachCivitaiToken(alreadyHasToken, apiKey)).toBe(alreadyHasToken);

      // Never attach token to untrusted hosts
      const maliciousUrl = 'https://evil-civitai.com/api/download/models/123';
      expect(attachCivitaiToken(maliciousUrl, apiKey)).toBe(maliciousUrl);

      const querySpoofUrl = 'https://evil.com/download?fake=civitai.com';
      expect(attachCivitaiToken(querySpoofUrl, apiKey)).toBe(querySpoofUrl);

      // Never attach token to cleartext HTTP
      const httpUrl = 'http://civitai.com/api/download/models/123';
      expect(attachCivitaiToken(httpUrl, apiKey)).toBe(httpUrl);

      // No apiKey provided
      expect(attachCivitaiToken(civitaiUrl, undefined)).toBe(civitaiUrl);
      expect(attachCivitaiToken(civitaiUrl, '')).toBe(civitaiUrl);
    });
  });

  describe('getSanitizedConfig', () => {
    const mockConfig: AppConfig = {
      comfyui_root: '/opt/ComfyUI',
      comfyui_folders: ['/opt/ComfyUI'],
      civitai_api_key: 'super_secret_civitai_key',
      huggingface_token: 'hf_super_secret_token',
      folder_mappings: {},
      advanced_mappings: { filename_patterns: [] },
      organize_by: { base_model: true, creator: false },
      conflict_strategy: 'rename',
      nsfw_max_visible_level: 5,
      nsfw_blur_enabled: true,
    };

    it('should redact keys completely and return boolean status flags for public /api/config', () => {
      const sanitized = getSanitizedConfig(mockConfig, false);
      expect((sanitized as any).civitai_api_key).toBeUndefined();
      expect((sanitized as any).huggingface_token).toBeUndefined();
      expect(sanitized.has_civitai_api_key).toBe(true);
      expect(sanitized.has_huggingface_token).toBe(true);
      expect(sanitized.comfyui_root).toBe('/opt/ComfyUI');
    });

    it('should mask keys with bullets for internal IPC get-config', () => {
      const sanitized = getSanitizedConfig(mockConfig, true);
      expect(sanitized.civitai_api_key).toBe('••••••••');
      expect(sanitized.huggingface_token).toBe('••••••••');
      expect(sanitized.has_civitai_api_key).toBe(true);
      expect(sanitized.has_huggingface_token).toBe(true);
    });

    it('should correctly report false flags when credentials are empty', () => {
      const emptyConfig: AppConfig = {
        ...mockConfig,
        civitai_api_key: '',
        huggingface_token: undefined,
      };
      const sanitized = getSanitizedConfig(emptyConfig, true);
      expect(sanitized.has_civitai_api_key).toBe(false);
      expect(sanitized.has_huggingface_token).toBe(false);
      expect(sanitized.civitai_api_key).toBe('');
      expect(sanitized.huggingface_token).toBe('');
    });
  });
});
