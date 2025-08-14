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
const RELEASE_DIR = './releases';

// Configure args
args
  .command('all', 'Build everything (default)', buildAll, ['a'])
  .command('dist', 'Build distribution package', buildDist, ['d'])
  .command('binaries', 'Build executable binaries', buildBinaries, ['b'])
  .command('clean', 'Clean build artifacts', clean, ['c']);

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
  console.log(`📁 Artifacts in: ${RELEASE_DIR}/`);
}

async function clean() {
  console.log('🧹 Cleaning...');
  await fs.rm(RELEASE_DIR, { recursive: true, force: true });
  await fs.mkdir(RELEASE_DIR, { recursive: true });
  console.log('  ✓ Clean complete');
}

async function buildDist() {
  console.log('\n📦 Building distribution package...');
  
  const distDir = `${RELEASE_DIR}/dist`;
  await fs.mkdir(distDir, { recursive: true });
  
  // Copy core files
  const files = ['index.js', 'package.json', 'README.md'];
  for (const file of files) {
    await fs.copyFile(file, path.join(distDir, file));
  }
  
  // Copy source
  await execAsync(`cp -r src ${distDir}/`);
  
  // Create production package.json
  const pkg = JSON.parse(await fs.readFile('./package.json', 'utf8'));
  delete pkg.devDependencies;
  delete pkg.scripts;
  pkg.scripts = { start: "node index.js" };
  
  await fs.writeFile(`${distDir}/package.json`, JSON.stringify(pkg, null, 2));
  
  // Install production deps with pnpm
  console.log('  Installing production dependencies...');
  try {
    await execAsync(`cd ${distDir} && pnpm install --prod`);
  } catch (err) {
    // Fallback to npm if pnpm fails
    console.log('  Fallback to npm...');
    await execAsync(`cd ${distDir} && npm install --production`);
  }
  
  // Create tarball
  console.log('  Creating tarball...');
  await execAsync(`cd ${distDir} && pnpm pack`);
  await execAsync(`mv ${distDir}/*.tgz ${RELEASE_DIR}/awsenv-${VERSION}.tgz`);
  
  console.log(`  ✓ Package created: awsenv-${VERSION}.tgz`);
}

async function buildBinaries() {
  console.log('\n💾 Building binaries...');
  
  const binDir = `${RELEASE_DIR}/binaries`;
  await fs.mkdir(binDir, { recursive: true });
  
  // Create simple wrapper scripts
  const platforms = [
    { name: 'linux-x64', shebang: '#!/usr/bin/env node\n' },
    { name: 'macos-x64', shebang: '#!/usr/bin/env node\n' },
    { name: 'windows-x64', ext: '.cmd', content: '@node "%~dp0\\index.js" %*' }
  ];
  
  for (const platform of platforms) {
    const filename = `awsenv-${platform.name}${platform.ext || ''}`;
    const filepath = path.join(binDir, filename);
    
    if (platform.content) {
      await fs.writeFile(filepath, platform.content);
    } else {
      // Copy index.js with shebang
      const content = await fs.readFile('./index.js', 'utf8');
      await fs.writeFile(filepath, content);
      await execAsync(`chmod +x ${filepath}`);
    }
    
    console.log(`  ✓ ${filename}`);
  }
  
  // Try to build with pkg if available
  try {
    console.log('  Building standalone binaries with pkg...');
    await execAsync('which pkg');
    await execAsync(`pkg . --out-path ${binDir} --targets node22-linux-x64,node22-macos-x64,node22-win-x64`);
    
    // Rename pkg outputs
    await fs.rename(`${binDir}/awsenv-linux`, `${binDir}/awsenv-linux-x64-standalone`).catch(() => {});
    await fs.rename(`${binDir}/awsenv-macos`, `${binDir}/awsenv-macos-x64-standalone`).catch(() => {});
    await fs.rename(`${binDir}/awsenv-win.exe`, `${binDir}/awsenv-windows-x64-standalone.exe`).catch(() => {});
    
    console.log('  ✓ Standalone binaries created');
  } catch {
    console.log('  ⚠ pkg not available, skipping standalone binaries');
  }
}