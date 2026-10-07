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
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { dbManager } from '../db/db';
import { logger } from '../utils/logger';
import {
  getMachineEntropy,
  encryptKey,
  decryptKey,
} from '../utils/secureStorage';
import {
  LicensePayload,
  LicenseValidationResult,
  UserIdentityKeyPair,
  RevocationTombstone,
} from '../types/license';

/**
 * Official Licensor Master Public Key for RenegadeCMM (/dev/null Inc)
 * Ed25519 SubjectPublicKeyInfo (SPKI) Base64
 */
export const DEFAULT_LICENSOR_MASTER_PUBLIC_KEY =
  'MCowBQYDK2VwAyEAn8MKXhX4ZSwUroJOks4QCwD0kqXj5d0+jyip0skvWe4=';

export class LicenseService {
  private masterPublicKey: string;
  private static isLocallyRevoked = false;
  private static localRevocationReason = '';
  private static localRevokedAt = '';
  private static isCanaryExecuting = false;
  private static lastCanaryVerifiedAt = 0;
  private static readonly CANARY_VERIFICATION_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

  constructor(masterPublicKey = DEFAULT_LICENSOR_MASTER_PUBLIC_KEY) {
    this.masterPublicKey = masterPublicKey;
  }

  /**
   * Resets the in-memory tripwire latch exclusively for isolated unit/integration test suites.
   */
  public static resetLocalRevocationForTesting(): void {
    LicenseService.isLocallyRevoked = false;
    LicenseService.localRevocationReason = '';
    LicenseService.localRevokedAt = '';
    LicenseService.isCanaryExecuting = false;
    LicenseService.lastCanaryVerifiedAt = 0;
  }

  /**
   * Resolves the disk path for the hardware-bound revocation tombstone vault file.
   */
  private getTombstoneFilePath(): string {
    const dbPath = dbManager.getDbPath();
    if (!dbPath || dbPath === ':memory:') {
      return '';
    }
    return path.join(path.dirname(dbPath), '.cmm_tombstone.vault');
  }

  /**
   * Evaluates whether this local client machine has been tombstoned / revoked due to
   * an integrity violation, memory hooking, or hardware tampering.
   */
  public async isMachineRevoked(): Promise<{
    isRevoked: boolean;
    reason?: string;
    revokedAt?: string;
    toxicHash?: string;
  }> {
    // 1. Fast in-memory tripwire check
    if (LicenseService.isLocallyRevoked) {
      return {
        isRevoked: true,
        reason: LicenseService.localRevocationReason || 'Memory revocation tripwire active',
        revokedAt: LicenseService.localRevokedAt,
      };
    }

    const currentEntropy = getMachineEntropy();
    const currentToxicHash = crypto
      .createHash('sha256')
      .update(`TOXIC:${currentEntropy}`)
      .digest('hex');

    // 2. Check SQLite database persistent tombstone
    try {
      const dbTombstone = await dbManager.getConfigValue('machine_revocation_tombstone');
      const dbToxicHash = await dbManager.getConfigValue('revocation_toxic_hash');
      if (dbTombstone) {
        const decrypted = decryptKey(dbTombstone);
        if (decrypted && decrypted.startsWith('{')) {
          const parsed: RevocationTombstone = JSON.parse(decrypted);
          if (
            parsed.revoked &&
            (parsed.machineEntropy === currentEntropy || parsed.toxicHash === currentToxicHash)
          ) {
            LicenseService.isLocallyRevoked = true;
            LicenseService.localRevocationReason = parsed.reason;
            LicenseService.localRevokedAt = parsed.revokedAt;
            return {
              isRevoked: true,
              reason: parsed.reason,
              revokedAt: parsed.revokedAt,
              toxicHash: parsed.toxicHash,
            };
          }
        }
      } else if (dbToxicHash && dbToxicHash === currentToxicHash) {
        LicenseService.isLocallyRevoked = true;
        LicenseService.localRevocationReason = 'Toxic machine hash flag matched in identity store';
        return { isRevoked: true, reason: LicenseService.localRevocationReason, toxicHash: dbToxicHash };
      }
    } catch (err) {
      logger.warn('Error reading database revocation tombstone:', err);
    }

    // 3. Check persistent disk vault tombstone file
    try {
      const tombstoneFile = this.getTombstoneFilePath();
      if (tombstoneFile && fs.existsSync(tombstoneFile)) {
        const rawVault = fs.readFileSync(tombstoneFile, 'utf8');
        const decrypted = decryptKey(rawVault.trim());
        if (decrypted && decrypted.startsWith('{')) {
          const parsed: RevocationTombstone = JSON.parse(decrypted);
          if (
            parsed.revoked &&
            (parsed.machineEntropy === currentEntropy || parsed.toxicHash === currentToxicHash)
          ) {
            LicenseService.isLocallyRevoked = true;
            LicenseService.localRevocationReason = parsed.reason;
            LicenseService.localRevokedAt = parsed.revokedAt;
            return {
              isRevoked: true,
              reason: parsed.reason,
              revokedAt: parsed.revokedAt,
              toxicHash: parsed.toxicHash,
            };
          }
        }
      }
    } catch (err) {
      logger.warn('Error reading disk vault revocation tombstone:', err);
    }

    return { isRevoked: false };
  }

