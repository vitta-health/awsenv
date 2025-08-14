export const OPTION_NAMESPACE_DESCRIPTION = 'Prefix for your parameters path, set also by $AWS_NAMESPACE environment variable.';
export const OPTION_REGION_DESCRIPTION = 'AWS region for SSM parameters, set by $AWS_REGION environment variable.';
export const OPTION_WITHOUT_EXPORTER_DESCRIPTION = 'Hides command export from stdout.';
export const OPTION_SYNC_DESCRIPTION = 'Sync .env file to AWS Parameter Store. Specify file path or use .env by default.';
export const OPTION_DRY_RUN_DESCRIPTION = 'Show what would be synced without actually uploading to Parameter Store.';
export const OPTION_FORCE_DESCRIPTION = 'Overwrite existing parameters in Parameter Store without confirmation.';
export const OPTION_ENCRYPT_DESCRIPTION = 'Store all parameters as SecureString (encrypted) regardless of content';
export const OPTION_PROFILE_DESCRIPTION = 'Use predefined configuration profile (e.g., --profile production)';
export const OPTION_VERBOSE_DESCRIPTION = 'Enable verbose output to see configuration details and decision process';
export const DEFAULT_ERROR_MSG = [
  '',
  '❌ Namespace is required',
  '',
  'Usage: awsenv --namespace <path>',
  '',
  '💡 Fix: Provide namespace via --namespace flag or set AWSENV_NAMESPACE environment variable',
  '',
  'For help: awsenv --help',
  ''
].join('\n');
export const SYNC_SUCCESS_MSG = '✅ Successfully synced parameters to AWS Parameter Store';
export const SYNC_DRY_RUN_MSG = '🔍 DRY RUN - The following parameters would be created/updated:';
export const SYNC_CONFIRM_MSG = '❓ This will create/update parameters in AWS Parameter Store. Continue? (y/N):';
export const SYNC_CANCELLED_MSG = '❌ Sync cancelled by user';
