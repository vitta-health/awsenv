/**
 * Robust .env file parser that handles various quote combinations and edge cases
 */

export function parseEnvContent(content) {
  const envVars = {};
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    
    // Match KEY=VALUE format (key can contain letters, numbers, underscore)
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)?$/i);
    if (!match) {
      continue;
    }
    
    const [, key, rawValue = ''] = match;
    let value = rawValue;
    
    // Handle quoted values
    value = parseValue(value, lines, i);
    
    envVars[key] = value;
  }
  
  return envVars;
}

/**
 * Parse a value handling various quote scenarios
 */
function parseValue(value, lines, currentIndex) {
  // No value after =
  if (value === '' || value === undefined) {
    return '';
  }
  
  // Remove leading/trailing whitespace
  value = value.trim();
  
  // Handle double quotes
  if (value.startsWith('"')) {
    return parseDoubleQuoted(value, lines, currentIndex);
  }
  
  // Handle single quotes
  if (value.startsWith("'")) {
    return parseSingleQuoted(value, lines, currentIndex);
  }
  
  // Handle backticks (template literals)
  if (value.startsWith('`')) {
    return parseBacktickQuoted(value, lines, currentIndex);
  }
  
  // Unquoted value - trim whitespace and return
  // But preserve internal spaces
  return value;
}

/**
 * Parse double-quoted values
 * Supports: escape sequences, multi-line, variable interpolation
 */
function parseDoubleQuoted(value, lines, currentIndex) {
  // Check if the quote is closed on the same line
  if (value.length > 1 && value.endsWith('"')) {
    // Check if the ending quote is escaped
    // Count consecutive backslashes before the quote
    let backslashCount = 0;
    for (let i = value.length - 2; i >= 0 && value[i] === '\\'; i--) {
      backslashCount++;
    }
    // If even number of backslashes (including 0), the quote is not escaped
    if (backslashCount % 2 === 0) {
      // Simple case: "value"
      const inner = value.slice(1, -1);
      // Process escape sequences
      return processEscapeSequences(inner);
    }
  }
  
  // Multi-line quoted value
  let fullValue = value.substring(1); // Remove opening quote
  let lineIndex = currentIndex;
  
  // Keep reading lines until we find the closing quote
  while (lineIndex < lines.length - 1) {
    // Check if current line ends with unescaped quote
    if (fullValue.endsWith('"')) {
      // Count consecutive backslashes before the quote
      let backslashCount = 0;
      for (let i = fullValue.length - 2; i >= 0 && fullValue[i] === '\\'; i--) {
        backslashCount++;
      }
      // If even number of backslashes (including 0), the quote is not escaped
      if (backslashCount % 2 === 0) {
        return processEscapeSequences(fullValue.slice(0, -1));
      }
    }
    
    lineIndex++;
    fullValue += '\n' + lines[lineIndex];
    
    // Safety check to prevent infinite loops
    if (lineIndex - currentIndex > 100) {
      // Unclosed quote, return the original value
      return value;
    }
  }
  
  // If we get here, quote was never closed
  // Check one more time if the last line ends with quote
  if (fullValue.endsWith('"')) {
    // Count consecutive backslashes before the quote
    let backslashCount = 0;
    for (let i = fullValue.length - 2; i >= 0 && fullValue[i] === '\\'; i--) {
      backslashCount++;
    }
    // If even number of backslashes (including 0), the quote is not escaped
    if (backslashCount % 2 === 0) {
      return processEscapeSequences(fullValue.slice(0, -1));
    }
  }
  
  return value; // Return original if unclosed
}

/**
 * Parse single-quoted values
 * Single quotes preserve literal values (no escape sequences except \')
 */
function parseSingleQuoted(value, lines, currentIndex) {
  // Check if the quote is closed on the same line
  if (value.length > 1 && value.endsWith("'")) {
    // Count consecutive backslashes before the quote
    let backslashCount = 0;
    for (let i = value.length - 2; i >= 0 && value[i] === '\\'; i--) {
      backslashCount++;
    }
    // If even number of backslashes (including 0), the quote is not escaped
    if (backslashCount % 2 === 0) {
      // Simple case: 'value'
      const inner = value.slice(1, -1);
      // Only process escaped single quotes
      return inner.replace(/\\'/g, "'");
    }
  }
  
  // Multi-line quoted value
  let fullValue = value.substring(1); // Remove opening quote
  let lineIndex = currentIndex;
  
  // Keep reading lines until we find the closing quote
  while (lineIndex < lines.length - 1) {
    // Check if current line ends with unescaped quote
    if (fullValue.endsWith("'") && !fullValue.endsWith("\\'")) {
      return fullValue.slice(0, -1).replace(/\\'/g, "'");
    }
    
    lineIndex++;
    fullValue += '\n' + lines[lineIndex];
    
    // Safety check
    if (lineIndex - currentIndex > 100) {
      return value;
    }
  }
  
  // Check last line
  if (fullValue.endsWith("'") && !fullValue.endsWith("\\'")) {
    return fullValue.slice(0, -1).replace(/\\'/g, "'");
  }
  
  return value; // Return original if unclosed
}

/**
 * Parse backtick-quoted values (template literals)
 * Similar to double quotes but preserves more formatting
 */
function parseBacktickQuoted(value, lines, currentIndex) {
  if (value.length > 1 && value.endsWith('`')) {
    return value.slice(1, -1);
  }
  
  // Multi-line
  let fullValue = value.substring(1);
  let lineIndex = currentIndex;
  
  while (lineIndex < lines.length - 1) {
    if (fullValue.endsWith('`')) {
      return fullValue.slice(0, -1);
    }
    
    lineIndex++;
    fullValue += '\n' + lines[lineIndex];
    
    if (lineIndex - currentIndex > 100) {
      return value;
    }
  }
  
  if (fullValue.endsWith('`')) {
    return fullValue.slice(0, -1);
  }
  
  return value;
}

/**
 * Process escape sequences in double-quoted strings
 */
function processEscapeSequences(str) {
  // Process in specific order to handle complex cases
  let result = '';
  let i = 0;
  
  while (i < str.length) {
    if (str[i] === '\\' && i + 1 < str.length) {
      const nextChar = str[i + 1];
      switch (nextChar) {
        case 'n':
          result += '\n';
          i += 2;
          break;
        case 'r':
          result += '\r';
          i += 2;
          break;
        case 't':
          result += '\t';
          i += 2;
          break;
        case '"':
          result += '"';
          i += 2;
          break;
        case "'":
          result += "'";
          i += 2;
          break;
        case '\\':
          result += '\\';
          i += 2;
          break;
        default:
          // Unknown escape sequence, keep the backslash
          result += str[i];
          i++;
      }
    } else {
      result += str[i];
      i++;
    }
  }
  
  return result;
}

/**
 * Export for testing
 */
export const _internal = {
  parseValue,
  parseDoubleQuoted,
  parseSingleQuoted,
  parseBacktickQuoted,
  processEscapeSequences
};