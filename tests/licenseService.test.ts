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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { dbManager } from '../src/db/db';
import { LicenseService, DEFAULT_LICENSOR_MASTER_PUBLIC_KEY } from '../src/services/licenseService';

describe('LicenseService Cryptographic Verification Engine', () => {
  let licenseService: LicenseService;
  let testMasterPublicKeyPem: string;
  let testMasterPrivateKeyPem: string;
  let testMasterPublicKeyDerBase64: string;

  beforeEach(async () => {
    LicenseService.resetLocalRevocationForTesting();
    // Initialize in-memory SQLite database
    await dbManager.init(':memory:');

    // Generate a fresh Ed25519 Test Master Keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    testMasterPublicKeyPem = publicKey;
    testMasterPrivateKeyPem = privateKey;
    testMasterPublicKeyDerBase64 = crypto
      .createPublicKey(publicKey)
      .export({ type: 'spki', format: 'der' })
      .toString('base64');

    licenseService = new LicenseService(testMasterPublicKeyDerBase64);
  });

  afterEach(async () => {
    LicenseService.resetLocalRevocationForTesting();
    await dbManager.close();
  });

  it('should generate and persist user identity keypair with valid fingerprint', async () => {
    const keyPair = await licenseService.getOrCreateUserKeyPair();
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
    expect(keyPair.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const userPubKey = await licenseService.getUserPublicKey();
    expect(userPubKey).toBe(keyPair.publicKey);

    // Re-retrieval should return the same keypair
    const reloaded = await licenseService.getOrCreateUserKeyPair();
    expect(reloaded.publicKey).toBe(keyPair.publicKey);
    expect(reloaded.fingerprint).toBe(keyPair.fingerprint);
  });

  it('should successfully sign and verify challenge proof of ownership', async () => {
    const keyPair = await licenseService.getOrCreateUserKeyPair();
    const nonce = `test-challenge-${Date.now()}`;

    const signature = await licenseService.signChallenge(nonce);
    expect(signature).toBeDefined();

    const isOwner = licenseService.verifyChallenge(nonce, signature, keyPair.publicKey);
    expect(isOwner).toBe(true);

    // Tampered nonce should fail
    const isTampered = licenseService.verifyChallenge('different-nonce', signature, keyPair.publicKey);
    expect(isTampered).toBe(false);
  });

  it('should validate a genuine single-user perpetual license tied to user public key', async () => {
    const userPubKey = await licenseService.getUserPublicKey();

    const licenseToken = licenseService.issueLicense(
      {
        licenseId: 'CMM-PRO-2026-0001',
        type: 'single-user',
        licensee: 'Solo Creator',
        email: 'creator@example.com',
        userPublicKey: userPubKey,
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        seats: 1,
        features: ['*'],
      },
      testMasterPrivateKeyPem
    );

    expect(licenseToken.startsWith('CMM1.')).toBe(true);

    const validation = await licenseService.verifyLicense(licenseToken);
    expect(validation.isValid).toBe(true);
    expect(validation.status).toBe('valid');
    expect(validation.isPerpetual).toBe(true);
    expect(validation.ownershipVerified).toBe(true);
    expect(validation.license?.licensee).toBe('Solo Creator');
    expect(validation.license?.type).toBe('single-user');
  });

  it('should validate a time-limited subscription license and calculate remaining days', async () => {
    const userPubKey = await licenseService.getUserPublicKey();
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const licenseToken = licenseService.issueLicense(
      {
        licenseId: 'CMM-SUB-2026-0030',
        type: 'single-user',
        licensee: 'Evaluating User',
        email: 'eval@example.com',
        userPublicKey: userPubKey,
        issuedAt: new Date().toISOString(),
        expiresAt: in30Days,
        seats: 1,
        features: ['all'],
      },
      testMasterPrivateKeyPem
    );

    const validation = await licenseService.verifyLicense(licenseToken);
    expect(validation.isValid).toBe(true);
    expect(validation.status).toBe('valid');
    expect(validation.isPerpetual).toBe(false);
    expect(validation.daysRemaining).toBeGreaterThanOrEqual(29);
    expect(validation.daysRemaining).toBeLessThanOrEqual(31);
  });

  it('should reject an expired license', async () => {
    const userPubKey = await licenseService.getUserPublicKey();
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(); // 1 day ago

    const licenseToken = licenseService.issueLicense(
      {
        licenseId: 'CMM-EXP-0001',
        type: 'single-user',
        licensee: 'Expired User',
        email: 'expired@example.com',
        userPublicKey: userPubKey,
        issuedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
        expiresAt: pastDate,
        seats: 1,
        features: ['*'],
      },
      testMasterPrivateKeyPem
    );

    const validation = await licenseService.verifyLicense(licenseToken);
    expect(validation.isValid).toBe(false);
    expect(validation.status).toBe('expired');
    expect(validation.daysRemaining).toBe(0);
    expect(validation.error).toContain('License expired');
  });

  it('should reject a license registered to a different user public key (key_mismatch)', async () => {
    // Generate a different third-party keypair
    const foreignKeyPair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    const foreignPublicKeyBase64 = foreignKeyPair.publicKey.toString('base64');

    const licenseToken = licenseService.issueLicense(
      {
        licenseId: 'CMM-STOLEN-0001',
        type: 'single-user',
        licensee: 'Other Person',
        email: 'other@example.com',
        userPublicKey: foreignPublicKeyBase64, // Different key than local user
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        seats: 1,
        features: ['*'],
      },
      testMasterPrivateKeyPem
    );

    const validation = await licenseService.verifyLicense(licenseToken);
    expect(validation.isValid).toBe(false);
    expect(validation.status).toBe('key_mismatch');
    expect(validation.error).toContain('registered to a different public signature key');
  });

  it('should reject a tampered license payload (invalid_signature)', async () => {
    const userPubKey = await licenseService.getUserPublicKey();

    const licenseToken = licenseService.issueLicense(
      {
        licenseId: 'CMM-TAMPER-0001',
        type: 'single-user',
        licensee: 'Legit User',
        email: 'user@example.com',
        userPublicKey: userPubKey,
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        seats: 1,
        features: ['*'],
      },
      testMasterPrivateKeyPem
    );

    // Tamper with payload (modify seats to 100)
    const parts = licenseToken.split('.');
    const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    decodedPayload.seats = 100;
    decodedPayload.licensee = 'Pirate';
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(decodedPayload), 'utf8').toString('base64url');

    const tamperedToken = `CMM1.${tamperedPayloadB64}.${parts[2]}`;

    const validation = await licenseService.verifyLicense(tamperedToken);
    expect(validation.isValid).toBe(false);
    expect(validation.status).toBe('invalid_signature');
    expect(validation.error).toContain('License signature verification failed');
  });

  it('should activate, query, and deactivate license in SQLite database', async () => {
    const userPubKey = await licenseService.getUserPublicKey();

    // Initial state: unregistered
    const initialStatus = await licenseService.getActiveLicenseStatus();
    expect(initialStatus.isValid).toBe(false);
    expect(initialStatus.status).toBe('unregistered');

    const licenseToken = licenseService.issueLicense(
      {
        licenseId: 'CMM-ACTIVE-0001',
        type: 'single-user',
        licensee: 'Active Licensee',
        email: 'active@example.com',
        userPublicKey: userPubKey,
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        seats: 1,
        features: ['*'],
      },
      testMasterPrivateKeyPem
    );

    // Activate
    const activationResult = await licenseService.activateLicense(licenseToken);
    expect(activationResult.isValid).toBe(true);
    expect(activationResult.status).toBe('valid');

    // Query active status
    const currentStatus = await licenseService.getActiveLicenseStatus();
    expect(currentStatus.isValid).toBe(true);
    expect(currentStatus.license?.licenseId).toBe('CMM-ACTIVE-0001');

    // Deactivate
    const deactivation = await licenseService.deactivateLicense();
    expect(deactivation.success).toBe(true);

    const postStatus = await licenseService.getActiveLicenseStatus();
    expect(postStatus.isValid).toBe(false);
    expect(postStatus.status).toBe('unregistered');
  });

  it('should handle malformed and garbage input tokens cleanly', async () => {
    const emptyResult = await licenseService.verifyLicense('');
    expect(emptyResult.isValid).toBe(false);
    expect(emptyResult.status).toBe('unregistered');

    const garbageResult = await licenseService.verifyLicense('not-a-valid-token');
    expect(garbageResult.isValid).toBe(false);
    expect(garbageResult.status).toBe('malformed');

    const badJsonResult = await licenseService.verifyLicense('CMM1.bm90LWpzb24.c2lnbmF0dXJl');
    expect(badJsonResult.isValid).toBe(false);
    expect(badJsonResult.status).toBe('malformed');
  });

  it('should pass cryptographic canary integrity check on uncompromised runtime', async () => {
    const canaryResult = await licenseService.verifyIntegrityCanary();
    expect(canaryResult.passed).toBe(true);
    expect(canaryResult.error).toBeUndefined();

    const revocation = await licenseService.isMachineRevoked();
    expect(revocation.isRevoked).toBe(false);
  });

  it('should write poison revocation tombstone, flag machine toxic, and wipe credentials when burnLocalState is invoked', async () => {
    const userPubKey = await licenseService.getUserPublicKey();
    expect(userPubKey).toBeDefined();

    // Set some secrets in DB
    await dbManager.setConfigValue('civitai_api_key', 'test-civitai-key-12345');
    await dbManager.setConfigValue('huggingface_token', 'hf_test_token_secret');

    // Burn state
    const burnResult = await licenseService.burnLocalState('Manual security tripwire test');
    expect(burnResult.success).toBe(true);
    expect(burnResult.toxicHash).toMatch(/^[a-f0-9]{64}$/);

    // Verify secrets wiped
    const wipedCivitai = await dbManager.getConfigValue('civitai_api_key');
    const wipedHf = await dbManager.getConfigValue('huggingface_token');
    expect(wipedCivitai).toBe('');
    expect(wipedHf).toBe('');

    // Verify machine is permanently marked revoked
    const revCheck = await licenseService.isMachineRevoked();
    expect(revCheck.isRevoked).toBe(true);
    expect(revCheck.reason).toContain('Manual security tripwire test');

    // License operations should now refuse and return 'revoked'
    const status = await licenseService.getActiveLicenseStatus();
    expect(status.isValid).toBe(false);
    expect(status.status).toBe('revoked');
    expect(status.error).toContain('permanently revoked');

    // User keypair generation should throw on revoked machine
    await expect(licenseService.getOrCreateUserKeyPair()).rejects.toThrow(/revoked due to security integrity violation/);
  });

  it('should detect hooked verification function returning true for invalid signatures, trigger tripwire, and lock out the client', async () => {
    // Simulate a cracker monkey-patching crypto.verify or verifyLicense to return true
    const originalCryptoVerify = crypto.verify;
    try {
      // Mock crypto.verify to always return true (simulating no-op / hook attack)
      (crypto as any).verify = () => true;

      // Executing canary on compromised runtime
      const canaryResult = await licenseService.verifyIntegrityCanary();
      expect(canaryResult.passed).toBe(false);
      expect(canaryResult.error).toContain('spoofed');

      // Machine should now be toxic and burned
      const revocation = await licenseService.isMachineRevoked();
      expect(revocation.isRevoked).toBe(true);
      expect(revocation.reason).toContain('Canary detected spoofed verification routine');
    } finally {
      // Restore native crypto.verify
      (crypto as any).verify = originalCryptoVerify;
    }
  });

  it('should successfully verify default licensor master public key format and valid tokens', async () => {
    const defaultService = new LicenseService();
    expect(DEFAULT_LICENSOR_MASTER_PUBLIC_KEY).toBe(
      'MCowBQYDK2VwAyEAn8MKXhX4ZSwUroJOks4QCwD0kqXj5d0+jyip0skvWe4='
    );

    // Verify that the default master public key parses as a valid SPKI Ed25519 key
    const pubKey = crypto.createPublicKey({
      key: Buffer.from(DEFAULT_LICENSOR_MASTER_PUBLIC_KEY, 'base64'),
      format: 'der',
      type: 'spki',
    });
    expect(pubKey.asymmetricKeyType).toBe('ed25519');
  });
});


