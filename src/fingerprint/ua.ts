/**
 * Dynamic User-Agent Generator
 * Generates unique, realistic User-Agent strings
 */

interface UAComponents {
  platform: string;
  platformVersion: string;
  browser: string;
  browserVersion: string;
  webkit: string;
  chrome: string;
}

// Chrome version ranges (realistic recent versions)
const CHROME_VERSIONS = {
  min: 110,
  max: 120,
};

// Platform configurations
const PLATFORMS = {
  windows: {
    name: 'Windows NT',
    versions: ['10.0', '11.0'],
    arch: ['Win64; x64'],
  },
  mac: {
    name: 'Macintosh',
    versions: ['10_15_7', '11_0', '12_0', '13_0', '14_0'],
    arch: ['Intel Mac OS X', 'Apple Silicon'],
  },
  linux: {
    name: 'X11',
    versions: [''],
    arch: ['Linux x86_64'],
  },
};

// WebKit versions corresponding to Chrome versions
const WEBKIT_BASE = 537.36;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateChromeVersion(): string {
  const major = randomInt(CHROME_VERSIONS.min, CHROME_VERSIONS.max);
  const minor = 0;
  const build = randomInt(5000, 6000);
  const patch = randomInt(0, 200);
  return `${major}.${minor}.${build}.${patch}`;
}

function generateWindowsUA(): string {
  const chromeVersion = generateChromeVersion();
  const ntVersion = randomChoice(PLATFORMS.windows.versions);
  const arch = randomChoice(PLATFORMS.windows.arch);

  return `Mozilla/5.0 (Windows NT ${ntVersion}; ${arch}) AppleWebKit/${WEBKIT_BASE} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${WEBKIT_BASE}`;
}

function generateMacUA(): string {
  const chromeVersion = generateChromeVersion();
  const osVersion = randomChoice(PLATFORMS.mac.versions);

  return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${osVersion}) AppleWebKit/${WEBKIT_BASE} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${WEBKIT_BASE}`;
}

function generateLinuxUA(): string {
  const chromeVersion = generateChromeVersion();

  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/${WEBKIT_BASE} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${WEBKIT_BASE}`;
}

export type PlatformType = 'windows' | 'mac' | 'linux' | 'random';

export function generateUA(platform: PlatformType = 'random'): string {
  if (platform === 'random') {
    const platforms: PlatformType[] = ['windows', 'mac', 'linux'];
    const weights = [0.7, 0.2, 0.1]; // Windows is most common
    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < platforms.length; i++) {
      cumulative += weights[i];
      if (rand < cumulative) {
        platform = platforms[i];
        break;
      }
    }
  }

  switch (platform) {
    case 'windows':
      return generateWindowsUA();
    case 'mac':
      return generateMacUA();
    case 'linux':
      return generateLinuxUA();
    default:
      return generateWindowsUA();
  }
}

export function parseUA(ua: string): UAComponents | null {
  const chromeMatch = ua.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
  const platformMatch = ua.match(/\(([^)]+)\)/);

  if (!chromeMatch || !platformMatch) return null;

  return {
    platform: platformMatch[1],
    platformVersion: '',
    browser: 'Chrome',
    browserVersion: chromeMatch[1],
    webkit: WEBKIT_BASE.toString(),
    chrome: chromeMatch[1],
  };
}

// Generate SEC-CH-UA headers (Client Hints)
export function generateClientHints(ua: string): Record<string, string> {
  const parsed = parseUA(ua);
  if (!parsed) return {};

  const majorVersion = parsed.browserVersion.split('.')[0];

  return {
    'sec-ch-ua': `"Chromium";v="${majorVersion}", "Google Chrome";v="${majorVersion}", "Not=A?Brand";v="8"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': ua.includes('Windows') ? '"Windows"' : ua.includes('Mac') ? '"macOS"' : '"Linux"',
  };
}
