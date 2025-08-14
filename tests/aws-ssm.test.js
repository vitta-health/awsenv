import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

describe('AwsSsm class', () => {
  let mockSend;
  let SSMClient, GetParametersByPathCommand, PutParameterCommand, DeleteParameterCommand;

  beforeEach(() => {
    // Reset modules to ensure fresh imports
    vi.resetModules();
    
    // Create mock functions
    mockSend = vi.fn();
    SSMClient = vi.fn(() => ({ send: mockSend }));
    GetParametersByPathCommand = vi.fn((params) => ({ type: 'GetParametersByPathCommand', ...params }));
    PutParameterCommand = vi.fn((params) => ({ type: 'PutParameterCommand', ...params }));
    DeleteParameterCommand = vi.fn((params) => ({ type: 'DeleteParameterCommand', ...params }));
    
    // Mock the AWS SDK
    vi.doMock('@aws-sdk/client-ssm', () => ({
      SSMClient,
      GetParametersByPathCommand,
      PutParameterCommand,
      DeleteParameterCommand
    }));
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  test('should create SSMClient and call getParametersByPath', async () => {
    const mockData = {
      Parameters: [
        {
          Name: '/test/param1',
          Value: 'value1',
          Type: 'String'
        }
      ]
    };

    mockSend.mockResolvedValue(mockData);

    // Import after mocking
    const { default: AwsSsm } = await import('../src/vendor/aws-ssm.js');
    
    const result = await AwsSsm.getParametersByPath('us-east-1', '/test');
    
    expect(SSMClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(GetParametersByPathCommand).toHaveBeenCalledWith({
      Path: '/test',
      Recursive: true,
      WithDecryption: true,
      MaxResults: 10,
      NextToken: undefined
    });
    expect(result).toEqual(mockData);
  });

  test('should use default region when none provided', async () => {
    const mockData = { Parameters: [] };
    mockSend.mockResolvedValue(mockData);

    const { default: AwsSsm } = await import('../src/vendor/aws-ssm.js');
    
    const result = await AwsSsm.getParametersByPath(undefined, '/test');
    
    expect(SSMClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(result).toEqual(mockData);
  });

  test('should handle putParameter call', async () => {
    const mockResponse = { Version: 1 };
    mockSend.mockResolvedValue(mockResponse);

    const parameter = {
      Name: '/test/param1',
      Value: 'value1',
      Type: 'String'
    };

    const { default: AwsSsm } = await import('../src/vendor/aws-ssm.js');
    
    const result = await AwsSsm.putParameter('us-east-1', parameter);
    
    expect(SSMClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(PutParameterCommand).toHaveBeenCalledWith(parameter);
    expect(result).toEqual(mockResponse);
  });

  test('should handle putParameters with multiple parameters', async () => {
    const mockResponse = { Version: 1 };
    mockSend.mockResolvedValue(mockResponse);

    const parameters = [
      {
        Name: '/test/param1',
        Value: 'value1',
        Type: 'String'
      },
      {
        Name: '/test/param2',
        Value: 'value2',
        Type: 'SecureString'
      }
    ];

    const { default: AwsSsm } = await import('../src/vendor/aws-ssm.js');
    
    const results = await AwsSsm.putParameters('us-east-1', parameters);
    
    expect(results).toHaveLength(1);
    expect(mockSend).toHaveBeenCalledTimes(2); // One call per parameter
  });

  test('should handle errors from AWS SDK', async () => {
    const mockError = new Error('AWS SDK Error');
    mockSend.mockRejectedValue(mockError);

    const { default: AwsSsm } = await import('../src/vendor/aws-ssm.js');
    
    await expect(AwsSsm.getParametersByPath('us-east-1', '/test'))
      .rejects.toThrow('AWS SDK Error');
  });

  test('should handle putParameter errors', async () => {
    const mockError = new Error('putParameter failed');
    mockSend.mockRejectedValue(mockError);

    const parameter = {
      Name: '/test/param',
      Value: 'value',
      Type: 'String'
    };

    const { default: AwsSsm } = await import('../src/vendor/aws-ssm.js');
    
    await expect(AwsSsm.putParameter('us-east-1', parameter))
      .rejects.toThrow('putParameter failed');
  });

  test('should handle deleteParameter call', async () => {
    const mockData = { DeletedParameter: true };
    mockSend.mockResolvedValue(mockData);

    // Import after mocking
    const { default: AwsSsm } = await import('../src/vendor/aws-ssm.js');
    
    const result = await AwsSsm.deleteParameter('us-east-1', '/test/param');
    
    expect(SSMClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(result).toEqual(mockData);
  });

  test('should handle deleteParameter errors', async () => {
    const mockError = new Error('Parameter not found');
    mockSend.mockRejectedValue(mockError);

    // Import after mocking
    const { default: AwsSsm } = await import('../src/vendor/aws-ssm.js');
    
    await expect(AwsSsm.deleteParameter('us-east-1', '/test/param')).rejects.toThrow('Parameter not found');
  });
});