/**
 * Cloudflare WARP Integration
 * Manages WARP connections for IP rotation
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import * as net from 'net';

export interface WarpInstance {
  id: string;
  port: number;
  process?: ChildProcess;
  status: 'starting' | 'running' | 'stopped' | 'error';
}

export interface WarpConfig {
  enabled: boolean;
  socksPort: number;
}

/**
 * Check if WARP CLI is installed
 */
export function isWarpInstalled(): boolean {
  try {
    execSync('warp-cli --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current WARP status
 */
export function getWarpStatus(): { connected: boolean; ip?: string } {
  try {
    const output = execSync('warp-cli status', { encoding: 'utf-8' });
    const connected = output.toLowerCase().includes('connected');
    return { connected };
  } catch {
    return { connected: false };
  }
}

/**
 * Connect WARP
 */
export async function connectWarp(): Promise<boolean> {
  if (!isWarpInstalled()) {
    console.error('WARP CLI is not installed. Please install it first:');
    console.error('  macOS: brew install cloudflare-warp');
    console.error('  Linux: https://developers.cloudflare.com/warp-client/get-started/linux/');
    return false;
  }

  try {
    execSync('warp-cli connect', { stdio: 'pipe' });
    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return getWarpStatus().connected;
  } catch (e) {
    return false;
  }
}

/**
 * Disconnect WARP
 */
export function disconnectWarp(): boolean {
  try {
    execSync('warp-cli disconnect', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Rotate WARP IP by reconnecting
 */
export async function rotateWarpIP(): Promise<boolean> {
  disconnectWarp();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return connectWarp();
}

/**
 * Enable WARP proxy mode (SOCKS5)
 */
export function enableWarpProxy(port: number = 40000): boolean {
  try {
    // Set WARP to proxy mode
    execSync(`warp-cli set-mode proxy`, { stdio: 'pipe' });
    execSync(`warp-cli set-proxy-port ${port}`, { stdio: 'pipe' });
    return true;
  } catch (e) {
    console.error('Failed to enable WARP proxy mode:', e);
    return false;
  }
}

/**
 * Get WARP proxy address
 */
export function getWarpProxyAddress(port: number = 40000): string {
  return `socks5://127.0.0.1:${port}`;
}

/**
 * Check if a port is available
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Find an available port starting from base
 */
export async function findAvailablePort(basePort: number = 40000): Promise<number> {
  for (let port = basePort; port < basePort + 100; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error('No available port found');
}

/**
 * WARP Manager class for managing multiple instances
 */
export class WarpManager {
  private instances: Map<string, WarpInstance> = new Map();
  private basePort: number;

  constructor(basePort: number = 40000) {
    this.basePort = basePort;
  }

  /**
   * Get WARP config for a profile
   */
  async getConfigForProfile(profileId: string): Promise<WarpConfig> {
    let instance = this.instances.get(profileId);

    if (!instance) {
      const port = await findAvailablePort(this.basePort + this.instances.size);
      instance = {
        id: profileId,
        port,
        status: 'stopped',
      };
      this.instances.set(profileId, instance);
    }

    return {
      enabled: true,
      socksPort: instance.port,
    };
  }

  /**
   * Start WARP for profile
   */
  async startForProfile(profileId: string): Promise<boolean> {
    // For simplicity, use single WARP instance with rotation
    // In production, you might want to use multiple WARP accounts or proxies
    const status = getWarpStatus();
    if (!status.connected) {
      await connectWarp();
    }
    return getWarpStatus().connected;
  }

  /**
   * Rotate IP for profile
   */
  async rotateForProfile(profileId: string): Promise<boolean> {
    return rotateWarpIP();
  }

  /**
   * Get all instances
   */
  getInstances(): WarpInstance[] {
    return Array.from(this.instances.values());
  }
}

export const warpManager = new WarpManager();

/**
 * Alternative: Simple proxy configuration without WARP
 * Use this if you have your own proxy servers
 */
export interface ProxyServer {
  host: string;
  port: number;
  username?: string;
  password?: string;
  type: 'http' | 'socks5';
  country?: string;
}

export class ProxyManager {
  private proxies: ProxyServer[] = [];
  private currentIndex: number = 0;

  addProxy(proxy: ProxyServer): void {
    this.proxies.push(proxy);
  }

  addProxies(proxies: ProxyServer[]): void {
    this.proxies.push(...proxies);
  }

  getNext(): ProxyServer | null {
    if (this.proxies.length === 0) return null;
    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  getRandom(): ProxyServer | null {
    if (this.proxies.length === 0) return null;
    return this.proxies[Math.floor(Math.random() * this.proxies.length)];
  }

  getByCountry(country: string): ProxyServer | null {
    const filtered = this.proxies.filter((p) => p.country === country);
    if (filtered.length === 0) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  toProxyString(proxy: ProxyServer): string {
    const auth = proxy.username ? `${proxy.username}:${proxy.password}@` : '';
    return `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
  }
}

export const proxyManager = new ProxyManager();
