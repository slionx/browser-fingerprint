# Browser Fingerprint

使用原生 Chrome 浏览器实现浏览器指纹隔离，每个 Profile 都有独立且唯一的指纹特征。

## 功能特性

- **独立 Profile 目录** - 每个账号完全隔离的浏览器数据
- **动态随机 UA** - 无限不重复的 User-Agent 生成
- **Canvas 指纹混淆** - 基于种子的 Canvas 噪声注入
- **WebGL 指纹混淆** - 随机化 GPU 渲染器信息
- **硬件信息随机化** - CPU、内存、屏幕、时区等
- **完整存储清理** - Cookie、缓存、历史记录等
- **WARP IP 轮换** - Cloudflare WARP 集成
- **代理支持** - HTTP/SOCKS5 代理

## 效果示例

```
账号1: IP 5.6.7.8 (美国), Canvas XYZ789, RTX 3060, Profile独立
账号2: IP 9.10.11.12 (日本), Canvas DEF456, RX 6700 XT, Profile独立
账号3: IP 13.14.15.16 (新加坡), Canvas GHI789, Intel Iris Xe, Profile独立
```

## 安装

```bash
npm install
npm run build
```

## CLI 使用

```bash
# 检查系统配置
npm run start -- check

# 创建新 Profile
npm run start -- create account1
npm run start -- create account2 --platform mac
npm run start -- create account3 --proxy socks5://127.0.0.1:1080

# 列出所有 Profile
npm run start -- list

# 启动浏览器
npm run start -- launch account1
npm run start -- launch account2 --headless

# 查看 Profile 详情
npm run start -- info account1

# 重新生成指纹
npm run start -- regenerate account1

# 清理 Profile 存储
npm run start -- clean account1
npm run start -- clean account1 --all

# 删除 Profile
npm run start -- delete account1

# WARP 管理
npm run start -- warp status
npm run start -- warp connect
npm run start -- warp rotate
npm run start -- warp disconnect


推荐操作流程（串行用账号、尽量让 IP 变）
步骤 1：确保 account1 的浏览器完全退出（不要让它还在后台跑连接）
步骤 2：旋转/重连 WARP
npm run start -- warp rotate
# 或者更“硬”的方式：
# npm run start -- warp disconnect
# npm run start -- warp connect
步骤 3：确认 WARP 连接状态
npm run start -- warp status
步骤 4：再启动 account2
npm run start -- launch account2
步骤 5：在浏览器里打开一个查 IP 网站确认是否变了
```

## 编程接口

### 快速启动

```typescript
import { quickLaunch } from 'browser-fingerprint';

const { browser, profile, close } = await quickLaunch({
  name: 'test-account',
  proxy: 'socks5://127.0.0.1:1080',
});

const page = await browser.newPage();
await page.goto('https://browserleaks.com/canvas');

// 完成后关闭
await close();
```

### 多账号管理

```typescript
import { BrowserPool } from 'browser-fingerprint';

const pool = new BrowserPool('./my-profiles');

// 创建多个浏览器实例
const account1 = await pool.create('account1', { proxy: 'socks5://proxy1:1080' });
const account2 = await pool.create('account2', { proxy: 'socks5://proxy2:1080' });
const account3 = await pool.create('account3', { proxy: 'socks5://proxy3:1080' });

// 每个实例有独立指纹
console.log(account1.profile.webgl.renderer); // NVIDIA GeForce RTX 3060
console.log(account2.profile.webgl.renderer); // AMD Radeon RX 6700 XT
console.log(account3.profile.webgl.renderer); // Intel Iris Xe Graphics

// 使用浏览器
const page1 = await account1.browser.newPage();
await page1.goto('https://aws.amazon.com');

// 关闭所有
await pool.closeAll();
```

### 手动管理 Profile

```typescript
import { ProfileManager, BrowserLauncher } from 'browser-fingerprint';

const manager = new ProfileManager('./profiles');
const launcher = new BrowserLauncher(manager);

// 创建 Profile
const profile = manager.create('my-account', 'windows', {
  type: 'socks5',
  host: '127.0.0.1',
  port: 1080,
});

console.log('Profile ID:', profile.id);
console.log('User-Agent:', profile.userAgent);
console.log('WebGL Vendor:', profile.webgl.vendor);
console.log('WebGL Renderer:', profile.webgl.renderer);
console.log('Screen:', `${profile.hardware.screenWidth}x${profile.hardware.screenHeight}`);
console.log('Timezone:', profile.hardware.timezone);

// 启动浏览器
const browser = await launcher.launch(profile.id);

// 重新生成指纹（保留 Profile 数据）
manager.regenerateFingerprint(profile.id);

// 清理存储（保留配置）
manager.clean(profile.id);

// 删除 Profile
manager.delete(profile.id);
```

