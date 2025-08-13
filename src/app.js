import { DEFAULT_ERROR_MSG } from './concerns/msgs.js';
import AwsSsm from './vendor/aws-ssm.js';


const { AWSENV_NAMESPACE, AWS_REGION } = process.env;

export default async (params) => {
  if (global.verbose) {
    const execInfo = [
      '',
      '[AWSENV Execution]',
      '  Mode: FETCH',
      `  Region: ${params.region || AWS_REGION || 'us-east-1'}`,
      `  Namespace: ${params.namespace || AWSENV_NAMESPACE || 'not set'}`
    ];
    console.log(execInfo.join('\n'));
  }

  // Original functionality: fetch parameters from AWS
  if (!params.namespace && !AWSENV_NAMESPACE) {
    console.error(DEFAULT_ERROR_MSG);
    process.exit(1);
  }

  const finalNamespace = params.namespace || AWSENV_NAMESPACE;
  const finalRegion = params.region || AWS_REGION || 'us-east-1';
  
  if (global.verbose) {
    const fetchInfo = [
      '',
      'Fetching from AWS SSM:',
      `  Region: ${finalRegion}`,
      `  Path: ${finalNamespace}`
    ];
    console.log(fetchInfo.join('\n'));
  }

  let response = null;
  try {
    response = await AwsSsm.getParametersByPath(finalRegion, finalNamespace)
  } catch (err) {
    if (global.verbose) {
      const errorInfo = [
        '',
        '[AWS API Error]',
        `  Type: ${err.name}`,
        `  Message: ${err.message}`
      ];
      if (err.code) errorInfo.push(`  Code: ${err.code}`);
      console.error(errorInfo.join('\n'));
    }
    
    // Handle specific AWS authentication errors
    if (err.name === 'UnrecognizedClientException' || 
        err.name === 'InvalidClientTokenId' ||
        err.message?.includes('security token') ||
        err.message?.includes('invalid')) {
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
      return;
    }
    
    // Handle expired token errors
    if (err.name === 'ExpiredToken' || 
        err.name === 'ExpiredTokenException' ||
        err.message?.includes('expired')) {
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
      return;
    }
    
    // Handle access denied errors
    if (err.name === 'AccessDeniedException' || 
        err.name === 'UnauthorizedException' ||
        err.message?.includes('not authorized')) {
      console.error([
        '',
        '❌ AWS Access Denied',
        '',
        `You don't have permission to access parameters at: ${params.namespace || AWSENV_NAMESPACE}`,
        '',
        'Required permissions:',
        '  • ssm:GetParametersByPath',
        '  • ssm:DescribeParameters',
        '  • kms:Decrypt (for SecureString parameters)',
        '',
        '💡 Fix: Ask your AWS administrator to grant the above permissions to your user/role',
        ''
      ].join('\n'));
      process.exit(1);
      return;
    }
    
    // Handle network/connection errors
    if (err.code === 'ENOTFOUND' || 
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNREFUSED') {
      console.error([
        '',
        '❌ Network Error',
        '',
        'Unable to connect to AWS services.',
        '',
        'Please check:',
        '  • Internet connection',
        '  • Proxy settings (if behind corporate firewall)',
        '  • AWS region is correct: ' + (params.region || AWS_REGION || 'us-east-1'),
        '  • AWS service endpoints are accessible',
        '',
        '💡 Fix: Check your internet connection and try again, or configure proxy if needed',
        ''
      ].join('\n'));
      process.exit(1);
      return;
    }
    
    // Generic error with better formatting
    const errorDetails = [
      '',
      '❌ Error fetching parameters from AWS SSM',
      '',
      `Error: ${err.message || err}`
    ];
    if (err.code) errorDetails.push(`Code: ${err.code}`);
    errorDetails.push(
      '',
      '💡 Fix: Check your AWS credentials and permissions, then try again',
      ''
    );
    console.error(errorDetails.join('\n'));
    process.exit(1);
    return;
  }
  
  if (!response || !response.Parameters) {
    console.error([
      '',
      '❌ No response from AWS SSM',
      '',
      '💡 Fix: Verify the namespace exists and you have permission to access it',
      ''
    ].join('\n'));
    process.exit(1);
    return;
  }

  if (global.verbose) {
    console.log(`\nFetched ${response.Parameters.length} parameters`);
  }

  const variables = response
    .Parameters
    .reduce((acc, param) => {
      const key = param.Name.split('/').pop();
      const value = param.Value.trim().replace(/\n/g, '');
      acc.push({ key, value });
      return acc;
    }, [])
    .sort((a, b) => a.key.localeCompare(b.key));

  if (global.verbose && variables.length > 0) {
    const outputInfo = [
      '',
      'Parameters found:'
    ];
    variables.forEach(({ key }) => {
      outputInfo.push(`  - ${key}`);
    });
    outputInfo.push('');
    outputInfo.push(`Output format: ${params.withoutExporter ? 'plain' : 'export'}`);
    outputInfo.push('---');
    outputInfo.push('');
    console.log(outputInfo.join('\n'));
  }

  const output = variables
    .map((param) => `${params.withoutExporter ? '' : 'export '}${param.key}=${param.value}`)
    .join('\n');

  process.stdout.write(output);
}

