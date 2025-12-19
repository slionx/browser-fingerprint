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

    const headless = options.headless ?? false;

    // Build Chrome arguments
    const args = [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      `--user-agent=${profile.userAgent}`,
    ];

    if (headless) {
      args.push(`--window-size=${profile.hardware.screenWidth},${profile.hardware.screenHeight}`);
    }

    // Add proxy if configured
    const proxyArg = this.getProxyArg(profile, options.proxy);
    if (proxyArg) {
      args.push(proxyArg);
    }

    // Launch browser
    const viewportHeight = headless
      ? profile.hardware.screenHeight
      : profile.hardware.screenHeight - 100;

    const defaultViewport = options.viewport
      ? { ...options.viewport, deviceScaleFactor: profile.hardware.pixelRatio }
      : {
          width: profile.hardware.screenWidth,
          height: viewportHeight,
          deviceScaleFactor: profile.hardware.pixelRatio,
        };

    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless,
      userDataDir,
      args,
      defaultViewport,
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // Store reference
    this.activeBrowsers.set(profileId, browser);

    const originalNewPage = browser.newPage.bind(browser);
    (browser as any).newPage = async () => {
      const page = await originalNewPage();
      await this.applyFingerprint(page, profile);
      return page;
    };

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

    try {
      await page.evaluate((script) => {
        eval(script);
      }, injectionScript);
    } catch (e) {}

    // Override User-Agent via CDP
    const client = await page.target().createCDPSession();

    // Set User-Agent
    await client.send('Network.setUserAgentOverride', {
      userAgent: profile.userAgent,
      ...generateClientHints(profile.userAgent),
    });

    // Mask webdriver
    const webdriverOverride = () => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    };
    await page.evaluateOnNewDocument(webdriverOverride);
    try {
      await page.evaluate(webdriverOverride);
    } catch (e) {}

    // Hide automation indicators
    const hideAutomationIndicators = () => {
      // Remove Puppeteer/Chrome automation flags
      const newProto = (navigator as any).__proto__;
      delete newProto.webdriver;

      // Mock plugins
      const createPluginAndMimeTypeArrays = () => {
        const data = [
          {
            name: 'Chrome PDF Plugin',
            filename: 'internal-pdf-viewer',
            description: 'Portable Document Format',
            mimeTypes: [
              {
                type: 'application/x-google-chrome-pdf',
                suffixes: 'pdf',
                description: 'Portable Document Format',
              },
            ],
          },
          {
            name: 'Chrome PDF Viewer',
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            description: '',
            mimeTypes: [
              {
                type: 'application/pdf',
                suffixes: 'pdf',
                description: '',
              },
            ],
          },
          {
            name: 'Native Client',
            filename: 'internal-nacl-plugin',
            description: '',
            mimeTypes: [
              {
                type: 'application/x-nacl',
                suffixes: '',
                description: 'Native Client Executable',
              },
              {
                type: 'application/x-pnacl',
                suffixes: '',
                description: 'Portable Native Client Executable',
              },
            ],
          },
        ];

        const plugins: any[] = [];
        const mimeTypes: any[] = [];

        const makeMimeType = (mt: any, enabledPlugin: any) => {
          const mimeType: any = {};
          Object.defineProperties(mimeType, {
            type: { get: () => mt.type },
            suffixes: { get: () => mt.suffixes },
            description: { get: () => mt.description },
            enabledPlugin: { get: () => enabledPlugin },
          });
          if (typeof MimeType !== 'undefined') {
            try {
              Object.setPrototypeOf(mimeType, (MimeType as any).prototype);
            } catch (e) {}
          }
          return mimeType;
        };

        const makePlugin = (p: any) => {
          const plugin: any = {};
          Object.defineProperties(plugin, {
            name: { get: () => p.name },
            filename: { get: () => p.filename },
            description: { get: () => p.description },
            length: { get: () => p.mimeTypes.length },
          });

          const pluginMimeTypes = p.mimeTypes.map((mt: any) => makeMimeType(mt, plugin));
          for (let i = 0; i < pluginMimeTypes.length; i++) {
            Object.defineProperty(plugin, i, { get: () => pluginMimeTypes[i] });
            mimeTypes.push(pluginMimeTypes[i]);
          }

          plugin.item = (index: number) => plugin[index] || null;
          plugin.namedItem = (name: string) => {
            for (let i = 0; i < plugin.length; i++) {
              const mt = plugin[i];
              if (mt && mt.type === name) return mt;
            }
            return null;
          };

          if (typeof Plugin !== 'undefined') {
            try {
              Object.setPrototypeOf(plugin, (Plugin as any).prototype);
            } catch (e) {}
          }

          return plugin;
        };

        for (const p of data) {
          plugins.push(makePlugin(p));
        }

        const pluginArray: any = plugins;
        pluginArray.item = (index: number) => pluginArray[index] || null;
        pluginArray.namedItem = (name: string) => pluginArray.find((p: any) => p.name === name) || null;
        pluginArray.refresh = () => undefined;

        const mimeTypeArray: any = mimeTypes;
        mimeTypeArray.item = (index: number) => mimeTypeArray[index] || null;
        mimeTypeArray.namedItem = (name: string) => mimeTypeArray.find((mt: any) => mt.type === name) || null;

        if (typeof PluginArray !== 'undefined') {
          try {
            Object.setPrototypeOf(pluginArray, (PluginArray as any).prototype);
          } catch (e) {}
        }
        if (typeof MimeTypeArray !== 'undefined') {
          try {
            Object.setPrototypeOf(mimeTypeArray, (MimeTypeArray as any).prototype);
          } catch (e) {}
        }

        return { pluginArray, mimeTypeArray };
      };

      const { pluginArray, mimeTypeArray } = createPluginAndMimeTypeArrays();

      Object.defineProperty(navigator, 'plugins', {
        get: () => pluginArray,
        configurable: true,
      });

      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => mimeTypeArray,
        configurable: true,
      });

      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: 'denied' } as PermissionStatus);
        }
        return originalQuery(parameters);
      };
    };
    await page.evaluateOnNewDocument(hideAutomationIndicators);
    try {
      await page.evaluate(hideAutomationIndicators);
    } catch (e) {}
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
