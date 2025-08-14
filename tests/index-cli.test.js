import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock everything before importing the CLI module
vi.mock('args', () => ({
  default: {
    option: vi.fn().mockReturnThis(),
    command: vi.fn().mockReturnThis(),
    parse: vi.fn().mockReturnValue({}),
    showHelp: vi.fn()
  }
}));

vi.mock('../src/app.js', () => ({
  default: vi.fn()
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false)
  }
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn().mockImplementation((...args) => args.join('/')),
    dirname: vi.fn(),
    basename: vi.fn()
  }
}));

vi.mock('url', () => ({
  fileURLToPath: vi.fn().mockReturnValue('/mocked/path/index.js')
}));

vi.mock('../src/profiles.js', () => ({
  applyProfile: vi.fn().mockReturnValue({}),
  listProfiles: vi.fn(),
  createExampleConfig: vi.fn()
}));

describe('CLI entry point execution', () => {
  let originalArgv, originalEnv;
  let mockArgs, mockApp, mockFs, mockProfiles;
  let exitSpy;

  beforeEach(async () => {
    // Clear all previous mocks
    vi.resetModules();
    
    // Save original state
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
    
    // Get the mocked modules
    const argsModule = await import('args');
    const appModule = await import('../src/app.js');
    const fsModule = await import('fs');
    const profilesModule = await import('../src/profiles.js');
    
    mockArgs = argsModule.default;
    mockApp = appModule.default;
    mockFs = fsModule.default;
    mockProfiles = profilesModule;
    
    // Mock process.exit
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original state
    process.argv = originalArgv;
    process.env = originalEnv;
    exitSpy.mockRestore();
  });


  test('should show help when no arguments and no env vars', async () => {
    // Set minimal argv
    process.argv = ['node', '/path/to/script'];
    
    // Clear environment variables
    delete process.env.AWSENV_NAMESPACE;
    
    // Mock parsing to return empty object
    mockArgs.parse.mockReturnValue({});

    try {
      // Import the CLI module to trigger execution
      await import('../src/index.js');
    } catch (error) {
      // Should exit with code 0
      expect(error.message).toBe('process.exit(0)');
    }

    // Should show help
    expect(mockArgs.showHelp).toHaveBeenCalled();
  });

  test('should not show help when namespace is in environment', async () => {
    // Set minimal argv
    process.argv = ['node', '/path/to/script'];
    
    // Set environment variable
    process.env.AWSENV_NAMESPACE = '/env/app';
    
    // Mock parsing to return empty object (but env var is set)
    mockArgs.parse.mockReturnValue({});

    // Import the CLI module to trigger execution
    await import('../src/index.js');

    // Should not show help
    expect(mockArgs.showHelp).not.toHaveBeenCalled();
    
    // Should call app function
    expect(mockApp).toHaveBeenCalledWith({});
  });


  test('should handle complex CLI arguments', async () => {
    // Set argv with multiple arguments
    process.argv = ['node', '/path/to/script', '--sync', '.env', '--namespace', '/prod/app', '--force'];
    
    // Mock comprehensive parsing
    mockArgs.parse.mockReturnValue({
      sync: '.env',
      namespace: '/prod/app',
      force: true,
      region: 'eu-west-1',
      encrypt: true,
      dryRun: false,
      withoutExporter: false
    });

    // Import the CLI module to trigger execution
    await import('../src/index.js');

    // Should not show help
    expect(mockArgs.showHelp).not.toHaveBeenCalled();
    
    // Should call app function with all parameters
    expect(mockApp).toHaveBeenCalledWith({
      sync: '.env',
      namespace: '/prod/app',
      force: true,
      region: 'eu-west-1',
      encrypt: true,
      dryRun: false,
      withoutExporter: false
    });
  });

  test('should handle process.mainModule compatibility setup', async () => {
    // Remove existing mainModule
    const originalMainModule = process.mainModule;
    delete process.mainModule;
    
    // Mock args to not show help
    mockArgs.parse.mockReturnValue({ namespace: '/test' });

    // Import the CLI module to trigger execution
    await import('../src/index.js');

    // Should have set mainModule
    expect(process.mainModule).toBeDefined();
    expect(typeof process.mainModule.filename).toBe('string');
    expect(process.mainModule.filename).toMatch(/index\.js$/);

    // Restore
    if (originalMainModule) {
      process.mainModule = originalMainModule;
    }
  });

  test('should handle list command', async () => {
    // Set argv to include list command
    process.argv = ['node', '/path/to/script', 'list'];
    
    // Mock args parse to return empty object
    mockArgs.parse.mockReturnValue({});

    try {
      await import('../src/index.js');
    } catch (error) {
      expect(error.message).toBe('process.exit(0)');
    }

    // Should not call app function
    expect(mockApp).not.toHaveBeenCalled();
  });

  test('should handle init command', async () => {
    // Set argv to include init command
    process.argv = ['node', '/path/to/script', 'init'];
    
    // Mock args parse to return empty object
    mockArgs.parse.mockReturnValue({});

    try {
      await import('../src/index.js');
    } catch (error) {
      expect(error.message).toBe('process.exit(0)');
    }

    // Should not call app function
    expect(mockApp).not.toHaveBeenCalled();
  });

  test('should auto-detect default profile when .awsenv/config exists', async () => {
    // Set minimal argv
    process.argv = ['node', '/path/to/script'];
    
    // Clear environment variables
    delete process.env.AWSENV_NAMESPACE;
    
    // Mock parsing to return empty object
    mockArgs.parse.mockReturnValue({});
    
    // Mock file system to indicate .awsenv/config exists
    mockFs.existsSync.mockReturnValue(true);
    
    // Mock profile application
    mockProfiles.applyProfile.mockReturnValue({ namespace: '/awsenv/app=test/env=production' });

    // Import the CLI module to trigger execution
    await import('../src/index.js');

    // Should call applyProfile with 'default'
    expect(mockProfiles.applyProfile).toHaveBeenCalledWith({}, 'default');
    
    // Should call app function with profile result
    expect(mockApp).toHaveBeenCalledWith({ namespace: '/awsenv/app=test/env=production' });
  });

  test('should not auto-detect when profile is explicitly provided', async () => {
    // Set argv with explicit profile
    process.argv = ['node', '/path/to/script'];
    
    // Mock parsing to return explicit profile
    mockArgs.parse.mockReturnValue({ profile: 'production' });
    
    // Mock file system to indicate .awsenv/config exists
    mockFs.existsSync.mockReturnValue(true);
    
    // Mock profile application
    mockProfiles.applyProfile.mockReturnValue({ namespace: '/production/app' });

    // Import the CLI module to trigger execution
    await import('../src/index.js');

    // Should call applyProfile with explicit profile, not default
    expect(mockProfiles.applyProfile).toHaveBeenCalledWith({ profile: 'production' }, 'production');
  });

  test('should not auto-detect when namespace is explicitly provided', async () => {
    // Set argv with explicit namespace
    process.argv = ['node', '/path/to/script'];
    
    // Mock parsing to return explicit namespace
    mockArgs.parse.mockReturnValue({ namespace: '/explicit/namespace' });
    
    // Mock file system to indicate .awsenv/config exists
    mockFs.existsSync.mockReturnValue(true);

    // Import the CLI module to trigger execution
    await import('../src/index.js');

    // Should not call applyProfile for auto-detection
    expect(mockProfiles.applyProfile).not.toHaveBeenCalled();
    
    // Should call app function with original params
    expect(mockApp).toHaveBeenCalledWith({ namespace: '/explicit/namespace' });
  });

  test('should not auto-detect when AWSENV_NAMESPACE env var is set', async () => {
    // Set minimal argv
    process.argv = ['node', '/path/to/script'];
    
    // Set environment variable
    process.env.AWSENV_NAMESPACE = '/env/namespace';
    
    // Mock parsing to return empty object
    mockArgs.parse.mockReturnValue({});
    
    // Mock file system to indicate .awsenv/config exists
    mockFs.existsSync.mockReturnValue(true);

    // Import the CLI module to trigger execution
    await import('../src/index.js');

    // Should not call applyProfile for auto-detection
    expect(mockProfiles.applyProfile).not.toHaveBeenCalled();
    
    // Should call app function with original params
    expect(mockApp).toHaveBeenCalledWith({});
  });

  test('should not auto-detect when .awsenv/config does not exist', async () => {
    // Set minimal argv with a namespace to prevent help from showing
    process.argv = ['node', '/path/to/script'];
    
    // Clear environment variables
    delete process.env.AWSENV_NAMESPACE;
    
    // Mock parsing to return object with namespace so help doesn't trigger
    mockArgs.parse.mockReturnValue({namespace: '/test'});
    
    // Mock file system to indicate .awsenv/config does NOT exist
    mockFs.existsSync.mockReturnValue(false);

    // Import the CLI module to trigger execution
    await import('../src/index.js');

    // Should not call applyProfile (no profile detected)
    expect(mockProfiles.applyProfile).not.toHaveBeenCalled();
    
    // Should call app function with namespace params
    expect(mockApp).toHaveBeenCalledWith({namespace: '/test'});
  });

  test('should handle profile application errors gracefully', async () => {
    // Set minimal argv
    process.argv = ['node', '/path/to/script'];
    
    // Mock parsing to return profile
    mockArgs.parse.mockReturnValue({ profile: 'nonexistent' });
    
    // Mock profile application to throw error
    mockProfiles.applyProfile.mockImplementation(() => {
      throw new Error('Profile not found');
    });

    try {
      await import('../src/index.js');
    } catch (error) {
      expect(error.message).toBe('process.exit(1)');
    }

    // Should have attempted to apply profile
    expect(mockProfiles.applyProfile).toHaveBeenCalled();
  });
});