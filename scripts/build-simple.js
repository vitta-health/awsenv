#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

async function buildBinary() {
  console.log('🔨 Building AWSENV binary for Linux...\n');

  // Create releases directory
  await fs.mkdir('./releases', { recursive: true });

  // Create a simple wrapper script
  const wrapperScript = `#!/usr/bin/env node
require = require("esm")(module);
require("./index.js");
`;

  await fs.writeFile('./releases/awsenv-wrapper.js', wrapperScript);

  // Copy all source files to releases
  console.log('📋 Copying source files...');
  await execAsync('cp -r src ./releases/');
  await execAsync('cp index.js ./releases/');
  await execAsync('cp package.json ./releases/');

  // Install production dependencies in releases
  console.log('📦 Installing dependencies...');
  await execAsync('cd releases && npm install --production');

  // Create standalone executable script
  const executableScript = `#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const nodeExecutable = process.argv[0];
const scriptPath = path.join(__dirname, 'index.js');
const args = process.argv.slice(2);

const child = spawn(nodeExecutable, [scriptPath, ...args], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code);
});
`;

  await fs.writeFile('./releases/awsenv', executableScript);
  await execAsync('chmod +x ./releases/awsenv');

  console.log('✅ Build complete! Executable created: ./releases/awsenv\n');
  console.log('To use it globally:');
  console.log('  sudo cp ./releases/awsenv /usr/local/bin/');
  console.log('  awsenv --help\n');
}

buildBinary().catch(console.error);