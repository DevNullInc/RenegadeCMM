/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
export interface LogEntry {
  id: string;
  time: string;
  level: 'info' | 'warn' | 'error' | 'log';
  message: string;
  stack?: string;
}

const MAX_LOGS = 300;
const logHistory: LogEntry[] = [];
const listeners = new Set<(logs: LogEntry[]) => void>();

let initialized = false;

function formatArg(arg: any): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
  try {
    return JSON.stringify(arg, null, 2);
  } catch (e) {
    return String(arg);
  }
}

function pushLog(level: LogEntry['level'], args: any[]) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
  
  let message = args.map(formatArg).join(' ');
  let stack: string | undefined;

  for (const arg of args) {
    if (arg instanceof Error && arg.stack) {
      stack = arg.stack;
      break;
    }
  }

  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    time: timeStr,
    level,
    message,
    stack,
  };

  logHistory.push(entry);
  if (logHistory.length > MAX_LOGS) {
    logHistory.shift();
  }

  listeners.forEach((listener) => {
    try {
      listener([...logHistory]);
    } catch (e) {
      // Ignore listener error
    }
  });
}

export function initConsoleCapture() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: any[]) => {
    pushLog('log', args);
    originalLog.apply(console, args);
  };

  console.info = (...args: any[]) => {
    pushLog('info', args);
    originalInfo.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    pushLog('warn', args);
    originalWarn.apply(console, args);
  };

  console.error = (...args: any[]) => {
    pushLog('error', args);
    originalError.apply(console, args);
  };

  window.addEventListener('error', (event) => {
    pushLog('error', [
      `[Uncaught Error] ${event.message} (${event.filename}:${event.lineno}:${event.colno})`,
      event.error,
    ]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    pushLog('error', [
      `[Unhandled Promise Rejection] ${event.reason?.message || event.reason}`,
      event.reason,
    ]);
  });

  if (window.civitaiAPI && typeof window.civitaiAPI.onAppLog === 'function') {
    try {
      window.civitaiAPI.onAppLog((entry) => {
        pushLog((entry.level as any) || 'info', [`[Backend] ${entry.message}`]);
      });
    } catch (e) {}
  }

  pushLog('info', ['[System] Console capture initialized successfully. Ready for diagnostics.']);
}

export function getLogs(): LogEntry[] {
  return [...logHistory];
}

export function clearLogs() {
  logHistory.length = 0;
  listeners.forEach((listener) => listener([]));
}

export function subscribeLogs(callback: (logs: LogEntry[]) => void): () => void {
  listeners.add(callback);
  callback([...logHistory]);
  return () => {
    listeners.delete(callback);
  };
}

export async function generateDiagnosticReport(extraContext?: Record<string, any>): Promise<string> {
  let sysInfo: any = {};
  if (window.civitaiAPI && typeof window.civitaiAPI.getSystemInfo === 'function') {
    try {
      sysInfo = await window.civitaiAPI.getSystemInfo();
    } catch (e) {
      sysInfo = { error: String(e) };
    }
  }

  const timestamp = new Date().toISOString();
  const errorCount = logHistory.filter((l) => l.level === 'error').length;
  const warnCount = logHistory.filter((l) => l.level === 'warn').length;

  let report = `### Renegade Core Model Manager - Diagnostic Report\n`;
  report += `**Generated:** ${timestamp}\n\n`;
  report += `#### 🖥️ Environment\n`;
  report += `- **App Version:** ${sysInfo.version || '1.5.0'}\n`;
  report += `- **Electron:** ${sysInfo.electronVersion || 'N/A'}\n`;
  report += `- **Node:** ${sysInfo.nodeVersion || 'N/A'}\n`;
  report += `- **Chrome:** ${sysInfo.chromeVersion || 'N/A'}\n`;
  report += `- **Platform / OS:** ${sysInfo.platform || navigator.platform} (${sysInfo.arch || 'x64'})\n`;
  report += `- **User Agent:** \`${navigator.userAgent}\`\n\n`;

  if (extraContext) {
    report += `#### ⚙️ Application Context\n`;
    report += '```json\n' + JSON.stringify(extraContext, null, 2) + '\n```\n\n';
  }

  report += `#### 📊 Summary\n`;
  report += `- Total Log Entries: ${logHistory.length}\n`;
  report += `- Errors: **${errorCount}** | Warnings: **${warnCount}**\n\n`;

  report += `#### 📜 Console & Error Logs (Latest ${logHistory.length} events)\n`;
  report += '```text\n';

  if (logHistory.length === 0) {
    report += '(No console logs recorded)\n';
  } else {
    logHistory.forEach((entry) => {
      report += `[${entry.time}] [${entry.level.toUpperCase().padEnd(5)}] ${entry.message}\n`;
      if (entry.stack) {
        report += `    Stack: ${entry.stack}\n`;
      }
    });
  }

  report += '```\n';
  return report;
}
