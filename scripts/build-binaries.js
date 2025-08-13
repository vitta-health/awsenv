#!/usr/bin/env node

import { build } from 'esbuild';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function buildBinaries() {
  console.log('🔨 Building AWSENV binaries for all platforms...\n');

  // Create temp and releases directories
  await fs.rm('./temp-build', { recursive: true, force: true });
  await fs.mkdir('./temp-build', { recursive: true });
  await fs.mkdir('./releases', { recursive: true });

  try {
    // Step 1: Bundle the ES6 code into CommonJS
    console.log('📦 Step 1: Bundling ES6 modules to CommonJS...');
    await build({
      entryPoints: ['./index.js'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: './temp-build/awsenv.cjs',
      packages: 'external',  // Keep node_modules external
      banner: {
        js: '#!/usr/bin/env node\n'
      }
    });
    console.log('  ✓ Bundle created\n');

    // Step 2: Copy package.json and install dependencies
    console.log('📋 Step 2: Preparing dependencies...');
    
    // Create a package.json for pkg
    const originalPkg = JSON.parse(await fs.readFile('./package.json', 'utf8'));
    const pkgConfig = {
      name: "awsenv",
      version: originalPkg.version,
      description: originalPkg.description,
      main: "awsenv.cjs",
      bin: "awsenv.cjs",
      dependencies: originalPkg.dependencies,
      pkg: {
        scripts: "awsenv.cjs",
        targets: [
          "node18-linux-x64",
          "node18-macos-x64",
          "node18-win-x64"
        ],
        outputPath: "../releases"
      }
    };
    
    await fs.writeFile('./temp-build/package.json', JSON.stringify(pkgConfig, null, 2));
    console.log('  ✓ Package.json created');
    
    // Install production dependencies
    console.log('  ✓ Installing dependencies...');
    await execAsync('cd temp-build && npm install --production --silent');
    console.log('  ✓ Dependencies installed\n');

    // Step 3: Build binaries with pkg
    console.log('🚀 Step 3: Building platform binaries...');
    
    const { stdout, stderr } = await execAsync(
      'cd temp-build && npx pkg . --compress GZip',
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    if (stderr && !stderr.includes('Warning')) {
      console.error('Build warnings:', stderr);
    }
    
    console.log('  ✓ Binaries created\n');

    // Step 4: Rename binaries to final names
    console.log('📝 Step 4: Processing binaries...');
    const binaries = [
      { from: 'awsenv-linux', to: 'awsenv-linux' },
      { from: 'awsenv-macos', to: 'awsenv-macos' },
      { from: 'awsenv-win.exe', to: 'awsenv-windows.exe' }
    ];

    for (const { from, to } of binaries) {
      const fromPath = path.join('./releases', from);
      const toPath = path.join('./releases', to);
      
      try {
        await fs.access(fromPath);
        // Make Linux and macOS binaries executable
        if (!to.includes('.exe')) {
          await execAsync(`chmod +x ${fromPath}`);
        }
        // If names are different, rename
        if (from !== to) {
          await fs.rename(fromPath, toPath);
        }
        
        const stats = await fs.stat(toPath);
        const size = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`  ✓ ${to} (${size} MB)`);
      } catch (err) {
        console.log(`  ⚠ ${from} not found (might be expected on this platform)`);
      }
    }

    // Step 5: Clean up
    console.log('\n🧹 Step 5: Cleaning up...');
    await fs.rm('./temp-build', { recursive: true, force: true });
    console.log('  ✓ Temporary files removed\n');

    // Final summary
    console.log('✅ Build complete! Binaries available in ./releases/\n');
    console.log('Usage examples:');
    console.log('  Linux:   ./releases/awsenv-linux --help');
    console.log('  macOS:   ./releases/awsenv-macos --help');
    console.log('  Windows: .\\releases\\awsenv-windows.exe --help\n');

  } catch (error) {
    console.error('❌ Build failed:', error.message);
    // Clean up on error
    await fs.rm('./temp-build', { recursive: true, force: true });
    process.exit(1);
  }
}

buildBinaries().catch(console.error);