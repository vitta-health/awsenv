// External packages
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Internal modules
import { applyProfile, createExampleConfig, listProfiles } from '../src/profiles.js';


// Mock fs, os and path
vi.mock('fs');
vi.mock('os');
vi.mock('path', () => ({
  default: {
    join: vi.fn().mockImplementation((...args) => args.join('/')),
    basename: vi.fn().mockReturnValue('project')
  }
}));

describe('AWS CLI Profiles functionality', () => {
  let consoleSpy, originalCwd, originalEnv;

  beforeEach(() => {
    // Setup spies
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Save original environment
    originalEnv = process.env.AWS_PROFILE;
    delete process.env.AWS_PROFILE;
    
    // Mock filesystem - reset to default behavior
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    vi.mocked(fs.mkdirSync).mockImplementation(() => {});
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    
    // Mock OS
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    
    // Mock process.cwd
    originalCwd = process.cwd;
    process.cwd = vi.fn().mockReturnValue('/project');
    
    // Mock path methods
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
    vi.mocked(path.basename).mockReturnValue('project');
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.cwd = originalCwd;
    // Restore environment
    if (originalEnv) {
      process.env.AWS_PROFILE = originalEnv;
    }
  });

  test('should parse AWS credentials file', () => {
    const credentialsContent = `[default]
aws_access_key_id = AKIA123
aws_secret_access_key = secret123
region = us-east-1

[production]
aws_access_key_id = AKIA456
aws_secret_access_key = secret456
region = us-west-2`;
    
    vi.mocked(fs.existsSync).mockImplementation((path) => 
      path && (path.includes('credentials') || path.includes('config'))
    );
    
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path && path.includes('credentials')) return credentialsContent;
      return '';
    });
    
    const result = applyProfile({}, 'production');
    expect(result.region).toBe('us-west-2');
  });

  test('should parse AWS config file with profile prefix', () => {
    const configContent = `[default]
region = us-east-1
output = json

[profile production]
region = us-west-2
output = json`;
    
    vi.mocked(fs.existsSync).mockImplementation((path) => 
      path && (path.includes('config') || path.includes('credentials'))
    );
    
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path && path.includes('config')) return configContent;
      return '';
    });
    
    const result = applyProfile({}, 'production');
    expect(result.region).toBe('us-west-2');
  });

  test('should merge credentials and config data', () => {
    const credentialsContent = `[production]
aws_access_key_id = AKIA456
aws_secret_access_key = secret456`;
    const configContent = `[profile production]
region = us-west-2
output = json`;
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path && path.includes('credentials')) return credentialsContent;
      if (path && path.includes('config')) return configContent;
      return '';
    });
    
    const result = applyProfile({}, 'production');
    expect(result.region).toBe('us-west-2');
  });

  test('should apply project-level AWSENV configuration', () => {
    const credentialsContent = `[production]
aws_access_key_id = AKIA456
region = us-west-2`;
    const awsenvContent = `[production]
namespace = /company/prod
all_secure = true`;
    
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return path && (path.includes('credentials') || (path.includes('.awsenv') && path.includes('/project/')));
    });
    
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path && path.includes('credentials')) return credentialsContent;
      if (path && path.includes('.awsenv') && path.includes('/project/')) return awsenvContent;
      return '';
    });
    
    const result = applyProfile({}, 'production');
    expect(result.region).toBe('us-west-2');
    expect(result.namespace).toBe('/company/prod');
    expect(result.allSecure).toBe(true);
  });

  test('should throw error for non-existent AWS CLI profile', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    
    expect(() => applyProfile({}, 'non-existent')).toThrow(
      "AWS CLI profile 'non-existent' not found"
    );
  });

  test('should handle CLI parameters taking precedence', () => {
    const credentialsContent = `[production]
region = us-west-2`;
    
    vi.mocked(fs.existsSync).mockImplementation((path) => path && path.includes('credentials'));
    vi.mocked(fs.readFileSync).mockImplementation(() => credentialsContent);
    
    const params = { region: 'eu-central-1', namespace: '/override/path' };
    const result = applyProfile(params, 'production');
    
    expect(result.region).toBe('eu-central-1'); // CLI override
    expect(result.namespace).toBe('/override/path'); // CLI override
  });

  test('should set AWS_PROFILE environment variable', () => {
    const credentialsContent = `[myprofile]
region = us-east-1`;
    
    vi.mocked(fs.existsSync).mockImplementation((path) => path && path.includes('credentials'));
    vi.mocked(fs.readFileSync).mockImplementation(() => credentialsContent);
    
    applyProfile({}, 'myprofile');
    
    expect(process.env.AWS_PROFILE).toBe('myprofile');
  });

  test('should skip comments and empty lines when parsing config', () => {
    const configContent = `# This is a comment
[default]
; This is also a comment
region = us-east-1

# Another comment
output = json`;
    
    vi.mocked(fs.existsSync).mockImplementation((path) => path && path.includes('config'));
    vi.mocked(fs.readFileSync).mockImplementation(() => configContent);
    
    const result = applyProfile({}, 'default');
    expect(result.region).toBe('us-east-1');
  });

  test('should list AWS CLI profiles', () => {
    const credentialsContent = `[default]
region = us-east-1

[production]
region = us-west-2`;
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => credentialsContent);
    
    // Test that function executes without error (console.log removed)
    expect(() => listProfiles()).not.toThrow();
  });

  test('should create smart AWSENV config with auto-generated namespaces', () => {
    createExampleConfig();
    
    expect(fs.mkdirSync).toHaveBeenCalledWith('/project/.awsenv', { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/project/.awsenv/config',
      expect.stringContaining('# Auto-generated configuration for: project')
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/project/.awsenv/config',
      expect.stringContaining('namespace = /awsenv/app=project/env=production')
    );
    // Console output tests removed since console.log statements were removed
  });

  test('should handle AWS config parsing errors gracefully', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File read error');
    });

    expect(() => applyProfile({}, 'production')).toThrow(
      "AWS CLI profile 'production' not found"
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not parse AWS config file'));
    
    warnSpy.mockRestore();
  });

  test('should handle no AWS CLI profiles found', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    
    // Test that function executes without error when no profiles found
    expect(() => listProfiles()).not.toThrow();
  });
});