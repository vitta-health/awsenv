#!/usr/bin/env node

import args from 'args';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

const VERSION = JSON.parse(await fs.readFile('./package.json', 'utf8')).version;
const DIST_DIR = './dist';
const RELEASES_DIR = './releases';

// Configure args
args
  .command('all', 'Build everything (default)', buildAll, ['a'])
  .command('dist', 'Build optimized distribution', buildDist, ['d'])
  .command('binaries', 'Build platform binaries', buildBinaries, ['b'])
  .command('clean', 'Clean all build artifacts', clean, ['c']);

// Parse arguments
const flags = args.parse(process.argv, { value: false, exit: false });

// If no command specified, run build all
if (!args.sub || args.sub.length === 0) {
  await buildAll();
  process.exit(0);
}

// Command implementations
async function buildAll() {
  console.log(`🚀 AWSENV Build v${VERSION}\n`);
  
  await clean();
  await buildDist();
  await buildBinaries();
  
  console.log('\n✅ Build complete!');
  console.log(`📦 Optimized dist in: ${DIST_DIR}/`);
  console.log(`💾 Binaries in: ${RELEASES_DIR}/`);
}

async function clean() {
  console.log('🧹 Cleaning...');
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.rm(RELEASES_DIR, { recursive: true, force: true });
  console.log('  ✓ Clean complete');
}

async function buildDist() {
  console.log('\n📦 Building optimized distribution...');
  
  await fs.mkdir(DIST_DIR, { recursive: true });
  
  // Simple copy for npm package
  await simpleCopy();
  
  // Create npm package
  console.log('\n  Creating npm package...');
  await execAsync(`cd ${DIST_DIR} && npm pack --silent`);
  await execAsync(`mv ${DIST_DIR}/*.tgz ${DIST_DIR}/awsenv-${VERSION}.tgz`);
  console.log(`  ✓ Package created: awsenv-${VERSION}.tgz`);
}

async function simpleCopy() {
  // Copy source files
  const files = ['index.js', 'package.json', 'README.md'];
  for (const file of files) {
    await fs.copyFile(file, path.join(DIST_DIR, file));
  }
  
  // Copy source directory
  await execAsync(`cp -r src ${DIST_DIR}/`);
  
  // Clean package.json
  const pkg = JSON.parse(await fs.readFile('./package.json', 'utf8'));
  delete pkg.devDependencies;
  delete pkg.scripts;
  delete pkg.vitest;
  delete pkg.pkg;
  
  await fs.writeFile(`${DIST_DIR}/package.json`, JSON.stringify(pkg, null, 2));
  
  // Install production deps
  await execAsync(`cd ${DIST_DIR} && npm install --production --silent`);
}

async function buildBinaries() {
  console.log('\n💾 Building platform binaries...');
  
  await fs.mkdir(RELEASES_DIR, { recursive: true });
  
  // Check if pkg is available globally
  let hasPkg = false;
  try {
    await execAsync('which pkg');
    hasPkg = true;
  } catch {
    console.log('  ⚠ pkg not found globally');
  }
  
  if (hasPkg) {
    console.log('  Building standalone binaries with pkg...');
    
    // Use Node 18 targets  
    const pkgTargets = [
      'node18-linux-x64',
      'node18-linux-arm64', 
      'node18-macos-x64',
      'node18-macos-arm64',
      'node18-win-x64'
    ];
    
    try {
      // First, build with esbuild to create CJS bundle
      console.log('  Creating CJS bundle with esbuild...');
      await execAsync('pnpm run build:bundle');
      
      // Then build binaries from the webpack bundle
      console.log('  Building binaries from webpack bundle...');
      await execAsync(`pkg ${DIST_DIR}/bundle.cjs \
        --targets ${pkgTargets.join(',')} \
        --out-path ${RELEASES_DIR}`);
      
      // Rename outputs to the specified naming convention
      const renames = [
        ['bundle-linux-x64', 'awsenv-linux'],
        ['bundle-linux-arm64', 'awsenv-linux-arm64'],
        ['bundle-macos-x64', 'awsenv-macos'],
        ['bundle-macos-arm64', 'awsenv-macos-arm64'],
        ['bundle-win-x64.exe', 'awsenv-win.exe']
      ];
      
      for (const [from, to] of renames) {
        try {
          await fs.rename(`${RELEASES_DIR}/${from}`, `${RELEASES_DIR}/${to}`);
          console.log(`  ✓ Created ${to}`);
        } catch {}
      }
      
      // Get binary sizes
      console.log('\n  Binary sizes:');
      const files = await fs.readdir(RELEASES_DIR);
      for (const file of files) {
        if (file.startsWith('awsenv-')) {
          const stats = await fs.stat(`${RELEASES_DIR}/${file}`);
          const size = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`    ${file}: ${size}MB`);
        }
      }
      
    } catch (err) {
      console.log(`  ❌ Failed to build binaries: ${err.message}`);
    } finally {
      // Clean up temp config if created
      await fs.unlink('pkg.config.json').catch(() => {});
    }
  } else {
    // Create wrapper scripts
    console.log('  Creating wrapper scripts...');
    
    const wrappers = [
      {
        name: 'awsenv-linux-x64.sh',
        content: '#!/bin/bash\nnode "$(dirname "$0")/../dist/index.js" "$@"'
      },
      {
        name: 'awsenv-macos-x64.sh',
        content: '#!/bin/bash\nnode "$(dirname "$0")/../dist/index.js" "$@"'
      },
      {
        name: 'awsenv-windows-x64.cmd',
        content: '@echo off\nnode "%~dp0\\..\\dist\\index.js" %*'
      }
    ];
    
    for (const wrapper of wrappers) {
      await fs.writeFile(`${RELEASES_DIR}/${wrapper.name}`, wrapper.content);
      if (!wrapper.name.endsWith('.cmd')) {
        await execAsync(`chmod +x ${RELEASES_DIR}/${wrapper.name}`);
      }
      console.log(`  ✓ Created ${wrapper.name}`);
    }
  }
  
  // Copy the npm package to releases
  try {
    await fs.copyFile(`${DIST_DIR}/awsenv-${VERSION}.tgz`, `${RELEASES_DIR}/awsenv-${VERSION}.tgz`);
    console.log(`  ✓ Copied npm package to releases`);
  } catch {}
}