/**
 * Profile Manager
 * Manages browser profiles with persistent fingerprint configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { generateUA, PlatformType } from './ua';
import { getDefaultCanvasConfig, CanvasNoiseConfig } from './canvas';
import { getDefaultWebGLConfig, WebGLConfig } from './webgl';
import { getDefaultHardwareConfig, HardwareConfig } from './hardware';

export interface ProfileConfig {
  id: string;
  name: string;
  createdAt: string;
  lastUsed: string;
  userAgent: string;
  platform: PlatformType;
  canvas: CanvasNoiseConfig;
  webgl: WebGLConfig;
  hardware: HardwareConfig;
  proxy?: ProxyConfig;
}

export interface ProxyConfig {
  type: 'http' | 'socks5' | 'warp';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  warpPort?: number;  // Local WARP socks5 port
}

export class ProfileManager {
  private profilesDir: string;

  constructor(profilesDir?: string) {
    this.profilesDir = profilesDir || path.join(process.cwd(), 'profiles');
    this.ensureProfilesDir();
  }

  private ensureProfilesDir(): void {
    if (!fs.existsSync(this.profilesDir)) {
      fs.mkdirSync(this.profilesDir, { recursive: true });
    }
  }

  private getProfilePath(profileId: string): string {
    return path.join(this.profilesDir, profileId);
  }

  private getConfigPath(profileId: string): string {
    return path.join(this.getProfilePath(profileId), 'config.json');
  }

  /**
   * Create a new profile with random fingerprint
   */
  create(name: string, platform: PlatformType = 'random', proxy?: ProxyConfig): ProfileConfig {
    const id = uuidv4();
    const profilePath = this.getProfilePath(id);

    // Create profile directory
    fs.mkdirSync(profilePath, { recursive: true });

    const config: ProfileConfig = {
      id,
      name,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      userAgent: generateUA(platform),
      platform,
      canvas: getDefaultCanvasConfig(),
      webgl: getDefaultWebGLConfig(),
      hardware: getDefaultHardwareConfig(),
      proxy,
    };

    // Save config
    fs.writeFileSync(this.getConfigPath(id), JSON.stringify(config, null, 2));

    return config;
  }

  /**
   * Get profile by ID
   */
  get(profileId: string): ProfileConfig | null {
    const configPath = this.getConfigPath(profileId);
    if (!fs.existsSync(configPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  /**
   * Update profile
   */
  update(profileId: string, updates: Partial<ProfileConfig>): ProfileConfig | null {
    const config = this.get(profileId);
    if (!config) return null;

    const updated = { ...config, ...updates, lastUsed: new Date().toISOString() };
    fs.writeFileSync(this.getConfigPath(profileId), JSON.stringify(updated, null, 2));
    return updated;
  }

  /**
   * List all profiles
   */
  list(): ProfileConfig[] {
    if (!fs.existsSync(this.profilesDir)) {
      return [];
    }

    const profiles: ProfileConfig[] = [];
    const dirs = fs.readdirSync(this.profilesDir);

    for (const dir of dirs) {
      const configPath = path.join(this.profilesDir, dir, 'config.json');
      if (fs.existsSync(configPath)) {
        try {
          profiles.push(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
        } catch (e) {
          // Skip invalid profiles
        }
      }
    }

    return profiles.sort((a, b) =>
      new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    );
  }

  /**
   * Delete profile
   */
  delete(profileId: string): boolean {
    const profilePath = this.getProfilePath(profileId);
    if (!fs.existsSync(profilePath)) {
      return false;
    }

    fs.rmSync(profilePath, { recursive: true, force: true });
    return true;
  }

  /**
   * Clean profile data (cookies, cache, etc.) but keep config
   */
  clean(profileId: string): boolean {
    const profilePath = this.getProfilePath(profileId);
    const configPath = this.getConfigPath(profileId);

    if (!fs.existsSync(profilePath)) {
      return false;
    }

    // Read config before cleaning
    const config = this.get(profileId);
    if (!config) return false;

    // Remove all files except config
    const files = fs.readdirSync(profilePath);
    for (const file of files) {
      if (file !== 'config.json') {
        const filePath = path.join(profilePath, file);
        fs.rmSync(filePath, { recursive: true, force: true });
      }
    }

    return true;
  }

  /**
   * Get Chrome user data directory for profile
   */
  getUserDataDir(profileId: string): string {
    return this.getProfilePath(profileId);
  }

  /**
   * Regenerate fingerprint for existing profile
   */
  regenerateFingerprint(profileId: string): ProfileConfig | null {
    const config = this.get(profileId);
    if (!config) return null;

    const updates: Partial<ProfileConfig> = {
      userAgent: generateUA(config.platform),
      canvas: getDefaultCanvasConfig(),
      webgl: getDefaultWebGLConfig(),
      hardware: getDefaultHardwareConfig(),
    };

    return this.update(profileId, updates);
  }
}

export const profileManager = new ProfileManager();
