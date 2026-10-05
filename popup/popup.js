/**
 * DashGuard Pro Popup Application Controller
 * Supports Quick 4-Digit PIN, Payment Cards, Password History, and Live Cloud Sync
 */

import { VaultStore } from '../lib/vault-store.js';
import { CryptoVault } from '../lib/crypto-vault.js';
import { TOTPEngine } from '../lib/totp.js';
import { BreachScanner } from '../lib/breach-scanner.js';

const vaultStore = new VaultStore();

let totpInterval = null;

// DOM View Elements
const viewSetup = document.getElementById('viewSetup');
const viewLocked = document.getElementById('viewLocked');
const viewMain = document.getElementById('viewMain');

let currentLogins = [];
let currentCards = [];
let currentNotes = [];
let activeTabDomain = '';
let activeTabUrl = '';
let activeFilter = 'all';
let enteredPinDigits = '';

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkVaultState();
});

/**
 * Check vault lock status and route to proper view
 */
async function checkVaultState() {
  const status = await vaultStore.getStatus();

  if (!status.isInitialized) {
    showView('setup');
  } else if (status.isLocked) {
    showView('locked', status.hasQuickPin);
  } else {
    showView('main');
    await loadMainData();
  }
}

function showView(view, hasQuickPin = false) {
  viewSetup.classList.add('hidden');
  viewLocked.classList.add('hidden');
  viewMain.classList.add('hidden');

  if (view === 'setup') {
    viewSetup.classList.remove('hidden');
  } else if (view === 'locked') {
    viewLocked.classList.remove('hidden');
    enteredPinDigits = '';
    updatePinDots();

    const boxPin = document.getElementById('boxPinUnlock');
    const boxMaster = document.getElementById('boxMasterPassUnlock');
    const btnSwitchPin = document.getElementById('btnSwitchToPin');
    const subtitle = document.getElementById('lockSubtitle');

    if (hasQuickPin) {
      boxPin.classList.remove('hidden');
      boxMaster.classList.add('hidden');
      btnSwitchPin.classList.remove('hidden');
      if (subtitle) subtitle.textContent = 'Enter your 4-Digit Quick PIN';
    } else {
      boxPin.classList.add('hidden');
      boxMaster.classList.remove('hidden');
      btnSwitchPin.classList.add('hidden');
      if (subtitle) subtitle.textContent = 'Enter your Master Password';
      document.getElementById('unlockPass')?.focus();
    }
  } else if (view === 'main') {
    viewMain.classList.remove('hidden');
  }
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`pdot${i}`);
    if (dot) {
      if (i < enteredPinDigits.length) dot.classList.add('filled');
      else dot.classList.remove('filled');
    }
  }
}

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
  // First-time Setup
  const setupPass = document.getElementById('setupPass');
  setupPass?.addEventListener('input', () => {
    const strength = CryptoVault.evaluateStrength(setupPass.value);
    const fill = document.querySelector('#setupStrengthMeter .dg-strength-fill');
    const label = document.getElementById('setupStrengthLabel');
    if (fill && label) {
      fill.style.width = `${strength.score}%`;
      fill.style.backgroundColor = strength.color;
      label.textContent = `${strength.label} (${strength.entropy} bits entropy)`;
      label.style.color = strength.color;
    }
  });

  document.getElementById('btnInitVault')?.addEventListener('click', async () => {
    const p1 = document.getElementById('setupPass').value;
    const p2 = document.getElementById('setupPassConfirm').value;
    const errEl = document.getElementById('setupError');

    if (!p1 || p1.length < 4) {
      showError(errEl, 'Password must be at least 4 characters.');
      return;
    }
    if (p1 !== p2) {
      showError(errEl, 'Passwords do not match.');
      return;
    }

    try {
      await vaultStore.initializeVault(p1);
      showToast('Vault initialized in Firebase Database!');
      await checkVaultState();
    } catch (e) {
      showError(errEl, e.message);
    }
  });

  // PIN Numpad Clicks
  document.querySelectorAll('.dg-num-btn[data-num]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (enteredPinDigits.length < 4) {
        enteredPinDigits += btn.dataset.num;
        updatePinDots();

        if (enteredPinDigits.length === 4) {
          try {
            await vaultStore.unlockWithPin(enteredPinDigits);
            showToast('Quick PIN Unlocked!');
            await checkVaultState();
          } catch (err) {
            showError(document.getElementById('unlockError'), err.message);
            enteredPinDigits = '';
            setTimeout(updatePinDots, 300);
          }
        }
      }
    });
  });

  document.getElementById('btnPinBackspace')?.addEventListener('click', () => {
    enteredPinDigits = enteredPinDigits.slice(0, -1);
    updatePinDots();
  });

  document.getElementById('btnPinClear')?.addEventListener('click', () => {
    enteredPinDigits = '';
    updatePinDots();
  });

  // Switch between PIN and Master Password
  document.getElementById('btnSwitchToMasterPass')?.addEventListener('click', () => {
    document.getElementById('boxPinUnlock').classList.add('hidden');
    document.getElementById('boxMasterPassUnlock').classList.remove('hidden');
    document.getElementById('unlockPass')?.focus();
  });

  document.getElementById('btnSwitchToPin')?.addEventListener('click', () => {
    document.getElementById('boxPinUnlock').classList.remove('hidden');
    document.getElementById('boxMasterPassUnlock').classList.add('hidden');
  });

  // Master Password Unlock
  const unlockPass = document.getElementById('unlockPass');
  document.getElementById('btnUnlockVault')?.addEventListener('click', handleMasterUnlock);
  unlockPass?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleMasterUnlock();
  });

  async function handleMasterUnlock() {
    const pass = unlockPass.value;
    const errEl = document.getElementById('unlockError');
    if (!pass) return;

    try {
      await vaultStore.unlock(pass);
      unlockPass.value = '';
      errEl.classList.add('hidden');
      await checkVaultState();
    } catch (e) {
      showError(errEl, e.message);
    }
  }

  // Header Actions
  document.getElementById('btnLockVault')?.addEventListener('click', async () => {
    await vaultStore.lock();
    showToast('Vault locked');
    await checkVaultState();
  });

  document.getElementById('btnOpenFullVault')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Tab Navigation
  document.querySelectorAll('.dg-tabs .dg-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.dg-tabs .dg-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dg-tab-panel').forEach(p => p.classList.remove('active'));

      tabBtn.classList.add('active');
      const targetPanel = document.getElementById(tabBtn.dataset.tab);
      if (targetPanel) targetPanel.classList.add('active');

      if (tabBtn.dataset.tab === 'tabGenerator') {
        triggerGenerate();
        renderPasswordHistory();
      }
      if (tabBtn.dataset.tab === 'tabCards') renderCards();
      if (tabBtn.dataset.tab === 'tabHealth') refreshHealthAudit();
      if (tabBtn.dataset.tab === 'tabNotes') renderNotes();
    });
  });

  // Search & Filters
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    renderLogins(e.target.value);
  });

  document.querySelectorAll('.dg-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.dg-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderLogins(document.getElementById('searchInput')?.value || '');
    });
  });

  // Eye toggle buttons
  document.querySelectorAll('.dg-eye-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        if (input.type === 'password') {
          input.type = 'text';
          btn.textContent = '🔒';
        } else {
          input.type = 'password';
          btn.textContent = '👁️';
        }
      }
    });
  });

  // Login Modal
  document.getElementById('btnAddLoginModal')?.addEventListener('click', () => openItemModal());
  document.getElementById('btnCloseItemModal')?.addEventListener('click', closeItemModal);
  document.getElementById('btnCancelItem')?.addEventListener('click', closeItemModal);

  document.getElementById('btnFillCurrentUrl')?.addEventListener('click', () => {
    if (activeTabUrl) {
      document.getElementById('itemUrl').value = activeTabUrl;
      if (!document.getElementById('itemTitle').value) {
        document.getElementById('itemTitle').value = activeTabDomain;
      }
    }
  });

  document.getElementById('btnGenInlinePass')?.addEventListener('click', () => {
    const pwd = CryptoVault.generatePassword({ length: 18 });
    const passInput = document.getElementById('itemPassword');
    passInput.value = pwd;
    passInput.type = 'text';
    vaultStore.saveGeneratedPassword(pwd);
    showToast('Strong password generated!');
  });

  document.getElementById('formItem')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('itemId').value;
    const title = document.getElementById('itemTitle').value;
    const website = document.getElementById('itemUrl').value;
    const username = document.getElementById('itemUsername').value;
    const password = document.getElementById('itemPassword').value;
    const category = document.getElementById('itemCategory').value;
    const totpSecret = document.getElementById('itemTotp')?.value.trim() || '';
    const notes = document.getElementById('itemNotes').value;

    try {
      await vaultStore.saveItem({ id, title, website, username, password, category, totpSecret, notes });
      closeItemModal();
      showToast('Saved to Firebase Database!');
      await loadMainData();
    } catch (err) {
      alert('Error saving login: ' + err.message);
    }
  });

  // Payment Cards Modal
  document.getElementById('btnAddCardModal')?.addEventListener('click', () => openCardModal());
  document.getElementById('btnCloseCardModal')?.addEventListener('click', closeCardModal);
  document.getElementById('btnCancelCard')?.addEventListener('click', closeCardModal);

  document.getElementById('formCard')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cardId').value;
    const bank = document.getElementById('cardBank').value;
    const cardholder = document.getElementById('cardHolder').value;
    const cardNumber = document.getElementById('cardNumber').value;
    const expiry = document.getElementById('cardExpiry').value;
    const cvv = document.getElementById('cardCvv').value;

    try {
      await vaultStore.saveCard({ id, bank, cardholder, cardNumber, expiry, cvv });
      closeCardModal();
      showToast('Payment Card saved to Firebase!');
      await loadMainData();
      renderCards();
    } catch (err) {
      alert('Error saving card: ' + err.message);
    }
  });

  // Generator Controls
  const genLength = document.getElementById('genLength');
  const genLenVal = document.getElementById('genLenVal');
  genLength?.addEventListener('input', () => {
    if (genLenVal) genLenVal.textContent = genLength.value;
    triggerGenerate();
  });

  ['genUpper', 'genLower', 'genNumbers', 'genSymbols', 'genAvoidAmbiguous', 'genPassphrase'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', triggerGenerate);
  });

  document.getElementById('btnRegenerate')?.addEventListener('click', triggerGenerate);
  document.getElementById('btnCopyGen')?.addEventListener('click', async () => {
    const text = document.getElementById('genResult')?.textContent;
    if (text && text !== 'Click Generate') {
      navigator.clipboard.writeText(text);
      await vaultStore.saveGeneratedPassword(text);
      renderPasswordHistory();
      showToast('Copied to clipboard!');
    }
  });

  // Notes Modal
  document.getElementById('btnAddNoteModal')?.addEventListener('click', () => openNoteModal());
  document.getElementById('btnCloseNoteModal')?.addEventListener('click', closeNoteModal);
  document.getElementById('btnCancelNote')?.addEventListener('click', closeNoteModal);

  document.getElementById('formNote')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('noteId').value;
    const title = document.getElementById('noteTitleInput').value;
    const content = document.getElementById('noteContentInput').value;

    try {
      await vaultStore.saveNote({ id, title, content });
      closeNoteModal();
      showToast('Secure note saved.');
      await loadMainData();
      renderNotes();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // Quick 4-Digit PIN Settings
  document.getElementById('btnSaveQuickPin')?.addEventListener('click', async () => {
    const pin = document.getElementById('inputNewQuickPin').value;
    try {
      await vaultStore.setQuickPin(pin);
      document.getElementById('inputNewQuickPin').value = '';
      document.getElementById('btnRemoveQuickPin').classList.remove('hidden');
      showToast('4-Digit Quick PIN enabled!');
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('btnRemoveQuickPin')?.addEventListener('click', async () => {
    await vaultStore.removeQuickPin();
    document.getElementById('btnRemoveQuickPin').classList.add('hidden');
    showToast('Quick PIN removed');
  });

  // Update Master Password
  document.getElementById('btnUpdateMasterPass')?.addEventListener('click', async () => {
    const newPass = document.getElementById('inputNewMasterPass')?.value;
    if (!newPass || newPass.length < 4) {
      alert('Password must be at least 4 characters long.');
      return;
    }

    try {
      await vaultStore.updateMasterPassword(newPass);
      document.getElementById('inputNewMasterPass').value = '';
      showToast('Master password updated in Firebase Database!');
    } catch (e) {
      alert('Could not update: ' + e.message);
    }
  });

  // Refresh
  document.getElementById('btnManualSync')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnManualSync');
    btn.textContent = '⏳ Refreshing...';
    btn.disabled = true;

    try {
      await loadMainData();
      showToast('Refreshed from Firebase Database!');
    } catch (err) {
      showToast('Database notice: ' + err.message);
    } finally {
      btn.textContent = '🔄 Refresh From Database';
      btn.disabled = false;
    }
  });

  // Export / Import
  document.getElementById('btnExportJson')?.addEventListener('click', async () => {
    const data = await vaultStore.exportVault('json');
    downloadBlob(data, 'dashguard-vault-backup.json', 'application/json');
  });

  document.getElementById('btnExportCsv')?.addEventListener('click', async () => {
    const data = await vaultStore.exportVault('csv');
    downloadBlob(data, 'dashguard-logins.csv', 'text/csv');
  });

  const importInput = document.getElementById('importFileInput');
  document.getElementById('btnTriggerImport')?.addEventListener('click', () => importInput.click());
  importInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target.result;
        const format = file.name.endsWith('.csv') ? 'csv' : 'json';
        const count = await vaultStore.importVault(content, format);
        showToast(`Imported ${count} items!`);
        await loadMainData();
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Autofill Current Domain
  document.getElementById('btnAutofillCurrent')?.addEventListener('click', async () => {
    const matches = await vaultStore.findMatchingLogins(activeTabUrl);
    if (matches.length > 0) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
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
          args: [matches[0]]
        });
        showToast(`Autofilled ${matches[0].username || matches[0].title}`);
      }
    }
  });

  // Dark Web Breach Audit Button in Popup
  document.getElementById('btnPopupBreachAudit')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnPopupBreachAudit');
    const statusEl = document.getElementById('popupBreachStatus');
    const listEl = document.getElementById('healthAuditList');

    btn.disabled = true;
    btn.textContent = '⏳ Scanning Dark Web...';
    statusEl?.classList.remove('hidden');
    if (statusEl) statusEl.textContent = 'Zero-knowledge HaveIBeenPwned k-anonymity check...';

    try {
      const breaches = await BreachScanner.auditVault(currentLogins, (curr, tot) => {
        if (statusEl) statusEl.textContent = `Auditing account ${curr} of ${tot}...`;
      });

      btn.disabled = false;
      btn.textContent = '🛡️ Run Live Dark Web Breach Scan (k-Anonymity)';

      if (breaches.length === 0) {
        if (statusEl) statusEl.textContent = '🎉 No passwords appeared in public data breaches!';
        showToast('All passwords clear of breaches!');
      } else {
        if (statusEl) statusEl.textContent = `⚠️ Found ${breaches.length} breached accounts!`;
        if (listEl) {
          breaches.forEach(b => {
            const row = document.createElement('div');
            row.className = 'dg-item-card';
            row.style.border = '1px solid #ef4444';
            row.innerHTML = `
              <div class="dg-item-left">
                <div class="dg-item-info">
                  <div class="dg-item-title">${escapeHtml(b.title)}</div>
                  <div style="font-size:10px; color:#ef4444; font-weight:700;">🚨 Exposed in ${b.breachCount.toLocaleString()} data breaches!</div>
                </div>
              </div>
              <button class="dg-btn-mini btn-fix" style="background:#ef4444; color:#fff;">Change</button>
            `;
            row.querySelector('.btn-fix').addEventListener('click', () => {
              const item = currentLogins.find(i => i.id === b.loginId);
              if (item) openItemModal(item);
            });
            listEl.prepend(row);
          });
        }
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '🛡️ Run Live Dark Web Breach Scan (k-Anonymity)';
      if (statusEl) statusEl.textContent = 'Notice: ' + err.message;
    }
  });
}

