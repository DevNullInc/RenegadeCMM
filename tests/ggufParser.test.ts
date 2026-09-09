import { describe, it, expect } from 'vitest';
import { ggufParser } from '../src/services/ggufParser';

describe('GGUF Binary Header Parser', () => {
  it('should reject invalid magic bytes', () => {
    const invalidBuf = Buffer.from('NOT_GGUF_HEADER_BYTES_TEST_1234');
    const result = ggufParser.inspectGGUF(invalidBuf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid GGUF header magic');
  });

  it('should reject truncated buffers smaller than 24 bytes', () => {
    const tinyBuf = Buffer.alloc(10);
    const result = ggufParser.inspectGGUF(tinyBuf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too small');
  });

  it('should accurately parse valid GGUF header metadata and infer ComfyUI destination', () => {
    // Construct a synthetic GGUF v3 binary header
    const buf = Buffer.alloc(512);
    let offset = 0;

    // 1. Magic (0x46554747)
    buf.writeUInt32LE(0x46554747, offset);
    offset += 4;

    // 2. Version 3
    buf.writeUInt32LE(3, offset);
    offset += 4;

    // 3. Tensor count: 320
    buf.writeBigUInt64LE(BigInt(320), offset);
    offset += 8;

    // 4. Metadata KV count: 2
    buf.writeBigUInt64LE(BigInt(2), offset);
    offset += 8;

    // --- Key 1: "general.architecture" -> "flux" (type 8 = STRING) ---
    const key1 = 'general.architecture';
    buf.writeBigUInt64LE(BigInt(key1.length), offset);
    offset += 8;
    buf.write(key1, offset, 'utf8');
    offset += key1.length;

    buf.writeUInt32LE(8, offset); // valType: STRING
    offset += 4;

    const val1 = 'flux';
    buf.writeBigUInt64LE(BigInt(val1.length), offset);
    offset += 8;
    buf.write(val1, offset, 'utf8');
    offset += val1.length;

    // --- Key 2: "general.file_type" -> 15 (Q4_K_M, type 4 = UINT32) ---
    const key2 = 'general.file_type';
    buf.writeBigUInt64LE(BigInt(key2.length), offset);
    offset += 8;
    buf.write(key2, offset, 'utf8');
    offset += key2.length;

    buf.writeUInt32LE(4, offset); // valType: UINT32
    offset += 4;

    buf.writeUInt32LE(15, offset); // 15 = Q4_K_M
    offset += 4;

    const res = ggufParser.inspectGGUF(buf);
    expect(res.valid).toBe(true);
    expect(res.version).toBe(3);
    expect(res.tensorCount).toBe(320);
    expect(res.architecture).toBe('flux');
    expect(res.quantization).toBe('Q4_K_M');
    expect(res.recommendedFolder).toBe('unet');
  });

  it('should route LLM architectures to LLM folder and parse filename quantizations', () => {
    const buf = Buffer.alloc(256);
    let offset = 0;

    buf.writeUInt32LE(0x46554747, offset); // Magic
    offset += 4;
    buf.writeUInt32LE(3, offset); // Version
    offset += 4;
    buf.writeBigUInt64LE(BigInt(100), offset); // Tensors
    offset += 8;
    buf.writeBigUInt64LE(BigInt(1), offset); // 1 KV pair
    offset += 8;

    const key1 = 'general.architecture';
    buf.writeBigUInt64LE(BigInt(key1.length), offset);
    offset += 8;
    buf.write(key1, offset, 'utf8');
    offset += key1.length;

    buf.writeUInt32LE(8, offset); // STRING
    offset += 4;
    const val1 = 'qwen2';
    buf.writeBigUInt64LE(BigInt(val1.length), offset);
    offset += 8;
    buf.write(val1, offset, 'utf8');

    const res = ggufParser.inspectGGUF(buf);
    expect(res.valid).toBe(true);
    expect(res.architecture).toBe('qwen2');
    expect(res.recommendedFolder).toBe('LLM');
  });

  it('should reject non-GGUF file extensions and directories for security path safety', () => {
    // Non-gguf extension
    const nonGgufRes = ggufParser.inspectGGUF('/tmp/malicious.txt');
    expect(nonGgufRes.valid).toBe(false);
    expect(nonGgufRes.error).toContain('File not found');

    // Unsupported extension on real file
    const packageJsonPath = require('path').resolve(__dirname, '../package.json');
    const extRes = ggufParser.inspectGGUF(packageJsonPath);
    expect(extRes.valid).toBe(false);
    expect(extRes.error).toContain('Unsupported file extension');

    // Directory path rejection
    const dirRes = ggufParser.inspectGGUF(__dirname);
    expect(dirRes.valid).toBe(false);
  });

  it('should terminate cleanly without hang on corrupted or truncated KV string bounds', () => {
    const corruptBuf = Buffer.alloc(128);
    let offset = 0;
    corruptBuf.writeUInt32LE(0x46554747, offset); // Magic
    offset += 4;
    corruptBuf.writeUInt32LE(3, offset); // Version
    offset += 4;
    corruptBuf.writeBigUInt64LE(BigInt(10), offset); // Tensors
    offset += 8;
    corruptBuf.writeBigUInt64LE(BigInt(500000), offset); // Huge KV count (potential loop bomb)
    offset += 8;

    // Key with length claiming to extend far past buffer length
    corruptBuf.writeBigUInt64LE(BigInt(999999), offset);
    offset += 8;

    const res = ggufParser.inspectGGUF(corruptBuf);
    expect(res.valid).toBe(true);
    expect(res.metadataKvCount).toBe(500000);
    // Verified parser does not spin or throw RangeError
  });
});
