// External packages
import { describe, expect, test } from 'vitest';

// Internal modules
import {
  DEFAULT_ERROR_MSG,
  OPTION_ENCRYPT_DESCRIPTION,
  OPTION_DRY_RUN_DESCRIPTION,
  OPTION_FORCE_DESCRIPTION,
  OPTION_NAMESPACE_DESCRIPTION,
  OPTION_PROFILE_DESCRIPTION,
  OPTION_REGION_DESCRIPTION,
  OPTION_SYNC_DESCRIPTION,
  OPTION_WITHOUT_EXPORTER_DESCRIPTION,
  SYNC_CANCELLED_MSG,
  SYNC_CONFIRM_MSG,
  SYNC_DRY_RUN_MSG,
  SYNC_SUCCESS_MSG,
} from '../src/concerns/msgs.js';


describe('msgs', () => {
  test('should export all required message constants', () => {
    expect(OPTION_NAMESPACE_DESCRIPTION).toBeDefined();
    expect(OPTION_REGION_DESCRIPTION).toBeDefined();
    expect(OPTION_WITHOUT_EXPORTER_DESCRIPTION).toBeDefined();
    expect(OPTION_SYNC_DESCRIPTION).toBeDefined();
    expect(OPTION_DRY_RUN_DESCRIPTION).toBeDefined();
    expect(OPTION_FORCE_DESCRIPTION).toBeDefined();
    expect(OPTION_ENCRYPT_DESCRIPTION).toBeDefined();
    expect(OPTION_PROFILE_DESCRIPTION).toBeDefined();
    expect(DEFAULT_ERROR_MSG).toBeDefined();
    expect(SYNC_SUCCESS_MSG).toBeDefined();
    expect(SYNC_DRY_RUN_MSG).toBeDefined();
    expect(SYNC_CONFIRM_MSG).toBeDefined();
    expect(SYNC_CANCELLED_MSG).toBeDefined();
  });

  test('should have correct message content for existing options', () => {
    expect(OPTION_NAMESPACE_DESCRIPTION).toContain('Prefix for your parameters path');
    expect(OPTION_REGION_DESCRIPTION).toContain('AWS region for SSM parameters');
    expect(OPTION_WITHOUT_EXPORTER_DESCRIPTION).toContain('Hides command export');
    expect(DEFAULT_ERROR_MSG).toContain('Namespace is required');
  });

  test('should have correct message content for new sync options', () => {
    expect(OPTION_SYNC_DESCRIPTION).toContain('Sync .env file to AWS Parameter Store');
    expect(OPTION_DRY_RUN_DESCRIPTION).toContain('Show what would be synced without actually uploading');
    expect(OPTION_FORCE_DESCRIPTION).toContain('Overwrite existing parameters in Parameter Store');
  });

  test('should have correct sync status messages', () => {
    expect(SYNC_SUCCESS_MSG).toContain('Successfully synced parameters');
    expect(SYNC_DRY_RUN_MSG).toContain('DRY RUN');
    expect(SYNC_CONFIRM_MSG).toContain('Continue?');
    expect(SYNC_CANCELLED_MSG).toContain('cancelled');
  });

  test('should have string type messages', () => {
    expect(typeof OPTION_NAMESPACE_DESCRIPTION).toBe('string');
    expect(typeof OPTION_REGION_DESCRIPTION).toBe('string');
    expect(typeof OPTION_WITHOUT_EXPORTER_DESCRIPTION).toBe('string');
    expect(typeof OPTION_SYNC_DESCRIPTION).toBe('string');
    expect(typeof OPTION_DRY_RUN_DESCRIPTION).toBe('string');
    expect(typeof OPTION_FORCE_DESCRIPTION).toBe('string');
    expect(typeof OPTION_ENCRYPT_DESCRIPTION).toBe('string');
    expect(typeof OPTION_PROFILE_DESCRIPTION).toBe('string');
    expect(typeof DEFAULT_ERROR_MSG).toBe('string');
    expect(typeof SYNC_SUCCESS_MSG).toBe('string');
    expect(typeof SYNC_DRY_RUN_MSG).toBe('string');
    expect(typeof SYNC_CONFIRM_MSG).toBe('string');
    expect(typeof SYNC_CANCELLED_MSG).toBe('string');
  });
});