/**
 * Load Main Data
 */
async function loadMainData() {
  currentLogins = await vaultStore.getItems();
  currentCards = await vaultStore.getCards();
  currentNotes = await vaultStore.getNotes();

  // Update tab badges
  const bLogins = document.getElementById('badgeLogins');
  const bCards = document.getElementById('badgeCards');
  if (bLogins) bLogins.textContent = currentLogins.length;
  if (bCards) bCards.textContent = currentCards.length;

  const projEl = document.getElementById('popupFirebaseProj');
  if (projEl) projEl.textContent = vaultStore.firebase?.config?.projectId || 'Connected';

  // Check Quick PIN state
  const status = await vaultStore.getStatus();
  const btnRemPin = document.getElementById('btnRemoveQuickPin');
  if (btnRemPin) {
    if (status.hasQuickPin) btnRemPin.classList.remove('hidden');
    else btnRemPin.classList.add('hidden');
  }

  // Detect active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && !tab.url.startsWith('chrome://')) {
      activeTabUrl = tab.url;
      activeTabDomain = vaultStore.cleanDomain(tab.url);
      checkActiveDomainMatches();
    }
  } catch (e) {}

  renderLogins();
  renderCards();
}

/**
 * Active Domain Matches Banner
 */
async function checkActiveDomainMatches() {
  const banner = document.getElementById('currentDomainBanner');
  if (!activeTabDomain) {
    banner.classList.add('hidden');
    return;
  }

  const matches = await vaultStore.findMatchingLogins(activeTabUrl);
  if (matches.length > 0) {
    banner.classList.remove('hidden');
    document.getElementById('currentDomainText').textContent = activeTabDomain;
    document.getElementById('currentDomainMatchText').textContent = `${matches.length} matching login (Ctrl+Shift+L)`;
    const favImg = document.getElementById('domainFavicon');
    favImg.src = `https://www.google.com/s2/favicons?domain=${activeTabDomain}&sz=64`;
  } else {
    banner.classList.add('hidden');
  }
}

