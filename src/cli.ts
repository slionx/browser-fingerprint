#!/usr/bin/env node
/**
 * Browser Fingerprint CLI
 */

import { program } from 'commander';
import chalk from 'chalk';
import { ProfileManager } from './fingerprint/profile';
import { BrowserLauncher, findChrome } from './browser/launcher';
import { cleanProfile, getProfileSize, formatBytes } from './utils/cleanup';
import { isWarpInstalled, getWarpStatus, connectWarp, disconnectWarp, rotateWarpIP } from './network/warp';

const manager = new ProfileManager();
const launcher = new BrowserLauncher(manager);

program
  .name('bfp')
  .description('Browser Fingerprint - Launch Chrome with unique fingerprints')
  .version('1.0.0');

// Create profile
program
  .command('create <name>')
  .description('Create a new browser profile')
  .option('-p, --platform <platform>', 'Platform: windows, mac, linux, random', 'random')
  .option('--proxy <proxy>', 'Proxy server URL')
  .action((name, options) => {
    const profile = manager.create(name, options.platform);
    console.log(chalk.green('✓ Profile created:'));
    console.log(`  ID: ${chalk.cyan(profile.id)}`);
    console.log(`  Name: ${profile.name}`);
    console.log(`  UA: ${profile.userAgent.substring(0, 60)}...`);
    console.log(`  WebGL: ${profile.webgl.renderer.substring(0, 50)}...`);
    console.log(`  Screen: ${profile.hardware.screenWidth}x${profile.hardware.screenHeight}`);
  });

// List profiles
program
  .command('list')
  .alias('ls')
  .description('List all profiles')
  .action(() => {
    const profiles = manager.list();
    if (profiles.length === 0) {
      console.log(chalk.yellow('No profiles found. Create one with: bfp create <name>'));
      return;
    }

    console.log(chalk.bold('Profiles:\n'));
    for (const p of profiles) {
      const size = formatBytes(getProfileSize(manager.getUserDataDir(p.id)));
      console.log(`  ${chalk.cyan(p.id.substring(0, 8))} ${chalk.bold(p.name)}`);
      console.log(`    Created: ${new Date(p.createdAt).toLocaleDateString()}`);
      console.log(`    Size: ${size}`);
      console.log('');
    }
  });

// Launch browser
program
  .command('launch <profile>')
  .description('Launch browser with profile (ID or name)')
  .option('--headless', 'Run in headless mode')
  .option('--proxy <proxy>', 'Override proxy server')
  .option('--chrome <path>', 'Path to Chrome executable')
  .action(async (profileRef, options) => {
    // Find profile by ID or name
    const profiles = manager.list();
    let profile = profiles.find((p) =>
      p.id === profileRef || p.id.startsWith(profileRef) || p.name === profileRef
    );

    if (!profile) {
      console.log(chalk.red(`Profile not found: ${profileRef}`));
      console.log('Use "bfp list" to see available profiles');
      process.exit(1);
    }

    console.log(chalk.cyan(`Launching profile: ${profile.name}`));
    console.log(`  UA: ${profile.userAgent.substring(0, 50)}...`);
    console.log(`  WebGL: ${profile.webgl.renderer.substring(0, 40)}...`);

    try {
      const browser = await launcher.launch(profile.id, {
        headless: options.headless,
        proxy: options.proxy,
        chromePath: options.chrome,
      });

      console.log(chalk.green('✓ Browser launched'));
      console.log('Press Ctrl+C to close');

      // Keep process running
      process.on('SIGINT', async () => {
        console.log('\nClosing browser...');
        await launcher.close(profile!.id);
        process.exit(0);
      });
    } catch (error: any) {
      console.error(chalk.red('Failed to launch browser:'), error.message);
      process.exit(1);
    }
  });

// Delete profile
program
  .command('delete <profile>')
  .alias('rm')
  .description('Delete a profile')
  .action((profileRef) => {
    const profiles = manager.list();
    const profile = profiles.find((p) =>
      p.id === profileRef || p.id.startsWith(profileRef) || p.name === profileRef
    );

    if (!profile) {
      console.log(chalk.red(`Profile not found: ${profileRef}`));
      process.exit(1);
    }

    if (manager.delete(profile.id)) {
      console.log(chalk.green(`✓ Deleted profile: ${profile.name}`));
    } else {
      console.log(chalk.red('Failed to delete profile'));
    }
  });

// Clean profile
program
  .command('clean <profile>')
  .description('Clean profile storage (cookies, cache, etc.)')
  .option('--all', 'Clean all data except config')
  .action((profileRef, options) => {
    const profiles = manager.list();
    const profile = profiles.find((p) =>
      p.id === profileRef || p.id.startsWith(profileRef) || p.name === profileRef
    );

    if (!profile) {
      console.log(chalk.red(`Profile not found: ${profileRef}`));
      process.exit(1);
    }

    const sizeBefore = getProfileSize(manager.getUserDataDir(profile.id));
    cleanProfile(manager.getUserDataDir(profile.id), { all: options.all });
    const sizeAfter = getProfileSize(manager.getUserDataDir(profile.id));

    console.log(chalk.green(`✓ Cleaned profile: ${profile.name}`));
    console.log(`  Freed: ${formatBytes(sizeBefore - sizeAfter)}`);
  });

