#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

const VERSION = JSON.parse(await fs.readFile('./package.json', 'utf8')).version;
const RELEASE_DIR = './releases';
const DIST_DIR = `${RELEASE_DIR}/dist`;

async function buildAll() {
  console.log(`🚀 AWSENV Build System v${VERSION}\n`);
  console.log('━'.repeat(50));
  
  // Clean and prepare directories
  await cleanAndPrepare();
  
  // Build all artifacts
  const artifacts = {
    npm: await buildNpmPackage(),
    binaries: await buildBinaries(),
    docker: await createDockerfile(),
    archive: await createArchive()
  };
  
  // Generate checksums
  await generateChecksums();
  
  // Create release notes
  await createReleaseNotes(artifacts);
  
  console.log('\n' + '━'.repeat(50));
  console.log('✅ Build complete!\n');
  console.log(`📁 All artifacts available in: ${RELEASE_DIR}/`);
  console.log('\nArtifacts created:');
  console.log(`  📦 NPM Package: ${artifacts.npm}`);
  console.log(`  💾 Binaries: ${artifacts.binaries.join(', ')}`);
  console.log(`  🐳 Docker: ${artifacts.docker}`);
  console.log(`  📚 Archive: ${artifacts.archive}`);
  console.log(`  ✓  Checksums: ${RELEASE_DIR}/checksums.sha256`);
  console.log(`  📝 Release Notes: ${RELEASE_DIR}/RELEASE.md`);
}

async function cleanAndPrepare() {
  console.log('🧹 Cleaning previous builds...');
  await fs.rm(RELEASE_DIR, { recursive: true, force: true });
  await fs.mkdir(RELEASE_DIR, { recursive: true });
  await fs.mkdir(DIST_DIR, { recursive: true });
  await fs.mkdir(`${RELEASE_DIR}/binaries`, { recursive: true });
  console.log('  ✓ Directories prepared\n');
}

async function buildNpmPackage() {
  console.log('📦 Building NPM package...');
  
  // Copy necessary files
  const filesToCopy = ['index.js', 'package.json', 'README.md', 'LICENSE'];
  for (const file of filesToCopy) {
    try {
      await fs.copyFile(file, path.join(DIST_DIR, file));
    } catch (err) {
      if (file !== 'LICENSE') console.log(`  ⚠ ${file} not found`);
    }
  }
  
  // Copy source directory
  await execAsync(`cp -r src ${DIST_DIR}/`);
  
  // Create production package.json
  const pkg = JSON.parse(await fs.readFile('./package.json', 'utf8'));
  delete pkg.devDependencies;
  delete pkg.scripts.test;
  delete pkg.scripts['test:coverage'];
  delete pkg.scripts['test:watch'];
  delete pkg.scripts['test:ui'];
  delete pkg.scripts.build;
  delete pkg.scripts['build:binaries'];
  delete pkg.scripts['build:pkg'];
  delete pkg.vitest;
  delete pkg.pkg;
  
  await fs.writeFile(`${DIST_DIR}/package.json`, JSON.stringify(pkg, null, 2));
  
  // Install production dependencies
  await execAsync(`cd ${DIST_DIR} && npm install --production --silent`);
  
  // Create tarball
  const { stdout } = await execAsync(`cd ${DIST_DIR} && npm pack`);
  const packedFile = stdout.trim();
  const tarballName = `awsenv-${VERSION}.tgz`;
  
  // Move the packed file to releases directory
  await fs.rename(`${DIST_DIR}/${packedFile}`, `${RELEASE_DIR}/${tarballName}`);
  
  const stats = await fs.stat(`${RELEASE_DIR}/${tarballName}`);
  const size = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`  ✓ NPM package created (${size} MB)\n`);
  
  return tarballName;
}

