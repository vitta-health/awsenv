import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import EnvPurge from '../src/purge.js';
import AwsSsm from '../src/vendor/aws-ssm.js';

// Mock AWS SSM
vi.mock('../src/vendor/aws-ssm.js', () => ({
  default: {
    getParametersByPath: vi.fn(),
    deleteParameter: vi.fn()
  }
}));

// Mock readline
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn()
  }))
}));

describe('EnvPurge class', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let processExitSpy;
  let stdoutWriteSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
    vi.restoreAllMocks();
  });

  test('should create EnvPurge with default options', () => {
    const purge = new EnvPurge();
    expect(purge.region).toBe('us-east-1');
    expect(purge.force).toBe(false);
    expect(purge.paranoid).toBe(false);
  });

  test('should create EnvPurge with custom options', () => {
    const options = {
      region: 'eu-west-1',
      namespace: '/test/app',
      force: true,
      paranoid: true
    };
    const purge = new EnvPurge(options);
    expect(purge.region).toBe('eu-west-1');
    expect(purge.namespace).toBe('/test/app');
    expect(purge.force).toBe(true);
    expect(purge.paranoid).toBe(true);
  });

  test('should list parameters successfully', async () => {
    const mockParameters = [
      { Name: '/test/app/KEY1' },
      { Name: '/test/app/KEY2' }
    ];
    
    AwsSsm.getParametersByPath.mockResolvedValue({
      Parameters: mockParameters
    });

    const purge = new EnvPurge({ namespace: '/test/app' });
    const result = await purge.listParameters();

    expect(result).toEqual(['/test/app/KEY1', '/test/app/KEY2']);
    expect(AwsSsm.getParametersByPath).toHaveBeenCalledWith('us-east-1', '/test/app');
  });

  test('should handle empty parameter list', async () => {
    AwsSsm.getParametersByPath.mockResolvedValue({
      Parameters: []
    });

    const purge = new EnvPurge({ namespace: '/test/app' });
    const result = await purge.listParameters();

    expect(result).toEqual([]);
  });

  test('should handle parameter not found error', async () => {
    const error = new Error('Parameter not found');
    error.name = 'ParameterNotFound';
    AwsSsm.getParametersByPath.mockRejectedValue(error);

    const purge = new EnvPurge({ namespace: '/test/app' });
    const result = await purge.listParameters();

    expect(result).toEqual([]);
  });

  test('should rethrow other errors when listing parameters', async () => {
    const error = new Error('AWS Error');
    AwsSsm.getParametersByPath.mockRejectedValue(error);

    const purge = new EnvPurge({ namespace: '/test/app' });
    
    await expect(purge.listParameters()).rejects.toThrow('AWS Error');
  });

  test('should delete parameters successfully', async () => {
    AwsSsm.deleteParameter.mockResolvedValue({});

    const purge = new EnvPurge({ namespace: '/test/app' });
    const parameters = ['/test/app/KEY1', '/test/app/KEY2'];
    
    const results = await purge.deleteParameters(parameters);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      success: true,
      parameter: '/test/app/KEY1'
    });
    expect(results[1]).toEqual({
      success: true,
      parameter: '/test/app/KEY2'
    });
    expect(stdoutWriteSpy).toHaveBeenCalledWith('.');
  });

  test('should handle delete failures', async () => {
    AwsSsm.deleteParameter
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Delete failed'));

    const purge = new EnvPurge({ namespace: '/test/app' });
    const parameters = ['/test/app/KEY1', '/test/app/KEY2'];
    
    const results = await purge.deleteParameters(parameters);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBe('Delete failed');
    expect(stdoutWriteSpy).toHaveBeenCalledWith('x');
  });

  test('should skip confirmation when force is true', async () => {
    const purge = new EnvPurge({ force: true });
    const result = await purge.askConfirmation([]);
    
    expect(result).toBe(true);
  });

  test('should handle paranoid mode', async () => {
    const purge = new EnvPurge({ 
      namespace: '/test/app',
      paranoid: true 
    });

    processExitSpy.mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    try {
      await purge.purge();
    } catch (error) {
      expect(error.message).toBe('process.exit(1)');
    }

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  test('should handle no namespace error', async () => {
    const purge = new EnvPurge();

    processExitSpy.mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    try {
      await purge.purge();
    } catch (error) {
      expect(error.message).toBe('process.exit(1)');
    }

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  test('should handle empty parameter list in purge', async () => {
    AwsSsm.getParametersByPath.mockResolvedValue({
      Parameters: []
    });

    const purge = new EnvPurge({ namespace: '/test/app' });
    await purge.purge();

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  test('should handle AWS authentication errors', async () => {
    const error = new Error('Invalid security token');
    error.name = 'UnrecognizedClientException';
    AwsSsm.getParametersByPath.mockRejectedValue(error);

    const purge = new EnvPurge({ namespace: '/test/app' });

    processExitSpy.mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    try {
      await purge.purge();
    } catch (err) {
      expect(err.message).toBe('process.exit(1)');
    }

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  test('should handle verbose mode', async () => {
    global.verbose = true;

    const mockParameters = [
      { Name: '/test/app/KEY1' }
    ];
    
    AwsSsm.getParametersByPath.mockResolvedValue({
      Parameters: mockParameters
    });
    AwsSsm.deleteParameter.mockResolvedValue({});

    const purge = new EnvPurge({ namespace: '/test/app' });
    await purge.listParameters();
    await purge.deleteParameters(['/test/app/KEY1']);

    expect(consoleLogSpy).toHaveBeenCalled();

    global.verbose = false;
  });
});
