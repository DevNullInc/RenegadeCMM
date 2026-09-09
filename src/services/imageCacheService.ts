/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { app } from 'electron';
import { logger } from '../utils/logger';

interface CachedImageEntry {
  buffer: Buffer;
  contentType: string;
  timestamp: number;
}

export class ImageCacheService {
  private libraryCacheDir: string;
  private browseSessionCache: Map<string, CachedImageEntry> = new Map();
  private maxBrowseEntries: number = 500;
  private inflightRequests: Map<string, Promise<{ buffer: Buffer; contentType: string } | null>> = new Map();
  private readonly allowedImageHosts: string[] = [
    'civitai.com',
    'image.civitai.com',
    'images.civitai.com',
    'cdn.civitai.com',
    'huggingface.co',
    'cdn-lfs.huggingface.co',
    'githubusercontent.com',
    'raw.githubusercontent.com',
    'user-images.githubusercontent.com',
    'github.com',
  ];

  constructor() {
    let baseDir = process.cwd();
    try {
      if (app && typeof app.getPath === 'function') {
        baseDir = app.getPath('userData');
      }
    } catch {
      baseDir = process.cwd();
    }
    this.libraryCacheDir = path.join(baseDir, 'cache', 'library_thumbnails');
    this.ensureDirectory(this.libraryCacheDir);
  }

