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
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ScanProgress } from '../types/app';

interface ScanContextType {
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  scanError: string | null;
  lastCompletedAt: number | null;
  startScan: () => Promise<void>;
  cancelScan: () => Promise<void>;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

export const ScanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastCompletedAt, setLastCompletedAt] = useState<number | null>(null);

  useEffect(() => {
    let unsub: (() => void) | void;
    let completeTimer: NodeJS.Timeout | null = null;

    if (window.civitaiAPI && typeof window.civitaiAPI.onScanProgress === 'function') {
      unsub = window.civitaiAPI.onScanProgress((progress: ScanProgress) => {
        if (!progress) return;
        setScanProgress(progress);

        if (
          progress.status === 'scanning' ||
          progress.status === 'hashing' ||
          progress.status === 'lookup'
        ) {
          setIsScanning(true);
          setScanError(null);
        } else if (progress.status === 'completed') {
          setIsScanning(false);
          setLastCompletedAt(Date.now());
          if (completeTimer) clearTimeout(completeTimer);
          completeTimer = setTimeout(() => {
            setScanProgress((prev) => (prev?.status === 'completed' ? null : prev));
          }, 4000);
        } else if (progress.status === 'failed') {
          setIsScanning(false);
          setScanError(progress.error || 'Scan failed.');
        } else if (progress.status === 'idle') {
          setIsScanning(false);
        }
      });
    }

    // Check initial status on mount
    if (window.civitaiAPI && typeof window.civitaiAPI.getScanStatus === 'function') {
      window.civitaiAPI
        .getScanStatus()
        .then((status) => {
          if (
            status &&
            (status.status === 'scanning' ||
              status.status === 'hashing' ||
              status.status === 'lookup')
          ) {
            setIsScanning(true);
            setScanProgress(status);
          }
        })
        .catch(() => {});
    }

    return () => {
      if (completeTimer) clearTimeout(completeTimer);
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const startScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanError(null);
    setScanProgress({
      scannedFiles: 0,
      totalFiles: 0,
      status: 'scanning',
      currentFile: 'Starting ComfyUI directory scan...',
    });

    try {
      if (window.civitaiAPI) {
        const config = await window.civitaiAPI.getConfig();
        const folders =
          config?.comfyui_folders && config.comfyui_folders.length > 0
            ? config.comfyui_folders
            : config?.comfyui_root
            ? [config.comfyui_root]
            : [];

        if (!folders || folders.length === 0 || !folders[0]) {
          alert('No model folders configured! Please add your ComfyUI model folder path in Settings.');
          setIsScanning(false);
          setScanProgress(null);
          return;
        }

        await window.civitaiAPI.scanLibrary(folders as any);
      }
    } catch (err: any) {
      console.error('Scan failed:', err);
      setScanError(err.message || 'Scan failed');
      setIsScanning(false);
    }
  };

  const cancelScan = async () => {
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.cancelScan === 'function') {
        await window.civitaiAPI.cancelScan();
      }
    } catch (e) {
      console.error('Error cancelling scan:', e);
    } finally {
      setIsScanning(false);
      setScanProgress((prev) =>
        prev ? { ...prev, status: 'idle', currentFile: 'Scan cancelled by user.' } : null
      );
      setTimeout(() => setScanProgress(null), 2500);
    }
  };

  return (
    <ScanContext.Provider
      value={{
        isScanning,
        scanProgress,
        scanError,
        lastCompletedAt,
        startScan,
        cancelScan,
      }}
    >
      {children}
    </ScanContext.Provider>
  );
};

export const useScan = () => {
  const context = useContext(ScanContext);
  if (!context) {
    throw new Error('useScan must be used within a ScanProvider');
  }
  return context;
};
