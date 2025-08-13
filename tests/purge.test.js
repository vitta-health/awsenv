import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import EnvPurge from '../src/purge.js';
import AwsSsm from '../src/vendor/aws-ssm.js';

vi.mock('../src/vendor/aws-ssm.js');

describe('EnvPurge', () => {
  let consoleSpy;
  let errorSpy;
  let stdoutSpy;
  let exitSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    global.verbose = false;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
  });

  describe('constructor', () => {
    test('should initialize with default options', () => {
      const purge = new EnvPurge();
      expect(purge.region).toBe('us-east-1');
      expect(purge.namespace).toBeUndefined();
      expect(purge.force).toBe(false);
      expect(purge.paranoid).toBe(false);
    });

    test('should initialize with custom options', () => {
      const purge = new EnvPurge({
        region: 'eu-west-1',
        namespace: '/test/app',
        force: true,
        paranoid: true
      });
      expect(purge.region).toBe('eu-west-1');
      expect(purge.namespace).toBe('/test/app');
      expect(purge.force).toBe(true);
      expect(purge.paranoid).toBe(true);
    });
  });

  describe('listParameters', () => {
    test('should fetch parameters from AWS', async () => {
      const mockResponse = {
        Parameters: [
          { Name: '/test/app/VAR1' },
          { Name: '/test/app/VAR2' }
        ]
      };
      AwsSsm.getParametersByPath.mockResolvedValue(mockResponse);

      const purge = new EnvPurge({
        region: 'us-east-1',
        namespace: '/test/app'
      });

      const params = await purge.listParameters();
      expect(params).toEqual(['/test/app/VAR1', '/test/app/VAR2']);
      expect(AwsSsm.getParametersByPath).toHaveBeenCalledWith('us-east-1', '/test/app');
    });

    test('should return empty array when no parameters found', async () => {
      AwsSsm.getParametersByPath.mockResolvedValue({ Parameters: [] });

      const purge = new EnvPurge({
        namespace: '/test/app'
      });

      const params = await purge.listParameters();
      expect(params).toEqual([]);
    });

    test('should handle parameter not found error', async () => {
      const error = new Error('Parameter not found');
      error.name = 'ParameterNotFound';
      AwsSsm.getParametersByPath.mockRejectedValue(error);

      const purge = new EnvPurge({
        namespace: '/test/app'
      });

      const params = await purge.listParameters();
      expect(params).toEqual([]);
    });
  });

  describe('deleteParameters', () => {
    test('should delete parameters in parallel', async () => {
      AwsSsm.deleteParameter.mockResolvedValue({});

      const purge = new EnvPurge({
        region: 'us-west-2'
      });

      const results = await purge.deleteParameters([
        '/test/app/VAR1',
        '/test/app/VAR2'
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        success: true,
        parameter: '/test/app/VAR1'
      });
      expect(results[1]).toEqual({
        success: true,
        parameter: '/test/app/VAR2'
      });

      expect(AwsSsm.deleteParameter).toHaveBeenCalledTimes(2);
      expect(stdoutSpy).toHaveBeenCalledWith('.');
    });

    test('should handle deletion failures', async () => {
      AwsSsm.deleteParameter
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('AccessDenied'));

      const purge = new EnvPurge({});

      const results = await purge.deleteParameters([
        '/test/app/VAR1',
        '/test/app/VAR2'
      ]);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('AccessDenied');

      expect(stdoutSpy).toHaveBeenCalledWith('.');
      expect(stdoutSpy).toHaveBeenCalledWith('x');
    });
  });

  describe('purge method', () => {
    test('should block purge when paranoid mode is enabled', async () => {
      const purge = new EnvPurge({
        namespace: '/test/app',
        paranoid: true
      });

      try {
        await purge.purge();
      } catch (error) {
        expect(error.message).toBe('process.exit(1)');
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Purge blocked by paranoid mode')
      );
    });

    test('should fail when namespace is not provided', async () => {
      const purge = new EnvPurge({});

      try {
        await purge.purge();
      } catch (error) {
        expect(error.message).toBe('process.exit(1)');
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Purge failed')
      );
    });

    test('should handle no parameters found', async () => {
      AwsSsm.getParametersByPath.mockResolvedValue({ Parameters: [] });

      const purge = new EnvPurge({
        namespace: '/test/app'
      });

      await purge.purge();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No parameters found')
      );
    });

    test('should purge parameters with force flag', async () => {
      const mockParams = [
        { Name: '/test/app/VAR1' },
        { Name: '/test/app/VAR2' }
      ];
      AwsSsm.getParametersByPath.mockResolvedValue({ Parameters: mockParams });
      AwsSsm.deleteParameter.mockResolvedValue({});

      const purge = new EnvPurge({
        namespace: '/test/app',
        force: true
      });

      await purge.purge();

      expect(AwsSsm.deleteParameter).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Purge completed')
      );
    });

    test('should handle AWS authentication errors', async () => {
      const authError = new Error('Invalid credentials');
      authError.name = 'UnrecognizedClientException';
      AwsSsm.getParametersByPath.mockRejectedValue(authError);

      const purge = new EnvPurge({
        namespace: '/test/app'
      });

      try {
        await purge.purge();
      } catch (error) {
        expect(error.message).toBe('process.exit(1)');
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('AWS Authentication Error')
      );
    });
  });

  describe('askConfirmation', () => {
    test('should skip confirmation with force flag', async () => {
      const purge = new EnvPurge({ force: true });
      const result = await purge.askConfirmation([]);
      expect(result).toBe(true);
    });
  });
});