// Regenerate fingerprint
program
  .command('regenerate <profile>')
  .alias('regen')
  .description('Regenerate fingerprint for profile')
  .action((profileRef) => {
    const profiles = manager.list();
    const profile = profiles.find((p) =>
      p.id === profileRef || p.id.startsWith(profileRef) || p.name === profileRef
    );

    if (!profile) {
      console.log(chalk.red(`Profile not found: ${profileRef}`));
      process.exit(1);
    }

    const updated = manager.regenerateFingerprint(profile.id);
    if (updated) {
      console.log(chalk.green(`✓ Regenerated fingerprint for: ${profile.name}`));
      console.log(`  New UA: ${updated.userAgent.substring(0, 50)}...`);
      console.log(`  New WebGL: ${updated.webgl.renderer.substring(0, 40)}...`);
    }
  });

// Show profile info
program
  .command('info <profile>')
  .description('Show detailed profile information')
  .action((profileRef) => {
    const profiles = manager.list();
    const profile = profiles.find((p) =>
      p.id === profileRef || p.id.startsWith(profileRef) || p.name === profileRef
    );

    if (!profile) {
      console.log(chalk.red(`Profile not found: ${profileRef}`));
      process.exit(1);
    }

    console.log(chalk.bold(`\nProfile: ${profile.name}\n`));
    console.log(`  ${chalk.cyan('ID:')} ${profile.id}`);
    console.log(`  ${chalk.cyan('Created:')} ${profile.createdAt}`);
    console.log(`  ${chalk.cyan('Last Used:')} ${profile.lastUsed}`);
    console.log(`  ${chalk.cyan('Size:')} ${formatBytes(getProfileSize(manager.getUserDataDir(profile.id)))}`);
    console.log(`\n  ${chalk.cyan('User-Agent:')}`);
    console.log(`    ${profile.userAgent}`);
    console.log(`\n  ${chalk.cyan('WebGL:')}`);
    console.log(`    Vendor: ${profile.webgl.vendor}`);
    console.log(`    Renderer: ${profile.webgl.renderer}`);
    console.log(`\n  ${chalk.cyan('Hardware:')}`);
    console.log(`    CPU Cores: ${profile.hardware.hardwareConcurrency}`);
    console.log(`    Memory: ${profile.hardware.deviceMemory}GB`);
    console.log(`    Screen: ${profile.hardware.screenWidth}x${profile.hardware.screenHeight}`);
    console.log(`    Timezone: ${profile.hardware.timezone}`);
    console.log(`    Language: ${profile.hardware.language}`);
    if (profile.proxy) {
      console.log(`\n  ${chalk.cyan('Proxy:')} ${profile.proxy.type}://${profile.proxy.host}:${profile.proxy.port}`);
    }
  });

// WARP commands
const warp = program.command('warp').description('Cloudflare WARP management');

warp
  .command('status')
  .description('Check WARP status')
  .action(() => {
    if (!isWarpInstalled()) {
      console.log(chalk.red('WARP CLI is not installed'));
      console.log('Install: brew install cloudflare-warp (macOS)');
      return;
    }

    const status = getWarpStatus();
    console.log(`WARP Status: ${status.connected ? chalk.green('Connected') : chalk.red('Disconnected')}`);
  });

warp
  .command('connect')
  .description('Connect to WARP')
  .action(async () => {
    console.log('Connecting to WARP...');
    const success = await connectWarp();
    if (success) {
      console.log(chalk.green('✓ Connected to WARP'));
    } else {
      console.log(chalk.red('Failed to connect to WARP'));
    }
  });

warp
  .command('disconnect')
  .description('Disconnect from WARP')
  .action(() => {
    disconnectWarp();
    console.log(chalk.green('✓ Disconnected from WARP'));
  });

warp
  .command('rotate')
  .description('Rotate WARP IP')
  .action(async () => {
    console.log('Rotating WARP IP...');
    const success = await rotateWarpIP();
    if (success) {
      console.log(chalk.green('✓ WARP IP rotated'));
    } else {
      console.log(chalk.red('Failed to rotate WARP IP'));
    }
  });

// Check Chrome
program
  .command('check')
  .description('Check system configuration')
  .action(() => {
    console.log(chalk.bold('\nSystem Check:\n'));

    // Chrome
    const chromePath = findChrome();
    if (chromePath) {
      console.log(`  ${chalk.green('✓')} Chrome: ${chromePath}`);
    } else {
      console.log(`  ${chalk.red('✗')} Chrome: Not found`);
    }

    // WARP
    if (isWarpInstalled()) {
      const status = getWarpStatus();
      console.log(`  ${chalk.green('✓')} WARP CLI: Installed (${status.connected ? 'Connected' : 'Disconnected'})`);
    } else {
      console.log(`  ${chalk.yellow('!')} WARP CLI: Not installed (optional)`);
    }

    // Profiles
    const profiles = manager.list();
    console.log(`  ${chalk.cyan('i')} Profiles: ${profiles.length}`);
  });

program.parse();
