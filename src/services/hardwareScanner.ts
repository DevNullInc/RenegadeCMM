/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import os from 'os';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export interface GpuInfo {
  name: string;
  vramTotalBytes?: number;
  vramFreeBytes?: number;
  vramFormatted?: string;
  driverVersion?: string;
  vendor?: string;
}

export interface HardwareProfile {
  cpu: {
    model: string;
    cores: number;
    speedMhz: number;
    arch: string;
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    totalFormatted: string;
    freeFormatted: string;
    usedPercent: number;
  };
  gpus: GpuInfo[];
  platform: string;
  timestamp: number;
}

export interface ConversionSafetyAssessment {
  isSafe: boolean;
  riskLevel: 'safe' | 'warning' | 'critical';
  modelSizeBytes: number;
  modelSizeFormatted: string;
  estimatedRamRequiredBytes: number;
  estimatedRamRequiredFormatted: string;
  freeRamBytes: number;
  freeRamFormatted: string;
  totalRamBytes: number;
  message: string;
  recommendation?: string;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export class HardwareScannerService {
  private cachedProfile: { profile: HardwareProfile; expiresAt: number } | null = null;

  /**
   * Scans CPU, System Memory (RAM), and GPU/VRAM telemetry.
   */
  async getHardwareProfile(forceRefresh = false): Promise<HardwareProfile> {
    const now = Date.now();
    if (!forceRefresh && this.cachedProfile && this.cachedProfile.expiresAt > now) {
      return this.cachedProfile.profile;
    }

    const cpus = os.cpus() || [];
    const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU';
    const cpuSpeed = cpus.length > 0 ? cpus[0].speed : 0;
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

    const gpus = await this.detectGpus();

    const profile: HardwareProfile = {
      cpu: {
        model: cpuModel,
        cores: cpus.length,
        speedMhz: cpuSpeed,
        arch: os.arch(),
      },
      memory: {
        totalBytes,
        freeBytes,
        usedBytes,
        totalFormatted: formatBytes(totalBytes),
        freeFormatted: formatBytes(freeBytes),
        usedPercent,
      },
      gpus,
      platform: os.platform(),
      timestamp: now,
    };

    this.cachedProfile = { profile, expiresAt: now + 15000 };
    return profile;
  }

  /**
   * Evaluates if current available RAM is sufficient to convert a given pickle model without an OOM crash.
   */
  async assessConversionSafety(modelSizeBytes: number): Promise<ConversionSafetyAssessment> {
    const profile = await this.getHardwareProfile();
    const freeRam = profile.memory.freeBytes;
    const totalRam = profile.memory.totalBytes;

    // PyTorch unpickling loads the uncompressed weights and temporarily duplicates dict keys during tensor conversion.
    // Recommended headroom: 1.5x model size in RAM.
    const requiredRam = Math.round(modelSizeBytes * 1.5);
    const modelFormatted = formatBytes(modelSizeBytes);
    const requiredFormatted = formatBytes(requiredRam);
    const freeFormatted = formatBytes(freeRam);

    if (freeRam >= requiredRam) {
      return {
        isSafe: true,
        riskLevel: 'safe',
        modelSizeBytes,
        modelSizeFormatted: modelFormatted,
        estimatedRamRequiredBytes: requiredRam,
        estimatedRamRequiredFormatted: requiredFormatted,
        freeRamBytes: freeRam,
        freeRamFormatted: freeFormatted,
        totalRamBytes: totalRam,
        message: `Sufficient memory available (${freeFormatted} free > ${requiredFormatted} recommended for ${modelFormatted} model).`,
      };
    } else if (freeRam >= modelSizeBytes) {
      return {
        isSafe: true,
        riskLevel: 'warning',
        modelSizeBytes,
        modelSizeFormatted: modelFormatted,
        estimatedRamRequiredBytes: requiredRam,
        estimatedRamRequiredFormatted: requiredFormatted,
        freeRamBytes: freeRam,
        freeRamFormatted: freeFormatted,
        totalRamBytes: totalRam,
        message: `Available RAM (${freeFormatted}) is close to model size (${modelFormatted}). Conversion will proceed, but system memory may experience brief pressure.`,
        recommendation: 'Close heavy background applications or running ComfyUI generations to prevent memory swapping.',
      };
    } else {
      return {
        isSafe: false,
        riskLevel: 'critical',
        modelSizeBytes,
        modelSizeFormatted: modelFormatted,
        estimatedRamRequiredBytes: requiredRam,
        estimatedRamRequiredFormatted: requiredFormatted,
        freeRamBytes: freeRam,
        freeRamFormatted: freeFormatted,
        totalRamBytes: totalRam,
        message: `High OOM Risk: Model size is ${modelFormatted}, but only ${freeFormatted} of system RAM is free. Conversion may crash or stall due to Out Of Memory.`,
        recommendation: `Free up at least ${requiredFormatted} of RAM before converting, or increase system swap space.`,
      };
    }
  }

  /**
   * Probes GPU accelerators across Windows, Linux, and macOS.
   */
  private async detectGpus(): Promise<GpuInfo[]> {
    const gpus: GpuInfo[] = [];

    // 1. First attempt: nvidia-smi (Works on Windows and Linux with NVIDIA hardware)
    try {
      const { stdout } = await execFileAsync(
        'nvidia-smi',
        ['--query-gpu=name,memory.total,memory.free,driver_version', '--format=csv,noheader,nounits'],
        { timeout: 2000 }
      );
      if (stdout && stdout.trim()) {
        const lines = stdout.trim().split(/\r?\n/);
        for (const line of lines) {
          const parts = line.split(',').map((p) => p.trim());
          if (parts.length >= 2) {
            const name = parts[0];
            const totalMb = parseInt(parts[1], 10);
            const freeMb = parts.length >= 3 ? parseInt(parts[2], 10) : undefined;
            const driver = parts.length >= 4 ? parts[3] : undefined;

            const totalBytes = !isNaN(totalMb) ? totalMb * 1024 * 1024 : undefined;
            const freeBytes = freeMb !== undefined && !isNaN(freeMb) ? freeMb * 1024 * 1024 : undefined;

            gpus.push({
              name,
              vramTotalBytes: totalBytes,
              vramFreeBytes: freeBytes,
              vramFormatted: totalBytes ? formatBytes(totalBytes) : undefined,
              driverVersion: driver,
              vendor: 'NVIDIA',
            });
          }
        }
        if (gpus.length > 0) return gpus;
      }
    } catch {
      // nvidia-smi not found or non-NVIDIA GPU, proceed to OS-level detection
    }

    // 2. Windows Fallback: Win32_VideoController via PowerShell CIM
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync(
          'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json"',
          { timeout: 3000 }
        );
        if (stdout && stdout.trim()) {
          const parsed = JSON.parse(stdout.trim());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of list) {
            if (item && item.Name) {
              const ram = typeof item.AdapterRAM === 'number' && item.AdapterRAM > 0 ? item.AdapterRAM : undefined;
              gpus.push({
                name: item.Name,
                vramTotalBytes: ram,
                vramFormatted: ram ? formatBytes(ram) : undefined,
                driverVersion: item.DriverVersion || undefined,
                vendor: item.Name.toLowerCase().includes('nvidia')
                  ? 'NVIDIA'
                  : item.Name.toLowerCase().includes('amd') || item.Name.toLowerCase().includes('radeon')
                  ? 'AMD'
                  : item.Name.toLowerCase().includes('intel')
                  ? 'Intel'
                  : 'Generic',
              });
            }
          }
          if (gpus.length > 0) return gpus;
        }
      } catch (winErr) {
        logger.debug('Win32_VideoController probe skipped:', winErr);
      }
    }

    // 3. macOS Fallback: system_profiler
    if (process.platform === 'darwin') {
      try {
        const { stdout } = await execAsync('system_profiler SPDisplaysDataType -json', { timeout: 3000 });
        if (stdout && stdout.trim()) {
          const parsed = JSON.parse(stdout.trim());
          const displays = parsed?.SPDisplaysDataType || [];
          for (const d of displays) {
            const name = d._name || d.sppci_model || 'Apple GPU';
            const vramStr = d.spdisplays_vram || d.sppci_video_memory;
            gpus.push({
              name,
              vramFormatted: vramStr || undefined,
              vendor: 'Apple',
            });
          }
          if (gpus.length > 0) return gpus;
        }
      } catch (macErr) {
        logger.debug('macOS display profile probe skipped:', macErr);
      }
    }

    // 4. Linux Fallback: lspci
    if (process.platform === 'linux') {
      try {
        const { stdout } = await execAsync('lspci | grep -i -E "vga|3d|display"', { timeout: 2000 });
        if (stdout && stdout.trim()) {
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            const clean = line.replace(/^[0-9a-f:.]+\s+[^:]+:\s+/i, '').trim();
            if (clean) {
              gpus.push({
                name: clean,
                vendor: clean.toLowerCase().includes('nvidia')
                  ? 'NVIDIA'
                  : clean.toLowerCase().includes('amd') || clean.toLowerCase().includes('radeon')
                  ? 'AMD'
                  : clean.toLowerCase().includes('intel')
                  ? 'Intel'
                  : 'Generic',
              });
            }
          }
          if (gpus.length > 0) return gpus;
        }
      } catch (nixErr) {
        logger.debug('Linux lspci probe skipped:', nixErr);
      }
    }

    return gpus;
  }
}

export const hardwareScanner = new HardwareScannerService();
