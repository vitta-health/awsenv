#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

async function buildBinariesSimple() {
  console.log('🔨 Building AWSENV binaries (simplified version)...\n');

  // Clean and create directories
  await fs.rm('./releases/binaries', { recursive: true, force: true });
  await fs.mkdir('./releases/binaries', { recursive: true });

  try {
    // Create a standalone Node.js script wrapper
    console.log('📦 Creating standalone wrapper...');
    
    const wrapperContent = `#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

// Embedded index.js content will go here
const indexContent = ${JSON.stringify(await fs.readFile('./index.js', 'utf8'))};

// Write to temp file and execute
const os = require('os');
const fs = require('fs');
const tempFile = path.join(os.tmpdir(), 'awsenv-' + Date.now() + '.mjs');
fs.writeFileSync(tempFile, indexContent);

const child = spawn(process.argv[0], [tempFile, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  try { fs.unlinkSync(tempFile); } catch {}
  process.exit(code || 0);
});
`;

    // Save wrapper for Linux
    await fs.writeFile('./releases/binaries/awsenv-linux', wrapperContent);
    await execAsync('chmod +x ./releases/binaries/awsenv-linux');
    
    // Save wrapper for macOS (same as Linux)
    await fs.writeFile('./releases/binaries/awsenv-macos', wrapperContent);
    await execAsync('chmod +x ./releases/binaries/awsenv-macos');
    
    // For Windows, create a batch file
    const windowsWrapper = `@echo off
node "%~dp0\\awsenv-linux" %*
`;
    await fs.writeFile('./releases/binaries/awsenv-windows.bat', windowsWrapper);
    
    console.log('✅ Simple wrappers created in ./releases/binaries/\n');
    
    console.log('Note: These are lightweight wrappers that require Node.js to be installed.');
    console.log('For true standalone binaries, we need to resolve the ES6 module issues first.\n');
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

buildBinariesSimple().catch(console.error);