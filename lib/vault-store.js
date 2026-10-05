/**
 * DashGuard Direct Vault Store
 * Supports Logins, Payment Cards, Secure Notes, Quick 4-Digit PIN,
 * Password Generation History, and Firebase Database sync.
 */

import { FirebaseClient } from './firebase-client.js';
import { CryptoVault } from './crypto-vault.js';

export class VaultStore {
  constructor() {
    this.firebase = new FirebaseClient();
    this.isSessionUnlocked = false;
  }

  /**
   * Check status: connects to database, checks master password & quick PIN
   */
  async getStatus() {
    let local = await chrome.storage.local.get(['dg_master_pass', 'dg_logins', 'dg_cards', 'dg_notes', 'dg_quick_pin', 'dg_db_error']);
    let isInitialized = !!local.dg_master_pass;
    let hasQuickPin = !!local.dg_quick_pin;
    let hasDbError = local.dg_db_error || null;

    // Fetch latest from Firebase Database
    try {
      const cloud = await this.firebase.fetchVault();
      if (cloud && cloud.masterPassword) {
        isInitialized = true;
        await chrome.storage.local.set({
          dg_master_pass: cloud.masterPassword,
          dg_logins: cloud.logins || [],
          dg_cards: cloud.cards || local.dg_cards || [],
          dg_notes: cloud.notes || [],
          dg_last_cloud_sync: Date.now(),
          dg_db_error: null
        });
        hasDbError = null;
      }
    } catch (err) {
      if (err.message === 'PERMISSION_DENIED') {
        hasDbError = 'PERMISSION_DENIED';
        await chrome.storage.local.set({ dg_db_error: 'PERMISSION_DENIED' });
      }
    }

    // Check session unlock
    let isLocked = !this.isSessionUnlocked;
    if (this.isSessionUnlocked) {
      isLocked = false;
    } else {
      try {
        const session = await chrome.storage.session?.get(['dg_unlocked']);
        if (session?.dg_unlocked) {
          isLocked = false;
          this.isSessionUnlocked = true;
        }
      } catch (e) {}
    }

    return {
      isInitialized,
      isLocked,
      hasQuickPin,
      hasDbError
    };
  }

  /**
   * Set Master Password
   */
  async initializeVault(masterPassword) {
    if (!masterPassword || masterPassword.length < 4) {
      throw new Error('Master password must be at least 4 characters long.');
    }

    const local = await chrome.storage.local.get(['dg_logins', 'dg_cards', 'dg_notes']);
    const logins = local.dg_logins || [];
    const cards = local.dg_cards || [];
    const notes = local.dg_notes || [];

    try {
      await this.firebase.saveVault({
        masterPassword,
        logins,
        cards,
        notes
      });
      await chrome.storage.local.set({ dg_db_error: null });
    } catch (e) {
      if (e.message === 'PERMISSION_DENIED') {
        await chrome.storage.local.set({ dg_db_error: 'PERMISSION_DENIED' });
      }
    }

    await chrome.storage.local.set({
      dg_master_pass: masterPassword,
      dg_logins: logins,
      dg_cards: cards,
      dg_notes: notes,
      dg_last_cloud_sync: Date.now()
    });

    this.isSessionUnlocked = true;
    await this.setSessionUnlocked(true);
    return true;
  }

  /**
   * Unlock with Master Password
   */
  async unlock(enteredPassword) {
    let masterPass = (await chrome.storage.local.get('dg_master_pass')).dg_master_pass;

    try {
      const cloud = await this.firebase.fetchVault();
      if (cloud && cloud.masterPassword) {
        masterPass = cloud.masterPassword;
        await chrome.storage.local.set({
          dg_master_pass: cloud.masterPassword,
          dg_logins: cloud.logins || [],
          dg_cards: cloud.cards || [],
          dg_notes: cloud.notes || [],
          dg_last_cloud_sync: Date.now(),
          dg_db_error: null
        });
      }
    } catch (e) {}

    if (!masterPass) {
      throw new Error('Vault is not set up.');
    }

    if (enteredPassword !== masterPass) {
      throw new Error('Incorrect Master Password.');
    }

    this.isSessionUnlocked = true;
    await this.setSessionUnlocked(true);
    return true;
  }

