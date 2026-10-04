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

export type LicenseType = 'single-user' | 'commercial-seat' | 'supporter' | 'enterprise';

export type LicenseValidationStatus =
  | 'valid'
  | 'unregistered'
  | 'invalid_signature'
  | 'key_mismatch'
  | 'expired'
  | 'malformed'
  | 'revoked';

export interface RevocationTombstone {
  revoked: boolean;
  toxicHash: string;
  machineEntropy: string;
  reason: string;
  revokedAt: string;
  toxicNonce: string;
}

export interface LicensePayload {
  v: number;
  licenseId: string;
  type: LicenseType;
  licensee: string;
  email: string;
  userPublicKey: string; // Ed25519 public signature key (SPKI base64 / hex)
  issuedAt: string;      // ISO 8601 string
  expiresAt: string | null; // ISO 8601 string or null for perpetual
  seats: number;
  features: string[];
  metadata?: Record<string, any>;
}

export interface LicenseValidationResult {
  isValid: boolean;
  status: LicenseValidationStatus;
  license: LicensePayload | null;
  userPublicKey: string | null;
  ownershipVerified: boolean;
  isPerpetual: boolean;
  daysRemaining?: number;
  error?: string;
}

export interface UserIdentityKeyPair {
  publicKey: string;  // SPKI base64
  privateKey: string; // PKCS8 base64
  fingerprint: string; // SHA-256 hex fingerprint
  createdAt: string;
}
