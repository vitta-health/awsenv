# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWSENV is a Node.js CLI tool that securely fetches environment variables from AWS Systems Manager Parameter Store. It's designed for Docker environments where environment variables need to be sourced from AWS SSM parameters.

## Commands

### Build
```bash
pnpm run build
```
Builds executable binaries using `pkg` and places them in `./releases/` directory for Linux, macOS, and Windows.

### Testing
```bash
pnpm test          # Run full test suite (98 tests)
pnpm run test      # Alternative syntax
```
Uses Vitest framework with ES6 modules. All tests must pass before commits.

### Development Setup
```bash
pnpm link --global
awsenv version  # Test that it's working
```

### Testing the CLI
```bash
# Fetch parameters from Parameter Store
./index.js -r us-east-1 -n /staging/my-app

# Sync .env file TO Parameter Store
./index.js --sync .env --namespace /staging/my-app --dry-run

# Test with environment variables
export AWS_REGION=us-east-1
export AWSENV_NAMESPACE=/staging/my-app
./index.js

# Sync with all parameters as SecureString (encrypted)
./index.js --sync .env --namespace /staging/my-app --all-secure

# AWS CLI profile integration
awsenv --profile production     # Uses AWS CLI profiles
awsenv init                     # Initialize project configuration
awsenv list                     # List available AWS CLI profiles
```

## Architecture

The project follows a simple CLI architecture:

- **Entry Point**: `index.js` (shebang executable) → `src/index.js`
- **CLI Parsing**: `src/index.js` uses `args` package for command-line argument parsing
- **Core Logic**: `src/app.js` handles the main application logic
- **AWS Integration**: `src/vendor/aws-ssm.js` wraps AWS SDK SSM operations
- **Messages**: `src/concerns/msgs.js` centralizes user-facing messages
- **Profile Management**: `src/profiles.js` handles AWS CLI profile integration
- **Sync Operations**: `src/sync.js` contains EnvSync class for bidirectional sync

### Data Flow

#### Fetch Mode (Default)
1. CLI arguments parsed (region, namespace, without-exporter flag)
2. AWS SSM `getParametersByPath` called with namespace path
3. Parameters transformed: extract key from path, clean values
4. Output formatted as `export KEY=value` or `KEY=value` (based on without-exporter flag)

#### Sync Mode (--sync)
1. CLI arguments parsed (sync, namespace, dry-run, force, all-secure flags)
2. .env file parsed to extract key-value pairs
3. Smart secret detection: determines SecureString vs String type
4. Parameters uploaded to AWS Parameter Store with proper encryption
5. Success confirmation or dry-run preview displayed

### Key Components
- **AwsSsm class**: Promisified wrapper around AWS SDK v3 SSM client
- **EnvSync class**: Handles bidirectional sync between .env files and Parameter Store
- **Parameter Processing**: Strips namespace path to get env var names, cleans multiline values
- **Smart Secret Detection**: Automatically encrypts passwords, keys, tokens as SecureString
- **Output Modes**: Can output with or without `export` prefix for different use cases
- **AWS CLI Integration**: Reads profiles from `~/.aws/credentials` and `~/.aws/config`
- **Project-Level Config**: Uses `.awsenv/config` for per-project AWSENV-specific settings

## CLI Options

### Fetch Mode
- `--region`, `-r`: AWS region (default: us-east-1)
- `--namespace`, `-n`: Parameter path prefix (required)
- `--without-exporter`, `-w`: Output without 'export' prefix

### Sync Mode
- `--sync`, `-s`: Enable sync mode, specify .env file path
- `--namespace`, `-n`: Parameter path prefix (required)
- `--region`, `-r`: AWS region (default: us-east-1)
- `--dry-run`, `-d`: Preview changes without uploading
- `--force`, `-f`: Skip confirmation prompts
- `--all-secure`, `-a`: **Force all parameters as SecureString (encrypted)**

### Examples
```bash
# Fetch parameters (default mode)
awsenv --namespace /prod/myapp

# Sync .env file with smart secret detection
awsenv --sync .env --namespace /prod/myapp --dry-run

# Force ALL parameters as encrypted SecureStrings
awsenv --sync .env --namespace /prod/myapp --all-secure

# Batch upload with force (no prompts)
awsenv --sync production.env --namespace /prod/myapp --force --all-secure
```

## Dependencies
- `@aws-sdk/client-ssm`: AWS SDK v3 for SSM operations
- `args`: Command-line argument parsing
- `pkg`: Binary compilation for releases

The tool expects AWS credentials to be configured via standard AWS methods (IAM roles, environment variables, etc.).

## AWS CLI Profile Integration

AWSENV integrates with AWS CLI profiles for seamless credential and configuration management:

### Profile Detection and Auto-Config
- **Zero-Config Magic**: Automatically detects `.awsenv` file and uses `default` profile
- **AWS CLI Integration**: Reads from `~/.aws/credentials` and `~/.aws/config` 
- **Project-Level Settings**: Extends AWS profiles with AWSENV-specific config
- **Monorepo Support**: Searches parent directories for `.awsenv` file

### Profile Commands
```bash
awsenv init                     # Create smart configuration for current project
awsenv list                     # List all available AWS CLI profiles
awsenv --profile production     # Use specific AWS CLI profile
```