  /**
   * Fires the local revocation payload directly into the machine's hardware-bound identity store,
   * writes the poison revocation tombstone, wipes secrets and cached keys, and flags the machine
   * hash as permanently toxic.
   */
  public async burnLocalState(reason: string): Promise<{ success: boolean; toxicHash: string }> {
    const currentEntropy = getMachineEntropy();
    const toxicHash = crypto
      .createHash('sha256')
      .update(`TOXIC:${currentEntropy}`)
      .digest('hex');
    const revokedAt = new Date().toISOString();

    LicenseService.isLocallyRevoked = true;
    LicenseService.localRevocationReason = reason;
    LicenseService.localRevokedAt = revokedAt;

    const tombstone: RevocationTombstone = {
      revoked: true,
      toxicHash,
      machineEntropy: currentEntropy,
      reason,
      revokedAt,
      toxicNonce: crypto.randomBytes(32).toString('hex'),
    };

    const encryptedTombstone = encryptKey(JSON.stringify(tombstone));

    // 1. Write encrypted tombstone and toxic flag into SQLite
    try {
      await dbManager.setConfigValue('machine_revocation_tombstone', encryptedTombstone);
      await dbManager.setConfigValue('revocation_toxic_hash', toxicHash);
      // Wipe credentials and keys
      await dbManager.setConfigValue('license_key', 'REVOKED_TOXIC_TOMBSTONE');
      await dbManager.setConfigValue('user_identity_keypair', 'REVOKED_TOXIC_TOMBSTONE');
      await dbManager.setConfigValue('civitai_api_key', '');
      await dbManager.setConfigValue('huggingface_token', '');
    } catch (err) {
      logger.error('Failed to write revocation tombstone to SQLite database:', err);
    }

    // 2. Write tombstone directly to encrypted hardware vault file on disk
    try {
      const tombstoneFile = this.getTombstoneFilePath();
      if (tombstoneFile) {
        fs.writeFileSync(tombstoneFile, encryptedTombstone, 'utf8');
      }
    } catch (err) {
      logger.error('Failed to write revocation vault tombstone to disk:', err);
    }

    logger.error(
      `[SECURITY ALERT] LOCAL REVOCATION PAYLOAD EXECUTED: ${reason}. Machine flagged as toxic (${toxicHash.slice(0, 16)}...). State burned.`
    );
    return { success: true, toxicHash };
  }