/**
 * Render Logins
 */
function renderLogins(searchQuery = '') {
  const listEl = document.getElementById('loginsList');
  const emptyEl = document.getElementById('emptyLogins');
  if (!listEl) return;

  listEl.innerHTML = '';
  const q = searchQuery.toLowerCase().trim();

  const filtered = currentLogins.filter(item => {
    const matchesSearch = !q ||
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.username && item.username.toLowerCase().includes(q)) ||
      (item.website && item.website.toLowerCase().includes(q));

    const matchesCategory =
      activeFilter === 'all' ? true :
      activeFilter === 'favorites' ? !!item.isFavorite :
      item.category === activeFilter;

    return matchesSearch && matchesCategory;
  });

  if (filtered.length === 0) {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  filtered.forEach(item => {
    const domain = vaultStore.cleanDomain(item.website || item.title);
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';

    const card = document.createElement('div');
    card.className = 'dg-item-card';
    card.innerHTML = `
      <div class="dg-item-left">
        <div class="dg-item-favicon">
          ${faviconUrl ? `<img src="${faviconUrl}" alt="" onerror="this.src=''; this.parentElement.innerText='🔑'">` : '🔑'}
        </div>
        <div class="dg-item-info">
          <div class="dg-item-title">${escapeHtml(item.title)}</div>
          <div class="dg-item-user">${escapeHtml(item.username || 'No username')}</div>
          ${item.totpSecret ? `
            <div class="dg-totp-badge" data-totp="${escapeHtml(item.totpSecret)}" title="Click to copy 2FA verification code" style="cursor:pointer; display:inline-flex; align-items:center; gap:5px; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.4); padding:2px 7px; border-radius:5px; margin-top:4px; font-family:monospace; font-size:11px; color:#10b981;">
              <span>🛡️ <strong class="totp-code-val">------</strong></span>
              <span class="totp-code-timer" style="font-size:9px; opacity:0.8;">30s</span>
            </div>
          ` : ''}
        </div>
      </div>
      <div class="dg-item-actions">
        <button class="dg-item-btn btn-copy" title="Copy Password">🔑 Copy</button>
        <button class="dg-item-btn" title="Copy Username">👤</button>
        <button class="dg-item-btn btn-edit" title="Edit">✏️</button>
        <button class="dg-item-btn btn-del" title="Delete">🗑️</button>
      </div>
    `;

    // Copy TOTP Code
    const totpBadge = card.querySelector('.dg-totp-badge');
    if (totpBadge) {
      totpBadge.addEventListener('click', async (e) => {
        e.stopPropagation();
        const gen = await TOTPEngine.generate(item.totpSecret);
        if (gen.code && gen.code !== '------') {
          navigator.clipboard.writeText(gen.code);
          showToast(`Copied 2FA Code: ${gen.code}!`);
        }
      });
    }

    card.querySelector('.btn-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(item.password || '');
      showToast('Password copied!');
    });

    card.querySelector('button[title="Copy Username"]').addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(item.username || '');
      showToast('Username copied!');
    });

    card.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openItemModal(item);
    });

    card.querySelector('.btn-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${item.title}"?`)) {
        await vaultStore.deleteItem(item.id);
        showToast('Login deleted from Firebase');
        await loadMainData();
      }
    });

    listEl.appendChild(card);
  });

  updatePopupTotpBadges();
  startPopupTotpTicker();
}

