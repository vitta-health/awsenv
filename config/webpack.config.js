import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import webpack from 'webpack';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Read package.json to get version
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

export default {
  mode: 'production',
  target: 'node',
  entry: path.join(rootDir, 'src/index.js'),
  output: {
    path: path.resolve(rootDir, 'dist'),
    filename: 'bundle.cjs',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  node: '16'
                },
                modules: 'commonjs'
              }]
            ]
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.mjs', '.json'],
    mainFields: ['main', 'module']
  },
  externals: {
    // Only AWS SDK is external
    '@aws-sdk/client-ssm': 'commonjs @aws-sdk/client-ssm'
  },
  optimization: {
    minimize: true,
    splitChunks: false,
    runtimeChunk: false,
    sideEffects: false,
    usedExports: false
  },
  plugins: [
    // Replace import.meta.url
    new webpack.DefinePlugin({
      'import.meta.url': JSON.stringify('file:///snapshot/awsenv/index.js'),
      'process.env.AWSENV_VERSION': JSON.stringify(packageJson.version)
    }),
    // Add shebang
    new webpack.BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
      entryOnly: true
    }),
    // Make executable
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('MakeExecutablePlugin', (compilation) => {
          const outputPath = path.join(compilation.outputOptions.path, 'bundle.cjs');
          try {
            fs.chmodSync(outputPath, 0o755);
          } catch (e) {
            // Ignore
          }
        });
      }
    }
  ]
};