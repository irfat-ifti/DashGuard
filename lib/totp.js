/**
 * DashGuard Zero-Knowledge TOTP / 2FA Authenticator Engine
 * RFC 6238 & RFC 4226 compliant
 * Implements native Web Crypto HMAC-SHA1 with Base32 decoding
 */

export class TOTPEngine {
  /**
   * Base32 character set lookup
   */
  static B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  /**
   * Clean and normalize Base32 secret string
   */
  static cleanSecret(secret) {
    if (!secret) return '';
    return secret.toUpperCase().replace(/[\s\-_]/g, '').replace(/=+$/, '');
  }

  /**
   * Decode Base32 string to Uint8Array
   */
  static base32ToBytes(base32) {
    const clean = this.cleanSecret(base32);
    if (!clean) return new Uint8Array(0);

    let bits = 0;
    let value = 0;
    const output = [];

    for (let i = 0; i < clean.length; i++) {
      const idx = this.B32_ALPHABET.indexOf(clean[i]);
      if (idx === -1) continue; // Skip invalid chars

      value = (value << 5) | idx;
      bits += 5;

      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return new Uint8Array(output);
  }

  /**
   * Compute 6-digit TOTP code for a secret at a given timestamp
   * @param {string} secret - Base32 encoded secret key
   * @param {number} [timeNow=Date.now()] - Timestamp in milliseconds
   * @param {number} [step=30] - Time step in seconds (default: 30)
   * @returns {Promise<{ code: string, remainingSeconds: number, progress: number }>}
   */
  static async generate(secret, timeNow = Date.now(), step = 30) {
    const clean = this.cleanSecret(secret);
    if (!clean) {
      return { code: '------', remainingSeconds: 0, progress: 0 };
    }

    const epochSeconds = Math.floor(timeNow / 1000);
    const counter = Math.floor(epochSeconds / step);
    const remainingSeconds = step - (epochSeconds % step);
    const progress = Math.round((remainingSeconds / step) * 100);

    try {
      const keyBytes = this.base32ToBytes(clean);
      if (keyBytes.length === 0) {
        return { code: '------', remainingSeconds: 0, progress: 0 };
      }

      // 8-byte big-endian counter buffer
      const counterBuffer = new ArrayBuffer(8);
      const counterView = new DataView(counterBuffer);
      // High 32 bits are 0 for standard unix epochs
      counterView.setUint32(0, 0, false);
      counterView.setUint32(4, counter, false);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: { name: 'SHA-1' } },
        false,
        ['sign']
      );

      const hmacSignature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
      const hmacBytes = new Uint8Array(hmacSignature);

      // Truncate dynamically (RFC 4226)
      const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
      const binary =
        ((hmacBytes[offset] & 0x7f) << 24) |
        ((hmacBytes[offset + 1] & 0xff) << 16) |
        ((hmacBytes[offset + 2] & 0xff) << 8) |
        (hmacBytes[offset + 3] & 0xff);

      const otp = binary % 1000000;
      const formattedCode = otp.toString().padStart(6, '0');

      return {
        code: formattedCode,
        remainingSeconds,
        progress
      };
    } catch (err) {
      console.warn('TOTP calculation error:', err);
      return { code: '------', remainingSeconds: 0, progress: 0 };
    }
  }

  /**
   * Validate if a secret string is valid Base32 format
   */
  static isValidSecret(secret) {
    const clean = this.cleanSecret(secret);
    if (!clean || clean.length < 8) return false;
    return /^[A-Z2-7]+$/.test(clean);
  }
}
