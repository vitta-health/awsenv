import fs from 'fs';
import os from 'os';
import path from 'path';
function parseAwsConfigFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const profiles = {};
    let currentProfile = null;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      const profileMatch = trimmed.match(/^\[(?:profile\s+)?([^\]]+)\]$/);
      if (profileMatch) {
        currentProfile = profileMatch[1];
        profiles[currentProfile] = profiles[currentProfile] || {};
        continue;
      }

      const keyValueMatch = trimmed.match(/^([^=]+)\s*=\s*(.*)$/);
      if (keyValueMatch && currentProfile) {
        const key = keyValueMatch[1].trim();
        const value = keyValueMatch[2].trim();
        profiles[currentProfile][key] = value;
      }
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
    path.join(process.cwd(), '.awsenv', 'config'),
    
    path.join(process.cwd(), '..', '.awsenv', 'config'),
    path.join(process.cwd(), '..', '..', '.awsenv', 'config')
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      const awsenvProfiles = parseAwsConfigFile(configPath);
      if (awsenvProfiles[profileName]) {
        return awsenvProfiles[profileName];
      }
    }
  }

  return {};
}

export function applyProfile(params, profileName) {
  const awsProfiles = getAwsCliProfiles();
  const awsProfile = awsProfiles[profileName];
  
  if (!awsProfile) {
    const availableProfiles = Object.keys(awsProfiles);
    throw new Error(
      `AWS CLI profile '${profileName}' not found. Available profiles: ${availableProfiles.join(', ')}\n` +
      `Run 'aws configure --profile ${profileName}' to create it.`
    );
  }

  const awsenvConfig = getAwsEnvConfig(profileName);

  const result = {};

  if (awsProfile.region) {
    result.region = awsProfile.region;
  }

  if (awsenvConfig.namespace) {
    result.namespace = awsenvConfig.namespace;
  }
  if (awsenvConfig.all_secure !== undefined) {
    result.allSecure = awsenvConfig.all_secure === 'true';
  }
  if (awsenvConfig.without_exporter !== undefined) {
    result.withoutExporter = awsenvConfig.without_exporter === 'true';
  }

  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      result[key] = params[key];
    }
  });

  if (!process.env.AWS_PROFILE) {
    process.env.AWS_PROFILE = profileName;
  }

  return result;
}

export function listProfiles() {
  const awsProfiles = getAwsCliProfiles();
  const profileNames = Object.keys(awsProfiles);

  if (profileNames.length === 0) {
    return;
  }

}

function generateNamespace(appName, environment = 'production') {
  
  const cleanAppName = appName
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, '-')    .replace(/^-+|-+$/g, '')          .replace(/-+/g, '-');           
  const cleanEnv = environment
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  
  return `/awsenv/app=${cleanAppName}/env=${cleanEnv}`;
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
  const configDir = path.join(process.cwd(), '.awsenv');
  const configFile = path.join(configDir, 'config');
  
  if (fs.existsSync(configFile)) {
    return;
  }
  
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const appName = getCurrentAppName();
  
  const smartConfig = `# AWSENV Project Configuration
# Auto-generated configuration for: ${appName}
# This file extends AWS CLI profiles with AWSENV-specific settings

[default]
namespace = ${generateNamespace(appName, 'production')}
all_secure = true

[production]  
namespace = ${generateNamespace(appName, 'production')}
all_secure = true

[staging]
namespace = ${generateNamespace(appName, 'staging')}
all_secure = false

[development]
namespace = ${generateNamespace(appName, 'development')}
all_secure = false
without_exporter = false

# Need custom namespaces? Edit them above!
# Parameter Store path format: /awsenv/app=<app-name>/env=<environment>
`;

  fs.writeFileSync(configFile, smartConfig);
  
}