/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import log from 'electron-log';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogEntryPayload = { level: 'info' | 'warn' | 'error' | 'log'; message: string };
type LogListener = (entry: LogEntryPayload) => void;

export function redactSecrets(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    // Redact URL query parameter tokens: ?token=..., &token=..., ?key=..., &apiKey=...
    .replace(/([?&](?:token|key|apiKey|secret|password)=)[^&\s]+/gi, '$1[REDACTED]')
    // Redact Bearer authorization headers
    .replace(/(Bearer\s+)[a-zA-Z0-9_.-]{6,}/gi, '$1[REDACTED]')
    // Redact JSON fields
    .replace(/("(?:civitai_api_key|huggingface_token|apiKey|api_key|token|secret)":\s*")[^"]+(")/gi, '$1[REDACTED]$2');
}

class Logger {
  private listeners: Set<LogListener> = new Set();

  constructor() {
    log.transports.file.level = 'info';
    log.transports.console.level = 'debug';
  }

  onLog(listener: LogListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private sanitize(arg: any): any {
    if (typeof arg === 'string') {
      return redactSecrets(arg);
    }
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.parse(redactSecrets(JSON.stringify(arg)));
      } catch {
        return arg;
      }
    }
    return arg;
  }

  private emit(level: 'info' | 'warn' | 'error' | 'log', message: string, ...args: any[]) {
    const cleanMsg = redactSecrets(message);
    const cleanArgs = args.map((a) => this.sanitize(a));
    const formatted = cleanArgs.length > 0 ? `${cleanMsg} ${cleanArgs.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}` : cleanMsg;
    this.listeners.forEach((fn) => {
      try {
        fn({ level, message: formatted });
      } catch (e) {}
    });
  }

  setLevel(level: LogLevel) {
    log.transports.file.level = level;
  }

  debug(message: string, ...args: any[]) {
    const cleanMsg = redactSecrets(message);
    const cleanArgs = args.map((a) => this.sanitize(a));
    log.debug(cleanMsg, ...cleanArgs);
  }

  info(message: string, ...args: any[]) {
    const cleanMsg = redactSecrets(message);
    const cleanArgs = args.map((a) => this.sanitize(a));
    log.info(cleanMsg, ...cleanArgs);
    this.emit('info', message, ...args);
  }

  warn(message: string, ...args: any[]) {
    const cleanMsg = redactSecrets(message);
    const cleanArgs = args.map((a) => this.sanitize(a));
    log.warn(cleanMsg, ...cleanArgs);
    this.emit('warn', message, ...args);
  }

  error(message: string, ...args: any[]) {
    const cleanMsg = redactSecrets(message);
    const cleanArgs = args.map((a) => this.sanitize(a));
    log.error(cleanMsg, ...cleanArgs);
    this.emit('error', message, ...args);
  }
}

export const logger = new Logger();
