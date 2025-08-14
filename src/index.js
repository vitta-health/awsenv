import args from 'args';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';  
import app from './app.js';
import {
  OPTION_ENCRYPT_DESCRIPTION,
  OPTION_DRY_RUN_DESCRIPTION,
  OPTION_FORCE_DESCRIPTION,
  OPTION_NAMESPACE_DESCRIPTION,
  OPTION_PROFILE_DESCRIPTION,
  OPTION_REGION_DESCRIPTION,
  OPTION_VERBOSE_DESCRIPTION,
  OPTION_WITHOUT_EXPORTER_DESCRIPTION,
} from './concerns/msgs.js';
import { applyProfile, createExampleConfig, listProfiles } from './profiles.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.mainModule) {
  process.mainModule = { filename: __filename };
}

// Handle purge command early (before args tries to spawn subprocess)
if (process.argv[2] === 'purge') {
  // Show help if requested
  if (process.argv[3] === '--help' || process.argv[3] === '-h') {
    console.log(`
  Usage: awsenv purge [options]
  
  Delete ALL environment variables from AWS Parameter Store namespace
  
  ⚠️  WARNING: This is a DESTRUCTIVE operation that cannot be undone!
  
  Options:
    -n, --namespace <path> Parameter Store namespace (required)
    -r, --region <region>  AWS region
    -p, --profile <name>   AWS CLI profile to use
    --paranoid             Block purge operation (safety mode)
    -v, --verbose          Enable verbose output
    -h, --help             Show this help message
  
  Examples:
    # Purge with double confirmation
    awsenv purge -n /test/myapp
    
    # Force purge (still asks for namespace confirmation)
    awsenv purge -n /prod/myapp --force
    
    # Block purge with paranoid mode
    awsenv purge -n /prod/myapp --paranoid
  
  Safety features:
    - Requires typing "yes" to first confirmation
    - Requires typing the exact namespace to confirm
    - Can be blocked with --paranoid flag
    - Can be permanently blocked in .awsenv config with paranoid = true
`);
    process.exit(0);
  }
  
  // Remove 'purge' from argv so args doesn't try to spawn it
  process.argv.splice(2, 1);
  
  // Mark that we should run purge
  global.runPurge = true;
}

// Handle sync command early (before args tries to spawn subprocess)
if (process.argv[2] === 'sync') {
  // Show help if requested
  if (process.argv[3] === '--help' || process.argv[3] === '-h') {
    console.log(`
  Usage: awsenv sync [options]
  
  Sync environment variables to AWS Parameter Store
  
  Options:
    -f, --file <path>      Path to .env file (required if not using stdin)
    -n, --namespace <path> Parameter Store namespace (required)
    -r, --region <region>  AWS region
    -p, --profile <name>   AWS CLI profile to use
    -d, --dry-run          Preview changes without uploading
    -e, --encrypt          Store all parameters as SecureString
    -v, --verbose          Enable verbose output
    -h, --help             Show this help message
  
  Examples:
    # Sync from file
    awsenv sync -f .env -n /prod/myapp
    
    # Sync from stdin
    cat .env | awsenv sync -n /prod/myapp
    echo "KEY=value" | awsenv sync -n /test/app
    
    # Dry run to preview changes
    awsenv sync -f production.env -n /prod/myapp --dry-run
    
    # Force all parameters as encrypted
    awsenv sync -f secrets.env -n /prod/myapp --encrypt
`);
    process.exit(0);
  }
  
  // Remove 'sync' from argv so args doesn't try to spawn it
  process.argv.splice(2, 1);
  
  // Mark that we should run sync
  global.runSync = true;
}

args
  .option('region', OPTION_REGION_DESCRIPTION)
  .option('namespace', OPTION_NAMESPACE_DESCRIPTION)
  .option('without-exporter', OPTION_WITHOUT_EXPORTER_DESCRIPTION)
  .option('profile', OPTION_PROFILE_DESCRIPTION)
  .option('verbose', OPTION_VERBOSE_DESCRIPTION)
  .option('paranoid', 'Block destructive operations like purge');

// Add sync options if sync command is being used
if (global.runSync) {
  args
    .option('file', 'Path to .env file (use \'-\' for stdin)')
    .option('dry-run', OPTION_DRY_RUN_DESCRIPTION)
    .option('encrypt', OPTION_ENCRYPT_DESCRIPTION);
}

// Add purge options if purge command is being used
if (global.runPurge) {
  args
    .option('force', OPTION_FORCE_DESCRIPTION);
}

args
  .command('init', 'Initialize AWSENV configuration for this project')
  .command('list', 'List all available AWS CLI profiles')
  .command('sync', 'Sync environment variables to AWS Parameter Store')
  .command('purge', 'Delete ALL parameters from namespace (DESTRUCTIVE)');

const params = args.parse(process.argv, { name: 'awsenv' });

