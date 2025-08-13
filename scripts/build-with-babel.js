#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function buildWithBabel() {
  console.log('🚀 Building AWSENV binaries with Babel transpilation\n');
  
  await fs.rm('./build-babel', { recursive: true, force: true });
  await fs.mkdir('./build-babel', { recursive: true });
  await fs.mkdir('./releases/babel-binaries', { recursive: true });

  try {
    // Step 1: Install Babel dependencies
    console.log('📦 Step 1: Installing Babel...');
    
    const babelDeps = [
      '@babel/core',
      '@babel/cli', 
      '@babel/preset-env',
      '@babel/plugin-transform-modules-commonjs',
      'babel-plugin-transform-import-meta'
    ];
    
    await execAsync(`npm install --save-dev ${babelDeps.join(' ')}`);
    console.log('  ✓ Babel installed\n');

    // Step 2: Create Babel config
    console.log('⚙️ Step 2: Configuring Babel...');
    
    const babelConfig = {
      presets: [
        ['@babel/preset-env', {
          targets: { node: '18' },
          modules: 'commonjs'
        }]
      ],
      plugins: [
        '@babel/plugin-transform-modules-commonjs',
        ['babel-plugin-transform-import-meta', {
          replaceWith: '__dirname'
        }]
      ]
    };
    
    await fs.writeFile('.babelrc.json', JSON.stringify(babelConfig, null, 2));
    console.log('  ✓ Babel configured\n');

    // Step 3: Transpile the code
    console.log('🔄 Step 3: Transpiling ES6 to CommonJS...');
    
    // Copy source files
    await execAsync('cp -r src ./build-babel/');
    await execAsync('cp index.js ./build-babel/');
    await execAsync('cp package.json ./build-babel/');
    
    // Transpile all JS files
    await execAsync(
      'npx babel ./build-babel --out-dir ./build-babel/transpiled ' +
      '--extensions ".js" --retain-lines'
    );
    
    console.log('  ✓ Code transpiled\n');

    // Step 4: Fix imports and create entry point
    console.log('🔧 Step 4: Creating CommonJS entry point...');
    
    const entryPoint = `#!/usr/bin/env node
// CommonJS entry point for transpiled code
'use strict';

// Fix for import.meta.url replacement
global.__filename = __filename;
global.__dirname = __dirname;

// Load the transpiled main module
require('./transpiled/index.js');
`;

    await fs.writeFile('./build-babel/main.js', entryPoint);
    
    // Update package.json for pkg
    const pkg = JSON.parse(await fs.readFile('./build-babel/package.json', 'utf8'));
    pkg.main = 'main.js';
    pkg.bin = 'main.js';
    pkg.type = 'commonjs'; // Change to CommonJS
    pkg.pkg = {
      scripts: ['main.js', 'transpiled/**/*.js'],
      assets: ['transpiled/**/*'],
      targets: [
        'node18-linux-x64',
        'node18-macos-x64',
        'node18-win-x64'
      ],
      outputPath: '../releases/babel-binaries'
    };
    
    await fs.writeFile('./build-babel/package.json', JSON.stringify(pkg, null, 2));
    console.log('  ✓ Entry point created\n');

    // Step 5: Install production dependencies
    console.log('📥 Step 5: Installing production dependencies...');
    await execAsync('cd build-babel && npm install --production');
    console.log('  ✓ Dependencies installed\n');

    // Step 6: Build with pkg
    console.log('🔨 Step 6: Building binaries with pkg...');
    
    const { stdout, stderr } = await execAsync(
      'cd build-babel && npx pkg . --compress GZip',
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    if (stdout) console.log(stdout);
    if (stderr && !stderr.includes('Warning')) {
      console.log('Build output:', stderr);
    }
    
    console.log('  ✓ Binaries created\n');

    // Step 7: Check and rename binaries
    console.log('📊 Step 7: Finalizing binaries...\n');
    
    const binaries = [
      { from: 'awsenv-linux', to: 'awsenv-linux-babel' },
      { from: 'awsenv-macos', to: 'awsenv-macos-babel' },
      { from: 'awsenv-win.exe', to: 'awsenv-windows-babel.exe' }
    ];
    
    for (const { from, to } of binaries) {
      try {
        const sourcePath = `./releases/babel-binaries/${from}`;
        const destPath = `./releases/babel-binaries/${to}`;
        
        await fs.rename(sourcePath, destPath);
        
        if (!to.includes('.exe')) {
          await execAsync(`chmod +x "${destPath}"`);
        }
        
        const stats = await fs.stat(destPath);
        const size = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`  ✓ ${to}: ${size} MB`);
      } catch (err) {
        console.log(`  ⚠ ${from} not found`);
      }
    }

    // Clean up
    console.log('\n🧹 Cleaning up...');
    await fs.rm('./build-babel', { recursive: true, force: true });
    await fs.rm('.babelrc.json', { force: true });
    console.log('  ✓ Temporary files removed\n');

    console.log('✅ Build with Babel complete!\n');
    console.log('Binaries available in: ./releases/babel-binaries/');
    console.log('\nThese binaries should work correctly with pkg since');
    console.log('all ES6 modules have been transpiled to CommonJS.\n');

  } catch (error) {
    console.error('❌ Build failed:', error.message);
    await fs.rm('./build-babel', { recursive: true, force: true });
    await fs.rm('.babelrc.json', { force: true });
    process.exit(1);
  }
}

buildWithBabel().catch(console.error);