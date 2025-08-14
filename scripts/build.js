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
  
  // Check if esbuild is available
  let hasEsbuild = false;
  try {
    await execAsync('npx esbuild --version');
    hasEsbuild = true;
  } catch {
    console.log('  ⚠ esbuild not found, using simple copy');
  }
  
  if (hasEsbuild) {
    // Bundle with esbuild
    console.log('  Bundling with esbuild...');
    
    // Bundle the main entry point
    await execAsync(`npx esbuild index.js \
      --bundle \
      --platform=node \
      --target=node20 \
      --format=esm \
      --minify \
      --tree-shaking=true \
      --external:@aws-sdk/* \
      --external:fs \
      --external:path \
      --external:os \
      --external:readline \
      --external:child_process \
      --external:url \
      --external:util \
      --external:process \
      --outfile=${DIST_DIR}/index.js`);
    console.log('  ✓ Bundled and minified index.js');
    
    // Create minimal package.json
    const pkg = {
      name: '@vitta-health/awsenv',
      version: VERSION,
      description: 'Secure way to handle environment variables in Docker with AWS Parameter Store',
      main: 'index.js',
      type: 'module',
      bin: {
        awsenv: './index.js'
      },
      engines: {
        node: '>=22.0.0'
      },
      dependencies: {
        '@aws-sdk/client-ssm': '^3.864.0'
      },
      keywords: ['aws', 'env', 'awsenv', 'ssm', 'docker']
    };
    
    await fs.writeFile(`${DIST_DIR}/package.json`, JSON.stringify(pkg, null, 2));
    console.log('  ✓ Created minimal package.json');
    
    // Copy README
    await fs.copyFile('README.md', `${DIST_DIR}/README.md`);
    console.log('  ✓ Copied README.md');
    
    // Install only production deps
    console.log('  Installing production dependencies...');
    await execAsync(`cd ${DIST_DIR} && npm install --production --silent`);
    console.log('  ✓ Installed @aws-sdk/client-ssm');
    
    // Get size info
    const { stdout: sizeInfo } = await execAsync(`du -sh ${DIST_DIR}`);
    console.log(`  📊 Distribution size: ${sizeInfo.split('\t')[0]}`);
    
  } else {
    // Fallback to simple copy
    await simpleCopy();
  }
  
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
    
    // Create temporary package.json for pkg
    const pkgConfig = JSON.parse(await fs.readFile('./package.json', 'utf8'));
    pkgConfig.pkg = {
      scripts: 'dist/index.js',
      targets: ['node18-linux-x64', 'node18-macos-x64', 'node18-win-x64'],
      outputPath: RELEASES_DIR
    };
    
    await fs.writeFile('pkg.config.json', JSON.stringify(pkgConfig, null, 2));
    
    try {
      // Build binaries from the optimized dist
      // Note: using node18 which is LTS and well-supported by pkg
      await execAsync(`pkg ${DIST_DIR}/index.js \
        --targets node18-linux-x64,node18-macos-x64,node18-win-x64 \
        --out-path ${RELEASES_DIR}`);
      
      // Rename outputs
      const renames = [
        ['index-linux', 'awsenv-linux-x64'],
        ['index-macos', 'awsenv-macos-x64'],
        ['index-win.exe', 'awsenv-windows-x64.exe']
      ];
      
      for (const [from, to] of renames) {
        try {
          await fs.rename(`${RELEASES_DIR}/${from}`, `${RELEASES_DIR}/${to}`);
          console.log(`  ✓ Created ${to}`);
        } catch {}
      }
      
      // Get binary sizes
      const { stdout: binSizes } = await execAsync(`ls -lh ${RELEASES_DIR}/*.{exe,x64} 2>/dev/null | awk '{print $9 ": " $5}'`);
      if (binSizes) {
        console.log('\n  Binary sizes:');
        binSizes.split('\n').filter(Boolean).forEach(line => {
          const parts = line.split(':');
          if (parts.length === 2) {
            const filename = path.basename(parts[0]);
            console.log(`    ${filename}: ${parts[1].trim()}`);
          }
        });
      }
      
    } catch (err) {
      console.log(`  ❌ Failed to build binaries: ${err.message}`);
    } finally {
      // Clean up temp config
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