async function buildBinaries() {
  console.log('💾 Building standalone binaries...');
  
  const binaries = [];
  
  // Create self-contained scripts for each platform
  const platforms = [
    { name: 'linux', ext: '', shebang: '#!/usr/bin/env node\n' },
    { name: 'macos', ext: '', shebang: '#!/usr/bin/env node\n' },
    { name: 'windows', ext: '.cmd', shebang: '' }
  ];
  
  for (const platform of platforms) {
    const filename = `awsenv-${platform.name}-x64${platform.ext}`;
    const filepath = `${RELEASE_DIR}/binaries/${filename}`;
    
    if (platform.name === 'windows') {
      // Windows batch file
      const content = `@echo off
setlocal
set NODE_EXE=node.exe
if exist "%~dp0\\node.exe" (set NODE_EXE="%~dp0\\node.exe")
%NODE_EXE% "%~dp0\\awsenv.js" %*
endlocal
`;
      await fs.writeFile(filepath, content);
    } else {
      // Unix shell script
      const content = `#!/bin/sh
# AWSENV Launcher for ${platform.name}
# Requires Node.js 18+ to be installed

# Check if node is available
if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is not installed or not in PATH" >&2
    echo "Please install Node.js 18 or later from https://nodejs.org" >&2
    exit 1
fi

# Get the directory where this script is located
DIR="$(cd "$(dirname "$0")" && pwd)"

# Run awsenv
exec node "$DIR/../../index.js" "$@"
`;
      await fs.writeFile(filepath, content);
      await execAsync(`chmod +x ${filepath}`);
    }
    
    const stats = await fs.stat(filepath);
    const size = (stats.size / 1024).toFixed(2);
    console.log(`  ✓ ${filename} (${size} KB)`);
    binaries.push(filename);
  }
  
  // Try to create real binaries with pkg if possible
  try {
    console.log('\n  🔨 Attempting to create standalone binaries with pkg...');
    await execAsync('which pkg', { timeout: 1000 });
    
    // Create a build directory
    await fs.mkdir(`${RELEASE_DIR}/pkg-build`, { recursive: true });
    
    // Copy files for pkg
    await execAsync(`cp -r src ${RELEASE_DIR}/pkg-build/`);
    await fs.copyFile('index.js', `${RELEASE_DIR}/pkg-build/index.js`);
    await fs.copyFile('package.json', `${RELEASE_DIR}/pkg-build/package.json`);
    
    // Try pkg build
    const pkgResult = await execAsync(
      `cd ${RELEASE_DIR}/pkg-build && npx pkg . --targets node18-linux-x64,node18-macos-x64,node18-win-x64 --out-path ../binaries --compress GZip`,
      { timeout: 60000 }
    ).catch(err => {
      console.log('  ⚠ pkg build failed, using wrapper scripts instead');
      return null;
    });
    
    if (pkgResult) {
      console.log('  ✓ Standalone binaries created successfully');
      
      // Rename pkg outputs
      const renames = [
        { from: 'awsenv-linux', to: 'awsenv-linux-x64-standalone' },
        { from: 'awsenv-macos', to: 'awsenv-macos-x64-standalone' },
        { from: 'awsenv-win.exe', to: 'awsenv-windows-x64-standalone.exe' }
      ];
      
      for (const { from, to } of renames) {
        try {
          await fs.rename(
            `${RELEASE_DIR}/binaries/${from}`,
            `${RELEASE_DIR}/binaries/${to}`
          );
          binaries.push(to);
        } catch {}
      }
    }
    
    // Clean up pkg build directory
    await fs.rm(`${RELEASE_DIR}/pkg-build`, { recursive: true, force: true });
    
  } catch (err) {
    console.log('  ℹ pkg not available, wrapper scripts created instead');
  }
  
  console.log('');
  return binaries;
}

async function createDockerfile() {
  console.log('🐳 Creating Docker configuration...');
  
  const dockerfile = `FROM node:18-alpine

# Install AWS CLI (optional, for AWS operations)
RUN apk add --no-cache aws-cli

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy app source
COPY index.js .
COPY src ./src

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nodejs -u 1001

# Switch to non-root user
USER nodejs

# Set entrypoint
ENTRYPOINT ["node", "index.js"]

# Default command (can be overridden)
CMD ["--help"]
`;

  await fs.writeFile(`${RELEASE_DIR}/Dockerfile`, dockerfile);
  
  // Create docker-compose example
  const dockerCompose = `version: '3.8'

services:
  awsenv:
    build: .
    image: awsenv:${VERSION}
    environment:
      - AWS_REGION=us-east-1
      - AWSENV_NAMESPACE=/production/myapp
    volumes:
      - ~/.aws:/home/nodejs/.aws:ro
    command: ["--namespace", "/production/myapp"]
`;

  await fs.writeFile(`${RELEASE_DIR}/docker-compose.yml`, dockerCompose);
  
  // Create build script
  const buildScript = `#!/bin/bash
# Build Docker image for AWSENV

docker build -t awsenv:${VERSION} -t awsenv:latest .
echo "Docker image built: awsenv:${VERSION}"
`;

  await fs.writeFile(`${RELEASE_DIR}/docker-build.sh`, buildScript);
  await execAsync(`chmod +x ${RELEASE_DIR}/docker-build.sh`);
  
  console.log('  ✓ Dockerfile created');
  console.log('  ✓ docker-compose.yml created');
  console.log('  ✓ docker-build.sh created\n');
  
  return 'Dockerfile, docker-compose.yml';
}

