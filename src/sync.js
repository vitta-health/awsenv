import fs from 'fs';
import path from 'path';
import {
  SYNC_CANCELLED_MSG,
  SYNC_CONFIRM_MSG,
  SYNC_DRY_RUN_MSG,
  SYNC_SUCCESS_MSG,
} from './concerns/msgs.js';
import AwsSsm from './vendor/aws-ssm.js';
const SECRET_PATTERNS = [
  /password/i,
  /secret/i,
  /key/i,
  /token/i,
  /auth/i,
  /credential/i,
  /pass/i,
  /pwd/i,
  /private/i,
  /cert/i,
  /ssl/i,
  /tls/i,
  /encrypt/i,
  /hash/i,
  /salt/i,
];

class EnvSync {
  constructor(options = {}) {
    this.region = options.region || 'us-east-1';
    this.namespace = options.namespace;
    this.dryRun = options.dryRun || false;
    this.force = options.force || false;
    this.allSecure = options.allSecure || false;
    this.filePath = options.filePath || '.env';
  }

  parseEnvFile(filePath) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const envVars = {};
      
      const lines = fileContent.split('\n');
      
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) {
          continue;
        }
        
        // Handle KEY=VALUE format
        const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
        if (match) {
          const [, key, value] = match;
          // Remove surrounding quotes if present
          let cleanValue = value.trim();
          if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
              (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
            cleanValue = cleanValue.slice(1, -1);
          }
          envVars[key] = cleanValue;
        }
      }
      
      return envVars;
    } catch (error) {
      throw new Error(`Failed to read .env file: ${error.message}`);
    }
  }

  /**
   * Determine if a variable should be stored as SecureString
   */
  isSecret(key, value) {
    // If allSecure flag is set, treat everything as secret
    if (this.allSecure) {
      return true;
    }
    
    // Check if key matches secret patterns
    const keyIsSecret = SECRET_PATTERNS.some(pattern => pattern.test(key));
    
    // Check if value looks like a secret (long random strings, tokens, etc.)
    const valueIsSecret = value.length > 20 && 
                         /[A-Za-z0-9+/=]{20,}/.test(value) && 
                         !/^https?:\/\//.test(value) && // Not a URL
                         !/^\d+$/.test(value); // Not just numbers
    
    return keyIsSecret || valueIsSecret;
  }

  /**
   * Create parameter path from namespace and key
   */
  createParameterPath(key) {
    const cleanNamespace = this.namespace.endsWith('/') 
      ? this.namespace.slice(0, -1) 
      : this.namespace;
    return `${cleanNamespace}/${key}`;
  }

  /**
   * Prepare parameters for AWS Parameter Store
   */
  prepareParameters(envVars) {
    const parameters = [];
    
    for (const [key, value] of Object.entries(envVars)) {
      const parameterPath = this.createParameterPath(key);
      const isSecure = this.isSecret(key, value);
      
      parameters.push({
        Name: parameterPath,
        Value: value,
        Type: isSecure ? 'SecureString' : 'String',
        Overwrite: true,
        Description: `Environment variable ${key} synced from .env file`,
      });
    }
    
    return parameters;
  }

  /**
   * Display parameters that would be synced (dry run)
   */
  displayDryRun(parameters) {
    // Dry run display removed
  }

  /**
   * Ask for user confirmation
   */
  async askConfirmation() {
    if (this.force) {
      return true;
    }

    return new Promise(async (resolve) => {
      const { createInterface } = await import('readline');
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(SYNC_CONFIRM_MSG + ' ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  /**
   * Upload parameters to AWS Parameter Store
   */
  async uploadParameters(parameters) {
    const results = [];
    
    for (const param of parameters) {
      try {
        await AwsSsm.putParameter(this.region, param);
        results.push({ success: true, parameter: param.Name });
        process.stdout.write('✅ ');
      } catch (error) {
        results.push({ 
          success: false, 
          parameter: param.Name, 
          error: error.message 
        });
        process.stdout.write('❌ ');
      }
    }
    
    // Progress completed silently
    return results;
  }

  /**
   * Main sync function
   */
  async sync() {
    try {
      // Validate inputs
      if (!this.namespace) {
        throw new Error('Namespace is required for sync operation');
      }

      if (!fs.existsSync(this.filePath)) {
        throw new Error(`File not found: ${this.filePath}`);
      }

      // Parse .env file
      // Reading environment file silently
      const envVars = this.parseEnvFile(this.filePath);
      
      if (Object.keys(envVars).length === 0) {
        // No environment variables found
        return;
      }

      // Prepare parameters
      const parameters = this.prepareParameters(envVars);
      
      // Show what will be synced
      this.displayDryRun(parameters);

      // If dry run, stop here
      if (this.dryRun) {
        // Dry run completed silently
        return;
      }

      // Ask for confirmation
      const confirmed = await this.askConfirmation();
      if (!confirmed) {
        // Sync cancelled silently
        return;
      }

      // Upload parameters
      // Syncing parameters silently

      const results = await this.uploadParameters(parameters);
      
      // Show results
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      // Sync results processed silently

    } catch (error) {
      console.error(`❌ Sync failed: ${error.message}`);
      process.exit(1);
    }
  }
}

export default EnvSync;