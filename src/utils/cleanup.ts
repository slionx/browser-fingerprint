/**
 * Storage Cleanup Utilities
 * Complete cleanup of browser storage and traces
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CleanupOptions {
  cookies: boolean;
  cache: boolean;
  localStorage: boolean;
  sessionStorage: boolean;
  indexedDB: boolean;
  history: boolean;
  all: boolean;
}

// Chrome profile directories to clean
const CLEANUP_TARGETS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'ShaderCache',
  'Default/Cache',
  'Default/Code Cache',
  'Default/Cookies',
  'Default/Cookies-journal',
  'Default/History',
  'Default/History-journal',
  'Default/Local Storage',
  'Default/Session Storage',
  'Default/IndexedDB',
  'Default/Web Data',
  'Default/Web Data-journal',
  'Default/Visited Links',
  'Default/Network Action Predictor',
  'Default/QuotaManager',
  'Default/QuotaManager-journal',
];

/**
 * Clean profile storage
 */
export function cleanProfile(profilePath: string, options: Partial<CleanupOptions> = {}): void {
  const opts: CleanupOptions = {
    cookies: true,
    cache: true,
    localStorage: true,
    sessionStorage: true,
    indexedDB: true,
    history: true,
    all: false,
    ...options,
  };

  if (opts.all) {
    // Clean everything except config.json
    cleanAll(profilePath);
    return;
  }

  // Selective cleanup
  const targets: string[] = [];

  if (opts.cache) {
    targets.push('Cache', 'Code Cache', 'GPUCache', 'ShaderCache', 'Default/Cache', 'Default/Code Cache');
  }

  if (opts.cookies) {
    targets.push('Default/Cookies', 'Default/Cookies-journal');
  }

  if (opts.localStorage) {
    targets.push('Default/Local Storage');
  }

  if (opts.sessionStorage) {
    targets.push('Default/Session Storage');
  }

  if (opts.indexedDB) {
    targets.push('Default/IndexedDB');
  }

  if (opts.history) {
    targets.push('Default/History', 'Default/History-journal', 'Default/Visited Links');
  }

  for (const target of targets) {
    const targetPath = path.join(profilePath, target);
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  }
}

/**
 * Clean all profile data except config
 */
export function cleanAll(profilePath: string): void {
  if (!fs.existsSync(profilePath)) return;

  const entries = fs.readdirSync(profilePath);
  for (const entry of entries) {
    if (entry === 'config.json') continue;

    const entryPath = path.join(profilePath, entry);
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
}

/**
 * Get profile storage size
 */
export function getProfileSize(profilePath: string): number {
  if (!fs.existsSync(profilePath)) return 0;

  let size = 0;

  function calculateSize(dirPath: string): void {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        calculateSize(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  }

  calculateSize(profilePath);
  return size;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
