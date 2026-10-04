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
import React, { useState, useEffect } from 'react';
import { Layers } from 'lucide-react';
import { getApiBase } from '../utils/webBridge';

export interface FallbackImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  candidateUrls?: (string | null | undefined)[];
  fallbackIcon?: React.ReactNode;
  fallbackText?: string;
  isBlurred?: boolean;
  cacheType?: 'library' | 'browse' | 'none';
}

function getCacheProxyUrl(url: string, type: 'library' | 'browse'): string {
  if (!url || typeof url !== 'string') return url;
  const apiBase = getApiBase();
  const hostBase = apiBase.replace(/\/api$/, '');
  if (url.startsWith('/api/local-image') || url.includes('/api/local-image')) {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${hostBase}${url}`;
  }
  if (url.includes('/api/cached-image')) return url;
  if (!url.startsWith('http')) return url;
  return `${apiBase}/cached-image?url=${encodeURIComponent(url)}&type=${type}`;
}

export const FallbackImage: React.FC<FallbackImageProps> = ({
  candidateUrls = [],
  src,
  alt,
  className = '',
  fallbackIcon,
  fallbackText = 'NO PREVIEW',
  isBlurred = false,
  cacheType = 'library',
  ...props
}) => {
  const candidateUrlsKey = (candidateUrls || []).filter(Boolean).join('|');

  // Build a distinct list of valid candidate URLs with local bridge caching
  const urls: string[] = React.useMemo(() => {
    const rawList: string[] = [];
    if (src && typeof src === 'string' && src.trim()) {
      rawList.push(src.trim());
    }
    (candidateUrls || []).forEach((item) => {
      if (item && typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed && !rawList.includes(trimmed)) {
          rawList.push(trimmed);
        }
      }
    });

    if (cacheType === 'none') {
      return rawList;
    }

    const apiBase = getApiBase();
    const hostBase = apiBase.replace(/\/api$/, '');

    const finalList: string[] = [];
    rawList.forEach((raw) => {
      if (raw.startsWith('/api/local-image') || raw.includes('/api/local-image')) {
        const fullLocal = raw.startsWith('http') ? raw : `${hostBase}${raw}`;
        if (!finalList.includes(fullLocal)) {
          finalList.push(fullLocal);
        }
        if (!finalList.includes(raw)) {
          finalList.push(raw);
        }
      } else if (raw.startsWith('http')) {
        const proxied = getCacheProxyUrl(raw, cacheType);
        if (!finalList.includes(proxied)) {
          finalList.push(proxied);
        }
        if (!finalList.includes(raw)) {
          finalList.push(raw);
        }
      } else {
        if (!finalList.includes(raw)) {
          finalList.push(raw);
        }
      }
    });

    return finalList;
  }, [src, candidateUrlsKey, cacheType]);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [hasFailedAll, setHasFailedAll] = useState<boolean>(urls.length === 0);

  const urlsKey = urls.join('|');
  useEffect(() => {
    setCurrentIndex(0);
    setHasFailedAll(urls.length === 0);
  }, [urlsKey]);

  const handleError = () => {
    if (currentIndex + 1 < urls.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setHasFailedAll(true);
    }
  };

  if (hasFailedAll || urls.length === 0) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-slate-700 font-mono text-[11px] gap-1 bg-slate-900/50 select-none ${className}`}>
        {fallbackIcon || <Layers size={22} className="text-slate-700 stroke-[1.5]" />}
        <span>{fallbackText}</span>
      </div>
    );
  }

  const currentUrl = urls[currentIndex];

  return (
    <img
      key={currentUrl}
      src={currentUrl}
      alt={alt || 'Model preview'}
      onError={handleError}
      className={`${className} ${isBlurred ? 'blur-md scale-110' : ''}`}
      style={isBlurred ? { filter: 'blur(10px)', transform: 'scale(1.1)', transition: 'filter 0.3s ease, transform 0.3s ease' } : undefined}
      {...props}
    />
  );
};
