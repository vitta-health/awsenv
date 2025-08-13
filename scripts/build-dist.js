#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

async function createDistribution() {
  console.log('🔨 Creating AWSENV distribution package...\n');

  // Clean and create dist directory
  await fs.rm('./dist', { recursive: true, force: true });
  await fs.mkdir('./dist', { recursive: true });

  // Copy necessary files
  console.log('📋 Copying files...');
  const filesToCopy = [
    'index.js',
    'package.json',
    'README.md',
    'LICENSE',
    'CLAUDE.md'
  ];

  for (const file of filesToCopy) {
    try {
      await fs.copyFile(file, path.join('./dist', file));
      console.log(`  ✓ ${file}`);
    } catch (err) {
      if (file !== 'LICENSE') {
        console.log(`  ⚠ ${file} not found (skipping)`);
      }
    }
  }

  // Copy src directory
  await execAsync('cp -r src ./dist/');
  console.log('  ✓ src/');

  // Create package.json for distribution
  const pkgJson = JSON.parse(await fs.readFile('./package.json', 'utf8'));
  
  // Remove dev dependencies and scripts we don't need in dist
  delete pkgJson.devDependencies;
  delete pkgJson.scripts.test;
  delete pkgJson.scripts['test:coverage'];
  delete pkgJson.scripts['test:watch'];
  delete pkgJson.scripts['test:ui'];
  delete pkgJson.scripts.build;
  delete pkgJson.scripts['build:pkg'];
  delete pkgJson.vitest;
  delete pkgJson.pkg;

  await fs.writeFile(
    './dist/package.json',
    JSON.stringify(pkgJson, null, 2)
  );

  // Install production dependencies
  console.log('\n📦 Installing production dependencies...');
  const { stdout, stderr } = await execAsync('cd dist && npm install --production');
  
  // Create releases directory
  await fs.mkdir('./releases', { recursive: true });
  
  // Create tarball
  console.log('\n📦 Creating tarball...');
  const version = pkgJson.version;
  const tarballName = `awsenv-${version}.tar.gz`;
  const tarballPath = path.join('releases', tarballName);
  
  await execAsync(`cd dist && tar -czf ../${tarballName} .`);
  
  // Move tarball to releases directory
  await fs.rename(tarballName, tarballPath);
  
  const stats = await fs.stat(tarballPath);
  const size = (stats.size / 1024 / 1024).toFixed(2);
  
  console.log(`\n✅ Distribution package created: ${tarballPath} (${size} MB)\n`);
  console.log('To install globally from the tarball:');
  console.log(`  npm install -g ${tarballPath}\n`);
  console.log('Or publish to npm:');
  console.log('  npm publish\n');

  // Create installation script
  const installScript = `#!/bin/bash
# AWSENV Installation Script

echo "Installing AWSENV globally..."
npm install -g ${tarballPath}
echo "✅ AWSENV installed successfully!"
echo "Run 'awsenv --help' to get started"
`;

  await fs.writeFile('scripts/install.sh', installScript);
  await execAsync('chmod +x scripts/install.sh');
  
  console.log('Installation script created: ./scripts/install.sh');
}

createDistribution().catch(console.error);