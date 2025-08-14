#!/usr/bin/env node

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json to get version
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

async function build() {
  try {
    const result = await esbuild.build({
      entryPoints: ['./src/index.js'],
      bundle: true,
      platform: 'node',
      target: 'node16',
      format: 'cjs',
      outfile: './dist/bundle.cjs',
      minify: true,
      external: ['@aws-sdk/client-ssm'],
      define: {
        'import.meta.url': '"file:///snapshot/awsenv/index.js"',
        '__VERSION__': `"${packageJson.version}"`
      },
      banner: {
        js: '#!/usr/bin/env node'
      }
    });

    // Make executable
    fs.chmodSync('./dist/bundle.cjs', 0o755);
    
    console.log('✓ Bundle created successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();