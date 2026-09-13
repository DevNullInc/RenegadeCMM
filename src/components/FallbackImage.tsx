/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import React, { useState, useEffect } from 'react';
import { Layers } from 'lucide-react';

export interface FallbackImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  candidateUrls?: (string | null | undefined)[];
  fallbackIcon?: React.ReactNode;
  fallbackText?: string;
  isBlurred?: boolean;
  cacheType?: 'library' | 'browse' | 'none';
}

function getCacheProxyUrl(url: string, type: 'library' | 'browse'): string {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('/api/local-image') || url.includes('/api/local-image')) {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `http://localhost:5174${url}`;
  }
  if (url.includes('/api/cached-image')) return url;
  if (!url.startsWith('http')) return url;
  return `http://localhost:5174/api/cached-image?url=${encodeURIComponent(url)}&type=${type}`;
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
  // Build a distinct list of valid candidate URLs with local bridge caching
  const urls: string[] = React.useMemo(() => {
    const rawList: string[] = [];
    if (src && typeof src === 'string' && src.trim()) {
      rawList.push(src.trim());
    }
    candidateUrls.forEach((item) => {
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

    const finalList: string[] = [];
    rawList.forEach((raw) => {
      if (raw.startsWith('/api/local-image') || raw.includes('/api/local-image')) {
        const fullLocal = raw.startsWith('http') ? raw : `http://localhost:5174${raw}`;
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
  }, [src, candidateUrls, cacheType]);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [hasFailedAll, setHasFailedAll] = useState<boolean>(urls.length === 0);

  useEffect(() => {
    setCurrentIndex(0);
    setHasFailedAll(urls.length === 0);
  }, [urls.join('|')]);

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
