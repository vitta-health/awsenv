#!/usr/bin/env node

import { build } from 'esbuild';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function buildBinary() {
  console.log('🔨 Building AWSENV binaries...\n');

  // Create releases directory
  await fs.mkdir('./releases', { recursive: true });

  // Bundle the ES6 code into a single CommonJS file
  console.log('📦 Bundling with esbuild...');
  await build({
    entryPoints: ['./index.js'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: './releases/awsenv-bundled.cjs',
    external: ['@aws-sdk/client-ssm'],
    banner: {
      js: '#!/usr/bin/env node\n'
    },
    minify: true
  });

  console.log('✅ Bundle created: ./releases/awsenv-bundled.cjs\n');

  // Create package.json for pkg
  const pkgJson = {
    name: "awsenv-binary",
    version: "1.2.4",
    main: "awsenv-bundled.cjs",
    dependencies: {
      "@aws-sdk/client-ssm": "^3.864.0"
    },
    pkg: {
      targets: [
        "node18-linux-x64",
        "node18-macos-x64", 
        "node18-win-x64"
      ],
      outputPath: "."
    }
  };

  await fs.writeFile(
    './releases/package.json',
    JSON.stringify(pkgJson, null, 2)
  );

  // Copy node_modules to releases directory for pkg
  console.log('📋 Preparing dependencies...');
  await execAsync('cp -r node_modules ./releases/');

  // Build binaries with pkg
  console.log('🚀 Building binaries with pkg...\n');
  
  try {
    const { stdout, stderr } = await execAsync(
      'cd releases && npx pkg . --out-path . --targets node18-linux-x64,node18-macos-x64,node18-win-x64',
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    if (stdout) console.log(stdout);
    if (stderr && !stderr.includes('Warning')) console.error(stderr);
  } catch (error) {
    console.error('Error building binaries:', error.message);
    process.exit(1);
  }

  // Rename binaries
  console.log('📝 Renaming binaries...');
  const renames = [
    { from: 'awsenv-binary-linux', to: 'awsenv-linux' },
    { from: 'awsenv-binary-macos', to: 'awsenv-macos' },
    { from: 'awsenv-binary-win.exe', to: 'awsenv-win.exe' }
  ];

  for (const { from, to } of renames) {
    const fromPath = path.join('./releases', from);
    const toPath = path.join('./releases', to);
    
    try {
      await fs.access(fromPath);
      await fs.rename(fromPath, toPath);
      console.log(`  ✓ ${to}`);
    } catch (err) {
      // Binary might not exist for this platform
    }
  }

  // Clean up temporary files
  console.log('\n🧹 Cleaning up...');
  await fs.rm('./releases/node_modules', { recursive: true, force: true });
  await fs.rm('./releases/package.json', { force: true });
  await fs.rm('./releases/awsenv-bundled.cjs', { force: true });

  // Make binaries executable
  await execAsync('chmod +x ./releases/awsenv-*');

  // List final binaries
  console.log('\n✅ Build complete! Binaries created:\n');
  const files = await fs.readdir('./releases');
  for (const file of files) {
    const stats = await fs.stat(path.join('./releases', file));
    const size = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  📦 ${file} (${size} MB)`);
  }
}

buildBinary().catch(console.error);