  /**
   * Quick 4-Digit PIN Unlock
   */
  async unlockWithPin(enteredPin) {
    const savedPin = (await chrome.storage.local.get('dg_quick_pin')).dg_quick_pin;
    if (!savedPin) {
      throw new Error('No Quick PIN set.');
    }
    if (enteredPin !== savedPin) {
      throw new Error('Incorrect 4-Digit PIN.');
    }

    this.isSessionUnlocked = true;
    await this.setSessionUnlocked(true);
    return true;
  }

  async setQuickPin(pin) {
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 digits (0-9).');
    }
    await chrome.storage.local.set({ dg_quick_pin: pin });
    return true;
  }

  async removeQuickPin() {
    await chrome.storage.local.remove('dg_quick_pin');
  }

  /**
   * Lock vault
   */
  async lock() {
    this.isSessionUnlocked = false;
    await this.setSessionUnlocked(false);
  }

  async setSessionUnlocked(unlocked) {
    try {
      if (chrome.storage.session) {
        await chrome.storage.session.set({
          dg_unlocked: unlocked,
          dg_unlocked_at: unlocked ? Date.now() : 0
        });
      }
    } catch (e) {}
  }

  /**
   * Get all logins
   */
  async getItems() {
    try {
      const cloud = await this.firebase.fetchVault();
      if (cloud) {
        await chrome.storage.local.set({
          dg_master_pass: cloud.masterPassword || (await chrome.storage.local.get('dg_master_pass')).dg_master_pass,
          dg_logins: cloud.logins || [],
          dg_cards: cloud.cards || [],
          dg_notes: cloud.notes || [],
          dg_last_cloud_sync: Date.now(),
          dg_db_error: null
        });
        return cloud.logins || [];
      }
    } catch (e) {}

    const local = await chrome.storage.local.get('dg_logins');
    return local.dg_logins || [];
  }

  /**
   * Save a login credential
   */
  async saveItem(item) {
    const items = await this.getItems();
    const cards = await this.getCards();
    const notes = await this.getNotes();
    const masterPass = (await chrome.storage.local.get('dg_master_pass')).dg_master_pass || '';

    const itemToSave = {
      id: item.id || 'login_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: item.title || 'Untitled Login',
      website: item.website || '',
      username: item.username || '',
      password: item.password || '',
      category: item.category || 'General',
      totpSecret: item.totpSecret || '',
      notes: item.notes || '',
      isFavorite: !!item.isFavorite,
      updatedAt: Date.now(),
      createdAt: item.createdAt || Date.now()
    };

    const index = items.findIndex(i => i.id === itemToSave.id);
    if (index >= 0) {
      items[index] = itemToSave;
    } else {
      items.unshift(itemToSave);
    }

    await chrome.storage.local.set({ dg_logins: items });

    try {
      await this.firebase.saveVault({
        masterPassword: masterPass,
        logins: items,
        cards,
        notes
      });
      await chrome.storage.local.set({ dg_last_cloud_sync: Date.now(), dg_db_error: null });
    } catch (e) {}

    return itemToSave;
  }

  /**
   * Delete a login credential
   */
  async deleteItem(id) {
    let items = await this.getItems();
    const cards = await this.getCards();
    const notes = await this.getNotes();
    const masterPass = (await chrome.storage.local.get('dg_master_pass')).dg_master_pass || '';

    items = items.filter(i => i.id !== id);
    await chrome.storage.local.set({ dg_logins: items });

    try {
      await this.firebase.saveVault({
        masterPassword: masterPass,
        logins: items,
        cards,
        notes
      });
      await chrome.storage.local.set({ dg_last_cloud_sync: Date.now(), dg_db_error: null });
    } catch (e) {}

    return true;
  }

  /**
   * Payment Cards Management (Dashlane Wallet feature)
   */
  async getCards() {
    try {
      const cloud = await this.firebase.fetchVault();
      if (cloud && cloud.cards) {
        await chrome.storage.local.set({ dg_cards: cloud.cards });
        return cloud.cards;
      }
    } catch (e) {}

    const local = await chrome.storage.local.get('dg_cards');
    return local.dg_cards || [];
  }

  async saveCard(card) {
    const items = await this.getItems();
    const cards = await this.getCards();
    const notes = await this.getNotes();
    const masterPass = (await chrome.storage.local.get('dg_master_pass')).dg_master_pass || '';

    const cardToSave = {
      id: card.id || 'card_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      cardholder: card.cardholder || '',
      cardNumber: card.cardNumber || '',
      expiry: card.expiry || '',
      cvv: card.cvv || '',
      bank: card.bank || 'Debit/Credit Card',
      cardType: this.detectCardType(card.cardNumber),
      updatedAt: Date.now()
    };

    const idx = cards.findIndex(c => c.id === cardToSave.id);
    if (idx >= 0) {
      cards[idx] = cardToSave;
    } else {
      cards.unshift(cardToSave);
    }

    await chrome.storage.local.set({ dg_cards: cards });

    try {
      await this.firebase.saveVault({
        masterPassword: masterPass,
        logins: items,
        cards,
        notes
      });
      await chrome.storage.local.set({ dg_last_cloud_sync: Date.now(), dg_db_error: null });
    } catch (e) {}

    return cardToSave;
  }

  async deleteCard(id) {
    const items = await this.getItems();
    let cards = await this.getCards();
    const notes = await this.getNotes();
    const masterPass = (await chrome.storage.local.get('dg_master_pass')).dg_master_pass || '';

    cards = cards.filter(c => c.id !== id);
    await chrome.storage.local.set({ dg_cards: cards });

    try {
      await this.firebase.saveVault({
        masterPassword: masterPass,
        logins: items,
        cards,
        notes
      });
      await chrome.storage.local.set({ dg_last_cloud_sync: Date.now(), dg_db_error: null });
    } catch (e) {}

    return true;
  }

  detectCardType(number = '') {
    const clean = number.replace(/\D/g, '');
    if (/^4/.test(clean)) return 'Visa';
    if (/^5[1-5]/.test(clean)) return 'Mastercard';
    if (/^3[47]/.test(clean)) return 'Amex';
    if (/^6(?:011|5)/.test(clean)) return 'Discover';
    return 'Card';
  }

  /**
   * Secure Notes
   */
  async getNotes() {
    try {
      const cloud = await this.firebase.fetchVault();
      if (cloud && cloud.notes) {
        return cloud.notes;
      }
    } catch (e) {}

    const local = await chrome.storage.local.get('dg_notes');
    return local.dg_notes || [];
  }

  async saveNote(note) {
    const items = await this.getItems();
    const cards = await this.getCards();
    const notes = await this.getNotes();
    const masterPass = (await chrome.storage.local.get('dg_master_pass')).dg_master_pass || '';

    const noteToSave = {
      id: note.id || 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: note.title || 'Untitled Note',
      category: note.category || 'Notes',
      notes: note.content || note.notes || '',
      updatedAt: Date.now(),
      createdAt: note.createdAt || Date.now()
    };

    const index = notes.findIndex(n => n.id === noteToSave.id);
    if (index >= 0) {
      notes[index] = noteToSave;
    } else {
      notes.unshift(noteToSave);
    }

    await chrome.storage.local.set({ dg_notes: notes });

    try {
      await this.firebase.saveVault({
        masterPassword: masterPass,
        logins: items,
        cards,
        notes
      });
      await chrome.storage.local.set({ dg_last_cloud_sync: Date.now(), dg_db_error: null });
    } catch (e) {}

    return noteToSave;
  }

  async deleteNote(id) {
    const items = await this.getItems();
    const cards = await this.getCards();
    let notes = await this.getNotes();
    const masterPass = (await chrome.storage.local.get('dg_master_pass')).dg_master_pass || '';

    notes = notes.filter(n => n.id !== id);
    await chrome.storage.local.set({ dg_notes: notes });

    try {
      await this.firebase.saveVault({
        masterPassword: masterPass,
        logins: items,
        cards,
        notes
      });
      await chrome.storage.local.set({ dg_last_cloud_sync: Date.now(), dg_db_error: null });
    } catch (e) {}

    return true;
  }

  /**
   * Password Generation History (Never lose a generated password)
   */
  async saveGeneratedPassword(pwd) {
    const res = await chrome.storage.local.get('dg_gen_history');
    let history = res.dg_gen_history || [];
    history.unshift({
      password: pwd,
      timestamp: Date.now(),
      strength: CryptoVault.evaluateStrength(pwd).label
    });
    history = history.slice(0, 15); // keep last 15
    await chrome.storage.local.set({ dg_gen_history: history });
    return history;
  }

  async getGeneratedHistory() {
    const res = await chrome.storage.local.get('dg_gen_history');
    return res.dg_gen_history || [];
  }

  /**
   * Update Master Password in Database
   */
  async updateMasterPassword(newPassword) {
    if (!newPassword || newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters long.');
    }

    const items = await this.getItems();
    const cards = await this.getCards();
    const notes = await this.getNotes();

    await this.firebase.saveVault({
      masterPassword: newPassword,
      logins: items,
      cards,
      notes
    });

    await chrome.storage.local.set({
      dg_master_pass: newPassword,
      dg_last_cloud_sync: Date.now(),
      dg_db_error: null
    });

    return true;
  }

  /**
   * Find matching credentials for a given website URL or domain
   */
  async findMatchingLogins(urlOrDomain) {
    if (!urlOrDomain) return [];
    try {
      const items = await this.getItems();
      const cleanTarget = this.cleanDomain(urlOrDomain);

      return items.filter(item => {
        if (!item.website) return false;
        const itemDomain = this.cleanDomain(item.website);
        return itemDomain.includes(cleanTarget) || cleanTarget.includes(itemDomain);
      });
    } catch (e) {
      return [];
    }
  }

  cleanDomain(url) {
    try {
      let host = url;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        host = new URL(url).hostname;
      }
      return host.replace(/^www\./, '').toLowerCase();
    } catch (e) {
      return (url || '').toLowerCase();
    }
  }

  /**
   * Advanced Security Health Audit
   */
  async calculatePasswordHealth() {
    const items = await this.getItems();
    if (items.length === 0) {
      return { overallScore: 100, total: 0, weak: [], reused: [], compromised: [], old: [] };
    }

    const weak = [];
    const reused = [];
    const compromised = [];
    const old = [];
    const passMap = new Map();
    const now = Date.now();
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

    const commonPassList = new Set([
      '123456', 'password', '12345678', 'qwerty', '123456789', '12345', '1234', '111111',
      '1234567', 'dragon', 'welcome', 'admin', 'password1', 'football', 'monkey', 'letmein'
    ]);

    for (const item of items) {
      const pass = item.password || '';

      if (commonPassList.has(pass.toLowerCase())) {
        compromised.push(item);
      }

      const evalRes = CryptoVault.evaluateStrength(pass);
      if (evalRes.score < 60 || pass.length < 8) {
        weak.push({ ...item, strengthScore: evalRes.score, reason: evalRes.feedback[0] || 'Short or weak' });
      }

      if (passMap.has(pass)) {
        passMap.get(pass).push(item);
      } else {
        passMap.set(pass, [item]);
      }

      if (item.updatedAt && (now - item.updatedAt > NINETY_DAYS)) {
        old.push(item);
      }
    }

    for (const [pass, list] of passMap.entries()) {
      if (list.length > 1 && pass.length > 0) {
        reused.push(...list);
      }
    }

    let penalty = (weak.length * 15) + (reused.length * 12) + (compromised.length * 30) + (old.length * 5);
    let overallScore = Math.max(0, Math.min(100, 100 - Math.round(penalty / Math.max(items.length, 1))));

    return { overallScore, total: items.length, weak, reused, compromised, old };
  }

  /**
   * Export
   */
  async exportVault(format = 'json') {
    const items = await this.getItems();
    const cards = await this.getCards();
    const notes = await this.getNotes();

    if (format === 'csv') {
      const headers = ['title', 'website', 'username', 'password', 'category', 'notes'];
      const rows = items.map(i => [
        `"${(i.title || '').replace(/"/g, '""')}"`,
        `"${(i.website || '').replace(/"/g, '""')}"`,
        `"${(i.username || '').replace(/"/g, '""')}"`,
        `"${(i.password || '').replace(/"/g, '""')}"`,
        `"${(i.category || '').replace(/"/g, '""')}"`,
        `"${(i.notes || '').replace(/"/g, '""')}"`
      ]);
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      items,
      cards,
      notes
    }, null, 2);
  }

  /**
   * Import
   */
  async importVault(content, format = 'json') {
    let count = 0;
    if (format === 'json') {
      const data = JSON.parse(content);
      const items = data.items || (Array.isArray(data) ? data : []);
      for (const item of items) {
        if (item.title || item.username || item.password) {
          await this.saveItem(item);
          count++;
        }
      }
    } else {
      const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length > 1) {
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
          if (cols.length >= 4) {
            await this.saveItem({
              title: cols[0],
              website: cols[1],
              username: cols[2],
              password: cols[3],
              category: cols[4] || 'General',
              notes: cols[5] || ''
            });
            count++;
          }
        }
      }
    }
    return count;
  }
}
