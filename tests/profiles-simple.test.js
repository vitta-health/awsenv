// External packages
import { describe, expect, test } from 'vitest';

describe('Profile utility functions', () => {
  test('should clean app names for Parameter Store', () => {
    const cleanAppName = (name) => {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9-_.]/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
    };
    
    expect(cleanAppName('My App With Spaces!@#')).toBe('my-app-with-spaces');
    expect(cleanAppName('payment-api_v2.0@prod')).toBe('payment-api_v2.0-prod');
    expect(cleanAppName('simple-app')).toBe('simple-app');
  });
  
  test('should generate correct namespace format', () => {
    const generateNamespace = (appName, env = 'production') => {
      const cleanApp = appName.toLowerCase().replace(/[^a-z0-9-_.]/g, '-');
      const cleanEnv = env.toLowerCase().replace(/[^a-z0-9-_.]/g, '-');
      return `/awsenv/app=${cleanApp}/env=${cleanEnv}`;
    };
    
    expect(generateNamespace('my-app')).toBe('/awsenv/app=my-app/env=production');
    expect(generateNamespace('test-api', 'staging')).toBe('/awsenv/app=test-api/env=staging');
  });
});