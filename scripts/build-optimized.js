#!/usr/bin/env node

import { build } from 'esbuild';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function buildOptimizedBinaries() {
  console.log('🚀 Building optimized AWSENV binaries\n');
  console.log('This build will:');
  console.log('  1. Bundle and minify with esbuild');
  console.log('  2. Tree-shake unused code');
  console.log('  3. Create smaller binaries with pkg\n');

  await fs.rm('./build-optimized', { recursive: true, force: true });
  await fs.mkdir('./build-optimized', { recursive: true });
  await fs.mkdir('./releases/optimized', { recursive: true });

  try {
    // Step 1: Bundle and minify with esbuild
    console.log('📦 Step 1: Bundling and minifying with esbuild...');
    
    await build({
      entryPoints: ['./index.js'],
      bundle: true,
      minify: true,
      treeShaking: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: './build-optimized/awsenv-bundled.js',
      external: ['@aws-sdk/client-ssm'], // Keep AWS SDK external to reduce size
      metafile: true,
      legalComments: 'none',
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    });
    
    const bundleStats = await fs.stat('./build-optimized/awsenv-bundled.js');
    console.log(`  ✓ Bundle created: ${(bundleStats.size / 1024).toFixed(2)} KB\n`);

    // Step 2: Create optimized package.json
    console.log('📋 Step 2: Preparing optimized package...');
    
    const pkg = JSON.parse(await fs.readFile('./package.json', 'utf8'));
    const optimizedPkg = {
      name: "awsenv",
      version: pkg.version,
      main: "awsenv-bundled.js",
      bin: {
        awsenv: "awsenv-bundled.js"
      },
      dependencies: {
        "@aws-sdk/client-ssm": pkg.dependencies["@aws-sdk/client-ssm"]
      },
      pkg: {
        scripts: "awsenv-bundled.js",
        assets: [],
        targets: [
          "node18-linux-x64",
          "node18-macos-x64", 
          "node18-win-x64"
        ],
        outputPath: "../releases/optimized",
        compress: "Brotli" // Better compression than GZip
      }
    };
    
    await fs.writeFile(
      './build-optimized/package.json',
      JSON.stringify(optimizedPkg, null, 2)
    );
    
    // Step 3: Install only production deps
    console.log('  Installing minimal dependencies...');
    await execAsync('cd build-optimized && npm install --production --no-optional');
    console.log('  ✓ Dependencies installed\n');

    // Step 4: Build with pkg
    console.log('🔨 Step 3: Building optimized binaries with pkg...');
    
    const { stdout, stderr } = await execAsync(
      'cd build-optimized && npx pkg . --compress Brotli --no-bytecode',
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    if (stderr && !stderr.includes('Warning')) {
      console.log('Build output:', stderr);
    }
    
    // Step 5: Check results
    console.log('\n📊 Optimized binaries created:\n');
    
    const binaries = [
      { file: 'awsenv-linux', name: 'Linux' },
      { file: 'awsenv-macos', name: 'macOS' },
      { file: 'awsenv-win.exe', name: 'Windows' }
    ];
    
    let totalSize = 0;
    for (const { file, name } of binaries) {
      try {
        const stats = await fs.stat(`./releases/optimized/${file}`);
        const size = stats.size / 1024 / 1024;
        totalSize += size;
        console.log(`  ✓ ${name}: ${size.toFixed(2)} MB`);
        
        // Make executable
        if (!file.includes('.exe')) {
          await execAsync(`chmod +x ./releases/optimized/${file}`);
        }
      } catch (err) {
        console.log(`  ⚠ ${name}: not created`);
      }
    }
    
    console.log(`\n📉 Average size: ${(totalSize / 3).toFixed(2)} MB`);
    
    // Step 6: Create ultra-light version (without Node.js runtime)
    console.log('\n💡 Creating ultra-light version (requires Node.js)...');
    
    // Create a self-extracting script
    const selfExtractingScript = `#!/usr/bin/env node
// Ultra-light AWSENV - Requires Node.js to be installed
// Size: ~500 KB instead of 40+ MB

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Embedded compressed code
const compressedCode = "${
  (await execAsync('gzip -9 -c ./build-optimized/awsenv-bundled.js | base64 -w0')).stdout
}";

// Decompress and run
const code = zlib.gunzipSync(Buffer.from(compressedCode, 'base64')).toString();
const tempFile = path.join(require('os').tmpdir(), 'awsenv-' + Date.now() + '.js');
fs.writeFileSync(tempFile, code);

const child = spawn(process.argv[0], [tempFile, ...process.argv.slice(2)], {
  stdio: 'inherit'
});

child.on('exit', (code) => {
  try { fs.unlinkSync(tempFile); } catch {}
  process.exit(code || 0);
});
`;

    await fs.writeFile('./releases/optimized/awsenv-ultralight', selfExtractingScript);
    await execAsync('chmod +x ./releases/optimized/awsenv-ultralight');
    
    const ultralightStats = await fs.stat('./releases/optimized/awsenv-ultralight');
    console.log(`  ✓ Ultra-light version: ${(ultralightStats.size / 1024).toFixed(2)} KB\n`);

    // Clean up
    console.log('🧹 Cleaning up...');
    await fs.rm('./build-optimized', { recursive: true, force: true });
    console.log('  ✓ Done\n');

    console.log('✅ Optimized build complete!\n');
    console.log('Comparison:');
    console.log('  Standard build: ~50 MB per binary');
    console.log(`  Optimized build: ~${(totalSize / 3).toFixed(0)} MB per binary`);
    console.log(`  Ultra-light: ${(ultralightStats.size / 1024).toFixed(0)} KB (requires Node.js)\n`);

  } catch (error) {
    console.error('❌ Build failed:', error.message);
    await fs.rm('./build-optimized', { recursive: true, force: true });
    process.exit(1);
  }
}

buildOptimizedBinaries().catch(console.error);