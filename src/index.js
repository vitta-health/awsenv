import args from 'args';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';  
import app from './app.js';
import {
  OPTION_ALL_SECURE_DESCRIPTION,
  OPTION_DRY_RUN_DESCRIPTION,
  OPTION_FORCE_DESCRIPTION,
  OPTION_NAMESPACE_DESCRIPTION,
  OPTION_PROFILE_DESCRIPTION,
  OPTION_REGION_DESCRIPTION,
  OPTION_SYNC_DESCRIPTION,
  OPTION_WITHOUT_EXPORTER_DESCRIPTION,
} from './concerns/msgs.js';
import { applyProfile, createExampleConfig, listProfiles } from './profiles.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.mainModule) {
  process.mainModule = { filename: __filename };
}

args
  .option('region', OPTION_REGION_DESCRIPTION, 'us-east-1')
  .option('namespace', OPTION_NAMESPACE_DESCRIPTION, null)
  .option('without-exporter', OPTION_WITHOUT_EXPORTER_DESCRIPTION)
  .option('sync', OPTION_SYNC_DESCRIPTION)
  .option('dry-run', OPTION_DRY_RUN_DESCRIPTION)
  .option('force', OPTION_FORCE_DESCRIPTION)
  .option('all-secure', OPTION_ALL_SECURE_DESCRIPTION)
  .option('profile', OPTION_PROFILE_DESCRIPTION)
  .command('init', 'Initialize AWSENV configuration for this project')
  .command('list', 'List all available AWS CLI profiles');

const params = args.parse(process.argv, { name: 'awsenv' });

function shouldUseDefaultProfile() {
  if (params.profile) return false;
  
  if (params.namespace || process.env.AWSENV_NAMESPACE) return false;
  
  if (params.sync && !params.namespace && !process.env.AWSENV_NAMESPACE) return false;
  
  const configPaths = [
    path.join(process.cwd(), '.awsenv', 'config'),
    path.join(process.cwd(), '..', '.awsenv', 'config'),
    path.join(process.cwd(), '..', '..', '.awsenv', 'config')
  ];
  
  return configPaths.some(configPath => fs.existsSync(configPath));
}

if (process.argv.includes('init')) {
  createExampleConfig();
  process.exit(0);
}

if (process.argv.includes('list')) {
  listProfiles();
  process.exit(0);
}

let finalParams = params;
let profileToUse = params.profile;

if (!profileToUse && shouldUseDefaultProfile()) {
  profileToUse = 'default';
}

if (profileToUse) {
  try {
    finalParams = applyProfile(params, profileToUse);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv.length <= 2 && !finalParams.namespace && !process.env.AWSENV_NAMESPACE && !finalParams.sync) {
  args.showHelp();
  process.exit(0);
}

app(finalParams);
