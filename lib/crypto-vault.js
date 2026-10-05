/**
 * DashGuard Zero-Knowledge WebCrypto Vault Engine
 * Implements PBKDF2 (SHA-256, 100,000 iterations) key derivation
 * and AES-GCM (256-bit) encryption/decryption with random 12-byte IVs.
 */

export class CryptoVault {
  /**
   * Derive an AES-GCM-256 CryptoKey from a master password and salt.
   * @param {string} masterPassword
   * @param {Uint8Array} salt
   * @returns {Promise<CryptoKey>}
   */
  static async deriveKey(masterPassword, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(masterPassword),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate cryptographically secure random bytes
   * @param {number} length
   * @returns {Uint8Array}
   */
  static getRandomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  /**
   * Convert buffer to base64 string
   */
  static bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to Uint8Array
   */
  static base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Encrypt a string using AES-GCM with a fresh random 12-byte IV
   * @param {string} plaintext
   * @param {CryptoKey} key
   * @returns {Promise<{ ciphertext: string, iv: string }>}
   */
  static async encrypt(plaintext, key) {
    const iv = this.getRandomBytes(12);
    const enc = new TextEncoder();
    const encoded = enc.encode(plaintext);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encoded
    );

    return {
      ciphertext: this.bufferToBase64(encrypted),
      iv: this.bufferToBase64(iv)
    };
  }

  /**
   * Decrypt ciphertext using AES-GCM
   * @param {string} ciphertextBase64
   * @param {string} ivBase64
   * @param {CryptoKey} key
   * @returns {Promise<string>}
   */
  static async decrypt(ciphertextBase64, ivBase64, key) {
    const iv = this.base64ToBuffer(ivBase64);
    const ciphertext = this.base64ToBuffer(ciphertextBase64);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  }

  /**
   * Encrypt sensitive fields of a vault item
   * @param {Object} item
   * @param {CryptoKey} key
   * @returns {Promise<Object>}
   */
  static async encryptVaultItem(item, key) {
    const itemCopy = { ...item };
    if (itemCopy.password) {
      const enc = await this.encrypt(itemCopy.password, key);
      itemCopy.encryptedPassword = enc.ciphertext;
      itemCopy.passwordIv = enc.iv;
      delete itemCopy.password;
    }
    if (itemCopy.notes) {
      const enc = await this.encrypt(itemCopy.notes, key);
      itemCopy.encryptedNotes = enc.ciphertext;
      itemCopy.notesIv = enc.iv;
      delete itemCopy.notes;
    }
    return itemCopy;
  }

  /**
   * Decrypt sensitive fields of a vault item
   * @param {Object} item
   * @param {CryptoKey} key
   * @returns {Promise<Object>}
   */
  static async decryptVaultItem(item, key) {
    const itemCopy = { ...item };
    if (itemCopy.encryptedPassword && itemCopy.passwordIv) {
      try {
        itemCopy.password = await this.decrypt(itemCopy.encryptedPassword, itemCopy.passwordIv, key);
      } catch (e) {
        itemCopy.password = '[Decryption error]';
      }
    }
    if (itemCopy.encryptedNotes && itemCopy.notesIv) {
      try {
        itemCopy.notes = await this.decrypt(itemCopy.encryptedNotes, itemCopy.notesIv, key);
      } catch (e) {
        itemCopy.notes = '';
      }
    }
    return itemCopy;
  }

  /**
   * Dashlane-style Advanced Password Generator
   * @param {Object} options
   * @returns {string}
   */
  static generatePassword(options = {}) {
    const {
      length = 16,
      uppercase = true,
      lowercase = true,
      numbers = true,
      symbols = true,
      excludeAmbiguous = true
    } = options;

    let upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let lowerChars = 'abcdefghijklmnopqrstuvwxyz';
    let numberChars = '0123456789';
    let symbolChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (excludeAmbiguous) {
      upperChars = upperChars.replace(/[IO]/g, '');
      lowerChars = lowerChars.replace(/[lo]/g, '');
      numberChars = numberChars.replace(/[01]/g, '');
      symbolChars = symbolChars.replace(/[|]/g, '');
    }

    let charPool = '';
    const guaranteed = [];

    if (uppercase) {
      charPool += upperChars;
      guaranteed.push(upperChars[Math.floor(Math.random() * upperChars.length)]);
    }
    if (lowercase) {
      charPool += lowerChars;
      guaranteed.push(lowerChars[Math.floor(Math.random() * lowerChars.length)]);
    }
    if (numbers) {
      charPool += numberChars;
      guaranteed.push(numberChars[Math.floor(Math.random() * numberChars.length)]);
    }
    if (symbols) {
      charPool += symbolChars;
      guaranteed.push(symbolChars[Math.floor(Math.random() * symbolChars.length)]);
    }

    if (!charPool) {
      charPool = lowerChars + numberChars;
    }

    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);

