/**
 * Base62 encoding/decoding utilities
 * 
 * 字符集: 0-9, A-Z, a-z (62 个字符)
 * 用于版本号、ID 等的紧凑表示
 */

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = BigInt(62);

/**
 * 将 BigInt 编码为 Base62 字符串
 */
export function encodeBase62(num: bigint): string {
  if (num === 0n) return '0';
  
  let result = '';
  let n = num < 0n ? -num : num;
  
  while (n > 0n) {
    result = CHARSET[Number(n % BASE)] + result;
    n = n / BASE;
  }
  
  return num < 0n ? `-${result}` : result;
}

/**
 * 将 Base62 字符串解码为 BigInt
 */
export function decodeBase62(str: string): bigint {
  const isNegative = str.startsWith('-');
  const chars = isNegative ? str.slice(1) : str;
  
  let result = 0n;
  for (const char of chars) {
    const index = CHARSET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base62 character: ${char}`);
    }
    result = result * BASE + BigInt(index);
  }
  
  return isNegative ? -result : result;
}

/**
 * 将 Uint8Array 编码为 Base62 字符串
 */
export function encodeBase62Bytes(bytes: Uint8Array): string {
  // 转换为 BigInt
  let num = 0n;
  for (const byte of bytes) {
    num = (num << 8n) | BigInt(byte);
  }
  return encodeBase62(num);
}

/**
 * 将 Buffer 编码为 Base62 字符串
 */
export function encodeBase62Buffer(buffer: Buffer): string {
  return encodeBase62Bytes(new Uint8Array(buffer));
}

/**
 * 将数字编码为固定长度的 Base62 字符串（左侧填充 0）
 */
export function encodeBase62Padded(num: bigint | number, length: number): string {
  const encoded = encodeBase62(BigInt(num));
  if (encoded.length > length) {
    throw new Error(`Number too large for ${length} Base62 characters`);
  }
  return encoded.padStart(length, '0');
}

/**
 * 递增 Base62 版本号
 * 
 * @example
 * incrementVersion('000000') // '000001'
 * incrementVersion('00000z') // '000010'
 */
export function incrementVersion(version: string): string {
  const num = decodeBase62(version);
  return encodeBase62Padded(num + 1n, version.length);
}

/**
 * 比较两个 Base62 版本号
 * 
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const numA = decodeBase62(a);
  const numB = decodeBase62(b);
  if (numA < numB) return -1;
  if (numA > numB) return 1;
  return 0;
}

/**
 * 初始版本号
 */
export const INITIAL_VERSION = '000000';

/**
 * 最大版本号
 */
export const MAX_VERSION = 'zzzzzz';

