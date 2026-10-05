/**
 * DashGuard Permanent Firebase Realtime Database Client
 * Dedicated direct connection for single-user personal password management.
 * Permanently connected to Firebase Realtime Database.
 */

import { firebaseConfig as activeConfig } from '../firebase-config.js';

export const FIREBASE_CONFIG = activeConfig;

export class FirebaseClient {
  constructor(config = FIREBASE_CONFIG) {
    this.config = config || {};
    this.dbEndpoint = this.config.databaseURL ? `${this.config.databaseURL}/dashguard.json` : '';
    this.authToken = null;
  }

  /**
   * Internal helper: Authenticate if needed
   */
  async getAuthToken() {
    if (this.authToken) return this.authToken;

    // Check cached token in chrome.storage.local
    const cached = await chrome.storage.local.get('dg_firebase_token');
    if (cached.dg_firebase_token && cached.dg_firebase_token.expiresAt > Date.now()) {
      this.authToken = cached.dg_firebase_token.idToken;
      return this.authToken;
    }
    return null;
  }

  /**
   * Fetch complete vault from Firebase Realtime Database
   * @returns {Promise<{ masterPassword?: string, logins: Array, notes: Array, updatedAt?: number } | null>}
   */
  async fetchVault() {
    try {
      // 1. Try direct fetch (when rules are read: true)
      let resp = await fetch(this.dbEndpoint);

      // 2. If 401 Permission denied, retry with background auth token
      if (resp.status === 401) {
        const token = await this.getAuthToken();
        if (token) {
          resp = await fetch(`${this.dbEndpoint}?auth=${token}`);
        }
      }

      if (!resp.ok) {
        if (resp.status === 401) {
          throw new Error('PERMISSION_DENIED');
        }
        throw new Error(`Database error (${resp.status}): ${resp.statusText}`);
      }

      const data = await resp.json();
      if (!data) {
        return { masterPassword: '', logins: [], notes: [], updatedAt: Date.now() };
      }

      // Convert logins object to array if needed
      let logins = [];
      if (Array.isArray(data.logins)) {
        logins = data.logins;
      } else if (data.logins && typeof data.logins === 'object') {
        logins = Object.values(data.logins);
      }

      let notes = [];
      if (Array.isArray(data.notes)) {
        notes = data.notes;
      } else if (data.notes && typeof data.notes === 'object') {
        notes = Object.values(data.notes);
      }

      return {
        masterPassword: data.masterPassword || '',
        logins,
        notes,
        updatedAt: data.updatedAt || Date.now()
      };
    } catch (err) {
      console.warn('Firebase fetchVault error:', err);
      throw err;
    }
  }

  /**
   * Persist complete vault directly into Firebase Realtime Database
   * @param {Object} vaultData { masterPassword, logins, notes }
   * @returns {Promise<boolean>}
   */
  async saveVault(vaultData) {
    const payload = {
      masterPassword: vaultData.masterPassword || '',
      logins: vaultData.logins || [],
      notes: vaultData.notes || [],
      updatedAt: Date.now()
    };

    try {
      // 1. Try direct write
      let resp = await fetch(this.dbEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // 2. If 401 Permission denied, retry with auth token
      if (resp.status === 401) {
        const token = await this.getAuthToken();
        if (token) {
          resp = await fetch(`${this.dbEndpoint}?auth=${token}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
      }

      if (!resp.ok) {
        if (resp.status === 401) {
          throw new Error('PERMISSION_DENIED');
        }
        throw new Error(`Database save error (${resp.status}): ${resp.statusText}`);
      }

      return true;
    } catch (err) {
      console.warn('Firebase saveVault error:', err);
      throw err;
    }
  }
}
