/**
 * Browser Fingerprint - Main Entry
 * Exports all modules for programmatic use
 */

// Fingerprint modules
export { generateUA, generateClientHints, PlatformType } from './fingerprint/ua';
export { getCanvasInjectionScript, getDefaultCanvasConfig, CanvasNoiseConfig } from './fingerprint/canvas';
export { getWebGLInjectionScript, getDefaultWebGLConfig, WebGLConfig, generateRandomGPU } from './fingerprint/webgl';
export { getHardwareInjectionScript, getDefaultHardwareConfig, HardwareConfig, generateRandomHardware } from './fingerprint/hardware';

// Profile management
export { ProfileManager, ProfileConfig, ProxyConfig, profileManager } from './fingerprint/profile';

// Browser launcher
export { BrowserLauncher, LaunchOptions, findChrome, browserLauncher } from './browser/launcher';

// Network/Proxy
export {
  WarpManager,
  ProxyManager,
  ProxyServer,
  warpManager,
  proxyManager,
  isWarpInstalled,
  getWarpStatus,
  connectWarp,
  disconnectWarp,
  rotateWarpIP,
} from './network/warp';

// Utilities
export { cleanProfile, cleanAll, getProfileSize, formatBytes, CleanupOptions } from './utils/cleanup';

// Convenience function for quick start
import { ProfileManager, ProfileConfig } from './fingerprint/profile';
import { BrowserLauncher } from './browser/launcher';
import { Browser } from 'puppeteer-core';

export interface QuickLaunchOptions {
  name?: string;
  proxy?: string;
  headless?: boolean;
  chromePath?: string;
}

/**
 * Quick launch a browser with a new random fingerprint
 */
export async function quickLaunch(options: QuickLaunchOptions = {}): Promise<{
  browser: Browser;
  profile: ProfileConfig;
  close: () => Promise<void>;
}> {
  const manager = new ProfileManager();
  const launcher = new BrowserLauncher(manager);

  const profile = manager.create(options.name || `quick-${Date.now()}`);
  const browser = await launcher.launch(profile.id, {
    headless: options.headless,
    chromePath: options.chromePath,
    proxy: options.proxy,
  });

  return {
    browser,
    profile,
    close: async () => {
      await launcher.close(profile.id);
      manager.delete(profile.id);
    },
  };
}

/**
 * Create and manage multiple browser instances
 */
export class BrowserPool {
  private manager: ProfileManager;
  private launcher: BrowserLauncher;
  private instances: Map<string, { browser: Browser; profile: ProfileConfig }> = new Map();

  constructor(profilesDir?: string) {
    this.manager = new ProfileManager(profilesDir);
    this.launcher = new BrowserLauncher(this.manager);
  }

  /**
   * Create a new browser instance
   */
  async create(name: string, options: { proxy?: string; headless?: boolean } = {}): Promise<{
    id: string;
    browser: Browser;
    profile: ProfileConfig;
  }> {
    const profile = this.manager.create(name);
    const browser = await this.launcher.launch(profile.id, options);

    this.instances.set(profile.id, { browser, profile });

    return { id: profile.id, browser, profile };
  }

  /**
   * Get instance by ID
   */
  get(id: string): { browser: Browser; profile: ProfileConfig } | undefined {
    return this.instances.get(id);
  }

  /**
   * Close instance
   */
  async close(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (instance) {
      await this.launcher.close(id);
      this.instances.delete(id);
    }
  }

  /**
   * Close all instances
   */
  async closeAll(): Promise<void> {
    for (const [id] of this.instances) {
      await this.close(id);
    }
  }

  /**
   * List all instances
   */
  list(): Array<{ id: string; name: string; profile: ProfileConfig }> {
    return Array.from(this.instances.entries()).map(([id, { profile }]) => ({
      id,
      name: profile.name,
      profile,
    }));
  }
}
