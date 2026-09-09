/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import crypto from 'crypto';
import os from 'os';

const ALGORITHM = 'aes-256-gcm';

/**
 * Derives machine-and-user specific entropy available consistently across both
 * the Electron desktop main process and the standalone Node.js CLI environment.
 */
export function getMachineEntropy(): string {
  let user = '';
  try {
    user = os.userInfo().username;
  } catch {
    user = process.env.USER || process.env.USERNAME || 'cmm-user';
  }
  const home = os.homedir() || '';
  const host = os.hostname() || '';
  const plat = os.platform() || '';
  return `cmm-entropy:${user}:${home}:${host}:${plat}`;
}

const MACHINE_SALT = crypto.createHash('sha256').update(getMachineEntropy()).digest();
const MACHINE_KEY = crypto.scryptSync('cmm-device-secret-key-v1', MACHINE_SALT, 32);
const LEGACY_SECRET_KEY = crypto.scryptSync('cmm-secret-salt-civitai', 'salt', 32);

/**
 * Encrypts a plaintext key using machine-and-user bound AES-256-GCM.
 */
export function encryptKey(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, MACHINE_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `mb_gcm:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts ciphertext, attempting machine-bound AES-256-GCM first, with automatic
 * backward-compatibility fallback to legacy static AES-GCM ciphertexts.
 */
export function decryptKey(cipherText: string): string {
  if (!cipherText) return '';
  if (typeof cipherText !== 'string' || !cipherText.includes(':')) return cipherText;

  // 1. Machine-bound format: mb_gcm:ivHex:authTagHex:encryptedText
  if (cipherText.startsWith('mb_gcm:')) {
    try {
      const parts = cipherText.split(':');
      if (parts.length === 4) {
        const [, ivHex, authTagHex, encryptedText] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, MACHINE_KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
    } catch {
      // Fall through to legacy or raw string fallback
    }
  }

  // 2. Legacy static AES-GCM format: ivHex:authTagHex:encryptedText
  try {
    const parts = cipherText.split(':');
    if (parts.length === 3) {
      const [ivHex, authTagHex, encryptedText] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, LEGACY_SECRET_KEY, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
  } catch {}

  return cipherText; // Fallback if unencrypted
}

/**
 * Checks if a ciphertext is stored under the legacy static salt format.
 */
export function isLegacyEncrypted(cipherText: string): boolean {
  if (!cipherText || typeof cipherText !== 'string') return false;
  return !cipherText.startsWith('mb_gcm:') && cipherText.split(':').length === 3;
}