// Set global verbose flag
global.verbose = params.verbose || false;

if (global.verbose) {
  const verboseInfo = [
    '',
    '[VERBOSE MODE]',
    '',
    'Initial CLI parameters:',
    `  namespace: ${params.namespace || 'not set'}`,
    `  region: ${params.region || 'not set'}`,
    `  profile: ${params.profile || 'not set'}`,
    `  sync: ${params.sync || false}`,
    '  verbose: true',
    '',
    'Environment variables:',
    `  AWS_PROFILE: ${process.env.AWS_PROFILE || 'not set'}`,
    `  AWS_REGION: ${process.env.AWS_REGION || 'not set'}`,
    `  AWSENV_NAMESPACE: ${process.env.AWSENV_NAMESPACE || 'not set'}`,
    `  AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'set' : 'not set'}`,
    `  AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? 'set' : 'not set'}`
  ];
  console.log(verboseInfo.join('\n'));
}

function shouldUseDefaultProfile() {
  if (params.profile) {
    if (global.verbose) console.log('\nProfile decision: Not using default (--profile flag provided)');
    return false;
  }
  
  if (params.namespace || process.env.AWSENV_NAMESPACE) {
    if (global.verbose) console.log('\nProfile decision: Not using default (namespace already provided)');
    return false;
  }
  
  if (params.sync && !params.namespace && !process.env.AWSENV_NAMESPACE) {
    if (global.verbose) console.log('\nProfile decision: Not using default (sync mode without namespace)');
    return false;
  }
  
  const configPaths = [
    path.join(process.cwd(), '.awsenv'),
    path.join(process.cwd(), '..', '.awsenv'),
    path.join(process.cwd(), '..', '..', '.awsenv')
  ];
  
  if (global.verbose) console.log('\nSearching for .awsenv config:');
  
  const foundConfig = configPaths.some(configPath => {
    const exists = fs.existsSync(configPath);
    if (global.verbose) {
      console.log(`  ${exists ? '[found]' : '[not found]'} ${configPath}`);
    }
    return exists;
  });
  
  if (global.verbose && foundConfig) {
    console.log('\nConfig found - will use default profile');
  }
  
  return foundConfig;
}

// Handle commands
if (process.argv.includes('init')) {
  createExampleConfig();
  process.exit(0);
}

if (process.argv.includes('list')) {
  listProfiles();
  process.exit(0);
}

