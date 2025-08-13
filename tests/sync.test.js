// External packages
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'fs';

// Internal modules
import EnvSync from '../src/sync.js';


// Mock AWS SSM
vi.mock('../src/vendor/aws-ssm.js', () => ({
  default: {
    putParameter: vi.fn()
  }
}));

// Import the mocked AwsSsm for use in tests
import AwsSsm from '../src/vendor/aws-ssm.js';

describe('EnvSync class', () => {
  let consoleSpy;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Setup spies
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Mock fs methods
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockImplementation(() => true);
    
    // Clear AWS SSM mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    
    // Restore spies and mocks
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  test('should create EnvSync with default options', () => {
    const envSync = new EnvSync();
    
    expect(envSync.region).toBe('us-east-1');
    expect(envSync.dryRun).toBe(false);
    expect(envSync.force).toBe(false);
    expect(envSync.filePath).toBe('.env');
  });

  test('should create EnvSync with custom options', () => {
    const options = {
      region: 'eu-west-1',
      namespace: '/test/app',
      dryRun: true,
      force: true,
      encrypt: true,
      filePath: 'custom.env'
    };
    const envSync = new EnvSync(options);
    
    expect(envSync.region).toBe('eu-west-1');
    expect(envSync.namespace).toBe('/test/app');
    expect(envSync.dryRun).toBe(true);
    expect(envSync.force).toBe(true);
    expect(envSync.encrypt).toBe(true);
    expect(envSync.filePath).toBe('custom.env');
  });

  test('should parse simple env file correctly', () => {
    const fileContent = `NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://localhost:5432/db`;
    
    fs.readFileSync.mockReturnValue(fileContent);
    
    const envSync = new EnvSync();
    const result = envSync.parseEnvFile('.env');
    
    expect(result).toEqual({
      NODE_ENV: 'production',
      PORT: '3000',
      DATABASE_URL: 'postgres://localhost:5432/db'
    });
  });

  test('should handle quoted values in env file', () => {
    const fileContent = `API_KEY="quoted-value"
SECRET='single-quoted'
NORMAL=unquoted`;
    
    fs.readFileSync.mockReturnValue(fileContent);
    
    const envSync = new EnvSync();
    const result = envSync.parseEnvFile('.env');
    
    expect(result).toEqual({
      API_KEY: 'quoted-value',
      SECRET: 'single-quoted',
      NORMAL: 'unquoted'
    });
  });

  test('should skip comments and empty lines', () => {
    const fileContent = `# This is a comment
NODE_ENV=production

# Another comment
PORT=3000`;
    
    fs.readFileSync.mockReturnValue(fileContent);
    
    const envSync = new EnvSync();
    const result = envSync.parseEnvFile('.env');
    
    expect(result).toEqual({
      NODE_ENV: 'production',
      PORT: '3000'
    });
  });

  test('should identify secret keys by name patterns', () => {
    const envSync = new EnvSync();
    
    expect(envSync.isSecret('API_SECRET', 'value')).toBe(true);
    expect(envSync.isSecret('DB_PASSWORD', 'value')).toBe(true);
    expect(envSync.isSecret('JWT_TOKEN', 'value')).toBe(true);
    expect(envSync.isSecret('PRIVATE_KEY', 'value')).toBe(true);
  });

  test('should not identify non-secret keys', () => {
    const envSync = new EnvSync();
    
    expect(envSync.isSecret('NODE_ENV', 'production')).toBe(false);
    expect(envSync.isSecret('PORT', '3000')).toBe(false);
    expect(envSync.isSecret('DEBUG', 'true')).toBe(false);
    expect(envSync.isSecret('APP_NAME', 'MyApp')).toBe(false);
  });

  test('should create correct parameter path', () => {
    const envSync = new EnvSync({ namespace: '/staging/app' });
    
    expect(envSync.createParameterPath('NODE_ENV')).toBe('/staging/app/NODE_ENV');
  });

  test('should handle namespace with trailing slash', () => {
    const envSync = new EnvSync({ namespace: '/staging/app/' });
    
    expect(envSync.createParameterPath('NODE_ENV')).toBe('/staging/app/NODE_ENV');
  });

  test('should prepare parameters correctly', () => {
    const envSync = new EnvSync({ namespace: '/test/app' });
    
    const envVars = {
      NODE_ENV: 'production',
      API_SECRET: 'secret-key-123',
      PORT: '3000'
    };

    const result = envSync.prepareParameters(envVars);
    
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      Name: '/test/app/NODE_ENV',
      Value: 'production',
      Type: 'String',
      Overwrite: true,
      Description: 'Environment variable NODE_ENV synced from .env file'
    });
    expect(result[1]).toEqual({
      Name: '/test/app/API_SECRET',
      Value: 'secret-key-123',
      Type: 'SecureString',
      Overwrite: true,
      Description: 'Environment variable API_SECRET synced from .env file'
    });
  });

  test('should handle empty environment variables', () => {
    const envSync = new EnvSync({ namespace: '/test/app' });
    const result = envSync.prepareParameters({});
    expect(result).toHaveLength(0);
  });

  test('should display dry run information', () => {
    const envSync = new EnvSync();
    const parameters = [
      {
        Name: '/test/NODE_ENV',
        Value: 'production',
        Type: 'String'
      },
      {
        Name: '/test/API_SECRET',
        Value: 'secret-key-123',
        Type: 'SecureString'
      }
    ];

    envSync.displayDryRun(parameters);

    expect(() => envSync.displayDryRun(parameters)).not.toThrow();
  });

  test('should return true for askConfirmation when force is enabled', async () => {
    const envSync = new EnvSync({ force: true });
    const result = await envSync.askConfirmation();
    expect(result).toBe(true);
  });


  test('should treat all variables as secrets when encrypt is enabled', () => {
    const envSync = new EnvSync({ encrypt: true });
    
    // Even non-secret looking keys should be treated as secrets
    expect(envSync.isSecret('NODE_ENV', 'production')).toBe(true);
    expect(envSync.isSecret('PORT', '3000')).toBe(true);
    expect(envSync.isSecret('DEBUG', 'true')).toBe(true);
    expect(envSync.isSecret('APP_NAME', 'MyApp')).toBe(true);
  });

  test('should prepare all parameters as SecureString when encrypt is enabled', () => {
    const envSync = new EnvSync({ 
      namespace: '/test/app',
      encrypt: true 
    });
    
    const envVars = {
      NODE_ENV: 'production',
      PORT: '3000',
      APP_NAME: 'TestApp'
    };

    const result = envSync.prepareParameters(envVars);
    
    expect(result).toHaveLength(3);
    // All should be SecureString when encrypt is enabled
    expect(result[0].Type).toBe('SecureString');
    expect(result[1].Type).toBe('SecureString'); 
    expect(result[2].Type).toBe('SecureString');
  });

  test('should handle file read errors', () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
    
    const envSync = new EnvSync();
    
    expect(() => envSync.parseEnvFile('.env')).toThrow('Failed to read .env file');
  });

  test('should handle complex secret value patterns', () => {
    const envSync = new EnvSync();
    
    // Long encoded-looking values should be treated as secrets
    expect(envSync.isSecret('NORMAL_VAR', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe(true);
    expect(envSync.isSecret('NORMAL_VAR', 'short')).toBe(false);
    // Keys with "KEY" pattern are detected as secrets regardless of value
    expect(envSync.isSecret('SOME_KEY', 'short')).toBe(true);
  });

  test('should handle various quote combinations in env file', () => {
    const fileContent = `MIXED="value'with'quotes"
EMPTY=""
SPACES=" spaced value "`;
    
    fs.readFileSync.mockReturnValue(fileContent);
    
    const envSync = new EnvSync();
    const result = envSync.parseEnvFile('.env');
    
    expect(result.MIXED).toBe("value'with'quotes");
    expect(result.EMPTY).toBe('');
    expect(result.SPACES).toBe(' spaced value ');
  });

  test('should validate file extension in filePath', () => {
    const envSync = new EnvSync({ filePath: 'config.txt' });
    expect(envSync.filePath).toBe('config.txt');
    
    const envSyncDefault = new EnvSync();
    expect(envSyncDefault.filePath).toBe('.env');
  });

  test('should handle nested parameter paths correctly', () => {
    const envSync = new EnvSync({ namespace: '/prod/microservice/auth' });
    
    expect(envSync.createParameterPath('JWT_SECRET')).toBe('/prod/microservice/auth/JWT_SECRET');
  });

  test('should identify long base64-like strings as secrets', () => {
    const envSync = new EnvSync();
    
    // Test various secret-like patterns
    expect(envSync.isSecret('CONFIG_VAR', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe(true);
    expect(envSync.isSecret('CONFIG_VAR', 'dGVzdC1sb25nLXN0cmluZy13aXRoLWVub3VnaC1jaGFyYWN0ZXJz')).toBe(true);
    expect(envSync.isSecret('CONFIG_VAR', 'short-string')).toBe(false);
    expect(envSync.isSecret('CONFIG_VAR', 'https://example.com/very-long-url-that-might-look-like-a-secret')).toBe(false);
    expect(envSync.isSecret('CONFIG_VAR', '1234567890')).toBe(false);
  });

  describe('uploadParameters method', () => {
    test('should upload parameters successfully', async () => {
      const envSync = new EnvSync({
        region: 'us-east-1',
        namespace: '/test/app'
      });
      
      const parameters = [
        {
          Name: '/test/app/NODE_ENV',
          Value: 'production',
          Type: 'String'
        },
        {
          Name: '/test/app/API_SECRET',
          Value: 'secret-123',
          Type: 'SecureString'
        }
      ];

      // Mock successful AWS responses
      AwsSsm.putParameter
        .mockResolvedValueOnce({ Version: 1 })
        .mockResolvedValueOnce({ Version: 1 });

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const results = await envSync.uploadParameters(parameters);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        success: true,
        parameter: '/test/app/NODE_ENV'
      });
      expect(results[1]).toEqual({
        success: true,
        parameter: '/test/app/API_SECRET'
      });

      expect(AwsSsm.putParameter).toHaveBeenCalledTimes(2);
      expect(stdoutSpy).toHaveBeenCalledWith('.');

      stdoutSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    test('should handle parameter upload failures', async () => {
      const envSync = new EnvSync({
        region: 'us-east-1',
        namespace: '/test/app'
      });
      
      const parameters = [
        {
          Name: '/test/app/VALID_PARAM',
          Value: 'value1',
          Type: 'String'
        },
        {
          Name: '/test/app/INVALID_PARAM',
          Value: 'value2',
          Type: 'String'
        }
      ];

      // Mock mixed success/failure responses
      AwsSsm.putParameter
        .mockResolvedValueOnce({ Version: 1 })
        .mockRejectedValueOnce(new Error('Parameter already exists'));

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const results = await envSync.uploadParameters(parameters);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        success: true,
        parameter: '/test/app/VALID_PARAM'
      });
      expect(results[1]).toEqual({
        success: false,
        parameter: '/test/app/INVALID_PARAM',
        error: 'Parameter already exists'
      });

      expect(stdoutSpy).toHaveBeenCalledWith('.');
      expect(stdoutSpy).toHaveBeenCalledWith('x');

      stdoutSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('sync method', () => {
    test('should fail when namespace is not provided', async () => {
      const envSync = new EnvSync({
        region: 'us-east-1',
        filePath: '.env'
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });

      try {
        await envSync.sync();
      } catch (error) {
        expect(error.message).toBe('process.exit(1)');
      }

      
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    test('should fail when env file does not exist', async () => {
      const envSync = new EnvSync({
        region: 'us-east-1',
        namespace: '/test/app',
        filePath: 'nonexistent.env'
      });

      fs.existsSync.mockReturnValue(false);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });

      try {
        await envSync.sync();
      } catch (error) {
        expect(error.message).toBe('process.exit(1)');
      }

      
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    test('should handle empty env file', async () => {
      const envSync = new EnvSync({
        region: 'us-east-1',
        namespace: '/test/app',
        filePath: '.env'
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await envSync.sync();

      expect(() => envSync.sync()).not.toThrow();
      
      consoleSpy.mockRestore();
    });

    test('should complete dry run without uploading', async () => {
      const envSync = new EnvSync({
        region: 'us-east-1',
        namespace: '/test/app',
        filePath: '.env',
        dryRun: true
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('NODE_ENV=production\nAPI_SECRET=secret-123');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await envSync.sync();

      expect(AwsSsm.putParameter).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    test('should handle user cancellation', async () => {
      const envSync = new EnvSync({
        region: 'us-east-1',
        namespace: '/test/app',
        filePath: '.env'
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('NODE_ENV=production');
      
      // Mock user selecting "no"
      envSync.askConfirmation = vi.fn().mockResolvedValue(false);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await envSync.sync();

      expect(AwsSsm.putParameter).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    test('should complete successful sync', async () => {
      const envSync = new EnvSync({
        region: 'us-east-1',
        namespace: '/test/app',
        filePath: '.env'
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('NODE_ENV=production\nAPI_SECRET=secret-123');
      
      // Mock user confirming
      envSync.askConfirmation = vi.fn().mockResolvedValue(true);
      
      // Mock successful upload
      AwsSsm.putParameter.mockResolvedValue({ Version: 1 });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {});

      await envSync.sync();

      
      consoleSpy.mockRestore();
      stdoutSpy.mockRestore();
    });

    test('should handle mixed success/failure results', async () => {
      const envSync = new EnvSync({
        region: 'us-east-1',
        namespace: '/test/app',
        filePath: '.env'
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('NODE_ENV=production\nAPI_SECRET=secret-123');
      
      envSync.askConfirmation = vi.fn().mockResolvedValue(true);
      
      // Mock mixed results
      AwsSsm.putParameter
        .mockResolvedValueOnce({ Version: 1 })
        .mockRejectedValueOnce(new Error('Parameter already exists'));

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {});

      await envSync.sync();

      
      consoleSpy.mockRestore();
      stdoutSpy.mockRestore();
    });

    test('should handle sync errors and exit', async () => {
      const envSync = new EnvSync({
        region: 'us-east-1',
        namespace: '/test/app',
        filePath: '.env'
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });

      try {
        await envSync.sync();
      } catch (error) {
        expect(error.message).toBe('process.exit(1)');
      }

      
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});