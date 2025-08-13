import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import {
  SYNC_CANCELLED_MSG,
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
    this.encrypt = options.encrypt || false;
    this.filePath = options.filePath || '.env';
    this.envContent = options.envContent || null;
  }

  parseEnvContent(content, source = 'file') {
    if (global.verbose) {
      console.log(`\nParsing env ${source}`);
    }
    
    try {
      const envVars = {};
      const lines = content.split('\n');
      
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
      
      if (global.verbose) {
        const varInfo = [`  Found ${Object.keys(envVars).length} variables:`];
        Object.keys(envVars).sort().forEach(key => {
          varInfo.push(`    - ${key}`);
        });
        console.log(varInfo.join('\n'));
      }
      
      return envVars;
    } catch (error) {
      throw new Error(`Failed to parse env content: ${error.message}`);
    }
  }

  parseEnvFile(filePath) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      return this.parseEnvContent(fileContent, `file: ${filePath}`);
    } catch (error) {
      throw new Error(`Failed to read .env file: ${error.message}`);
    }
  }

  /**
   * Determine if a variable should be stored as SecureString
   */
  isSecret(key, value) {
    // If encrypt flag is set, treat everything as secret
    if (this.encrypt) {
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
    
    const verboseParams = global.verbose ? ['', 'Preparing parameters for AWS:'] : null;
    
    for (const [key, value] of Object.entries(envVars)) {
      const parameterPath = this.createParameterPath(key);
      const isSecure = this.isSecret(key, value);
      
      if (global.verbose) {
        verboseParams.push(`  ${key}:`);
        verboseParams.push(`    Path: ${parameterPath}`);
        verboseParams.push(`    Type: ${isSecure ? 'SecureString (encrypted)' : 'String (plain text)'}`);
        if (isSecure && !this.encrypt) {
          const reason = SECRET_PATTERNS.some(pattern => pattern.test(key)) ? 'key pattern match' : 'value pattern match';
          verboseParams.push(`    Reason: ${reason}`);
        }
      }
      
      parameters.push({
        Name: parameterPath,
        Value: value,
        Type: isSecure ? 'SecureString' : 'String',
        Overwrite: true,
        Description: `Environment variable ${key} synced from .env file`,
      });
    }
    
    if (verboseParams) {
      console.log(verboseParams.join('\n'));
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
   * Upload parameters to AWS Parameter Store
   */
  async uploadParameters(parameters) {
    // Create concurrency limiter - 3 parallel requests (safe for AWS rate limits)
    const limit = pLimit(3);
    
    if (global.verbose) {
      const info = [
        '',
        `Uploading ${parameters.length} parameters with concurrency: 3`
      ];
      console.log(info.join('\n'));
    }
    
    // Create promises for all uploads with concurrency control
    const uploadPromises = parameters.map((param, index) => 
      limit(async () => {
        try {
          // Add small delay to avoid rate limiting (50ms between requests)
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          await AwsSsm.putParameter(this.region, param);
          process.stdout.write('.');
          return { success: true, parameter: param.Name };
        } catch (error) {
          // Handle specific AWS authentication errors
          if (error.name === 'UnrecognizedClientException' || 
              error.name === 'InvalidClientTokenId' ||
              error.message?.includes('security token') ||
              error.message?.includes('invalid')) {
            console.error([
              '',
              '❌ AWS Authentication Error',
              '',
              'Your AWS credentials are invalid or expired.',
              '',
              'Possible solutions:',
              '  1. Configure AWS credentials: aws configure',
              '  2. Use a valid AWS profile: awsenv --profile <profile-name>',
              '  3. Set environment variables:',
              '     export AWS_ACCESS_KEY_ID=<your-key>',
              '     export AWS_SECRET_ACCESS_KEY=<your-secret>',
              '  4. If using temporary credentials, refresh them',
              '',
              '💡 Fix: Run "aws configure" or "awsenv --profile <name>" with valid credentials',
              ''
            ].join('\n'));
            process.exit(1);
          }
          
          // Handle expired token errors
          if (error.name === 'ExpiredToken' || 
              error.name === 'ExpiredTokenException' ||
              error.message?.includes('expired')) {
            console.error([
              '',
              '❌ AWS Token Expired',
              '',
              'Your AWS session token has expired.',
              '',
              'Please refresh your credentials:',
              '  • If using SSO: aws sso login --profile <profile-name>',
              '  • If using temporary credentials: obtain new ones',
              '  • If using IAM user: check if credentials are still valid',
              '',
              '💡 Fix: Run "aws sso login --profile <profile-name>" to refresh your session',
              ''
            ].join('\n'));
            process.exit(1);
          }
          
          // Handle access denied errors
          if (error.name === 'AccessDeniedException' || 
              error.name === 'UnauthorizedException' ||
              error.message?.includes('not authorized')) {
            console.error([
              '',
              '❌ AWS Access Denied',
              '',
              `You don't have permission to write parameters at: ${param.Name}`,
              '',
              'Required permissions:',
              '  • ssm:PutParameter',
              '  • kms:Encrypt (for SecureString parameters)',
              '',
              '💡 Fix: Ask your AWS administrator to grant the above permissions to your user/role',
              ''
            ].join('\n'));
            process.exit(1);
          }
          
          process.stdout.write('x');
          return { 
            success: false, 
            parameter: param.Name, 
            error: error.message 
          };
        }
      })
    );
    
    // Wait for all uploads to complete
    const results = await Promise.all(uploadPromises);
    
    // Add newline after progress dots
    console.log('');
    
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

      // Parse environment variables
      let envVars;
      
      if (this.envContent) {
        // Parse from stdin content
        envVars = this.parseEnvContent(this.envContent, 'stdin');
      } else {
        // Check if file exists
        if (!fs.existsSync(this.filePath)) {
          throw new Error(`File not found: ${this.filePath}`);
        }
        
        // Parse from file
        envVars = this.parseEnvFile(this.filePath);
      }
      
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

      // Upload parameters directly without confirmation
      // Syncing parameters silently

      const results = await this.uploadParameters(parameters);
      
      // Show results
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      if (failed > 0) {
        console.error([
          '',
          `⚠️  Sync completed with errors:`,
          `  ✅ Success: ${successful} parameters`,
          `  ❌ Failed: ${failed} parameters`,
          ''
        ].join('\n'));
        
        // Show which parameters failed
        const failedParams = results.filter(r => !r.success);
        console.error('Failed parameters:');
        failedParams.forEach(p => {
          console.error(`  - ${p.parameter}: ${p.error}`);
        });
        console.error('');
        process.exit(1);
      } else {
        console.log([
          '',
          `✅ Sync completed successfully:`,
          `  Uploaded: ${successful} parameters`,
          ''
        ].join('\n'));
      }

    } catch (error) {
      console.error([
        '',
        '❌ Sync failed',
        '',
        `Error: ${error.message}`,
        '',
        '💡 Fix: Check the error message above and correct the issue',
        ''
      ].join('\n'));
      process.exit(1);
    }
  }
}

export default EnvSync;