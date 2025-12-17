/**
 * Browser Launcher
 * Launches Chrome with fingerprint spoofing
 */

import * as puppeteer from 'puppeteer-core';
import { Browser, Page } from 'puppeteer-core';
import * as path from 'path';
import * as fs from 'fs';
import { ProfileConfig, ProfileManager } from '../fingerprint/profile';
import { getCanvasInjectionScript } from '../fingerprint/canvas';
import { getWebGLInjectionScript } from '../fingerprint/webgl';
import { getHardwareInjectionScript } from '../fingerprint/hardware';
import { generateClientHints } from '../fingerprint/ua';

export interface LaunchOptions {
  headless?: boolean;
  chromePath?: string;
  proxy?: string;
  viewport?: { width: number; height: number };
}

// Default Chrome paths by platform
const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ],
};

/**
 * Find Chrome executable
 */
export function findChrome(): string | null {
  const platform = process.platform;
  const paths = CHROME_PATHS[platform] || [];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Generate combined injection script
 */
function generateInjectionScript(profile: ProfileConfig): string {
  const scripts = [
    getCanvasInjectionScript(profile.canvas),
    getWebGLInjectionScript(profile.webgl),
    getHardwareInjectionScript(profile.hardware),
  ];

  return scripts.join('\n\n');
}

/**
 * Browser Launcher class
 */
export class BrowserLauncher {
  private profileManager: ProfileManager;
  private activeBrowsers: Map<string, Browser> = new Map();

  constructor(profileManager?: ProfileManager) {
    this.profileManager = profileManager || new ProfileManager();
  }

  /**
   * Launch browser with profile
   */
  async launch(profileId: string, options: LaunchOptions = {}): Promise<Browser> {
    const profile = this.profileManager.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    // Update last used
    this.profileManager.update(profileId, { lastUsed: new Date().toISOString() });

    const chromePath = options.chromePath || findChrome();
    if (!chromePath) {
      throw new Error('Chrome executable not found. Please specify chromePath option.');
    }

    const userDataDir = this.profileManager.getUserDataDir(profileId);

    // Build Chrome arguments
    const args = [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      `--user-agent=${profile.userAgent}`,
    ];

    // Add proxy if configured
    const proxyArg = this.getProxyArg(profile, options.proxy);
    if (proxyArg) {
      args.push(proxyArg);
    }

    // Launch browser
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: options.headless ?? false,
      userDataDir,
      args,
      defaultViewport: options.viewport || {
        width: profile.hardware.screenWidth,
        height: profile.hardware.screenHeight - 100,
      },
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // Store reference
    this.activeBrowsers.set(profileId, browser);

    // Apply fingerprint spoofing to all pages
    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        const page = await target.page();
        if (page) {
          await this.applyFingerprint(page, profile);
        }
      }
    });

    // Apply to existing pages
    const pages = await browser.pages();
    for (const page of pages) {
      await this.applyFingerprint(page, profile);
    }

    return browser;
  }

  /**
   * Apply fingerprint spoofing to a page
   */
  private async applyFingerprint(page: Page, profile: ProfileConfig): Promise<void> {
    const injectionScript = generateInjectionScript(profile);

    // Inject before page loads
    await page.evaluateOnNewDocument(injectionScript);

    // Override User-Agent via CDP
    const client = await page.target().createCDPSession();

    // Set User-Agent
    await client.send('Network.setUserAgentOverride', {
      userAgent: profile.userAgent,
      ...generateClientHints(profile.userAgent),
    });

    // Mask webdriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    // Hide automation indicators
    await page.evaluateOnNewDocument(() => {
      // Remove Puppeteer/Chrome automation flags
      const newProto = (navigator as any).__proto__;
      delete newProto.webdriver;

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
            { name: 'Native Client', filename: 'internal-nacl-plugin' },
          ];
          return Object.setPrototypeOf(
            plugins.map((p) => ({
              ...p,
              description: '',
              length: 1,
              item: () => null,
              namedItem: () => null,
            })),
            PluginArray.prototype
          );
        },
      });

      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: 'denied' } as PermissionStatus);
        }
        return originalQuery(parameters);
      };
    });
  }

  /**
   * Get proxy argument for Chrome
   */
  private getProxyArg(profile: ProfileConfig, overrideProxy?: string): string | null {
    if (overrideProxy) {
      return `--proxy-server=${overrideProxy}`;
    }

    if (!profile.proxy) {
      return null;
    }

    const { type, host, port, warpPort } = profile.proxy;

    if (type === 'warp' && warpPort) {
      return `--proxy-server=socks5://127.0.0.1:${warpPort}`;
    }

    if (host && port) {
      const scheme = type === 'socks5' ? 'socks5' : 'http';
      return `--proxy-server=${scheme}://${host}:${port}`;
    }

    return null;
  }

  /**
   * Create new page with fingerprint
   */
  async newPage(profileId: string): Promise<Page> {
    const browser = this.activeBrowsers.get(profileId);
    if (!browser) {
      throw new Error(`No active browser for profile: ${profileId}`);
    }

    const profile = this.profileManager.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const page = await browser.newPage();
    await this.applyFingerprint(page, profile);
    return page;
  }

  /**
   * Close browser for profile
   */
  async close(profileId: string): Promise<void> {
    const browser = this.activeBrowsers.get(profileId);
    if (browser) {
      await browser.close();
      this.activeBrowsers.delete(profileId);
    }
  }

  /**
   * Close all browsers
   */
  async closeAll(): Promise<void> {
    for (const [profileId, browser] of this.activeBrowsers) {
      await browser.close();
    }
    this.activeBrowsers.clear();
  }

  /**
   * Get active browser for profile
   */
  getBrowser(profileId: string): Browser | undefined {
    return this.activeBrowsers.get(profileId);
  }
}

export const browserLauncher = new BrowserLauncher();
