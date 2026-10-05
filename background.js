/**
 * DashGuard Background Service Worker (Manifest V3)
 * Handles context menus, keyboard shortcuts (Ctrl+Shift+L),
 * periodic background alarms, and cross-extension messaging.
 */

import { VaultStore } from './lib/vault-store.js';
import { CryptoVault } from './lib/crypto-vault.js';
import { TOTPEngine } from './lib/totp.js';

const vaultStore = new VaultStore();

// Setup extension on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('DashGuard extension installed/updated:', details.reason);

  // Setup Context Menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'dashguard_root',
      title: 'DashGuard Password Manager',
      contexts: ['all']
    });

    chrome.contextMenus.create({
      id: 'dashguard_autofill_now',
      parentId: 'dashguard_root',
      title: '⚡ Autofill Credentials (Ctrl+Shift+L)',
      contexts: ['all']
    });

    chrome.contextMenus.create({
      id: 'dashguard_generate',
      parentId: 'dashguard_root',
      title: '🔑 Generate Strong Password (Copy)',
      contexts: ['all']
    });

    chrome.contextMenus.create({
      id: 'dashguard_open_vault',
      parentId: 'dashguard_root',
      title: '🛡️ Open Full Vault Dashboard',
      contexts: ['all']
    });
  });

  // Setup periodic sync alarm (every 15 mins)
  chrome.alarms.create('dashguard_periodic_sync', {
    periodInMinutes: 15
  });
});

// Keyboard Shortcut: Ctrl+Shift+L (Instant 1-Click Autofill like 1Password/Bitwarden)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick_autofill') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || tab.url?.startsWith('chrome://')) return;

    const logins = await vaultStore.findMatchingLogins(tab.url);
    if (logins.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (cred) => {
          const passInputs = Array.from(document.querySelectorAll('input[type="password"]'));
          const allInputs = Array.from(document.querySelectorAll('input:not([type="password"]):not([type="hidden"])'));

          passInputs.forEach(p => {
            p.value = cred.password;
            p.dispatchEvent(new Event('input', { bubbles: true }));
            p.dispatchEvent(new Event('change', { bubbles: true }));
          });

          if (cred.username) {
            for (const u of allInputs) {
              const str = `${u.name} ${u.id} ${u.placeholder} ${u.type}`.toLowerCase();
              if (str.includes('user') || str.includes('login') || str.includes('email')) {
                u.value = cred.username;
                u.dispatchEvent(new Event('input', { bubbles: true }));
                u.dispatchEvent(new Event('change', { bubbles: true }));
                break;
              }
            }
          }
        },
        args: [logins[0]]
      });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'DashGuard Autofilled',
        message: `Autofilled ${logins[0].username || logins[0].title}`
      });
    }
  }
});

// Context Menu Click Handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'dashguard_autofill_now' && tab?.id) {
    const logins = await vaultStore.findMatchingLogins(tab.url);
    if (logins.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (cred) => {
          const passInputs = Array.from(document.querySelectorAll('input[type="password"]'));
          const allInputs = Array.from(document.querySelectorAll('input:not([type="password"]):not([type="hidden"])'));

          passInputs.forEach(p => {
            p.value = cred.password;
            p.dispatchEvent(new Event('input', { bubbles: true }));
            p.dispatchEvent(new Event('change', { bubbles: true }));
          });

          if (cred.username) {
            for (const u of allInputs) {
              const str = `${u.name} ${u.id} ${u.placeholder} ${u.type}`.toLowerCase();
              if (str.includes('user') || str.includes('login') || str.includes('email')) {
                u.value = cred.username;
                u.dispatchEvent(new Event('input', { bubbles: true }));
                u.dispatchEvent(new Event('change', { bubbles: true }));
                break;
              }
            }
          }
        },
        args: [logins[0]]
      });
    }
  } else if (info.menuItemId === 'dashguard_generate') {
    const password = CryptoVault.generatePassword({ length: 18 });
    
    if (tab && tab.id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (pwd) => {
            navigator.clipboard.writeText(pwd);
          },
          args: [password]
        });

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: 'DashGuard',
          message: 'Strong password generated and copied to clipboard!'
        });
      } catch (err) {
        console.warn('Clipboard write error:', err);
      }
    }
  } else if (info.menuItemId === 'dashguard_open_vault') {
    chrome.runtime.openOptionsPage();
  }
});

// Periodic Alarms Handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dashguard_periodic_sync') {
    try {
      const status = await vaultStore.getStatus();
      if (status.isInitialized && !status.isLocked) {
        await vaultStore.getItems();
        console.log('DashGuard background database check completed.');
      }
    } catch (e) {
      console.warn('Background sync check:', e.message);
    }
  }
});

// Message Listener for Content Scripts & Extension Pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_STATUS': {
          const status = await vaultStore.getStatus();
          sendResponse({ success: true, status });
          break;
        }

        case 'GET_MATCHING_LOGINS': {
          const url = message.url || (sender.tab ? sender.tab.url : '');
          const logins = await vaultStore.findMatchingLogins(url);
          const cards = await vaultStore.getCards();
          sendResponse({ success: true, logins, cards });
          break;
        }

        case 'SAVE_CREDENTIAL': {
          const { website, username, password, title } = message.payload;
          const status = await vaultStore.getStatus();
          if (status.isLocked) {
            sendResponse({ success: false, error: 'Vault is locked. Open DashGuard to unlock.' });
            return;
          }

          const saved = await vaultStore.saveItem({
            title: title || new URL(website).hostname.replace(/^www\./, ''),
            website,
            username,
            password,
            category: 'Personal'
          });

          sendResponse({ success: true, saved });
          break;
        }

        case 'GENERATE_PASSWORD': {
          const password = CryptoVault.generatePassword(message.options || {});
          const strength = CryptoVault.evaluateStrength(password);
          sendResponse({ success: true, password, strength });
          break;
        }

        case 'OPEN_VAULT': {
          chrome.runtime.openOptionsPage();
          sendResponse({ success: true });
          break;
        }

        case 'GET_TOTP': {
          const res = await TOTPEngine.generate(message.secret);
          sendResponse({ success: true, ...res });
          break;
        }

        case 'SAVE_HISTORY': {
          if (message.password) {
            await vaultStore.saveGeneratedPassword(message.password);
          }
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep message channel open for async response
});