### Configuration Structure
- **AWS CLI Files**: Standard `~/.aws/credentials` and `~/.aws/config`
- **AWSENV Config**: Project-level `.awsenv` file with profile extensions
- **Smart Namespaces**: Auto-generated Parameter Store paths like `/awsenv/app=project-name/env=production`

### Example .awsenv file

#### Minimal Configuration
```ini
# Simplest possible setup
[default]
namespace = /production/myapp
```

#### Full Example with All Options
```ini
# Profile names match AWS CLI profiles in ~/.aws/credentials
[default]
namespace = "/production/myapp"         # Quotes are optional
encrypt = true                          # Force all as SecureString
paranoid = true                         # Block purge operations
without_exporter = false                # Include 'export' prefix

[staging]  
namespace = /staging/myapp              # No quotes is fine
encrypt = false
paranoid = false

[development]
namespace = '/dev/myapp'                # Single quotes work too
all_secure = true                       # Old name still works (→ encrypt)
```

#### Quote Handling
```ini
# All these formats work correctly:
namespace = "/path/to/params"          # Double quotes
namespace = '/path/to/params'          # Single quotes  
namespace = /path/to/params            # No quotes
namespace = "/path/with spaces/params" # Quotes required for spaces
```

## Development Standards

### Import Organization
All imports must be organized alphabetically by package name, with proper spacing:

```javascript
// External packages (alphabetical)
import args from 'args';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Internal modules (alphabetical, relative paths)
import { applyProfile, listProfiles } from './profiles.js';
import app from './app.js';
import {
  OPTION_REGION_DESCRIPTION,
  OPTION_NAMESPACE_DESCRIPTION
} from './concerns/msgs.js';


// Always 2 blank lines before main code starts
const params = args.parse(process.argv);
```

### Code Structure Rules
1. **Import Order**: External packages first (alphabetical), then internal modules (alphabetical)
2. **Spacing**: Always 2 blank lines between imports and main code
3. **Grouping**: Group related imports with single blank line between groups
4. **Consistency**: Apply same standards across all files
5. **Clean Code**: No console.log statements or comments in source code
6. **Error Handling**: Use console.error for user-facing error messages only

## Testing Framework & Best Practices

### Test Structure
- **Framework**: Vitest with ES6 module support
- **Total Tests**: 98 tests across 10 test files
- **Coverage Target**: Aim for 95%+ code coverage
- **Test Organization**: Located in `tests/` directory (not `src/`)

### Critical Testing Knowledge

#### Mock Implementation Patterns
```javascript
// CORRECT: Always check for path being defined
vi.mocked(fs.existsSync).mockImplementation((path) => 
  path && path.includes('credentials')
);

// INCORRECT: Will cause "Cannot read properties of undefined" errors
vi.mocked(fs.existsSync).mockImplementation((path) => 
  path.includes('credentials') // ← Fails when path is undefined
);
```

#### Expected Test Messages
- **stderr in CLI tests**: Message "Profile not found" is EXPECTED and CORRECT
- **This appears in**: `tests/index-cli.test.js > should handle profile application errors gracefully`
- **Why it appears**: Tests error handling when invalid profile is used
- **Not an error**: Confirms console.error() and process.exit(1) work correctly

#### Test File Patterns
- **profiles.test.js**: AWS CLI profile integration, config parsing, namespace generation
- **sync.test.js**: EnvSync class, Parameter Store sync, secret detection
- **index-cli.test.js**: CLI entry point, argument parsing, profile auto-detection
- **app.test.js**: Core application logic, parameter fetching and processing

### Common Test Fixes
1. **Mock fs operations** with null checks for path parameters
2. **Remove console.log expectations** when console output is removed
3. **Use placeholder tests** to prevent empty test suite errors
4. **Mock process.exit** properly in CLI tests
5. **Provide parameters** to prevent help text from showing (causes process.exit)

### Debugging Test Failures
- **"Cannot read properties of undefined (reading 'includes')"**: Add null checks to fs mocks
- **"process.exit(0/1)"**: Mock process.exit or provide proper parameters to avoid help/error paths
- **"No tests found"**: Add placeholder test to empty test files
- **stderr output**: Usually expected error handling, not actual failures

## File Organization

### Source Code Structure
```
src/
├── index.js          # CLI entry point and argument parsing
├── app.js            # Core application logic
├── profiles.js       # AWS CLI profile integration  
├── sync.js           # EnvSync class for Parameter Store sync
├── concerns/
│   └── msgs.js       # Centralized user messages
└── vendor/
    └── aws-ssm.js    # AWS SDK SSM wrapper
```

### Test Structure
```
tests/
├── index-cli.test.js     # CLI entry point tests
├── app.test.js           # Core app logic tests  
├── profiles.test.js      # Profile integration tests
├── sync.test.js          # Sync functionality tests
├── aws-ssm.test.js       # AWS integration tests
└── msgs.test.js          # Message constants tests
```

### Configuration Files
- **.gitignore**: Excludes test-*.js, quick-test.js, coverage/, .awsenv/
- **package.json**: Vitest config with tests/**/*.test.js pattern
- **CLAUDE.md**: This file - project guidance for Claude Code