  private ensureDirectory(dir: string) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      logger.warn(`Failed to create image cache directory at ${dir}:`, err);
    }
  }

  private hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url.trim()).digest('hex');
  }

  private getDiskPaths(url: string): { dataPath: string; metaPath: string } {
    const hash = this.hashUrl(url);
    return {
      dataPath: path.join(this.libraryCacheDir, `${hash}.bin`),
      metaPath: path.join(this.libraryCacheDir, `${hash}.meta`),
    };
  }

  /**
   * Check if image is permanently cached in library cache
   */
  public hasLibraryCache(url: string): boolean {
    if (!url) return false;
    const { dataPath, metaPath } = this.getDiskPaths(url);
    return fs.existsSync(dataPath) && fs.existsSync(metaPath);
  }

  private isPrivateOrLocalHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') return true;

    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const octets = ipv4Match.slice(1).map((n) => Number(n));
      if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
      const [a, b] = octets;
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a >= 224) return true;
    }

    return host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd');
  }

  private isHostWhitelisted(hostname: string): boolean {
    const host = hostname.toLowerCase().trim();
    if (this.isPrivateOrLocalHost(host)) return false;
    return this.allowedImageHosts.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
  }

  private isAllowedImageUrl(rawUrl: string): URL | null {
    try {
      if (!rawUrl || typeof rawUrl !== 'string') return null;
      const parsed = new URL(rawUrl.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      const hostname = parsed.hostname.toLowerCase();
      if (!this.isHostWhitelisted(hostname)) return null;

      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Securely downloads an image buffer over HTTPS with strict host whitelisting,
   * size limits, and redirect validation without invoking dynamic SSRF sinks.
   */
  private fetchSecureImage(
    targetUrl: string
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    return new Promise((resolve) => {
      let redirectsRemaining = 5;

      const performFetch = (urlToFetch: string) => {
        let parsed: URL;
        try {
          parsed = new URL(urlToFetch);
        } catch {
          return resolve(null);
        }

        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return resolve(null);
        }

        const hostname = parsed.hostname.toLowerCase();
        if (!this.isHostWhitelisted(hostname)) {
          logger.warn(`[ImageCache] SSRF check blocked request to unauthorized host: ${hostname}`);
          return resolve(null);
        }

        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.get(
          {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            headers: {
              'User-Agent': 'RenegadeCMM/1.5.0',
              Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
            timeout: 15000,
          },
          (res) => {
            // Handle redirects safely
            if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
              if (redirectsRemaining <= 0) {
                res.resume();
                return resolve(null);
              }
              redirectsRemaining--;
              const location = res.headers.location;
              if (!location) {
                res.resume();
                return resolve(null);
              }
              try {
                const nextUrl = new URL(location, urlToFetch).toString();
                res.resume();
                return performFetch(nextUrl);
              } catch {
                res.resume();
                return resolve(null);
              }
            }

            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              res.resume();
              return resolve(null);
            }

            const rawContentType = res.headers['content-type'];
            const contentType = typeof rawContentType === 'string' ? rawContentType : 'image/jpeg';
            const chunks: Buffer[] = [];
            let totalBytes = 0;
            const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50MB

            res.on('data', (chunk: Buffer) => {
              totalBytes += chunk.length;
              if (totalBytes > MAX_IMAGE_BYTES) {
                req.destroy(new Error('Image size exceeded 50MB limit'));
                return resolve(null);
              }
              chunks.push(chunk);
            });

            res.on('end', () => {
              const buffer = Buffer.concat(chunks);
              resolve({ buffer, contentType });
            });

            res.on('error', (err) => {
              logger.warn(`[ImageCache] Stream error while fetching ${urlToFetch}:`, err);
              resolve(null);
            });
          }
        );

        req.on('error', (err) => {
          logger.warn(`[ImageCache] Request error fetching ${urlToFetch}:`, err);
          resolve(null);
        });

        req.setTimeout(15000, () => {
          req.destroy(new Error('Request timeout'));
          resolve(null);
        });
      };

      performFetch(targetUrl.trim());
    });
  }

  /**
   * Fetch image with caching according to target context:
   * - 'library': Permanent disk cache (persists across sessions)
   * - 'browse': Temporary in-memory session cache (cleared on restart)
   */
  public async getImage(
    url: string,
    type: 'library' | 'browse' = 'library'
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!url || typeof url !== 'string') {
      return null;
    }

    const validatedUrl = this.isAllowedImageUrl(url);
    if (!validatedUrl) {
      logger.warn('[ImageCache] Blocked image request due to invalid or disallowed URL');
      return null;
    }

    const cleanUrl = validatedUrl.toString();
    const cacheKey = `${type}:${cleanUrl}`;

    // 1. Check if already cached
    if (type === 'library') {
      const { dataPath, metaPath } = this.getDiskPaths(cleanUrl);
      if (fs.existsSync(dataPath) && fs.existsSync(metaPath)) {
        try {
          const buffer = fs.readFileSync(dataPath);
          const metaJson = fs.readFileSync(metaPath, 'utf8');
          const meta = JSON.parse(metaJson);
          return { buffer, contentType: meta.contentType || 'image/jpeg' };
        } catch (e) {
          logger.warn(`Failed reading permanent thumbnail cache for ${cleanUrl}:`, e);
        }
      }
    } else {
      // Browse Session Cache
      if (this.browseSessionCache.has(cleanUrl)) {
        const entry = this.browseSessionCache.get(cleanUrl)!;
        entry.timestamp = Date.now();
        return { buffer: entry.buffer, contentType: entry.contentType };
      }
    }

    // 2. Prevent duplicate in-flight network requests for same URL
    if (this.inflightRequests.has(cacheKey)) {
      return await this.inflightRequests.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      try {
        const downloaded = await this.fetchSecureImage(cleanUrl);
        if (!downloaded) return null;

        const { buffer, contentType } = downloaded;

        if (type === 'library') {
          // Write to permanent disk cache
          this.ensureDirectory(this.libraryCacheDir);
          const { dataPath, metaPath } = this.getDiskPaths(cleanUrl);
          fs.writeFileSync(dataPath, buffer);
          fs.writeFileSync(
            metaPath,
            JSON.stringify({
              url: cleanUrl,
              contentType,
              cachedAt: new Date().toISOString(),
              size: buffer.length,
            })
          );
        } else {
          // Store in temporary browse session cache
          if (this.browseSessionCache.size >= this.maxBrowseEntries) {
            // Evict oldest item
            let oldestKey: string | null = null;
            let oldestTime = Infinity;
            for (const [k, v] of this.browseSessionCache.entries()) {
              if (v.timestamp < oldestTime) {
                oldestTime = v.timestamp;
                oldestKey = k;
              }
            }
            if (oldestKey) this.browseSessionCache.delete(oldestKey);
          }

          this.browseSessionCache.set(cleanUrl, {
            buffer,
            contentType,
            timestamp: Date.now(),
          });
        }

        return { buffer, contentType };
      } catch (err: any) {
        logger.warn(`[ImageCache] Failed to download thumbnail for ${cleanUrl}:`, err?.message || err);
        return null;
      } finally {
        this.inflightRequests.delete(cacheKey);
      }
    })();

    this.inflightRequests.set(cacheKey, fetchPromise);
    return await fetchPromise;
  }

  /**
   * Asynchronously prefetch thumbnail into permanent library disk cache in background
   */
  public prefetchToPermanentCache(url?: string): void {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
    const cleanUrl = url.trim();
    if (this.hasLibraryCache(cleanUrl)) return;

    // Fire-and-forget in background
    this.getImage(cleanUrl, 'library').catch(() => {});
  }

  /**
   * Promote an image from temporary session cache to permanent library cache
   */
  public promoteToPermanentCache(url?: string): void {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
    const cleanUrl = url.trim();
    if (this.hasLibraryCache(cleanUrl)) return;

    if (this.browseSessionCache.has(cleanUrl)) {
      const entry = this.browseSessionCache.get(cleanUrl)!;
      try {
        this.ensureDirectory(this.libraryCacheDir);
        const { dataPath, metaPath } = this.getDiskPaths(cleanUrl);
        fs.writeFileSync(dataPath, entry.buffer);
        fs.writeFileSync(
          metaPath,
          JSON.stringify({
            url: cleanUrl,
            contentType: entry.contentType,
            cachedAt: new Date().toISOString(),
            size: entry.buffer.length,
          })
        );
        return;
      } catch (e) {
        logger.warn(`Failed to promote image to permanent cache: ${cleanUrl}`, e);
      }
    }

    // Otherwise download directly to permanent cache
    this.prefetchToPermanentCache(cleanUrl);
  }

  /**
   * Clear in-memory browse session cache
   */
  public clearBrowseSessionCache(): void {
    this.browseSessionCache.clear();
  }

  /**
   * Clear permanent library disk cache
   */
  public clearPermanentLibraryCache(): void {
    try {
      if (fs.existsSync(this.libraryCacheDir)) {
        const files = fs.readdirSync(this.libraryCacheDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.libraryCacheDir, file));
        }
      }
    } catch (e) {
      logger.warn('Failed clearing permanent library cache:', e);
    }
  }
}

export const imageCacheService = new ImageCacheService();