function startPopupTotpTicker() {
  if (totpInterval) clearInterval(totpInterval);
  totpInterval = setInterval(updatePopupTotpBadges, 1000);
}

async function updatePopupTotpBadges() {
  const badges = document.querySelectorAll('.dg-totp-badge');
  for (const badge of badges) {
    const secret = badge.dataset.totp;
    if (!secret) continue;
    const res = await TOTPEngine.generate(secret);
    const valEl = badge.querySelector('.totp-code-val');
    const timerEl = badge.querySelector('.totp-code-timer');
    if (valEl && res.code) {
      valEl.textContent = `${res.code.slice(0, 3)} ${res.code.slice(3)}`;
    }
    if (timerEl) {
      timerEl.textContent = `${res.remainingSeconds}s`;
      timerEl.style.color = res.remainingSeconds <= 5 ? '#ef4444' : '#10b981';
    }
  }
}

/**
 * Render Payment Cards (Dashlane Wallet)
 */
function renderCards() {
  const listEl = document.getElementById('cardsList');
  const emptyEl = document.getElementById('emptyCards');
  if (!listEl) return;

  listEl.innerHTML = '';
  if (currentCards.length === 0) {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  currentCards.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'dg-payment-card-visual';
    const last4 = (card.cardNumber || '').slice(-4);
    const masked = '•••• •••• •••• ' + (last4 || '••••');

    cardEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="dg-card-brand-badge">${escapeHtml(card.cardType || 'CARD')}</span>
        <span style="font-size:12px; font-weight:700; color:#fff;">${escapeHtml(card.bank || 'Card')}</span>
      </div>
      <div class="dg-card-num-preview">${masked}</div>
      <div class="dg-card-foot-meta">
        <span>${escapeHtml(card.cardholder || 'Cardholder')}</span>
        <span>Exp: ${escapeHtml(card.expiry || '--/--')}</span>
      </div>
      <div style="display:flex; gap:6px; margin-top:10px; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px;">
        <button class="dg-item-btn btn-copy-card" style="flex:1;">💳 Copy Number</button>
        <button class="dg-item-btn btn-copy-cvv">CVV</button>
        <button class="dg-item-btn btn-del-card">🗑️</button>
      </div>
    `;

    cardEl.querySelector('.btn-copy-card').addEventListener('click', () => {
      navigator.clipboard.writeText(card.cardNumber || '');
      showToast('Card number copied!');
    });

    cardEl.querySelector('.btn-copy-cvv').addEventListener('click', () => {
      navigator.clipboard.writeText(card.cvv || '');
      showToast(`CVV: ${card.cvv} copied!`);
    });

    cardEl.querySelector('.btn-del-card').addEventListener('click', async () => {
      if (confirm(`Delete card ending in ${last4}?`)) {
        await vaultStore.deleteCard(card.id);
        showToast('Card removed from Firebase');
        await loadMainData();
        renderCards();
      }
    });

    listEl.appendChild(cardEl);
  });
}

/**
 * Render Notes
 */
function renderNotes() {
  const listEl = document.getElementById('notesList');
  const emptyEl = document.getElementById('emptyNotes');
  if (!listEl) return;

  listEl.innerHTML = '';
  if (currentNotes.length === 0) {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  currentNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'dg-item-card';
    card.innerHTML = `
      <div class="dg-item-left">
        <div class="dg-item-favicon">📝</div>
        <div class="dg-item-info">
          <div class="dg-item-title">${escapeHtml(note.title)}</div>
          <div class="dg-item-user">${escapeHtml(note.notes ? note.notes.substring(0, 30) + '...' : 'Empty')}</div>
        </div>
      </div>
      <div class="dg-item-actions">
        <button class="dg-item-btn btn-copy-note" title="Copy Note Content">📋</button>
        <button class="dg-item-btn btn-edit-note" title="Edit">✏️</button>
        <button class="dg-item-btn btn-del-note" title="Delete">🗑️</button>
      </div>
    `;

    card.querySelector('.btn-copy-note').addEventListener('click', () => {
      navigator.clipboard.writeText(note.notes || '');
      showToast('Note copied!');
    });

    card.querySelector('.btn-edit-note').addEventListener('click', () => openNoteModal(note));

    card.querySelector('.btn-del-note').addEventListener('click', async () => {
      if (confirm(`Delete note "${note.title}"?`)) {
        await vaultStore.deleteNote(note.id);
        showToast('Note deleted');
        await loadMainData();
        renderNotes();
      }
    });

    listEl.appendChild(card);
  });
}

/**
 * Password Generator & History
 */
function triggerGenerate() {
  const isPassphrase = document.getElementById('genPassphrase')?.checked;
  let password = '';

  if (isPassphrase) {
    password = CryptoVault.generatePassphrase(4, true);
  } else {
    const length = parseInt(document.getElementById('genLength')?.value || '16', 10);
    const uppercase = document.getElementById('genUpper')?.checked;
    const lowercase = document.getElementById('genLower')?.checked;
    const numbers = document.getElementById('genNumbers')?.checked;
    const symbols = document.getElementById('genSymbols')?.checked;
    const excludeAmbiguous = document.getElementById('genAvoidAmbiguous')?.checked;

    password = CryptoVault.generatePassword({
      length, uppercase, lowercase, numbers, symbols, excludeAmbiguous
    });
  }

  const resEl = document.getElementById('genResult');
  if (resEl) resEl.textContent = password;

  const evalRes = CryptoVault.evaluateStrength(password);
  const fill = document.getElementById('genStrengthFill');
  const label = document.getElementById('genStrengthLabel');
  const entropy = document.getElementById('genEntropyLabel');

  if (fill) {
    fill.style.width = `${evalRes.score}%`;
    fill.style.backgroundColor = evalRes.color;
  }
  if (label) {
    label.textContent = evalRes.label;
    label.style.color = evalRes.color;
  }
  if (entropy) {
    entropy.textContent = `~${evalRes.entropy} bits entropy`;
  }
}

async function renderPasswordHistory() {
  const listEl = document.getElementById('genHistoryList');
  if (!listEl) return;

  const history = await vaultStore.getGeneratedHistory();
  if (history.length === 0) {
    listEl.innerHTML = '<span style="font-size:11px; color:#64748b;">No recent generated passwords</span>';
    return;
  }

  listEl.innerHTML = '';
  history.forEach(item => {
    const row = document.createElement('div');
    row.className = 'dg-history-item';
    row.innerHTML = `
      <span>${escapeHtml(item.password)}</span>
      <button title="Copy">📋</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      navigator.clipboard.writeText(item.password);
      showToast('Copied from history!');
    });
    listEl.appendChild(row);
  });
}

