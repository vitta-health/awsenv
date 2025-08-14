#!/bin/bash
# AWSENV Installation Script

VERSION=$(node -p "require('./package.json').version")

echo "Installing AWSENV v$VERSION globally..."
pnpm add -g "./releases/awsenv-${VERSION}.tgz"
echo "✅ AWSENV installed successfully!"
echo "Run 'awsenv --help' to get started"
