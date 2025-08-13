import pLimit from 'p-limit';
import AwsSsm from './vendor/aws-ssm.js';

class EnvPurge {
  constructor(options = {}) {
    this.region = options.region || 'us-east-1';
    this.namespace = options.namespace;
    this.force = options.force || false;
    this.paranoid = options.paranoid || false;
  }

  async listParameters() {
    if (global.verbose) {
      const info = [
        '',
        'Fetching parameters to purge:',
        `  Region: ${this.region}`,
        `  Namespace: ${this.namespace}`
      ];
      console.log(info.join('\n'));
    }

    try {
      const response = await AwsSsm.getParametersByPath(this.region, this.namespace);
      if (!response || !response.Parameters) {
        return [];
      }
      return response.Parameters.map(p => p.Name);
    } catch (error) {
      if (error.name === 'ParameterNotFound' || error.message?.includes('not found')) {
        return [];
      }
      throw error;
    }
  }

  async deleteParameters(parameterNames) {
    // Create concurrency limiter - 3 parallel requests (safe for AWS rate limits)
    const limit = pLimit(3);
    
    if (global.verbose) {
      const info = [
        '',
        `Deleting ${parameterNames.length} parameters with concurrency: 3`
      ];
      console.log(info.join('\n'));
    }

    // Create promises for all deletions with concurrency control
    const deletePromises = parameterNames.map((name, index) => 
      limit(async () => {
        try {
          // Add small delay to avoid rate limiting (50ms between requests)
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          await AwsSsm.deleteParameter(this.region, name);
          process.stdout.write('.');
          return { success: true, parameter: name };
        } catch (error) {
          process.stdout.write('x');
          return { 
            success: false, 
            parameter: name, 
            error: error.message 
          };
        }
      })
    );
    
    // Wait for all deletions to complete
    const results = await Promise.all(deletePromises);
    
    // Add newline after progress dots
    console.log('');
    
    return results;
  }

  async askConfirmation(parameterNames) {
    if (this.force) {
      return true;
    }

    const confirmMessages = [
      '',
      '⚠️  WARNING: DESTRUCTIVE OPERATION',
      '',
      `You are about to DELETE ${parameterNames.length} parameters from:`,
      `  Namespace: ${this.namespace}`,
      `  Region: ${this.region}`,
      '',
      'Parameters to be deleted:',
    ];

    // Show first 10 parameters
    const preview = parameterNames.slice(0, 10);
    preview.forEach(name => {
      confirmMessages.push(`  - ${name}`);
    });
    
    if (parameterNames.length > 10) {
      confirmMessages.push(`  ... and ${parameterNames.length - 10} more`);
    }

    confirmMessages.push('');
    confirmMessages.push('This action CANNOT be undone!');
    confirmMessages.push('');
    
    console.log(confirmMessages.join('\n'));

    return new Promise(async (resolve) => {
      const { createInterface } = await import('readline');
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      // First confirmation
      rl.question('Are you absolutely sure? Type "yes" to continue: ', (answer1) => {
        if (answer1.toLowerCase() !== 'yes') {
          rl.close();
          resolve(false);
          return;
        }

        // Second confirmation with namespace
        rl.question(`Type the namespace "${this.namespace}" to confirm deletion: `, (answer2) => {
          rl.close();
          resolve(answer2 === this.namespace);
        });
      });
    });
  }

  async purge() {
    try {
      // Check paranoid mode first
      if (this.paranoid) {
        console.error([
          '',
          '❌ Purge blocked by paranoid mode',
          '',
          'Paranoid mode is enabled, preventing purge operations.',
          'To disable paranoid mode:',
          '  1. Remove --paranoid flag from command',
          '  2. Set paranoid = false in .awsenv config',
          '  3. Or remove paranoid setting from config',
          ''
        ].join('\n'));
        process.exit(1);
      }

      // Validate namespace
      if (!this.namespace) {
        throw new Error('Namespace is required for purge operation');
      }

      // List parameters
      const parameterNames = await this.listParameters();
      
      if (parameterNames.length === 0) {
        console.log([
          '',
          'No parameters found in namespace:',
          `  ${this.namespace}`,
          ''
        ].join('\n'));
        return;
      }

      // Ask for confirmation (twice if not forced)
      const confirmed = await this.askConfirmation(parameterNames);
      if (!confirmed) {
        console.log('\nPurge cancelled.');
        return;
      }

      // Delete parameters
      console.log('\nPurging parameters...\n');
      const results = await this.deleteParameters(parameterNames);
      
      // Show results
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log([
        '',
        '',
        'Purge completed:',
        `  ✅ Deleted: ${successful} parameters`,
        failed > 0 ? `  ❌ Failed: ${failed} parameters` : '',
        ''
      ].filter(Boolean).join('\n'));

      if (failed > 0) {
        console.error('Failed to delete:');
        results.filter(r => !r.success).forEach(r => {
          console.error(`  - ${r.parameter}: ${r.error}`);
        });
      }

    } catch (error) {
      // Handle AWS authentication errors
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
          'Please check your AWS configuration and try again.',
          ''
        ].join('\n'));
        process.exit(1);
      }

      console.error([
        '',
        '❌ Purge failed',
        '',
        `Error: ${error.message}`,
        ''
      ].join('\n'));
      process.exit(1);
    }
  }
}

export default EnvPurge;