/**
 * Refresh Security Health Audit
 */
async function refreshHealthAudit() {
  const health = await vaultStore.calculatePasswordHealth();

  document.getElementById('healthScoreText').textContent = `${health.overallScore}%`;
  document.getElementById('healthScoreCircle').setAttribute('stroke-dasharray', `${health.overallScore}, 100`);

  const color = health.overallScore >= 80 ? '#10b981' : health.overallScore >= 50 ? '#f59e0b' : '#ef4444';
  document.getElementById('healthScoreCircle').style.stroke = color;

  document.getElementById('auditWeakCount').textContent = health.weak.length;
  document.getElementById('auditReusedCount').textContent = health.reused.length;
  document.getElementById('auditCompromisedCount').textContent = health.compromised.length;
  document.getElementById('auditOldCount').textContent = health.old.length;

  const listEl = document.getElementById('healthAuditList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const issues = [...health.compromised.map(i => ({ ...i, issueType: 'Breached / Insecure' })),
                  ...health.weak.map(i => ({ ...i, issueType: 'Weak Password' })),
                  ...health.reused.map(i => ({ ...i, issueType: 'Reused on Multiple Sites' }))];

  const seen = new Set();
  const uniqueIssues = issues.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  if (uniqueIssues.length === 0) {
    listEl.innerHTML = '<div style="font-size:12px; color:#10b981; padding:8px;">🎉 Perfect health! All accounts protected.</div>';
    return;
  }

  uniqueIssues.forEach(item => {
    const row = document.createElement('div');
    row.className = 'dg-item-card';
    row.innerHTML = `
      <div class="dg-item-left">
        <div class="dg-item-info">
          <div class="dg-item-title">${escapeHtml(item.title)}</div>
          <div style="font-size:10px; color:#ef4444; font-weight:600;">⚠️ ${escapeHtml(item.issueType)}</div>
        </div>
      </div>
      <button class="dg-btn-mini btn-fix">Fix Now</button>
    `;

    row.querySelector('.btn-fix').addEventListener('click', () => {
      openItemModal(item);
    });

    listEl.appendChild(row);
  });
}