async function createArchive() {
  console.log('📚 Creating distribution archive...');
  
  const archiveName = `awsenv-${VERSION}-full.tar.gz`;
  
  // Create archive in parent directory first, then move it
  await execAsync(
    `tar -czf ${archiveName} ` +
    `--exclude='*.tar.gz' --exclude='dist' ` +
    `-C ${RELEASE_DIR} .`
  );
  
  // Move archive into releases directory
  await fs.rename(archiveName, `${RELEASE_DIR}/${archiveName}`);
  
  const stats = await fs.stat(`${RELEASE_DIR}/${archiveName}`);
  const size = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`  ✓ Archive created (${size} MB)\n`);
  
  return archiveName;
}

async function generateChecksums() {
  console.log('🔐 Generating checksums...');
  
  const files = await fs.readdir(RELEASE_DIR, { recursive: true });
  const checksums = [];
  
  for (const file of files) {
    const filepath = path.join(RELEASE_DIR, file);
    const stat = await fs.stat(filepath);
    
    if (stat.isFile() && !file.includes('checksums')) {
      try {
        const { stdout } = await execAsync(`sha256sum "${filepath}"`);
        const [hash, ] = stdout.split(' ');
        checksums.push(`${hash}  ${file}`);
      } catch {}
    }
  }
  
  await fs.writeFile(`${RELEASE_DIR}/checksums.sha256`, checksums.join('\n'));
  console.log(`  ✓ SHA256 checksums generated\n`);
}

async function createReleaseNotes(artifacts) {
  console.log('📝 Creating release notes...');
  
  const releaseNotes = `# AWSENV Release v${VERSION}

## 📦 Installation Options

### NPM (Recommended)
\`\`\`bash
npm install -g ${artifacts.npm}
# or
npm install -g @vitta-health/awsenv
\`\`\`

### Standalone Binaries
Download the appropriate binary for your platform from the \`binaries/\` directory:
- Linux: \`awsenv-linux-x64\`
- macOS: \`awsenv-macos-x64\`
- Windows: \`awsenv-windows-x64.cmd\`

Make it executable (Linux/macOS):
\`\`\`bash
chmod +x awsenv-linux-x64
./awsenv-linux-x64 --help
\`\`\`

### Docker
\`\`\`bash
# Build the image
./docker-build.sh

# Run with docker
docker run --rm awsenv:${VERSION} --help

# Or use docker-compose
docker-compose up
\`\`\`

## 🔐 Verify Downloads
All files include SHA256 checksums in \`checksums.sha256\`:
\`\`\`bash
sha256sum -c checksums.sha256
\`\`\`

## 📋 What's Included
- **NPM Package**: Full npm-installable package
- **Binaries**: Platform-specific executables (requires Node.js)
- **Docker**: Dockerfile and docker-compose configuration
- **Archive**: Complete distribution archive with all files

## 🚀 Quick Start
\`\`\`bash
# Fetch parameters from AWS SSM
awsenv --namespace /production/myapp

# Sync .env file to Parameter Store
awsenv --sync .env --namespace /staging/myapp

# Use with AWS profiles
awsenv --profile production
\`\`\`

## 📚 Documentation
See README.md for full documentation and examples.

## 🐛 Issues
Report issues at: https://github.com/developers-vitta/awsenv/issues

---
Built on: ${new Date().toISOString()}
`;

  await fs.writeFile(`${RELEASE_DIR}/RELEASE.md`, releaseNotes);
  console.log('  ✓ Release notes created\n');
}

// Run the build
buildAll().catch(error => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});