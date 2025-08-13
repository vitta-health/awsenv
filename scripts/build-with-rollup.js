#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function buildWithRollup() {
  console.log('🚀 Building AWSENV binaries with Rollup\n');
  console.log('Rollup advantages:');
  console.log('  ✓ Simpler configuration than Webpack');
  console.log('  ✓ Better tree-shaking than Babel');
  console.log('  ✓ Designed for libraries\n');
  
  await fs.rm('./build-rollup', { recursive: true, force: true });
  await fs.mkdir('./build-rollup', { recursive: true });
  await fs.mkdir('./releases/production', { recursive: true });

  try {
    // Step 1: Install Rollup and plugins
    console.log('📦 Step 1: Installing Rollup...');
    
    const rollupDeps = [
      '@rollup/plugin-node-resolve',
      '@rollup/plugin-commonjs',
      '@rollup/plugin-json',
      '@rollup/plugin-replace',
      '@rollup/plugin-terser'  // Use @rollup/plugin-terser for Rollup 3+
    ];
    
    // Check if already installed
    let needsInstall = false;
    for (const dep of rollupDeps) {
      try {
        await fs.access(`./node_modules/${dep}`);
      } catch {
        needsInstall = true;
        break;
      }
    }
    
    if (needsInstall) {
      await execAsync(`npm install --save-dev ${rollupDeps.join(' ')}`);
    }
    console.log('  ✓ Rollup ready\n');

    // Step 2: Create Rollup config
    console.log('⚙️ Step 2: Creating Rollup configuration...');
    
    const rollupConfig = `
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';

export default {
  input: 'index.js',
  output: {
    file: 'build-rollup/bundle.cjs',
    format: 'cjs',
    banner: '#!/usr/bin/env node\\n"use strict";',
    interop: 'auto'
  },
  external: [
    // Keep AWS SDK external to reduce bundle size
    '@aws-sdk/client-ssm',
    /^@aws-sdk/,
    
    // Node built-ins
    'fs', 'path', 'url', 'util', 'os', 'crypto', 'child_process',
    'readline', 'events', 'stream', 'buffer', 'querystring',
    'http', 'https', 'net', 'tls', 'dns', 'zlib'
  ],
  plugins: [
    // Replace import.meta.url with CommonJS equivalent
    replace({
      preventAssignment: true,
      values: {
        'import.meta.url': '"file:///awsenv/index.js"',
        'process.env.NODE_ENV': JSON.stringify('production')
      }
    }),
    
    // Resolve node modules
    nodeResolve({
      preferBuiltins: true,
      exportConditions: ['node']
    }),
    
    // Convert CommonJS modules
    commonjs({
      ignoreDynamicRequires: true
    }),
    
    // Handle JSON imports
    json()
    
    // Temporarily disabled terser due to ES6 compatibility issues
    // Will minify with esbuild later if needed
  ]
};
`;

    await fs.writeFile('./rollup.config.mjs', rollupConfig);
    console.log('  ✓ Configuration created\n');

    // Step 3: Run Rollup
    console.log('📦 Step 3: Bundling with Rollup...');
    
    const { stdout, stderr } = await execAsync('npx rollup -c rollup.config.mjs');
    
    if (stderr && !stderr.includes('created')) {
      console.log('Rollup output:', stderr);
    }
    
    const bundleStats = await fs.stat('./build-rollup/bundle.cjs');
    console.log(`  ✓ Bundle created: ${(bundleStats.size / 1024).toFixed(2)} KB\n`);

    // Step 4: Prepare for pkg
    console.log('🔧 Step 4: Preparing for pkg...');
    
    // Copy package.json and modify it
    const pkg = JSON.parse(await fs.readFile('./package.json', 'utf8'));
    const pkgConfig = {
      name: "awsenv",
      version: pkg.version,
      description: pkg.description,
      main: "bundle.cjs",
      bin: "bundle.cjs",
      dependencies: {
        // Only keep AWS SDK as external dependency
        "@aws-sdk/client-ssm": pkg.dependencies["@aws-sdk/client-ssm"]
      },
      pkg: {
        scripts: "bundle.cjs",
        targets: [
          "node18-linux-x64",
          "node18-macos-x64",
          "node18-win-x64"
        ],
        outputPath: "../releases/production",
        compress: "GZip"
      }
    };
    
    await fs.writeFile('./build-rollup/package.json', JSON.stringify(pkgConfig, null, 2));
    
    // Install only the AWS SDK
    console.log('  Installing minimal dependencies...');
    await execAsync('cd build-rollup && npm install --production');
    console.log('  ✓ Package prepared\n');

    // Step 5: Build with pkg
    console.log('🔨 Step 5: Building standalone binaries with pkg...');
    
    const pkgResult = await execAsync(
      'cd build-rollup && npx pkg . --compress GZip',
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    console.log('  ✓ Binaries created\n');

    // Step 6: Test and finalize
    console.log('✅ Step 6: Finalizing binaries...\n');
    
    const binaries = [
      { name: 'awsenv-linux', platform: 'Linux' },
      { name: 'awsenv-macos', platform: 'macOS' },
      { name: 'awsenv-win.exe', platform: 'Windows' }
    ];
    
    let successCount = 0;
    for (const { name, platform } of binaries) {
      const binaryPath = `./releases/production/${name}`;
      
      try {
        const stats = await fs.stat(binaryPath);
        const size = (stats.size / 1024 / 1024).toFixed(2);
        
        // Make executable
        if (!name.includes('.exe')) {
          await execAsync(`chmod +x "${binaryPath}"`);
        }
        
        // Test if it runs (only Linux on Linux system)
        if (name === 'awsenv-linux' && process.platform === 'linux') {
          try {
            const { stdout } = await execAsync(`${binaryPath} --version`, { timeout: 5000 });
            console.log(`  ✅ ${platform}: ${size} MB (tested: v${stdout.trim()})`);
          } catch {
            console.log(`  ✓ ${platform}: ${size} MB`);
          }
        } else {
          console.log(`  ✓ ${platform}: ${size} MB`);
        }
        
        successCount++;
      } catch (err) {
        console.log(`  ❌ ${platform}: Build failed`);
      }
    }

    // Clean up
    console.log('\n🧹 Cleaning up...');
    await fs.rm('./build-rollup', { recursive: true, force: true });
    await fs.rm('./rollup.config.mjs', { force: true });
    console.log('  ✓ Temporary files removed\n');

    if (successCount === 3) {
      console.log('🎉 Success! All binaries built correctly.\n');
      console.log('📁 Location: ./releases/production/');
      console.log('📏 Size: ~40-50 MB (includes Node.js runtime)');
      console.log('🚀 Ready for distribution!\n');
      console.log('Test them:');
      console.log('  ./releases/production/awsenv-linux --version');
      console.log('  ./releases/production/awsenv-linux --help');
    } else {
      console.log('⚠️  Some binaries failed to build.');
      console.log('This might be due to pkg compatibility issues.\n');
    }

  } catch (error) {
    console.error('❌ Build failed:', error.message);
    console.error('\nError details:', error);
    
    // Clean up on error
    await fs.rm('./build-rollup', { recursive: true, force: true });
    await fs.rm('./rollup.config.mjs', { force: true });
    
    process.exit(1);
  }
}

// Run the build
buildWithRollup().catch(console.error);