// Handle sync command
if (global.runSync) {
  (async () => {
    // Use params parsed by args
    const mergedParams = params;
    
    // Set verbose flag globally
    global.verbose = mergedParams.verbose || params.verbose || false;
    
    if (global.verbose) {
      const syncInfo = [
        '',
        '[SYNC COMMAND]',
        `  File: ${mergedParams.file || 'stdin'}`,
        `  Namespace: ${mergedParams.namespace || process.env.AWSENV_NAMESPACE || 'not set'}`,
        `  Region: ${mergedParams.region || process.env.AWS_REGION || 'not set'}`,
        `  Dry run: ${mergedParams.dryRun || false}`,
        `  Encrypt: ${mergedParams.encrypt || false}`
      ];
      console.log(syncInfo.join('\n'));
    }
    
    // Import sync module
    const { default: EnvSync } = await import('./sync.js');
    
    // Check for input source
    let envContent = null;
    const hasFile = mergedParams.file;
    
    if (global.verbose) {
      const inputInfo = [
        '',
        'Input source detection:',
        `  File specified: ${hasFile || 'no'}`,
        `  TTY mode: ${process.stdin.isTTY ? 'yes (terminal)' : 'no (pipe/redirect)'}`
      ];
      console.log(inputInfo.join('\n'));
    }
    
    // If user specified a file, use it
    if (hasFile) {
      // Will be handled by sync.js
      if (global.verbose) console.log('  Decision: Using file input');
    } 
    // If no file specified, try to read from stdin
    else {
      if (global.verbose) console.log('  Decision: Attempting to read from stdin');
      
      // Check if stdin is a pipe/redirect (not TTY)
      if (!process.stdin.isTTY) {
        // Read from stdin
        if (global.verbose) console.log('\nReading from stdin...');
        
        const chunks = [];
        process.stdin.setEncoding('utf8');
        
        await new Promise((resolve) => {
          process.stdin.on('data', chunk => chunks.push(chunk));
          process.stdin.on('end', resolve);
        });
        
        if (chunks.length > 0) {
          envContent = chunks.join('');
          if (global.verbose) console.log(`  Read ${envContent.split('\n').length} lines from stdin`);
        } else {
          console.error([
            '',
            '❌ Empty stdin input',
            '',
            '💡 Fix: Pipe valid content to stdin or use -f <file>',
            ''
          ].join('\n'));
          process.exit(1);
        }
      } else {
        // No file and no piped input
        console.error([
          '',
          '❌ No input source specified',
          '',
          'You must provide environment variables via:',
          '  1. File: awsenv sync -f <file> ...',
          '  2. Stdin: cat .env | awsenv sync ...',
          '',
          'Examples:',
          '  awsenv sync -f .env -n /prod/app',
          '  cat .env | awsenv sync -n /prod/app',
          '  echo "KEY=value" | awsenv sync -n /test/app',
          '',
          '💡 Fix: Use -f <file> to specify a file or pipe content via stdin',
          ''
        ].join('\n'));
        process.exit(1);
      }
    }
    
    // Apply profile if needed
    let finalSyncParams = mergedParams;
    const profileToUse = mergedParams.profile || (!mergedParams.namespace && shouldUseDefaultProfile() ? 'default' : null);
    
    if (profileToUse) {
      if (global.verbose) console.log(`\nApplying profile: ${profileToUse}`);
      try {
        finalSyncParams = applyProfile(mergedParams, profileToUse);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    }
    
    // Validate namespace
    if (!finalSyncParams.namespace && !process.env.AWSENV_NAMESPACE) {
      console.error([
        '',
        '❌ Namespace is required for sync operation',
        '',
        '💡 Fix: Use --namespace <path> or set AWSENV_NAMESPACE environment variable',
        ''
      ].join('\n'));
      process.exit(1);
    }
    
    const syncOptions = {
      region: finalSyncParams.region || process.env.AWS_REGION || 'us-east-1',
      namespace: finalSyncParams.namespace || process.env.AWSENV_NAMESPACE,
      dryRun: finalSyncParams.dryRun,
      encrypt: finalSyncParams.encrypt || false,
      filePath: envContent ? null : finalSyncParams.file,
      envContent: envContent
    };
    
    const envSync = new EnvSync(syncOptions);
    await envSync.sync();
    process.exit(0);
  })();
} else if (global.runPurge) {
  // Handle purge command
  (async () => {
    const mergedParams = params;
    
    // Set verbose flag globally
    global.verbose = mergedParams.verbose || params.verbose || false;
    
    if (global.verbose) {
      const purgeInfo = [
        '',
        '[PURGE COMMAND]',
        `  Namespace: ${mergedParams.namespace || process.env.AWSENV_NAMESPACE || 'not set'}`,
        `  Region: ${mergedParams.region || process.env.AWS_REGION || 'not set'}`,
        `  Force: ${mergedParams.force || false}`,
        `  Paranoid: ${mergedParams.paranoid || false}`
      ];
      console.log(purgeInfo.join('\n'));
    }
    
    // Import purge module
    const { default: EnvPurge } = await import('./purge.js');
    
    // Apply profile if needed
    let finalPurgeParams = mergedParams;
    const profileToUse = mergedParams.profile || (!mergedParams.namespace && shouldUseDefaultProfile() ? 'default' : null);
    
    if (profileToUse) {
      if (global.verbose) console.log(`\nApplying profile: ${profileToUse}`);
      try {
        finalPurgeParams = applyProfile(mergedParams, profileToUse);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    }
    
    // Validate namespace
    if (!finalPurgeParams.namespace && !process.env.AWSENV_NAMESPACE) {
      console.error([
        '',
        '❌ Namespace is required for purge operation',
        '',
        '💡 Fix: Use --namespace <path> or set AWSENV_NAMESPACE environment variable',
        ''
      ].join('\n'));
      process.exit(1);
    }
    
    const purgeOptions = {
      region: finalPurgeParams.region || process.env.AWS_REGION || 'us-east-1',
      namespace: finalPurgeParams.namespace || process.env.AWSENV_NAMESPACE,
      force: finalPurgeParams.force,
      paranoid: finalPurgeParams.paranoid || false  // CLI flag or config setting
    };
    
    const envPurge = new EnvPurge(purgeOptions);
    await envPurge.purge();
    process.exit(0);
  })();
} else {

let finalParams = params;
let profileToUse = params.profile;

if (!profileToUse && shouldUseDefaultProfile()) {
  profileToUse = 'default';
  if (global.verbose) console.log('Using default profile from .awsenv config');
}

if (profileToUse) {
  if (global.verbose) console.log(`\nApplying profile: ${profileToUse}`);
  try {
    finalParams = applyProfile(params, profileToUse);
    if (global.verbose) {
      const finalConfig = [
        '',
        'Final configuration:',
        `  region: ${finalParams.region || 'not set'}`,
        `  namespace: ${finalParams.namespace || 'not set'}`,
        `  encrypt: ${finalParams.encrypt || false}`,
        `  without_exporter: ${finalParams.withoutExporter || false}`
      ];
      console.log(finalConfig.join('\n'));
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv.length <= 2 && !finalParams.namespace && !process.env.AWSENV_NAMESPACE) {
  args.showHelp();
  process.exit(0);
}

app(finalParams);

}