  /**
   * Executes internal cryptographic canary validations and function integrity checks.
   * If function hijacking, return-value spoofing, or canary bypass is detected, burns local state immediately.
   * Supports TTL throttling to avoid running Ed25519 keypair generation on hot loops or UI renders.
   */
  public async verifyIntegrityCanary(forceCheck = false): Promise<{ passed: boolean; error?: string }> {
    if (LicenseService.isCanaryExecuting) {
      return { passed: true };
    }

    // Fast-path TTL throttle: Skip redundant Ed25519 key generation if recently verified
    if (
      !forceCheck &&
      LicenseService.lastCanaryVerifiedAt > 0 &&
      Date.now() - LicenseService.lastCanaryVerifiedAt < LicenseService.CANARY_VERIFICATION_TTL_MS
    ) {
      return { passed: true };
    }

    LicenseService.isCanaryExecuting = true;

    try {
      // 1. Check method and prototype integrity
      if (
        typeof this.verifyLicense !== 'function' ||
        typeof this.signChallenge !== 'function' ||
        typeof this.verifyChallenge !== 'function' ||
        typeof crypto.verify !== 'function' ||
        typeof crypto.sign !== 'function'
      ) {
        await this.burnLocalState('INTEGRITY_TAMPER_DETECTED: Critical cryptographic methods replaced or missing');
        return { passed: false, error: 'Function definition tampering' };
      }

      // 2. Cryptographic canary self-test vector with temporary canary keypair
      const canaryKeyPair = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const canaryMasterPubDerBase64 = crypto
        .createPublicKey(canaryKeyPair.publicKey)
        .export({ type: 'spki', format: 'der' })
        .toString('base64');

      const canaryUserKeyPair = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'der' },
      });
      const canaryUserPubKeyBase64 = canaryUserKeyPair.publicKey.toString('base64');

      // 2a. Issue genuine canary token
      const validCanaryToken = this.issueLicense(
        {
          licenseId: 'CANARY-GENUINE-0001',
          type: 'single-user',
          licensee: 'Canary Test',
          email: 'canary@renegadeinc.net',
          userPublicKey: canaryUserPubKeyBase64,
          issuedAt: new Date().toISOString(),
          expiresAt: null,
          seats: 1,
          features: ['canary'],
        },
        canaryKeyPair.privateKey
      );

      // Verify genuine canary token with canary master pub key
      const validCheck = await this.verifyLicense(validCanaryToken, {
        customMasterPublicKey: canaryMasterPubDerBase64,
        expectedUserPublicKey: canaryUserPubKeyBase64,
        verifyOwnership: false,
        skipCanary: true,
      });

      if (!validCheck.isValid || validCheck.status !== 'valid') {
        await this.burnLocalState('INTEGRITY_TAMPER_DETECTED: Canary valid signature validation failed');
        return { passed: false, error: 'Canary valid signature rejected' };
      }

      // 2b. Forge / corrupt canary token (corrupt signature)
      const tokenParts = validCanaryToken.split('.');
      const corruptSignature = this.toBase64Url(crypto.randomBytes(64));
      const corruptedCanaryToken = `CMM1.${tokenParts[1]}.${corruptSignature}`;

      const corruptCheck = await this.verifyLicense(corruptedCanaryToken, {
        customMasterPublicKey: canaryMasterPubDerBase64,
        expectedUserPublicKey: canaryUserPubKeyBase64,
        verifyOwnership: false,
        skipCanary: true,
      });

      // If the verification function claimed the corrupted/forged token is VALID, the verification routine was spoofed / no-op hooked!
      if (corruptCheck.isValid || corruptCheck.status === 'valid') {
        await this.burnLocalState(
          'INTEGRITY_TAMPER_DETECTED: Canary detected spoofed verification routine returning true for invalid signature'
        );
        return { passed: false, error: 'Verification routine spoofed / hooked' };
      }

      LicenseService.lastCanaryVerifiedAt = Date.now();
      return { passed: true };
    } catch (err: any) {
      await this.burnLocalState(
        `INTEGRITY_TAMPER_DETECTED: Canary execution failure: ${err?.message || 'Unknown error'}`
      );
      return { passed: false, error: err?.message || 'Canary exception' };
    } finally {
      LicenseService.isCanaryExecuting = false;
    }
  }

  /**
   * Encodes a buffer or string into URL-safe Base64 without padding.
   */
  private toBase64Url(input: Buffer | string): string {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    return buf.toString('base64url');
  }

  /**
   * Decodes a URL-safe Base64 string into a Buffer.
   */
  private fromBase64Url(input: string): Buffer {
    return Buffer.from(input, 'base64url');
  }

  /**
   * Produces a deterministic canonical JSON string representation of a payload.
   */
  public canonicalizePayload(payload: LicensePayload): string {
    const sortedKeys = Object.keys(payload).sort();
    const ordered: Record<string, any> = {};
    for (const key of sortedKeys) {
      ordered[key] = (payload as any)[key];
    }
    return JSON.stringify(ordered);
  }

  /**
   * Retrieves or automatically generates the persistent Ed25519 User Identity KeyPair for this client machine.
   */
  public async getOrCreateUserKeyPair(): Promise<UserIdentityKeyPair> {
    const revocation = await this.isMachineRevoked();
    if (revocation.isRevoked) {
      throw new Error(`Machine is revoked due to security integrity violation: ${revocation.reason}`);
    }

    const existingRaw = await dbManager.getConfigValue('user_identity_keypair');
    if (existingRaw && existingRaw !== 'REVOKED_TOXIC_TOMBSTONE') {
      try {
        const parsed: UserIdentityKeyPair = JSON.parse(existingRaw);
        if (parsed.publicKey && parsed.privateKey) {
          return parsed;
        }
      } catch (err) {
        logger.warn('Failed to parse stored user identity keypair, generating a fresh keypair:', err);
      }
    }

    // Generate fresh Ed25519 KeyPair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Derive compact base64 representation and SHA-256 fingerprint
    const pubSpkiBase64 = crypto
      .createPublicKey(publicKey)
      .export({ type: 'spki', format: 'der' })
      .toString('base64');

    const privPkcs8Base64 = crypto
      .createPrivateKey(privateKey)
      .export({ type: 'pkcs8', format: 'der' })
      .toString('base64');

    const fingerprint = crypto
      .createHash('sha256')
      .update(Buffer.from(pubSpkiBase64, 'base64'))
      .digest('hex');

    const keyPair: UserIdentityKeyPair = {
      publicKey: pubSpkiBase64,
      privateKey: privPkcs8Base64,
      fingerprint,
      createdAt: new Date().toISOString(),
    };

    await dbManager.setConfigValue('user_identity_keypair', JSON.stringify(keyPair));
    logger.info(`Initialized user signature keypair with fingerprint: ${fingerprint.slice(0, 16)}...`);
    return keyPair;
  }

  /**
   * Returns the local user's public signature key.
   */
  public async getUserPublicKey(): Promise<string> {
    const keyPair = await this.getOrCreateUserKeyPair();
    return keyPair.publicKey;
  }

  /**
   * Signs a cryptographic challenge using the local user's private key to prove ownership.
   */
  public async signChallenge(challengeString: string): Promise<string> {
    const keyPair = await this.getOrCreateUserKeyPair();
    const privateKey = crypto.createPrivateKey({
      key: Buffer.from(keyPair.privateKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });

    const signature = crypto.sign(null, Buffer.from(challengeString, 'utf8'), privateKey);
    return signature.toString('base64');
  }

  /**
   * Verifies an ownership challenge signed with an Ed25519 public key.
   */
  public verifyChallenge(
    challengeString: string,
    signatureBase64: string,
    publicKeyBase64: string
  ): boolean {
    try {
      const publicKey = crypto.createPublicKey({
        key: Buffer.from(publicKeyBase64, 'base64'),
        format: 'der',
        type: 'spki',
      });
      const sigBuf = Buffer.from(signatureBase64, 'base64');
      return crypto.verify(null, Buffer.from(challengeString, 'utf8'), publicKey, sigBuf);
    } catch (err) {
      logger.warn('Challenge verification error:', err);
      return false;
    }
  }

  /**
   * Issues and cryptographically signs a new License Token (Licensor Master function).
   */
  public issueLicense(
    payloadData: Omit<LicensePayload, 'v'>,
    masterPrivateKey: crypto.KeyLike | string | Buffer
  ): string {
    const fullPayload: LicensePayload = {
      v: 1,
      ...payloadData,
    };

    const canonicalJson = this.canonicalizePayload(fullPayload);
    const payloadBuffer = Buffer.from(canonicalJson, 'utf8');

    let privateKeyObj: crypto.KeyObject;
    if (typeof masterPrivateKey === 'string' || Buffer.isBuffer(masterPrivateKey)) {
      try {
        privateKeyObj = crypto.createPrivateKey(masterPrivateKey);
      } catch {
        privateKeyObj = crypto.createPrivateKey({
          key: Buffer.isBuffer(masterPrivateKey) ? masterPrivateKey : Buffer.from(masterPrivateKey, 'base64'),
          format: 'der',
          type: 'pkcs8',
        });
      }
    } else {
      privateKeyObj = masterPrivateKey;
    }

    const signature = crypto.sign(null, payloadBuffer, privateKeyObj);
    const encodedPayload = this.toBase64Url(payloadBuffer);
    const encodedSignature = this.toBase64Url(signature);

    return `CMM1.${encodedPayload}.${encodedSignature}`;
  }

  /**
   * Cryptographically verifies a License Token against the Licensor Master Public Key
   * and validates that it is bound to the expected user's public signature key.
   */
  public async verifyLicense(
    licenseToken: string,
    options: {
      expectedUserPublicKey?: string;
      verifyOwnership?: boolean;
      customMasterPublicKey?: string;
      now?: Date;
      skipCanary?: boolean;
      forceCanary?: boolean;
    } = {}
  ): Promise<LicenseValidationResult> {
    const now = options.now || new Date();
    const activeMasterKeyBase64 = options.customMasterPublicKey || this.masterPublicKey;

    // 0a. Check if this machine is tombstoned / revoked
    const revocation = await this.isMachineRevoked();
    if (revocation.isRevoked) {
      return {
        isValid: false,
        status: 'revoked',
        license: null,
        userPublicKey: null,
        ownershipVerified: false,
        isPerpetual: false,
        error: `Machine is permanently revoked due to security integrity violation: ${revocation.reason || 'Hardware tombstone present'}`,
      };
    }

    // 0b. Run cryptographic canary unless skipped for internal canary calls
    if (!options.skipCanary) {
      const canaryResult = await this.verifyIntegrityCanary(options.forceCanary || false);
      if (!canaryResult.passed) {
        return {
          isValid: false,
          status: 'revoked',
          license: null,
          userPublicKey: null,
          ownershipVerified: false,
          isPerpetual: false,
          error: `Security integrity check failed: ${canaryResult.error}`,
        };
      }
    }

    let localUserPubKey: string | null = null;
    try {
      localUserPubKey = await this.getUserPublicKey();
    } catch {
      localUserPubKey = null;
    }

    const expectedUserPubKey = options.expectedUserPublicKey || localUserPubKey;

    if (!licenseToken || typeof licenseToken !== 'string' || !licenseToken.trim()) {
      return {
        isValid: false,
        status: 'unregistered',
        license: null,
        userPublicKey: localUserPubKey,
        ownershipVerified: false,
        isPerpetual: false,
        error: 'No license key configured',
      };
    }

    const parts = licenseToken.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'CMM1') {
      return {
        isValid: false,
        status: 'malformed',
        license: null,
        userPublicKey: localUserPubKey,
        ownershipVerified: false,
        isPerpetual: false,
        error: 'Invalid license format. Expected CMM1 token.',
      };
    }

    const [, payloadB64, sigB64] = parts;
    let payload: LicensePayload;
    let payloadBuffer: Buffer;
    let signatureBuffer: Buffer;

    try {
      payloadBuffer = this.fromBase64Url(payloadB64);
      signatureBuffer = this.fromBase64Url(sigB64);
      payload = JSON.parse(payloadBuffer.toString('utf8'));
    } catch (err: any) {
      return {
        isValid: false,
        status: 'malformed',
        license: null,
        userPublicKey: localUserPubKey,
        ownershipVerified: false,
        isPerpetual: false,
        error: `Failed to decode license payload: ${err?.message || 'Invalid JSON'}`,
      };
    }

    // 1. Verify Master Signature
    try {
      const masterPubKeyObj = crypto.createPublicKey({
        key: Buffer.from(activeMasterKeyBase64, 'base64'),
        format: 'der',
        type: 'spki',
      });

      const isSignatureValid = crypto.verify(null, payloadBuffer, masterPubKeyObj, signatureBuffer);
      if (!isSignatureValid) {
        return {
          isValid: false,
          status: 'invalid_signature',
          license: payload,
          userPublicKey: localUserPubKey,
          ownershipVerified: false,
          isPerpetual: false,
          error: 'License signature verification failed. Token may be forged or corrupted.',
        };
      }
    } catch (sigErr: any) {
      return {
        isValid: false,
        status: 'invalid_signature',
        license: payload,
        userPublicKey: localUserPubKey,
        ownershipVerified: false,
        isPerpetual: false,
        error: `Master key verification error: ${sigErr?.message || 'Invalid master public key'}`,
      };
    }

    // 2. Verify User Public Key Binding
    if (expectedUserPubKey) {
      const normLicenseKey = payload.userPublicKey ? payload.userPublicKey.trim() : '';
      const normExpectedKey = expectedUserPubKey.trim();

      if (normLicenseKey !== normExpectedKey) {
        return {
          isValid: false,
          status: 'key_mismatch',
          license: payload,
          userPublicKey: localUserPubKey,
          ownershipVerified: false,
          isPerpetual: false,
          error: 'License is registered to a different public signature key.',
        };
      }
    }

    // 3. Optional: Verify Local Key Ownership (Challenge-Response)
    let ownershipVerified = true;
    if (options.verifyOwnership !== false && localUserPubKey && payload.userPublicKey === localUserPubKey) {
      try {
        const nonce = `cmm-verify-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
        const challengeSig = await this.signChallenge(nonce);
        ownershipVerified = this.verifyChallenge(nonce, challengeSig, localUserPubKey);
        if (!ownershipVerified) {
          return {
            isValid: false,
            status: 'key_mismatch',
            license: payload,
            userPublicKey: localUserPubKey,
            ownershipVerified: false,
            isPerpetual: false,
            error: 'Local machine failed cryptographic proof-of-ownership for user public key.',
          };
        }
      } catch (err: any) {
        logger.warn('Ownership proof check encountered error:', err);
      }
    }

    // 4. Verify Clock Skew & Expiration
    const issuedAtDate = new Date(payload.issuedAt);
    if (isNaN(issuedAtDate.getTime())) {
      return {
        isValid: false,
        status: 'malformed',
        license: payload,
        userPublicKey: localUserPubKey,
        ownershipVerified,
        isPerpetual: false,
        error: 'License has invalid issuedAt timestamp.',
      };
    }

    // Future issuance protection (> 5 minutes clock skew)
    if (issuedAtDate.getTime() > now.getTime() + 300000) {
      return {
        isValid: false,
        status: 'malformed',
        license: payload,
        userPublicKey: localUserPubKey,
        ownershipVerified,
        isPerpetual: false,
        error: 'License issue date is in the future.',
      };
    }

    let daysRemaining: number | undefined;
    const isPerpetual = !payload.expiresAt;

    if (payload.expiresAt) {
      const expiresAtDate = new Date(payload.expiresAt);
      if (isNaN(expiresAtDate.getTime())) {
        return {
          isValid: false,
          status: 'malformed',
          license: payload,
          userPublicKey: localUserPubKey,
          ownershipVerified,
          isPerpetual: false,
          error: 'License has invalid expiresAt timestamp.',
        };
      }

      const diffMs = expiresAtDate.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      if (diffMs <= 0) {
        return {
          isValid: false,
          status: 'expired',
          license: payload,
          userPublicKey: localUserPubKey,
          ownershipVerified,
          isPerpetual: false,
          daysRemaining: 0,
          error: `License expired on ${expiresAtDate.toISOString().split('T')[0]}.`,
        };
      }
    }

    return {
      isValid: true,
      status: 'valid',
      license: payload,
      userPublicKey: localUserPubKey,
      ownershipVerified,
      isPerpetual,
      daysRemaining,
    };
  }

  /**
   * Activates and persists a License Token into SQLite database.
   * Forces a live cryptographic canary run during activation.
   */
  public async activateLicense(licenseToken: string): Promise<LicenseValidationResult> {
    const validation = await this.verifyLicense(licenseToken, { forceCanary: true });
    if (!validation.isValid) {
      return validation;
    }

    await dbManager.setConfigValue('license_key', licenseToken.trim());
    logger.info(
      `Activated license ${validation.license?.licenseId} for ${validation.license?.licensee} (${validation.license?.type})`
    );
    return validation;
  }

  /**
   * Deactivates and removes any active License Token from the SQLite database.
   */
  public async deactivateLicense(): Promise<{ success: boolean }> {
    await dbManager.setConfigValue('license_key', '');
    logger.info('Deactivated local license key');
    return { success: true };
  }

  /**
   * Checks and returns the currently configured active license status.
   */
  public async getActiveLicenseStatus(): Promise<LicenseValidationResult> {
    const revocation = await this.isMachineRevoked();
    if (revocation.isRevoked) {
      return {
        isValid: false,
        status: 'revoked',
        license: null,
        userPublicKey: null,
        ownershipVerified: false,
        isPerpetual: false,
        error: `Machine is permanently revoked: ${revocation.reason || 'Integrity violation'}`,
      };
    }

    const storedKey = await dbManager.getConfigValue('license_key');
    if (!storedKey || !storedKey.trim() || storedKey === 'REVOKED_TOXIC_TOMBSTONE') {
      let localUserPubKey: string | null = null;
      try {
        localUserPubKey = await this.getUserPublicKey();
      } catch {
        localUserPubKey = null;
      }

      return {
        isValid: false,
        status: 'unregistered',
        license: null,
        userPublicKey: localUserPubKey,
        ownershipVerified: true,
        isPerpetual: false,
      };
    }

    return this.verifyLicense(storedKey);
  }
}

export const licenseService = new LicenseService();