/**
 * Modals
 */
function openItemModal(item = null) {
  const modal = document.getElementById('modalItem');
  const titleEl = document.getElementById('modalItemTitle');

  if (item) {
    titleEl.textContent = 'Edit Login';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemTitle').value = item.title || '';
    document.getElementById('itemUrl').value = item.website || '';
    document.getElementById('itemUsername').value = item.username || '';
    document.getElementById('itemPassword').value = item.password || '';
    document.getElementById('itemCategory').value = item.category || 'General';
    document.getElementById('itemTotp').value = item.totpSecret || '';
    document.getElementById('itemNotes').value = item.notes || '';
  } else {
    titleEl.textContent = 'Add Login';
    document.getElementById('itemId').value = '';
    document.getElementById('itemTitle').value = activeTabDomain || '';
    document.getElementById('itemUrl').value = activeTabUrl || '';
    document.getElementById('itemUsername').value = '';
    document.getElementById('itemPassword').value = '';
    document.getElementById('itemCategory').value = 'General';
    document.getElementById('itemTotp').value = '';
    document.getElementById('itemNotes').value = '';
  }

  modal.classList.remove('hidden');
}

function closeItemModal() {
  document.getElementById('modalItem').classList.add('hidden');
}

function openCardModal() {
  const modal = document.getElementById('modalCard');
  document.getElementById('cardId').value = '';
  document.getElementById('cardBank').value = '';
  document.getElementById('cardHolder').value = '';
  document.getElementById('cardNumber').value = '';
  document.getElementById('cardExpiry').value = '';
  document.getElementById('cardCvv').value = '';
  modal.classList.remove('hidden');
}

function closeCardModal() {
  document.getElementById('modalCard').classList.add('hidden');
}

function openNoteModal(note = null) {
  const modal = document.getElementById('modalNote');
  const titleEl = document.getElementById('modalNoteTitle');

  if (note) {
    titleEl.textContent = 'Edit Note';
    document.getElementById('noteId').value = note.id;
    document.getElementById('noteTitleInput').value = note.title || '';
    document.getElementById('noteContentInput').value = note.notes || '';
  } else {
    titleEl.textContent = 'Add Secure Note';
    document.getElementById('noteId').value = '';
    document.getElementById('noteTitleInput').value = '';
    document.getElementById('noteContentInput').value = '';
  }

  modal.classList.remove('hidden');
}

function closeNoteModal() {
  document.getElementById('modalNote').classList.add('hidden');
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
