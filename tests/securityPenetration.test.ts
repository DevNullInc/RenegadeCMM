/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  isAllowedOriginOrReferer,
  isPathWithinAllowedRoots,
  isSafeModelPath,
  isSafeNetworkUrl,
  parseSanitizedDeepLink,
  sanitizePathString,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_MODEL_EXTENSIONS,
} from '../src/utils/securityValidator';
import { webhookService } from '../src/services/webhookService';
import { storageOptimizer } from '../src/services/storageOptimizer';
import { swarmBridge } from '../src/services/swarmBridge';

describe('Penetration Testing & Security Hardening Suite', () => {
  let tempDir: string;
  let modelDir: string;
  let outsideDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-pentest-')));
    modelDir = path.join(tempDir, 'models');
    outsideDir = path.join(tempDir, 'outside_system');
    fs.mkdirSync(modelDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. HTTP Bridge CSRF & DNS Rebinding Protection (Origin / Referer)', () => {
    it('allows legitimate local origins and desktop app origins', () => {
      expect(isAllowedOriginOrReferer('http://localhost:5173')).toBe(true);
      expect(isAllowedOriginOrReferer('http://127.0.0.1:5173')).toBe(true);
      expect(isAllowedOriginOrReferer('http://127.0.0.1:5174')).toBe(true);
      expect(isAllowedOriginOrReferer('http://[::1]:5173')).toBe(true);
      expect(isAllowedOriginOrReferer('app://localhost')).toBe(true);
      expect(isAllowedOriginOrReferer('file:///app/index.html')).toBe(true);
      expect(isAllowedOriginOrReferer('vscode-webview://main')).toBe(true);
      expect(isAllowedOriginOrReferer(undefined)).toBe(true); // Non-browser clients
      expect(isAllowedOriginOrReferer('')).toBe(true);
    });

    it('strictly rejects malicious external origins & DNS rebinding hosts', () => {
      expect(isAllowedOriginOrReferer('http://evil.com')).toBe(false);
      expect(isAllowedOriginOrReferer('https://attacker.org:5174')).toBe(false);
      expect(isAllowedOriginOrReferer('http://localhost.evil.com')).toBe(false);
      expect(isAllowedOriginOrReferer('http://127.0.0.1.attacker.net')).toBe(false);
      expect(isAllowedOriginOrReferer('http://192.168.1.50:5174')).toBe(false);
      expect(isAllowedOriginOrReferer('http://attacker.com/bypass#localhost')).toBe(false);
    });

    it('strictly rejects malicious Referer headers to block cross-site request smuggling', () => {
      expect(isAllowedOriginOrReferer('https://malicious-site.com/exploit.html')).toBe(false);
      expect(isAllowedOriginOrReferer('http://phishing.site/cmm-csrf')).toBe(false);
      expect(isAllowedOriginOrReferer('http://localhost:5173/models')).toBe(true);
    });
  });

  describe('2. Path Traversal & Filesystem Boundary Containment', () => {
    it('sanitizes path strings and rejects null bytes / illegal control characters', () => {
      expect(sanitizePathString('/valid/path/model.safetensors')).not.toBeNull();
      expect(sanitizePathString('valid\0path/exploit.png')).toBeNull();
      expect(sanitizePathString('valid\x00exploit')).toBeNull();
      expect(sanitizePathString('')).toBeNull();
      expect(sanitizePathString(undefined)).toBeNull();
    });

    it('verifies paths stay strictly within permitted model directory roots', () => {
      const allowedRoots = [modelDir];

      const insideFile = path.join(modelDir, 'checkpoints', 'model.safetensors');
      const outsideFile = path.join(outsideDir, 'sensitive.txt');
      const traversalAttempt = path.join(modelDir, '..', 'outside_system', 'sensitive.txt');

      expect(isPathWithinAllowedRoots(insideFile, allowedRoots)).toBe(true);
      expect(isPathWithinAllowedRoots(outsideFile, allowedRoots)).toBe(false);
      expect(isPathWithinAllowedRoots(traversalAttempt, allowedRoots)).toBe(false);
    });

    it('validates allowed AI model extensions and blocks executable/script files', () => {
      expect(isSafeModelPath(path.join(modelDir, 'sd_xl.safetensors'))).toBe(true);
      expect(isSafeModelPath(path.join(modelDir, 'flux.gguf'))).toBe(true);
      expect(isSafeModelPath(path.join(modelDir, 'v1-5-pruned.ckpt'))).toBe(true);
      expect(isSafeModelPath(path.join(modelDir, 'model.pt'))).toBe(true);
      expect(isSafeModelPath(path.join(modelDir, 'model.bin'))).toBe(true);

      // Block dangerous executable/script extensions
      expect(isSafeModelPath(path.join(modelDir, 'malware.exe'))).toBe(false);
      expect(isSafeModelPath(path.join(modelDir, 'script.bat'))).toBe(false);
      expect(isSafeModelPath(path.join(modelDir, 'payload.ps1'))).toBe(false);
      expect(isSafeModelPath(path.join(modelDir, 'backdoor.py'))).toBe(false);
      expect(isSafeModelPath(path.join(modelDir, 'exploit.sh'))).toBe(false);
      expect(isSafeModelPath(path.join(modelDir, 'injected.dll'))).toBe(false);
    });
  });

  describe('3. SSRF & Cloud Metadata IP Blocking', () => {
    it('permits safe local and remote HTTPS URLs', () => {
      expect(isSafeNetworkUrl('http://127.0.0.1:5180').safe).toBe(true);
      expect(isSafeNetworkUrl('http://localhost:5180').safe).toBe(true);
      expect(isSafeNetworkUrl('https://civitai.com/api/v1/models').safe).toBe(true);
      expect(isSafeNetworkUrl('https://huggingface.co/api/models').safe).toBe(true);
    });

    it('blocks cloud instance metadata endpoints (AWS, GCP, Azure, Alibaba)', () => {
      expect(isSafeNetworkUrl('http://169.254.169.254/latest/meta-data/').safe).toBe(false);
      expect(isSafeNetworkUrl('http://169.254.169.254/computeMetadata/v1/').safe).toBe(false);
      expect(isSafeNetworkUrl('http://100.100.100.200/latest/meta-data/').safe).toBe(false);
      expect(isSafeNetworkUrl('http://metadata.google.internal/computeMetadata/v1/').safe).toBe(false);
      expect(isSafeNetworkUrl('http://169.254.1.1/exploit').safe).toBe(false);
    });

    it('blocks non-HTTP protocols to prevent protocol smuggling', () => {
      expect(isSafeNetworkUrl('file:///etc/passwd').safe).toBe(false);
      expect(isSafeNetworkUrl('javascript:alert(1)').safe).toBe(false);
      expect(isSafeNetworkUrl('gopher://127.0.0.1:6379/_flushall').safe).toBe(false);
      expect(isSafeNetworkUrl('data:text/html,<script>alert(1)</script>').safe).toBe(false);
      expect(isSafeNetworkUrl('powershell:Invoke-Expression').safe).toBe(false);
    });

    it('blocks webhook delivery to cloud metadata endpoints', async () => {
      const result = await webhookService.testWebhook('http://169.254.169.254/latest/meta-data');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cloud instance metadata|Invalid webhook URL/i);
    });
  });

  describe('4. Deep Link Protocol Parsing & Attack Payloads (`renegadecmm://`)', () => {
    it('correctly parses legitimate model and download deep links', () => {
      const parsedDownload = parseSanitizedDeepLink('renegadecmm://download?modelId=827184&versionId=2514310');
      expect(parsedDownload).not.toBeNull();
      expect(parsedDownload?.action).toBe('download');
      expect(parsedDownload?.modelId).toBe(827184);
      expect(parsedDownload?.versionId).toBe(2514310);

      const parsedModel = parseSanitizedDeepLink('renegadecmm://model?id=12345');
      expect(parsedModel).not.toBeNull();
      expect(parsedModel?.action).toBe('model');
      expect(parsedModel?.modelId).toBe(12345);

      const parsedNav = parseSanitizedDeepLink('renegadecmm://navigate?tab=optimizer');
      expect(parsedNav).not.toBeNull();
      expect(parsedNav?.action).toBe('navigate');
      expect(parsedNav?.tab).toBe('optimizer');

      const parsedSearch = parseSanitizedDeepLink('renegadecmm://search?q=flux+lora');
      expect(parsedSearch).not.toBeNull();
      expect(parsedSearch?.action).toBe('search');
      expect(parsedSearch?.query).toBe('flux lora');
    });

    it('sanitizes or rejects injection payloads in deep links', () => {
      // Command injection string in modelId
      const badId = parseSanitizedDeepLink('renegadecmm://download?modelId=calc.exe');
      expect(badId).toBeNull();

      // HTML/Script tags in search query are stripped
      const xssSearch = parseSanitizedDeepLink('renegadecmm://search?q=<script>alert(1)</script>sdxl');
      expect(xssSearch).not.toBeNull();
      expect(xssSearch?.query).not.toContain('<script>');

      // Invalid action
      const badAction = parseSanitizedDeepLink('renegadecmm://exec?cmd=whoami');
      expect(badAction).toBeNull();

      // Non-renegadecmm protocol
      const wrongProtocol = parseSanitizedDeepLink('http://renegadecmm://download?modelId=1');
      expect(wrongProtocol).toBeNull();
    });
  });

  describe('5. Storage Optimizer Hardlink Hardening', () => {
    it('refuses to hardlink non-model files (e.g. scripts or binaries)', async () => {
      const nonModel1 = path.join(modelDir, 'script1.bat');
      const nonModel2 = path.join(modelDir, 'script2.bat');
      fs.writeFileSync(nonModel1, 'echo 1');
      fs.writeFileSync(nonModel2, 'echo 1');

      await expect(storageOptimizer.executeHardlink(nonModel1, nonModel2)).rejects.toThrow(
        /Hardlink deduplication is only permitted for supported AI model file types/i
      );
    });

    it('refuses to hardlink paths containing null bytes or invalid characters', async () => {
      await expect(storageOptimizer.executeHardlink('master\0.safetensors', 'dup.safetensors')).rejects.toThrow(
        /Invalid or unsafe file path/i
      );
    });
  });

  describe('6. Swarm Sister Daemon Bridge URL Normalization', () => {
    it('sanitizes and defaults invalid or SSRF URLs to localhost:5180', () => {
      expect(swarmBridge.normalizeUrl('http://127.0.0.1:5180/')).toBe('http://127.0.0.1:5180');
      expect(swarmBridge.normalizeUrl('127.0.0.1:5180')).toBe('http://127.0.0.1:5180');

      // Rejects cloud metadata and falls back safely
      expect(swarmBridge.normalizeUrl('http://169.254.169.254/swarm')).toBe('http://127.0.0.1:5180');
      expect(swarmBridge.normalizeUrl('file:///etc/hosts')).toBe('http://127.0.0.1:5180');
      expect(swarmBridge.normalizeUrl('javascript:alert(1)')).toBe('http://127.0.0.1:5180');
    });
  });
});
