import fs from 'fs';
import os from 'os';
import path from 'path';
function parseAwsConfigFile(filePath) {
  if (!fs.existsSync(filePath)) {
    if (global.verbose) console.log(`  [not found] ${filePath}`);
    return {};
  }

  try {
    if (global.verbose) console.log(`  [reading] ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf8');
    const profiles = {};
    let currentProfile = null;
    let profileCount = 0;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      const profileMatch = trimmed.match(/^\[(?:profile\s+)?([^\]]+)\]$/);
      if (profileMatch) {
        currentProfile = profileMatch[1];
        profiles[currentProfile] = profiles[currentProfile] || {};
        profileCount++;
        continue;
      }

      const keyValueMatch = trimmed.match(/^([^=]+)\s*=\s*(.*)$/);
      if (keyValueMatch && currentProfile) {
        const key = keyValueMatch[1].trim();
        const value = keyValueMatch[2].trim();
        profiles[currentProfile][key] = value;
      }
    }

    if (global.verbose && profileCount > 0) {
      console.log(`    Found ${profileCount} profiles: ${Object.keys(profiles).join(', ')}`);
    }
    return profiles;
  } catch (error) {
    console.warn(`Warning: Could not parse AWS config file ${filePath}: ${error.message}`);
    return {};
  }
}

function getAwsCliProfiles() {
  const homeDir = os.homedir();
  const credentialsPath = path.join(homeDir, '.aws', 'credentials');
  const configPath = path.join(homeDir, '.aws', 'config');

  if (global.verbose) console.log('\nLoading AWS CLI profiles:');
  
  const credentialsProfiles = parseAwsConfigFile(credentialsPath);
  const configProfiles = parseAwsConfigFile(configPath);

  const allProfiles = { ...credentialsProfiles };
  
  Object.keys(configProfiles).forEach(profileName => {
    allProfiles[profileName] = {
      ...allProfiles[profileName],
      ...configProfiles[profileName]
    };
  });

  return allProfiles;
}

function getAwsEnvConfig(profileName) {
  const configPaths = [
    path.join(process.cwd(), '.awsenv'),
    path.join(process.cwd(), '..', '.awsenv'),
    path.join(process.cwd(), '..', '..', '.awsenv')
  ];

  if (global.verbose) console.log(`\nLooking for AWSENV config for profile [${profileName}]:`);

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      if (global.verbose) console.log(`  [found] ${configPath}`);
      const awsenvProfiles = parseAwsConfigFile(configPath);
      if (awsenvProfiles[profileName]) {
        if (global.verbose) {
          const configInfo = [
            `    Profile [${profileName}] configuration:`,
            `      namespace: ${awsenvProfiles[profileName].namespace || 'not set'}`,
            `      encrypt: ${awsenvProfiles[profileName].encrypt || 'false'}`,
            `      paranoid: ${awsenvProfiles[profileName].paranoid || 'false'}`
          ];
          console.log(configInfo.join('\n'));
        }
        return awsenvProfiles[profileName];
      } else {
        if (global.verbose) console.log(`    Profile [${profileName}] not found in this config`);
      }
    }
  }

  if (global.verbose) console.log(`  No AWSENV config found for profile [${profileName}]`);
  return {};
}

export function applyProfile(params, profileName) {
  // Get AWS CLI profile first (must exist)
  const awsProfiles = getAwsCliProfiles();
  const awsProfile = awsProfiles[profileName];
  
  if (!awsProfile) {
    const availableProfiles = Object.keys(awsProfiles);
    throw new Error(
      `AWS CLI profile '${profileName}' not found. Available profiles: ${availableProfiles.join(', ')}\n` +
      `Run 'aws configure --profile ${profileName}' to create it.`
    );
  }
  
  if (global.verbose) {
    console.log(`\nAWS CLI profile [${profileName}] loaded:`);
    if (awsProfile.region) console.log(`  region: ${awsProfile.region}`);
    if (awsProfile.sso_session) console.log(`  sso_session: ${awsProfile.sso_session}`);
    if (awsProfile.sso_role_name) console.log(`  role: ${awsProfile.sso_role_name}`);
  }
  
  // Then get AWSENV config for this profile (optional - adds extra settings)
  const awsenvConfig = getAwsEnvConfig(profileName);

  const result = {};

  if (awsProfile.region) {
    result.region = awsProfile.region;
  }

  if (awsenvConfig.namespace) {
    // Remove any trailing slashes from namespace
    result.namespace = awsenvConfig.namespace.replace(/\/+$/, '');
  }
  if (awsenvConfig.encrypt !== undefined) {
    result.encrypt = awsenvConfig.encrypt === 'true';
  }
  if (awsenvConfig.without_exporter !== undefined) {
    result.withoutExporter = awsenvConfig.without_exporter === 'true';
  }
  if (awsenvConfig.paranoid !== undefined) {
    result.paranoid = awsenvConfig.paranoid === 'true';
  }

  // CLI parameters override everything (except when they're just defaults)
  let hasOverrides = false;
  
  Object.keys(params).forEach(key => {
    // Skip 'r' and 'region' if they're the default value and we already have a region from profile
    if (key === 'r' || key === 'region') {
      if (params[key] === 'us-east-1' && result.region) {
        // This is just the CLI default, don't override profile region
        return;
      }
    }
    
    if (params[key] !== undefined && params[key] !== null) {
      if (result[key] !== params[key] && key !== 'verbose' && key !== 'v' && key !== 'n') {
        hasOverrides = true;
        if (global.verbose) {
          if (!hasOverrides) console.log('\nCLI overrides:');
          console.log(`  ${key}: ${result[key]} → ${params[key]}`);
        }
      }
      result[key] = params[key];
    }
  });

  // Set the AWS_PROFILE environment variable
  if (!process.env.AWS_PROFILE) {
    process.env.AWS_PROFILE = profileName;
    if (global.verbose) console.log(`\nSetting AWS_PROFILE=${profileName}`);
  }

  return result;
}

export function listProfiles() {
  const awsProfiles = getAwsCliProfiles();
  const profileNames = Object.keys(awsProfiles);

  if (profileNames.length === 0) {
    console.log('\nNo AWS CLI profiles found.');
    console.log('Run "aws configure --profile <name>" to create a profile.');
    return;
  }

  console.log('\nAvailable AWS CLI profiles:');
  profileNames.forEach(name => {
    const profile = awsProfiles[name];
    console.log(`  ${name}:`);
    if (profile.region) console.log(`    region: ${profile.region}`);
    if (profile.sso_session) console.log(`    sso_session: ${profile.sso_session}`);
    if (profile.sso_role_name) console.log(`    role: ${profile.sso_role_name}`);
  });
  
  console.log('\nUsage:');
  console.log(`  awsenv --profile ${profileNames[0]}`);
}

function generateNamespace(appName, environment = 'production') {
  
  const cleanAppName = appName
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
           
  const cleanEnv = environment
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  
  // AWS Parameter Store namespace format
  // Cannot start with /aws or /ssm (AWS restriction)
  // Using single underscore as separator
  // Ensure no trailing slashes
  const namespace = `/envstore/app_${cleanAppName}/env_${cleanEnv}`;
  return namespace.replace(/\/+$/, ''); // Remove any trailing slashes
}

function getCurrentAppName() {
  const currentDir = process.cwd();
  const dirName = path.basename(currentDir);
  
  if (!dirName || dirName === '.' || dirName === '/') {
    return 'my-app';
  }
  
  return dirName;
}

export function createExampleConfig() {
  const configFile = path.join(process.cwd(), '.awsenv');
  
  if (fs.existsSync(configFile)) {
    console.log('\n⚠️  Configuration already exists at:');
    console.log(`   ${configFile}\n`);
    return;
  }

  const appName = getCurrentAppName();
  const awsProfiles = getAwsCliProfiles();
  const availableProfiles = Object.keys(awsProfiles);
  
  // Build config sections based on existing AWS CLI profiles
  let configSections = [];
  
  // Add default section
  configSections.push(`[default]
namespace = ${generateNamespace(appName, 'production')}
encrypt = true
paranoid = true`);
  
  // Add sections for each AWS CLI profile found
  if (availableProfiles.length > 0) {
    availableProfiles.forEach(profile => {
      // Try to guess environment from profile name
      let env = 'production';
      if (profile.includes('dev') || profile.includes('development')) {
        env = 'development';
      } else if (profile.includes('staging') || profile.includes('stage')) {
        env = 'staging';
      } else if (profile.includes('test')) {
        env = 'test';
      }
      
      configSections.push(`[${profile}]
namespace = ${generateNamespace(appName, env)}
encrypt = ${env === 'production' ? 'true' : 'false'}
paranoid = ${env === 'production' ? 'true' : 'false'}`);
    });
  } else {
    // If no AWS profiles, add example sections
    configSections.push(`[production]
namespace = ${generateNamespace(appName, 'production')}
encrypt = true
paranoid = true

[staging]
namespace = ${generateNamespace(appName, 'staging')}
encrypt = false
paranoid = false

[development]
namespace = ${generateNamespace(appName, 'development')}
encrypt = false
paranoid = false`);
  }
  
  const smartConfig = `# AWSENV Project Configuration
# Auto-generated for: ${appName}
# Created at: ${new Date().toISOString()}
# Path: ${configFile}

# IMPORTANT: Profile names must match AWS CLI profile names!
# Each [section] name corresponds to an AWS CLI profile in ~/.aws/credentials

${configSections.join('\n\n')}

# Usage:
# awsenv --profile ${availableProfiles[0] || 'production'}    # Uses AWS CLI profile and settings above
# awsenv                                       # Uses [default] section

# Each section can have:
# - namespace: Parameter Store path (required)
# - encrypt: Force all params as SecureString (true/false)
# - without_exporter: Output without 'export' prefix (true/false)
# - paranoid: Block destructive operations like purge (true/false)

# Available AWS CLI profiles on this system:
${availableProfiles.length > 0 ? availableProfiles.map(p => `# - ${p}`).join('\n') : '# (none found - run "aws configure" to create one)'}

# Namespace format: /envstore/app_{app-name}/env_{environment}
# Example: /envstore/app_myapp/env_production, /envstore/app_myapp/env_staging
`;

  fs.writeFileSync(configFile, smartConfig);
  
  console.log('\n✅ AWSENV configuration created!\n');
  console.log(`📁 Config file: ${configFile}`);
  
  if (availableProfiles.length > 0) {
    console.log('\n📝 Configuration sections created for AWS CLI profiles:');
    console.log('   • [default] - fallback configuration');
    availableProfiles.forEach(p => console.log(`   • [${p}] - matches AWS CLI profile "${p}"`));
    
    console.log('\n🚀 Usage:');
    console.log(`   awsenv --profile ${availableProfiles[0]}`);
    console.log('   awsenv  # uses [default] section\n');
    
    console.log('💡 Important: Profile names must match AWS CLI profiles exactly!\n');
  } else {
    console.log('\n📝 Example configuration sections created:');
    console.log('   • [default]');
    console.log('   • [production]');
    console.log('   • [staging]');
    console.log('   • [development]\n');
    
    console.log('⚠️  No AWS CLI profiles found.');
    console.log('   Run "aws configure --profile <name>" to create profiles first.\n');
  }
}