    const result = [...guaranteed];
    for (let i = result.length; i < length; i++) {
      result.push(charPool[randomValues[i] % charPool.length]);
    }

    // Shuffle result securely (Fisher-Yates)
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomValues[i] % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result.join('');
  }

  /**
   * Generate pronounceable memorable passphrase
   * e.g. "crystal-emerald-falcon-92"
   */
  static generatePassphrase(wordsCount = 4, includeNumber = true) {
    const wordList = [
      'amber', 'azure', 'beacon', 'breeze', 'canyon', 'cascade', 'cipher', 'comet',
      'coral', 'cosmic', 'crest', 'crystal', 'delta', 'dragon', 'echo', 'eclipse',
      'ember', 'falcon', 'feather', 'forest', 'frost', 'galaxy', 'glacier', 'haven',
      'horizon', 'island', 'jasper', 'lagoon', 'lotus', 'lunar', 'meadow', 'mirage',
      'nebula', 'nexus', 'oasis', 'ocean', 'orbit', 'origin', 'phoenix', 'prism',
      'pulsar', 'pyramid', 'quantum', 'quartz', 'raven', 'reef', 'river', 'ruby',
      'sapphire', 'shadow', 'shield', 'sierra', 'silver', 'solstice', 'spark', 'summit',
      'thunder', 'topaz', 'torrent', 'valiant', 'vector', 'vertex', 'vortex', 'zenith'
    ];

    const randoms = new Uint32Array(wordsCount + 1);
    crypto.getRandomValues(randoms);

    const selected = [];
    for (let i = 0; i < wordsCount; i++) {
      selected.push(wordList[randoms[i] % wordList.length]);
    }

    if (includeNumber) {
      const num = 10 + (randoms[wordsCount] % 90);
      selected.push(num.toString());
    }

    return selected.join('-');
  }

  /**
   * Password Strength & Entropy Evaluator
   * @param {string} password
   * @returns {{ score: number, entropy: number, label: string, color: string, feedback: string[] }}
   */
  static evaluateStrength(password) {
    if (!password) {
      return { score: 0, entropy: 0, label: 'Empty', color: '#64748b', feedback: ['Enter a password'] };
    }

    let poolSize = 0;
    if (/[a-z]/.test(password)) poolSize += 26;
    if (/[A-Z]/.test(password)) poolSize += 26;
    if (/[0-9]/.test(password)) poolSize += 10;
    if (/[^a-zA-Z0-9]/.test(password)) poolSize += 33;

    const entropy = Math.round(password.length * (poolSize > 0 ? Math.log2(poolSize) : 0));
    const feedback = [];

    if (password.length < 8) {
      feedback.push('Must be at least 8 characters');
    } else if (password.length < 12) {
      feedback.push('12+ characters recommended');
    }

    if (!/[A-Z]/.test(password)) feedback.push('Add uppercase letters');
    if (!/[0-9]/.test(password)) feedback.push('Add numbers');
    if (!/[^a-zA-Z0-9]/.test(password)) feedback.push('Add special symbols');

    let score = 0;
    let label = 'Very Weak';
    let color = '#ef4444'; // Red

    if (entropy >= 80 && password.length >= 14 && feedback.length === 0) {
      score = 100;
      label = 'Very Strong';
      color = '#10b981'; // Emerald
    } else if (entropy >= 60 && password.length >= 12) {
      score = 80;
      label = 'Strong';
      color = '#10b981'; // Green
    } else if (entropy >= 45 && password.length >= 9) {
      score = 60;
      label = 'Moderate';
      color = '#f59e0b'; // Amber
    } else if (entropy >= 28 && password.length >= 6) {
      score = 35;
      label = 'Weak';
      color = '#f97316'; // Orange
    } else {
      score = 15;
      label = 'Very Weak';
      color = '#ef4444'; // Red
    }

    return { score, entropy, label, color, feedback };
  }
}
