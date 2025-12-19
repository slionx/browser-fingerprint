/**
 * WebGL Fingerprint Spoofing
 * Randomizes WebGL renderer and vendor information
 */

import { PlatformType } from './ua';

export interface WebGLConfig {
  enabled: boolean;
  vendor: string;
  renderer: string;
  seed: string;
}

// Realistic GPU configurations
const GPU_CONFIGS = [
  // NVIDIA
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  // AMD
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 5600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  // Intel
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  // Apple (for Mac)
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)' },
];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateRandomGPU(platform: PlatformType = 'random'): { vendor: string; renderer: string } {
  if (platform === 'mac') {
    const candidates = GPU_CONFIGS.filter((g) => g.vendor.includes('(Apple)'));
    return randomChoice(candidates.length ? candidates : GPU_CONFIGS);
  }

  if (platform === 'windows' || platform === 'linux') {
    const candidates = GPU_CONFIGS.filter((g) => !g.vendor.includes('(Apple)'));
    return randomChoice(candidates.length ? candidates : GPU_CONFIGS);
  }

  return randomChoice(GPU_CONFIGS);
}

export function generateWebGLSeed(): string {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Generate injection script for WebGL fingerprint spoofing
 */
export function getWebGLInjectionScript(config: WebGLConfig): string {
  return `
(function() {
  if (window.__webglSpoofApplied) return;
  window.__webglSpoofApplied = true;

  const config = ${JSON.stringify(config)};

  if (!config.enabled) return;

  // Override WebGL getParameter
  const getParameterProxy = function(originalFn, target) {
    return function(parameter) {
      // UNMASKED_VENDOR_WEBGL
      if (parameter === 37445) {
        return config.vendor;
      }
      // UNMASKED_RENDERER_WEBGL
      if (parameter === 37446) {
        return config.renderer;
      }
      return originalFn.call(target, parameter);
    };
  };

  // Override for WebGL1
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const context = originalGetContext.call(this, type, ...args);

    if (context && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
      const originalGetParameter = context.getParameter.bind(context);
      context.getParameter = getParameterProxy(originalGetParameter, context);

      // Also override getExtension to return our spoofed debug info
      const originalGetExtension = context.getExtension.bind(context);
      context.getExtension = function(name) {
        const ext = originalGetExtension(name);
        if (name === 'WEBGL_debug_renderer_info') {
          return {
            UNMASKED_VENDOR_WEBGL: 37445,
            UNMASKED_RENDERER_WEBGL: 37446,
          };
        }
        return ext;
      };
    }

    return context;
  };

  console.log('[BFP] WebGL fingerprint spoofing applied');
})();
`;
}

export function getDefaultWebGLConfig(platform: PlatformType = 'random'): WebGLConfig {
  const gpu = generateRandomGPU(platform);
  return {
    enabled: true,
    vendor: gpu.vendor,
    renderer: gpu.renderer,
    seed: generateWebGLSeed(),
  };
}
