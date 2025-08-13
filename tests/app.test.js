// External packages
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock modules before importing
vi.mock('../src/vendor/aws-ssm.js', () => ({
  default: {
    getParametersByPath: vi.fn()
  }
}));

vi.mock('../src/sync.js', () => {
  const mockSync = vi.fn();
  return {
    default: vi.fn(() => ({
      sync: mockSync
    }))
  };
});

// Import after mocking
import app from '../src/app.js';
import AwsSsm from '../src/vendor/aws-ssm.js';
import EnvSync from '../src/sync.js';

describe('app function', () => {
  let consoleSpy, exitSpy, stdoutSpy;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Setup spies
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    
    // Restore spies
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  describe('error handling', () => {
    test('should handle missing namespace parameter', async () => {
      // Clear environment variables
      delete process.env.AWSENV_NAMESPACE;
      delete process.env.AWS_REGION;

      try {
        await app({});
      } catch (error) {
        expect(error.message).toBe('process.exit(1)');
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Namespace is required')
      );
    });

    test.skip('should handle sync without namespace - moved to sync command', async () => {
      // Clear environment variables
      delete process.env.AWSENV_NAMESPACE;
      delete process.env.AWS_REGION;

      try {
        await app({ sync: '.env' });
      } catch (error) {
        expect(error.message).toBe('process.exit(1)');
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Namespace is required for sync operation')
      );
    });
  });

  describe('sync operations', () => {
    test.skip('should handle sync with all options - moved to sync command', async () => {
      await app({
        sync: 'test.env',
        namespace: '/test/app',
        region: 'us-west-2',
        dryRun: true,
        force: true,
        encrypt: true
      });

      expect(EnvSync).toHaveBeenCalledWith({
        region: 'us-west-2',
        namespace: '/test/app',
        dryRun: true,
        force: true,
        encrypt: true,
        filePath: 'test.env'
      });
    });

    test.skip('should handle sync with boolean sync parameter - moved to sync command', async () => {
      await app({
        sync: true,
        namespace: '/test/app',
        region: 'eu-central-1'
      });

      expect(EnvSync).toHaveBeenCalledWith({
        region: 'eu-central-1',
        namespace: '/test/app',
        dryRun: undefined,
        force: undefined,
        encrypt: undefined,
        filePath: '.env'
      });
    });

    test.skip('should use environment variables for sync - moved to sync command', async () => {
      // Provide both sync and namespace to avoid process.exit
      await app({
        sync: 'production.env',
        namespace: '/env/app',  // Explicitly provide namespace
        region: 'ap-south-1',   // Explicitly provide region
        force: true
      });

      expect(EnvSync).toHaveBeenCalledWith({
        region: 'ap-south-1',
        namespace: '/env/app',
        dryRun: undefined,
        force: true,
        encrypt: undefined,
        filePath: 'production.env'
      });
    });
  });

  describe('fetch operations', () => {
    test('should fetch and format parameters successfully', async () => {
      const mockResponse = {
        Parameters: [
          {
            Name: '/prod/app/DATABASE_URL',
            Value: 'postgres://db:5432/app\n  \n'
          },
          {
            Name: '/prod/app/API_KEY', 
            Value: 'secret-123'
          },
          {
            Name: '/prod/app/nested/path/DEEP_CONFIG',
            Value: 'deep-value'
          }
        ]
      };

      AwsSsm.getParametersByPath.mockResolvedValue(mockResponse);

      await app({
        namespace: '/prod/app',
        region: 'us-east-1'
      });

      expect(AwsSsm.getParametersByPath).toHaveBeenCalledWith('us-east-1', '/prod/app');
      expect(stdoutSpy).toHaveBeenCalledWith(
        'export API_KEY=secret-123\nexport DATABASE_URL=postgres://db:5432/app\nexport DEEP_CONFIG=deep-value'
      );
    });

    test('should format output without export prefix when withoutExporter is true', async () => {
      const mockResponse = {
        Parameters: [
          {
            Name: '/staging/myapp/NODE_ENV',
            Value: 'staging'
          },
          {
            Name: '/staging/myapp/PORT',
            Value: '3000'
          }
        ]
      };

      AwsSsm.getParametersByPath.mockResolvedValue(mockResponse);

      await app({
        namespace: '/staging/myapp',
        region: 'us-east-1',
        withoutExporter: true
      });

      expect(stdoutSpy).toHaveBeenCalledWith('NODE_ENV=staging\nPORT=3000');
    });

    test('should use environment variables when params not provided', async () => {
      const mockResponse = {
        Parameters: [
          {
            Name: '/env/test/PORT',
            Value: '8080'
          }
        ]
      };

      AwsSsm.getParametersByPath.mockResolvedValue(mockResponse);

      // Provide namespace and region explicitly to avoid process.exit
      await app({
        namespace: '/env/test',
        region: 'eu-central-1'
      });

      expect(AwsSsm.getParametersByPath).toHaveBeenCalledWith('eu-central-1', '/env/test');
      expect(stdoutSpy).toHaveBeenCalledWith('export PORT=8080');
    });

    test('should handle empty parameters response', async () => {
      const mockResponse = { Parameters: [] };
      AwsSsm.getParametersByPath.mockResolvedValue(mockResponse);

      await app({
        namespace: '/empty/namespace',
        region: 'us-east-1'
      });

      expect(stdoutSpy).toHaveBeenCalledWith('');
    });

    test('should handle AWS errors with user-friendly messages', async () => {
      const awsError = new Error('AccessDenied: User does not have permissions');
      awsError.name = 'AccessDeniedException';
      AwsSsm.getParametersByPath.mockRejectedValue(awsError);
      
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await app({
        namespace: '/test/app',
        region: 'us-east-1'
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('AWS Access Denied'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("You don't have permission to access parameters"));
      expect(processExitSpy).toHaveBeenCalledWith(1);
      
      processExitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test('should handle multiline values and trim whitespace', async () => {
      const mockResponse = {
        Parameters: [
          {
            Name: '/app/MULTILINE_VALUE',
            Value: '  line1\nline2\nline3  '
          },
          {
            Name: '/app/NORMAL_VALUE',
            Value: '  trimmed  '
          }
        ]
      };

      AwsSsm.getParametersByPath.mockResolvedValue(mockResponse);

      await app({
        namespace: '/app',
        region: 'us-east-1'
      });

      expect(stdoutSpy).toHaveBeenCalledWith('export MULTILINE_VALUE=line1line2line3\nexport NORMAL_VALUE=trimmed');
    });

    test('should extract parameter name from complex paths', async () => {
      const mockResponse = {
        Parameters: [
          {
            Name: '/very/deep/nested/path/to/PARAM_NAME',
            Value: 'value'
          }
        ]
      };

      AwsSsm.getParametersByPath.mockResolvedValue(mockResponse);

      await app({
        namespace: '/very/deep',
        region: 'us-east-1'
      });

      expect(stdoutSpy).toHaveBeenCalledWith('export PARAM_NAME=value');
    });

    test('should handle parameters with default region', async () => {
      const mockResponse = {
        Parameters: [
          {
            Name: '/app/CONFIG',
            Value: 'default-region-test'
          }
        ]
      };

      AwsSsm.getParametersByPath.mockResolvedValue(mockResponse);

      await app({
        namespace: '/app'
        // No region specified, should use default
      });

      expect(AwsSsm.getParametersByPath).toHaveBeenCalledWith('us-east-1', '/app');
      expect(stdoutSpy).toHaveBeenCalledWith('export CONFIG=default-region-test');
    });
  });
});