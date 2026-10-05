/**
 * DashGuard Zero-Knowledge Dark Web & Password Breach Scanner
 * Utilizes standard k-Anonymity (HaveIBeenPwned API)
 *
 * PRIVACY GUARANTEE:
 * The user's password is NEVER transmitted over the network.
 * Only the first 5 characters of the SHA-1 hash (prefix) are sent.
 * The matching is completed 100% locally in the browser!
 */

export class BreachScanner {
  /**
   * Compute SHA-1 hash of a string in uppercase hex
   */
  static async sha1(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  /**
   * Check a single password against known data breaches
   * @param {string} password
   * @returns {Promise<{ isBreached: boolean, breachCount: number, checked: boolean }>}
   */
  static async checkPassword(password) {
    if (!password) {
      return { isBreached: false, breachCount: 0, checked: false };
    }

    try {
      const sha1Hash = await this.sha1(password);
      const prefix = sha1Hash.substring(0, 5);
      const suffix = sha1Hash.substring(5);

      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        method: 'GET',
        headers: {
          'Add-Padding': 'true' // Prevents response size sniffing
        }
      });

      if (!response.ok) {
        return { isBreached: false, breachCount: 0, checked: false };
      }

      const text = await response.text();
      const lines = text.split('\r\n');

      for (const line of lines) {
        const [hashSuffix, countStr] = line.split(':');
        if (hashSuffix && hashSuffix.toUpperCase() === suffix) {
          const count = parseInt(countStr, 10) || 1;
          return {
            isBreached: true,
            breachCount: count,
            checked: true
          };
        }
      }

      return { isBreached: false, breachCount: 0, checked: true };
    } catch (err) {
      console.warn('Dark web breach check failed:', err);
      return { isBreached: false, breachCount: 0, checked: false };
    }
  }

  /**
   * Audit an entire list of vault logins for breaches
   * @param {Array} logins
   * @param {Function} [onProgress] - callback(current, total, item)
   * @returns {Promise<Array<{ loginId: string, title: string, username: string, isBreached: boolean, breachCount: number }>>}
   */
  static async auditVault(logins, onProgress = null) {
    const results = [];
    const total = logins.length;

    for (let i = 0; i < total; i++) {
      const item = logins[i];
      if (onProgress) {
        onProgress(i + 1, total, item);
      }

      if (item.password) {
        const check = await this.checkPassword(item.password);
        if (check.isBreached) {
          results.push({
            loginId: item.id,
            title: item.title,
            username: item.username,
            website: item.website,
            breachCount: check.breachCount
          });
        }
      }
    }

    return results;
  }
}