## 指纹组件

### Canvas 指纹

通过在 Canvas 像素数据中注入微小噪声来混淆指纹：

```typescript
import { getDefaultCanvasConfig } from 'browser-fingerprint';

const config = getDefaultCanvasConfig();
// { enabled: true, noise: 3, seed: 'abc123...' }
```

### WebGL 指纹

随机化 GPU 渲染器和供应商信息：

```typescript
import { generateRandomGPU } from 'browser-fingerprint';

const gpu = generateRandomGPU();
// { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060...)' }
```

### 硬件指纹

随机化硬件特征：

```typescript
import { generateRandomHardware } from 'browser-fingerprint';

const hardware = generateRandomHardware();
// {
//   hardwareConcurrency: 8,
//   deviceMemory: 16,
//   screenWidth: 1920,
//   screenHeight: 1080,
//   timezone: 'America/New_York',
//   language: 'en-US',
//   ...
// }
```

## WARP 集成

使用 Cloudflare WARP 进行 IP 轮换：

```bash
# 安装 WARP CLI
# macOS
brew install cloudflare-warp

# 注册（首次使用）
warp-cli register

# 通过 CLI 使用
npm run start -- warp connect
npm run start -- warp rotate
```

```typescript
import { connectWarp, rotateWarpIP, getWarpStatus } from 'browser-fingerprint';

// 检查状态
const status = getWarpStatus();
console.log('Connected:', status.connected);

// 连接
await connectWarp();

// 轮换 IP
await rotateWarpIP();
```

## 代理配置

支持 HTTP 和 SOCKS5 代理：

```typescript
// 创建带代理的 Profile
const profile = manager.create('account', 'random', {
  type: 'socks5',
  host: '127.0.0.1',
  port: 1080,
  username: 'user',     // 可选
  password: 'pass',     // 可选
});

// 或使用代理管理器
import { proxyManager } from 'browser-fingerprint';

proxyManager.addProxies([
  { type: 'socks5', host: 'us.proxy.com', port: 1080, country: 'US' },
  { type: 'socks5', host: 'jp.proxy.com', port: 1080, country: 'JP' },
  { type: 'socks5', host: 'sg.proxy.com', port: 1080, country: 'SG' },
]);

const usProxy = proxyManager.getByCountry('US');
const randomProxy = proxyManager.getRandom();
```

## 检测测试

推荐使用以下网站测试指纹隔离效果：

- https://browserleaks.com/canvas
- https://browserleaks.com/webgl
- https://browserleaks.com/javascript
- https://fingerprintjs.github.io/fingerprintjs/
- https://pixelscan.net
- https://bot.sannysoft.com

### 综合指纹/隐私信息检测（类似 BrowserLeaks）

- https://browserleaks.com/（canvas/webgl/webrtc/javascript/fonts/headers 等分项页面）
- https://pixelscan.net/fingerprint-check（指纹一致性/风险评分）
- https://www.browserscan.net（综合指纹检测）
- https://amiunique.org/fingerprint（指纹唯一性/研究向）
- https://coveryourtracks.eff.org/（追踪/指纹综合测试）
- https://www.deviceinfo.me/（设备/浏览器暴露信息大全）

### 自动化/无头/反爬检测（看你像不像 bot）

- https://bot.sannysoft.com/
- https://bot.incolumitas.com/
- https://arh.antoinevastel.com/bots/areyouheadless
- https://intoli.com/blog/making-chrome-headless-undetectable/chrome-headless-test.html
- https://fingerprintjs.github.io/BotD/main/
- https://pixelscan.net/bot-check

### IP / DNS / WebRTC 泄露检测（代理/隧道常踩坑）

- https://ipleak.net/
- https://www.dnsleaktest.com/webrtc.html（含 WebRTC 页面）
- https://browserleaks.com/webrtc
- https://whoer.net/

### TLS / HTTP2 指纹（更偏网络层）

- https://www.howsmyssl.com/
- https://www.browserscan.net/tls
- https://tls.peet.ws/（JA3/HTTP2 相关）

### 额外：CreepJS（强指纹探测）

- https://abrahamjuliot.github.io/creepjs/（官方 GitHub Pages；非官方镜像可能是 honeypot）

## 注意事项

1. **代理配置** - 建议每个 Profile 使用不同的代理 IP
2. **指纹一致性** - Profile 的指纹在重新生成前保持一致
3. **存储隔离** - 每个 Profile 的 Cookie、LocalStorage 等完全隔离
4. **Chrome 版本** - 需要本地安装 Chrome 或 Chromium

## License

MIT
