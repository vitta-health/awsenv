#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

async function buildBinaries() {
  console.log('🔨 Building AWSENV standalone binaries...\n');

  // Create directories
  await fs.mkdir('./releases/binaries', { recursive: true });
  await fs.rm('./build-temp', { recursive: true, force: true });
  await fs.mkdir('./build-temp', { recursive: true });

  try {
    // Step 1: Create a CommonJS entry point
    console.log('📦 Step 1: Creating CommonJS entry point...');
    
    const entryPoint = `#!/usr/bin/env node

// CommonJS wrapper for ES6 module
const { createRequire } = require('module');
const customRequire = createRequire(__filename);

// Set up ES module loader
require = customRequire;

// Import and run the ES6 module
(async () => {
  try {
    // Dynamic import of the ES6 module
    await import('./src/index.js');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
`;

    await fs.writeFile('./build-temp/entry.cjs', entryPoint);
    console.log('  ✓ Entry point created\n');

    // Step 2: Copy all source files
    console.log('📋 Step 2: Copying source files...');
    await execAsync('cp -r src ./build-temp/');
    await execAsync('cp index.js ./build-temp/');
    
    // Copy and modify package.json
    const pkgJson = JSON.parse(await fs.readFile('./package.json', 'utf8'));
    const buildPkgJson = {
      name: "awsenv-binary",
      version: pkgJson.version,
      main: "entry.cjs",
      bin: "entry.cjs",
      type: "module",
      dependencies: pkgJson.dependencies,
      pkg: {
        scripts: ["entry.cjs", "index.js", "src/**/*.js"],
        assets: ["src/**/*.js", "index.js"],
        targets: [
          "node18-linux-x64",
          "node18-macos-x64",
          "node18-win-x64"
        ]
      }
    };
    
    await fs.writeFile('./build-temp/package.json', JSON.stringify(buildPkgJson, null, 2));
    console.log('  ✓ Files copied\n');

    // Step 3: Install dependencies
    console.log('📦 Step 3: Installing dependencies...');
    await execAsync('cd build-temp && npm install --production');
    console.log('  ✓ Dependencies installed\n');

    // Step 4: Build with pkg
    console.log('🚀 Step 4: Building binaries with pkg...');
    
    try {
      // Try to build binaries
      const { stdout, stderr } = await execAsync(
        'cd build-temp && npx pkg . --out-path ../releases/binaries --compress GZip',
        { maxBuffer: 10 * 1024 * 1024 }
      );
      
      if (stdout) console.log(stdout);
      if (stderr) console.log('Build output:', stderr);
      
    } catch (pkgError) {
      console.log('Note: Some warnings are expected with ES6 modules\n');
    }

    // Step 5: Check and rename binaries
    console.log('📝 Step 5: Finalizing binaries...');
    
    const expectedBinaries = [
      { src: 'awsenv-binary-linux', dest: 'awsenv-linux' },
      { src: 'awsenv-binary-macos', dest: 'awsenv-macos' },
      { src: 'awsenv-binary-win.exe', dest: 'awsenv-windows.exe' }
    ];

    let createdCount = 0;
    for (const { src, dest } of expectedBinaries) {
      const srcPath = path.join('./releases/binaries', src);
      const destPath = path.join('./releases/binaries', dest);
      
      try {
        await fs.access(srcPath);
        await fs.rename(srcPath, destPath);
        
        // Make executable (for Linux/macOS)
        if (!dest.includes('.exe')) {
          await execAsync(`chmod +x "${destPath}"`);
        }
        
        const stats = await fs.stat(destPath);
        const size = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`  ✓ ${dest} (${size} MB)`);
        createdCount++;
      } catch (err) {
        // Try without renaming
        try {
          const altPath = path.join('./releases/binaries', dest);
          await fs.access(altPath);
          if (!dest.includes('.exe')) {
            await execAsync(`chmod +x "${altPath}"`);
          }
          const stats = await fs.stat(altPath);
          const size = (stats.size / 1024 / 1024).toFixed(2);
          console.log(`  ✓ ${dest} (${size} MB)`);
          createdCount++;
        } catch {
          console.log(`  ⚠ ${dest} not created`);
        }
      }
    }

    if (createdCount === 0) {
      console.log('\n⚠️  No binaries were created. Falling back to wrapper scripts...\n');
      
      // Create wrapper scripts as fallback
      await createWrapperScripts();
    }

    // Clean up
    console.log('\n🧹 Cleaning up...');
    await fs.rm('./build-temp', { recursive: true, force: true });
    console.log('  ✓ Temporary files removed\n');

    console.log('✅ Build process complete!\n');
    
    if (createdCount > 0) {
      console.log('Binaries are available in ./releases/binaries/');
      console.log('\nUsage examples:');
      console.log('  Linux:   ./releases/binaries/awsenv-linux --help');
      console.log('  macOS:   ./releases/binaries/awsenv-macos --help');
      console.log('  Windows: .\\releases\\binaries\\awsenv-windows.exe --help');
    }

  } catch (error) {
    console.error('❌ Build error:', error.message);
    await fs.rm('./build-temp', { recursive: true, force: true });
    process.exit(1);
  }
}

async function createWrapperScripts() {
  console.log('Creating Node.js wrapper scripts...');
  
  // Linux/macOS wrapper
  const unixWrapper = `#!/usr/bin/env node
require('child_process').spawn(
  process.argv[0],
  [require.resolve('../../index.js'), ...process.argv.slice(2)],
  { stdio: 'inherit' }
).on('exit', code => process.exit(code));
`;

  await fs.writeFile('./releases/binaries/awsenv-linux', unixWrapper);
  await fs.writeFile('./releases/binaries/awsenv-macos', unixWrapper);
  await execAsync('chmod +x ./releases/binaries/awsenv-linux');
  await execAsync('chmod +x ./releases/binaries/awsenv-macos');
  
  // Windows wrapper
  const winWrapper = `@echo off
node "%~dp0\\..\\..\\index.js" %*
`;
  await fs.writeFile('./releases/binaries/awsenv-windows.bat', winWrapper);
  
  console.log('  ✓ Wrapper scripts created (require Node.js)');
}

buildBinaries().catch(console.error);