/**
 * Hardware Information Randomization
 * Spoofs navigator properties related to hardware
 */

import { PlatformType } from './ua';

export interface HardwareConfig {
  enabled: boolean;
  hardwareConcurrency: number;  // CPU cores
  deviceMemory: number;         // RAM in GB
  platform: string;
  language: string;
  languages: string[];
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  pixelRatio: number;
  seed: string;
}

// Common screen resolutions
const SCREEN_RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1680, height: 1050 },
  { width: 2560, height: 1600 },
  { width: 3840, height: 2160 },
];

// Common CPU core counts
const CPU_CORES = [4, 6, 8, 12, 16];

// Common memory sizes
const MEMORY_SIZES = [4, 8, 16, 32];

// Common languages
const LANGUAGES = [
  { primary: 'en-US', list: ['en-US', 'en'] },
  { primary: 'en-GB', list: ['en-GB', 'en'] },
  { primary: 'zh-CN', list: ['zh-CN', 'zh'] },
  { primary: 'ja-JP', list: ['ja-JP', 'ja', 'en'] },
  { primary: 'ko-KR', list: ['ko-KR', 'ko', 'en'] },
  { primary: 'de-DE', list: ['de-DE', 'de', 'en'] },
  { primary: 'fr-FR', list: ['fr-FR', 'fr', 'en'] },
];

// Timezones
const TIMEZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateHardwareSeed(): string {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

export function generateRandomHardware(platform: PlatformType = 'random'): Omit<HardwareConfig, 'enabled' | 'seed'> {
  const screen = randomChoice(SCREEN_RESOLUTIONS);
  const lang = randomChoice(LANGUAGES);

  const resolvedPlatform = platform === 'random'
    ? randomChoice<Exclude<PlatformType, 'random'>>(['windows', 'mac', 'linux'])
    : platform;

  const navigatorPlatform = resolvedPlatform === 'mac'
    ? 'MacIntel'
    : resolvedPlatform === 'windows'
      ? 'Win32'
      : 'Linux x86_64';

  return {
    hardwareConcurrency: randomChoice(CPU_CORES),
    deviceMemory: randomChoice(MEMORY_SIZES),
    platform: navigatorPlatform,
    language: lang.primary,
    languages: lang.list,
    timezone: randomChoice(TIMEZONES),
    screenWidth: screen.width,
    screenHeight: screen.height,
    colorDepth: 24,
    pixelRatio: randomChoice([1, 1.25, 1.5, 2]),
  };
}

/**
 * Generate injection script for hardware spoofing
 */
export function getHardwareInjectionScript(config: HardwareConfig): string {
  return `
(function() {
  if (window.__hardwareSpoofApplied) return;
  window.__hardwareSpoofApplied = true;

  const config = ${JSON.stringify(config)};

  if (!config.enabled) return;

  // Override navigator properties
  const navigatorProps = {
    hardwareConcurrency: { value: config.hardwareConcurrency },
    deviceMemory: { value: config.deviceMemory },
    platform: { value: config.platform },
    language: { value: config.language },
    languages: { value: Object.freeze(config.languages) },
  };

  const navigatorProto = Object.getPrototypeOf(navigator);

  for (const [prop, descriptor] of Object.entries(navigatorProps)) {
    try {
      Object.defineProperty(navigator, prop, {
        get: () => descriptor.value,
        configurable: true,
      });
    } catch (e) {
      // Property might not be configurable
    }

    try {
      Object.defineProperty(navigatorProto, prop, {
        get: () => descriptor.value,
        configurable: true,
      });
    } catch (e) {
    }
  }

  // Override screen properties
  const screenProps = {
    width: config.screenWidth,
    height: config.screenHeight,
    availWidth: config.screenWidth,
    availHeight: config.screenHeight - 40, // Taskbar
    colorDepth: config.colorDepth,
    pixelDepth: config.colorDepth,
  };

  const screenProto = Object.getPrototypeOf(screen);

  for (const [prop, value] of Object.entries(screenProps)) {
    try {
      Object.defineProperty(screen, prop, {
        get: () => value,
        configurable: true,
      });
    } catch (e) {}

    try {
      Object.defineProperty(screenProto, prop, {
        get: () => value,
        configurable: true,
      });
    } catch (e) {}
  }

  // Override devicePixelRatio
  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      get: () => config.pixelRatio,
      configurable: true,
    });
  } catch (e) {}

  // Override timezone
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function(locales, options) {
    options = options || {};
    options.timeZone = options.timeZone || config.timezone;
    return new originalDateTimeFormat(locales, options);
  };
  Intl.DateTimeFormat.prototype = originalDateTimeFormat.prototype;
  Intl.DateTimeFormat.supportedLocalesOf = originalDateTimeFormat.supportedLocalesOf;

  // Override Date.prototype.getTimezoneOffset
  const targetOffset = getTimezoneOffset(config.timezone);
  Date.prototype.getTimezoneOffset = function() {
    return targetOffset;
  };

  function getTimezoneOffset(tz) {
    const offsets = {
      'America/New_York': 300,
      'America/Los_Angeles': 480,
      'America/Chicago': 360,
      'Europe/London': 0,
      'Europe/Paris': -60,
      'Europe/Berlin': -60,
      'Asia/Tokyo': -540,
      'Asia/Shanghai': -480,
      'Asia/Singapore': -480,
      'Australia/Sydney': -660,
    };
    return offsets[tz] || 0;
  }

  console.log('[BFP] Hardware spoofing applied');
})();
`;
}

export function getDefaultHardwareConfig(platform: PlatformType = 'random'): HardwareConfig {
  const hardware = generateRandomHardware(platform);
  return {
    enabled: true,
    ...hardware,
    seed: generateHardwareSeed(),
  };
}
