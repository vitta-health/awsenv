import { describe, it, expect } from 'vitest';
import { parseEnvContent, _internal } from '../src/lib/env-parser.js';

describe('env-parser', () => {
  describe('parseEnvContent', () => {
    it('should parse simple unquoted values', () => {
      const content = `
KEY1=value1
KEY2=value2
KEY3=123
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value2',
        KEY3: '123'
      });
    });

    it('should parse double-quoted values', () => {
      const content = `
KEY1="value1"
KEY2="value with spaces"
KEY3=""
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value with spaces',
        KEY3: ''
      });
    });

    it('should parse single-quoted values', () => {
      const content = `
KEY1='value1'
KEY2='value with spaces'
KEY3=''
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value with spaces',
        KEY3: ''
      });
    });

    it('should handle escaped quotes in double-quoted strings', () => {
      const content = `
KEY1="value with \\"quotes\\""
KEY2="it's fine"
KEY3="mixed \\"quotes\\" and 'singles'"
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'value with "quotes"',
        KEY2: "it's fine",
        KEY3: "mixed \"quotes\" and 'singles'"
      });
    });

    it('should handle escaped quotes in single-quoted strings', () => {
      const content = `
KEY1='it\\'s working'
KEY2='value with "doubles"'
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: "it's working",
        KEY2: 'value with "doubles"'
      });
    });

    it('should handle backtick-quoted values', () => {
      const content = `
KEY1=\`backtick value\`
KEY2=\`value with "quotes" and 'singles'\`
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'backtick value',
        KEY2: `value with "quotes" and 'singles'`
      });
    });

    it('should parse values with equals signs', () => {
      const content = `
KEY1=value=with=equals
KEY2="value=with=equals"
KEY3='value=with=equals'
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'value=with=equals',
        KEY2: 'value=with=equals',
        KEY3: 'value=with=equals'
      });
    });

    it('should handle empty values', () => {
      const content = `
KEY1=
KEY2=""
KEY3=''
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: '',
        KEY2: '',
        KEY3: ''
      });
    });

    it('should skip comments and empty lines', () => {
      const content = `
# This is a comment
KEY1=value1

# Another comment
KEY2=value2
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value2'
      });
    });

    it('should handle multi-line values in double quotes', () => {
      const content = `KEY1="line1
line2
line3"
KEY2=value2`;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'line1\nline2\nline3',
        KEY2: 'value2'
      });
    });

    it('should handle multi-line values in single quotes', () => {
      const content = `KEY1='line1
line2
line3'
KEY2=value2`;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'line1\nline2\nline3',
        KEY2: 'value2'
      });
    });

    it('should process escape sequences in double quotes', () => {
      const content = `
KEY1="line1\\nline2"
KEY2="tab\\there"
KEY3="carriage\\rreturn"
KEY4="backslash\\\\"
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'line1\nline2',
        KEY2: 'tab\there',
        KEY3: 'carriage\rreturn',
        KEY4: 'backslash\\'
      });
    });

    it('should NOT process escape sequences in single quotes', () => {
      const content = `
KEY1='line1\\nline2'
KEY2='tab\\there'
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'line1\\nline2',
        KEY2: 'tab\\there'
      });
    });

    it('should handle complex real-world examples', () => {
      const content = `
DATABASE_URL="postgresql://user:pass@localhost:5432/mydb"
API_KEY='sk-1234567890abcdef'
JWT_SECRET="super-secret-key-with-\\"quotes\\"-inside"
MULTILINE_JSON='{"key": "value", "number": 123}'
REGEX_PATTERN=^[a-z0-9]+$
EMPTY=
WITH_SPACES=   value with spaces   
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/mydb',
        API_KEY: 'sk-1234567890abcdef',
        JWT_SECRET: 'super-secret-key-with-"quotes"-inside',
        MULTILINE_JSON: '{"key": "value", "number": 123}',
        REGEX_PATTERN: '^[a-z0-9]+$',
        EMPTY: '',
        WITH_SPACES: 'value with spaces'
      });
    });

    it('should handle keys with underscores and numbers', () => {
      const content = `
KEY_WITH_UNDERSCORES=value1
KEY_123=value2
KEY_WITH_123_NUMBERS=value3
_PRIVATE_KEY=value4
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY_WITH_UNDERSCORES: 'value1',
        KEY_123: 'value2',
        KEY_WITH_123_NUMBERS: 'value3',
        _PRIVATE_KEY: 'value4'
      });
    });

    it('should handle unclosed quotes by returning original', () => {
      const content = `
KEY1="unclosed quote
KEY2=value2
      `;
      const result = parseEnvContent(content);
      expect(result.KEY1).toBe('"unclosed quote');
      expect(result.KEY2).toBe('value2');
    });

    it('should handle special AWS Parameter Store values', () => {
      const content = `
AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
AWS_SESSION_TOKEN="FwoGZXIvYXdzEJr//////////wEaDMfZmCvmFc6Yfo0/1yLOAZPbUZBStxWpRmK..."
DATABASE_URL="mysql://root:p@ssw0rd!@localhost:3306/db_name?ssl-mode=REQUIRED"
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        AWS_SESSION_TOKEN: 'FwoGZXIvYXdzEJr//////////wEaDMfZmCvmFc6Yfo0/1yLOAZPbUZBStxWpRmK...',
        DATABASE_URL: 'mysql://root:p@ssw0rd!@localhost:3306/db_name?ssl-mode=REQUIRED'
      });
    });
  });

  describe('edge cases', () => {
    it('should handle the examples from user', () => {
      const content = `
A=1
B="1"
C="\"1\""
D='1'
E='\'1\''
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        A: '1',
        B: '1',
        C: '"1"',
        D: '1',
        E: "'1'"
      });
    });

    it('should handle values with special characters', () => {
      const content = `
KEY1=!@#$%^&*()
KEY2="!@#$%^&*()"
KEY3='!@#$%^&*()'
KEY4=https://example.com/path?query=value&other=123
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: '!@#$%^&*()',
        KEY2: '!@#$%^&*()',
        KEY3: '!@#$%^&*()',
        KEY4: 'https://example.com/path?query=value&other=123'
      });
    });

    it('should handle JSON values', () => {
      const content = `
JSON1={"key":"value","number":123,"nested":{"a":"b"}}
JSON2='{"key":"value","number":123,"nested":{"a":"b"}}'
JSON3="{\\"key\\":\\"value\\",\\"number\\":123}"
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        JSON1: '{"key":"value","number":123,"nested":{"a":"b"}}',
        JSON2: '{"key":"value","number":123,"nested":{"a":"b"}}',
        JSON3: '{"key":"value","number":123}'
      });
    });

    it('should handle base64 encoded values', () => {
      const content = `
KEY1=SGVsbG8gV29ybGQh
KEY2="SGVsbG8gV29ybGQh"
KEY3='SGVsbG8gV29ybGQh'
CERT="LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUNVVENDQWJxZ0F3SUJBZ0lCQURBTkJna3Foa2lHOXcwQkFRc0ZBREE5TVFzd0NRWUR..."
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'SGVsbG8gV29ybGQh',
        KEY2: 'SGVsbG8gV29ybGQh',
        KEY3: 'SGVsbG8gV29ybGQh',
        CERT: 'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUNVVENDQWJxZ0F3SUJBZ0lCQURBTkJna3Foa2lHOXcwQkFRc0ZBREE5TVFzd0NRWUR...'
      });
    });
  });

  describe('additional edge cases for coverage', () => {
    it('should handle escaped single quotes in double-quoted strings', () => {
      const content = `KEY="value with \\'single\\' quotes"`;
      const result = parseEnvContent(content);
      expect(result.KEY).toBe("value with 'single' quotes");
    });

    it('should handle unknown escape sequences', () => {
      const content = `KEY="unknown\\xescape"`;
      const result = parseEnvContent(content);
      expect(result.KEY).toBe("unknown\\xescape");
    });

    it('should handle multiline single-quoted values', () => {
      const content = `KEY='line1
line2
line3'`;
      const result = parseEnvContent(content);
      expect(result.KEY).toBe('line1\nline2\nline3');
    });

    it('should handle unclosed single quotes', () => {
      const content = `KEY='unclosed quote`;
      const result = parseEnvContent(content);
      expect(result.KEY).toBe("'unclosed quote");
    });

    it('should handle multiline double-quoted values ending with escaped quote', () => {
      const content = `KEY="line1
line2\\"`;
      const result = parseEnvContent(content);
      expect(result.KEY).toBe('"line1');
    });

    it('should handle backtick multiline values', () => {
      const content = `KEY=\`line1
line2
line3\``;
      const result = parseEnvContent(content);
      expect(result.KEY).toBe('line1\nline2\nline3');
    });

    it('should handle unclosed backticks', () => {
      const content = `KEY=\`unclosed backtick`;
      const result = parseEnvContent(content);
      expect(result.KEY).toBe('`unclosed backtick');
    });

    it('should handle empty input', () => {
      const result = parseEnvContent('');
      expect(result).toEqual({});
    });

    it('should handle only comments and empty lines', () => {
      const content = `
# comment 1

# comment 2
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({});
    });

    it('should handle lines without equals sign', () => {
      const content = `
KEY1=value1
INVALID_LINE_WITHOUT_EQUALS
KEY2=value2
      `;
      const result = parseEnvContent(content);
      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value2'
      });
    });

    it('should handle very long multiline values', () => {
      let longContent = 'KEY="start\n';
      for (let i = 0; i < 150; i++) {
        longContent += `line${i}\n`;
      }
      longContent = longContent.trim();
      const result = parseEnvContent(longContent);
      expect(result.KEY).toBe('"start');
    });

    it('should handle edge case with multiple backslashes before quote', () => {
      const content = `KEY="value\\\\\\\\"`;
      const result = parseEnvContent(content);
      expect(result.KEY).toBe('value\\\\');
    });

    it('should handle single-quoted values with escaped quotes properly', () => {
      const content = `KEY='can\\'t'`;
      const result = parseEnvContent(content);
      expect(result.KEY).toBe("can't");
    });
  });
});