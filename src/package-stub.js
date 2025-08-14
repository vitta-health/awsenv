// Stub module to replace package.json reads
module.exports = {
  name: '@vitta-health/awsenv',
  version: process.env.AWSENV_VERSION || '1.2.4',
  description: 'Secure way to handle environment variables in Docker with AWS Parameter Store'
};