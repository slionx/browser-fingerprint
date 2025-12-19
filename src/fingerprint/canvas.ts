/**
 * Canvas Fingerprint Spoofing
 * Adds subtle noise to canvas operations to create unique fingerprints
 */

export interface CanvasNoiseConfig {
  enabled: boolean;
  noise: number; // 0-10, amount of noise to add
  seed: string;  // Seed for consistent noise per profile
}

export function generateCanvasNoiseSeed(): string {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Generate injection script for Canvas fingerprint spoofing
 */
export function getCanvasInjectionScript(config: CanvasNoiseConfig): string {
  return `
(function() {
  if (window.__canvasNoiseApplied) return;
  window.__canvasNoiseApplied = true;

  const config = ${JSON.stringify(config)};

  // Seeded random number generator for consistent noise per profile
  function seededRandom(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return function() {
      hash = Math.sin(hash) * 10000;
      return hash - Math.floor(hash);
    };
  }

  const noiseScale = config.noise / 100;

  // Store original methods
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

  // Add noise to canvas pixel data
  function addNoise(imageData) {
    const random = seededRandom(config.seed + '_canvas');
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Add subtle noise to RGB channels (not alpha)
      for (let j = 0; j < 3; j++) {
        const noise = Math.floor((random() - 0.5) * noiseScale * 10);
        data[i + j] = Math.max(0, Math.min(255, data[i + j] + noise));
      }
    }
    return imageData;
  }

  // Override toDataURL
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    if (!config.enabled) return originalToDataURL.apply(this, args);

    const ctx = this.getContext('2d');
    if (ctx) {
      try {
        const imageData = originalGetImageData.call(ctx, 0, 0, this.width, this.height);
        const originalData = new Uint8ClampedArray(imageData.data);
        const noisyData = addNoise(imageData);
        ctx.putImageData(noisyData, 0, 0);

        const result = originalToDataURL.apply(this, args);

        imageData.data.set(originalData);
        ctx.putImageData(imageData, 0, 0);

        return result;
      } catch (e) {
        // Canvas might be tainted, proceed without noise
      }
    }
    return originalToDataURL.apply(this, args);
  };

  // Override toBlob
  HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
    if (!config.enabled) return originalToBlob.call(this, callback, ...args);

    const ctx = this.getContext('2d');
    if (ctx) {
      try {
        const imageData = originalGetImageData.call(ctx, 0, 0, this.width, this.height);
        const originalData = new Uint8ClampedArray(imageData.data);
        const noisyData = addNoise(imageData);
        ctx.putImageData(noisyData, 0, 0);

        const wrappedCallback = function(blob) {
          try {
            imageData.data.set(originalData);
            ctx.putImageData(imageData, 0, 0);
          } catch (e) {}
          callback(blob);
        };

        return originalToBlob.call(this, wrappedCallback, ...args);
      } catch (e) {
        // Canvas might be tainted
      }
    }
    return originalToBlob.call(this, callback, ...args);
  };

  // Override getImageData
  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    const imageData = originalGetImageData.apply(this, args);
    if (!config.enabled) return imageData;
    return addNoise(imageData);
  };

  console.log('[BFP] Canvas fingerprint noise applied');
})();
`;
}

export function getDefaultCanvasConfig(): CanvasNoiseConfig {
  return {
    enabled: true,
    noise: 3,
    seed: generateCanvasNoiseSeed(),
  };
}
