/**
 * DashGuard Full-Screen Vault Dashboard Controller
 * Single-User Direct Firebase Database Mode
 */

import { VaultStore } from '../lib/vault-store.js';
import { CryptoVault } from '../lib/crypto-vault.js';
import { TOTPEngine } from '../lib/totp.js';
import { BreachScanner } from '../lib/breach-scanner.js';

const vaultStore = new VaultStore();

let allItems = [];
let allCards = [];
let allNotes = [];
let activeCat = 'all';
let totpInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupModalsAndForms();
  setupGenerator();
  setupCloudAndExport();

  const status = await vaultStore.getStatus();
  if (status.isLocked || !status.isInitialized) {
    alert('Vault is currently locked. Please open DashGuard from your extension toolbar to unlock.');
    window.close();
    return;
  }

  await loadDashboardData();
  startTotpTicker();
});

/**
 * Setup Sidebar Nav switching
 */
function setupNavigation() {
  document.querySelectorAll('.dv-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dv-nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dv-view-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.view);
      if (target) target.classList.add('active');

      if (btn.dataset.view === 'viewCards') renderCards();
      if (btn.dataset.view === 'viewHealth') renderHealth();
      if (btn.dataset.view === 'viewNotes') renderNotes();
      if (btn.dataset.view === 'viewGenerator') triggerGen();
    });
  });

  document.getElementById('btnSidebarLock')?.addEventListener('click', async () => {
    await vaultStore.lock();
    alert('Vault has been locked.');
    window.close();
  });

  // Category filtering
  document.querySelectorAll('.dv-cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.dv-cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeCat = chip.dataset.cat;
      renderLogins(document.getElementById('dvGlobalSearch')?.value || '');
    });
  });

  // Global search
  document.getElementById('dvGlobalSearch')?.addEventListener('input', (e) => {
    renderLogins(e.target.value);
  });
}

/**
 * Load and render data
 */
async function loadDashboardData() {
  try {
    allItems = await vaultStore.getItems();
    allCards = await vaultStore.getCards();
    allNotes = await vaultStore.getNotes();
    renderLogins();
    renderCards();
    renderNotes();
    await renderHealth();
    await updateCloudDetails();
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

/**
 * Render Logins Table
 */
function renderLogins(search = '') {
  const tbody = document.getElementById('dvLoginsTbody');
  const empty = document.getElementById('dvEmptyLogins');
  if (!tbody) return;

  tbody.innerHTML = '';
  const q = search.toLowerCase().trim();

  const filtered = allItems.filter(item => {
    const matchesQ = !q ||
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.username && item.username.toLowerCase().includes(q)) ||
      (item.website && item.website.toLowerCase().includes(q));

    const matchesCat = activeCat === 'all' ? true :
      activeCat === 'favorites' ? !!item.isFavorite :
      item.category === activeCat;

    return matchesQ && matchesCat;
  });

  if (filtered.length === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  filtered.forEach(item => {
    const domain = vaultStore.cleanDomain(item.website || item.title);
    const favUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="dv-item-cell">
          <div class="dv-favicon">
            ${favUrl ? `<img src="${favUrl}" alt="" onerror="this.src=''; this.parentElement.innerText='🔑'">` : '🔑'}
          </div>
          <div>
            <div class="dv-item-title-text">${escapeHtml(item.title)}</div>
            <div class="dv-item-url-text">${escapeHtml(item.website || 'No URL')}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(item.username || '-')}</td>
      <td>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="dv-pass-mask" data-pass="${escapeHtml(item.password)}">••••••••••••</span>
          <button class="dv-act-btn btn-reveal" title="Show/Hide">👁️</button>
        </div>
        ${item.totpSecret ? `
          <div class="dv-totp-badge" data-totp="${escapeHtml(item.totpSecret)}" title="Click to copy 2FA verification code" style="cursor:pointer; margin-top:6px;">
            <span>🛡️ <strong class="totp-val">------</strong></span>
            <span class="totp-timer" style="font-size:10px; opacity:0.8;">30s</span>
          </div>
        ` : ''}
      </td>
      <td><span class="dv-cat-chip" style="font-size:11px; padding:2px 8px;">${escapeHtml(item.category || 'General')}</span></td>
      <td style="color:#94a3b8; font-size:12px;">${item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : 'Recent'}</td>
      <td>
        <div class="dv-action-btns">
          <button class="dv-act-btn btn-copy-pwd" title="Copy Password">🔑 Copy</button>
          <button class="dv-act-btn btn-copy-usr" title="Copy Username">👤</button>
          <button class="dv-act-btn btn-edit-login" title="Edit">✏️</button>
          <button class="dv-act-btn btn-del-login" title="Delete">🗑️</button>
        </div>
      </td>
    `;

    // Reveal toggle
    const mask = tr.querySelector('.dv-pass-mask');
    const btnRev = tr.querySelector('.btn-reveal');
    btnRev.addEventListener('click', () => {
      if (mask.textContent === '••••••••••••') {
        mask.textContent = item.password;
        mask.style.letterSpacing = 'normal';
      } else {
        mask.textContent = '••••••••••••';
        mask.style.letterSpacing = '2px';
      }
    });

    // Copy Password
    tr.querySelector('.btn-copy-pwd').addEventListener('click', () => {
      navigator.clipboard.writeText(item.password);
      showToast('Password copied to clipboard!');
    });

    // Copy Username
    tr.querySelector('.btn-copy-usr').addEventListener('click', () => {
      navigator.clipboard.writeText(item.username);
      showToast('Username copied!');
    });

    // Copy TOTP Code
    const totpBadge = tr.querySelector('.dv-totp-badge');
    if (totpBadge) {
      totpBadge.addEventListener('click', async () => {
        const gen = await TOTPEngine.generate(item.totpSecret);
        if (gen.code && gen.code !== '------') {
          navigator.clipboard.writeText(gen.code);
          showToast(`Copied 2FA Code: ${gen.code}!`);
        }
      });
    }

    // Edit
    tr.querySelector('.btn-edit-login').addEventListener('click', () => openLoginModal(item));

    // Delete
    tr.querySelector('.btn-del-login').addEventListener('click', async () => {
      if (confirm(`Delete "${item.title}"?`)) {
        await vaultStore.deleteItem(item.id);
        showToast('Login deleted from Firebase.');
        await loadDashboardData();
      }
    });

    tbody.appendChild(tr);
  });

  updateAllTotpBadges();
}

/**
 * Live 2FA / TOTP Authenticator Ticker
 */
function startTotpTicker() {
  if (totpInterval) clearInterval(totpInterval);
  totpInterval = setInterval(updateAllTotpBadges, 1000);
}

async function updateAllTotpBadges() {
  const badges = document.querySelectorAll('.dv-totp-badge');
  for (const badge of badges) {
    const secret = badge.dataset.totp;
    if (!secret) continue;
    const res = await TOTPEngine.generate(secret);
    const valEl = badge.querySelector('.totp-val');
    const timerEl = badge.querySelector('.totp-timer');
    if (valEl && res.code) {
      // Split into 3-3 digits for readability: 492 810
      valEl.textContent = `${res.code.slice(0, 3)} ${res.code.slice(3)}`;
    }
    if (timerEl) {
      timerEl.textContent = `${res.remainingSeconds}s`;
      timerEl.style.color = res.remainingSeconds <= 5 ? '#ef4444' : '#10b981';
    }
  }
}

/**
 * Render Notes Grid
 */
function renderNotes() {
  const grid = document.getElementById('dvNotesGrid');
  const empty = document.getElementById('dvEmptyNotes');
  if (!grid) return;

  grid.innerHTML = '';
  if (allNotes.length === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  allNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'dv-note-card';
    card.innerHTML = `
      <div>
        <div class="dv-note-title">${escapeHtml(note.title)}</div>
        <div class="dv-note-body">${escapeHtml(note.notes || '')}</div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:14px; border-top:1px solid rgba(255,255,255,0.06); padding-top:10px;">
        <button class="dv-act-btn btn-copy-n">📋 Copy</button>
        <div style="display:flex; gap:6px;">
          <button class="dv-act-btn btn-edit-n">✏️ Edit</button>
          <button class="dv-act-btn btn-del-n">🗑️ Delete</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-copy-n').addEventListener('click', () => {
      navigator.clipboard.writeText(note.notes);
      showToast('Note content copied!');
    });

    card.querySelector('.btn-edit-n').addEventListener('click', () => openNoteModal(note));

    card.querySelector('.btn-del-n').addEventListener('click', async () => {
      if (confirm(`Delete note "${note.title}"?`)) {
        await vaultStore.deleteNote(note.id);
        showToast('Note deleted.');
        await loadDashboardData();
      }
    });

    grid.appendChild(card);
  });
}

/**
 * Password Health Audit
 */
async function renderHealth() {
  const health = await vaultStore.calculatePasswordHealth();

  document.getElementById('dvHealthScore').textContent = `${health.overallScore}%`;
  document.getElementById('dvHealthPath').setAttribute('stroke-dasharray', `${health.overallScore}, 100`);
  document.getElementById('sidebarHealthBadge').textContent = `${health.overallScore}%`;

  const color = health.overallScore >= 80 ? '#10b981' : health.overallScore >= 50 ? '#f59e0b' : '#ef4444';
  document.getElementById('dvHealthPath').style.stroke = color;

  document.getElementById('dvStatCompromised').textContent = health.compromised.length;
  document.getElementById('dvStatWeak').textContent = health.weak.length;
  document.getElementById('dvStatReused').textContent = health.reused.length;
  document.getElementById('dvStatOld').textContent = health.old.length;

  const listEl = document.getElementById('dvVulnerableList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const issues = [
    ...health.compromised.map(i => ({ ...i, issueLabel: 'High Risk: Commonly Compromised Password' })),
    ...health.weak.map(i => ({ ...i, issueLabel: 'Weak: Low entropy or short length' })),
    ...health.reused.map(i => ({ ...i, issueLabel: 'Reused: Shared across multiple accounts' }))
  ];

  const seen = new Set();
  const uniqueIssues = issues.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  if (uniqueIssues.length === 0) {
    listEl.innerHTML = '<div style="color:#10b981; font-weight:600; padding:12px;">🌟 All stored passwords meet strong security criteria!</div>';
    return;
  }

  uniqueIssues.forEach(item => {
    const row = document.createElement('div');
    row.style.cssText = 'background:#1e293b; padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;';
    row.innerHTML = `
      <div>
        <div style="font-weight:700;">${escapeHtml(item.title)} (${escapeHtml(item.username || 'No user')})</div>
        <div style="font-size:12px; color:#ef4444; margin-top:3px;">⚠️ ${escapeHtml(item.issueLabel)}</div>
      </div>
      <button class="dv-btn-primary btn-fix-vuln" style="padding:6px 12px; font-size:12px;">Change Password</button>
    `;

    row.querySelector('.btn-fix-vuln').addEventListener('click', () => openLoginModal(item));
    listEl.appendChild(row);
  });
}

/**
 * Render Payment Cards (Digital Wallet)
 */
function renderCards() {
  const grid = document.getElementById('dvCardsGrid');
  const empty = document.getElementById('dvEmptyCards');
  if (!grid) return;

  grid.innerHTML = '';
  if (allCards.length === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  allCards.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'dv-paycard';

    // Mask card number: "•••• •••• •••• 1234"
    const rawNum = (card.cardNumber || '').replace(/\s+/g, '');
    const last4 = rawNum.slice(-4) || '••••';
    const masked = `•••• •••• •••• ${last4}`;

    cardEl.innerHTML = `
      <div>
        <div class="dv-paycard-head">
          <div class="dv-paycard-chip"></div>
          <div class="dv-paycard-bank">${escapeHtml(card.bank || 'Debit / Credit')}</div>
          <div class="dv-paycard-type">${detectCardType(rawNum)}</div>
        </div>

        <div class="dv-paycard-number">
          <span class="card-num-text">${masked}</span>
          <button class="dv-act-btn btn-rev-num" title="Reveal / Hide" style="font-size:11px;">👁️</button>
        </div>

        <div class="dv-paycard-foot">
          <div>
            <div class="dv-paycard-label">Cardholder</div>
            <div class="dv-paycard-val">${escapeHtml(card.cardholder || 'VALUED CUSTOMER')}</div>
          </div>
          <div>
            <div class="dv-paycard-label">Expires</div>
            <div class="dv-paycard-val">${escapeHtml(card.expiry || 'MM/YY')}</div>
          </div>
          <div>
            <div class="dv-paycard-label">CVV</div>
            <div class="dv-paycard-val">
              <span class="cvv-text">•••</span>
              <button class="dv-act-btn btn-rev-cvv" style="font-size:10px; padding:2px 4px;">👁️</button>
            </div>
          </div>
        </div>
      </div>

      <div class="dv-paycard-actions">
        <button class="dv-act-btn btn-copy-card" style="flex:1;">📋 Copy Number</button>
        <button class="dv-act-btn btn-copy-cvv">🔒 Copy CVV</button>
        <button class="dv-act-btn btn-edit-card">✏️ Edit</button>
        <button class="dv-act-btn btn-del-card">🗑️</button>
      </div>
    `;

    // Toggle card number reveal
    const numText = cardEl.querySelector('.card-num-text');
    cardEl.querySelector('.btn-rev-num').addEventListener('click', () => {
      if (numText.textContent === masked) {
        numText.textContent = formatCardNumber(rawNum);
      } else {
        numText.textContent = masked;
      }
    });

    // Toggle CVV reveal
    const cvvText = cardEl.querySelector('.cvv-text');
    cardEl.querySelector('.btn-rev-cvv').addEventListener('click', () => {
      if (cvvText.textContent === '•••') {
        cvvText.textContent = card.cvv || '---';
      } else {
        cvvText.textContent = '•••';
      }
    });

    // Copy number
    cardEl.querySelector('.btn-copy-card').addEventListener('click', () => {
      navigator.clipboard.writeText(rawNum);
      showToast('Card number copied to clipboard!');
    });

    // Copy CVV
    cardEl.querySelector('.btn-copy-cvv').addEventListener('click', () => {
      navigator.clipboard.writeText(card.cvv || '');
      showToast('CVV copied!');
    });

    // Edit
    cardEl.querySelector('.btn-edit-card').addEventListener('click', () => openCardModal(card));

    // Delete
    cardEl.querySelector('.btn-del-card').addEventListener('click', async () => {
      if (confirm(`Delete card ending in ${last4}?`)) {
        await vaultStore.deleteCard(card.id);
        showToast('Payment card removed.');
        await loadDashboardData();
      }
    });

    grid.appendChild(cardEl);
  });
}

function detectCardType(number) {
  if (/^4/.test(number)) return 'VISA';
  if (/^5[1-5]/.test(number) || /^2[2-7]/.test(number)) return 'MASTERCARD';
  if (/^3[47]/.test(number)) return 'AMEX';
  if (/^6(?:011|5)/.test(number)) return 'DISCOVER';
  return 'CARD';
}

function formatCardNumber(num) {
  return num.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Modals and Forms
 */
function setupModalsAndForms() {
  document.getElementById('btnAddNewLogin')?.addEventListener('click', () => openLoginModal());
  document.getElementById('btnAddNewCard')?.addEventListener('click', () => openCardModal());
  document.getElementById('btnAddNewNote')?.addEventListener('click', () => openNoteModal());

  document.getElementById('btnDvCloseItemModal')?.addEventListener('click', closeLoginModal);
  document.getElementById('btnDvCancelItem')?.addEventListener('click', closeLoginModal);

  document.getElementById('btnDvCloseCardModal')?.addEventListener('click', closeCardModal);
  document.getElementById('btnDvCancelCard')?.addEventListener('click', closeCardModal);

  document.getElementById('btnDvCloseNoteModal')?.addEventListener('click', closeNoteModal);
  document.getElementById('btnDvCancelNote')?.addEventListener('click', closeNoteModal);

  // Card input auto-formatters
  const numInput = document.getElementById('dvCardNumber');
  numInput?.addEventListener('input', (e) => {
    const clean = e.target.value.replace(/\D/g, '').substring(0, 16);
    e.target.value = clean.replace(/(.{4})/g, '$1 ').trim();
  });

  const expInput = document.getElementById('dvCardExpiry');
  expInput?.addEventListener('input', (e) => {
    let clean = e.target.value.replace(/\D/g, '').substring(0, 4);
    if (clean.length >= 3) {
      clean = clean.substring(0, 2) + '/' + clean.substring(2);
    }
    e.target.value = clean;
  });

  // Dark Web & Data Breach Audit
  document.getElementById('btnRunBreachAudit')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRunBreachAudit');
    const statusEl = document.getElementById('dvBreachStatus');
    const listEl = document.getElementById('dvBreachList');

    btn.disabled = true;
    btn.textContent = '⏳ Scanning Dark Web...';
    statusEl?.classList.remove('hidden');
    if (statusEl) statusEl.textContent = 'Checking passwords against HaveIBeenPwned k-Anonymity API...';
    if (listEl) listEl.innerHTML = '';

    try {
      const breaches = await BreachScanner.auditVault(allItems, (curr, tot) => {
        if (statusEl) statusEl.textContent = `Auditing account ${curr} of ${tot}... (100% private zero-knowledge)`;
      });

      btn.disabled = false;
      btn.textContent = '🛡️ Check Dark Web Breaches';

      if (breaches.length === 0) {
        if (statusEl) statusEl.textContent = 'Scan complete: No breached credentials found!';
        if (listEl) {
          listEl.innerHTML = `
            <div style="background:rgba(16,185,129,0.15); border:1px solid #10b981; color:#10b981; padding:14px; border-radius:8px; font-weight:700;">
              🎉 Excellent! None of your ${allItems.length} vault passwords have appeared in public data breaches.
            </div>
          `;
        }
      } else {
        if (statusEl) statusEl.textContent = `⚠️ Found ${breaches.length} compromised account(s) exposed in data breaches!`;
        if (listEl) {
          listEl.innerHTML = breaches.map(b => `
            <div class="dv-breach-alert">
              <div>
                <strong>${escapeHtml(b.title)}</strong> (${escapeHtml(b.username || 'User')})
                <div style="font-size:11px; margin-top:2px;">Exposed in <strong>${b.breachCount.toLocaleString()}</strong> public data breaches!</div>
              </div>
              <button class="dv-btn-primary btn-fix-breach" data-id="${escapeHtml(b.loginId)}" style="font-size:11px; padding:6px 12px;">Change Password</button>
            </div>
          `).join('');

          listEl.querySelectorAll('.btn-fix-breach').forEach(bBtn => {
            bBtn.addEventListener('click', () => {
              const item = allItems.find(i => i.id === bBtn.dataset.id);
              if (item) openLoginModal(item);
            });
          });
        }
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '🛡️ Check Dark Web Breaches';
      if (statusEl) statusEl.textContent = 'Breach scan error: ' + err.message;
    }
  });

  document.getElementById('btnDvGenInline')?.addEventListener('click', () => {
    const pwd = CryptoVault.generatePassword({ length: 20 });
    document.getElementById('dvItemPassword').value = pwd;
    showToast('Strong password generated!');
  });

  document.getElementById('dvFormItem')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('dvItemId').value;
    const title = document.getElementById('dvItemTitle').value;
    const website = document.getElementById('dvItemUrl').value;
    const username = document.getElementById('dvItemUsername').value;
    const password = document.getElementById('dvItemPassword').value;
    const category = document.getElementById('dvItemCategory').value;
    const totpSecret = document.getElementById('dvItemTotp')?.value.trim() || '';
    const notes = document.getElementById('dvItemNotes').value;

    try {
      await vaultStore.saveItem({ id, title, website, username, password, category, totpSecret, notes });
      closeLoginModal();
      showToast('Saved directly to Firebase!');
      await loadDashboardData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  document.getElementById('dvFormCard')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('dvCardId').value;
    const cardholder = document.getElementById('dvCardHolder').value;
    const cardNumber = document.getElementById('dvCardNumber').value;
    const expiry = document.getElementById('dvCardExpiry').value;
    const cvv = document.getElementById('dvCardCvv').value;
    const bank = document.getElementById('dvCardBank').value;

    try {
      await vaultStore.saveCard({ id, cardholder, cardNumber, expiry, cvv, bank });
      closeCardModal();
      showToast('Payment card saved directly to Firebase!');
      await loadDashboardData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  document.getElementById('dvFormNote')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('dvNoteId').value;
    const title = document.getElementById('dvNoteTitle').value;
    const content = document.getElementById('dvNoteContent').value;

    try {
      await vaultStore.saveNote({ id, title, content });
      closeNoteModal();
      showToast('Secure note saved directly to Firebase.');
      await loadDashboardData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

function openLoginModal(item = null) {
  const modal = document.getElementById('dvModalItem');
  const heading = document.getElementById('dvModalItemHeading');

  if (item) {
    heading.textContent = 'Edit Login';
    document.getElementById('dvItemId').value = item.id;
    document.getElementById('dvItemTitle').value = item.title || '';
    document.getElementById('dvItemUrl').value = item.website || '';
    document.getElementById('dvItemUsername').value = item.username || '';
    document.getElementById('dvItemPassword').value = item.password || '';
    document.getElementById('dvItemCategory').value = item.category || 'General';
    document.getElementById('dvItemTotp').value = item.totpSecret || '';
    document.getElementById('dvItemNotes').value = item.notes || '';
  } else {
    heading.textContent = 'Add Login';
    document.getElementById('dvItemId').value = '';
    document.getElementById('dvItemTitle').value = '';
    document.getElementById('dvItemUrl').value = '';
    document.getElementById('dvItemUsername').value = '';
    document.getElementById('dvItemPassword').value = '';
    document.getElementById('dvItemCategory').value = 'General';
    document.getElementById('dvItemTotp').value = '';
    document.getElementById('dvItemNotes').value = '';
  }

  modal.classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('dvModalItem').classList.add('hidden');
}

function openCardModal(card = null) {
  const modal = document.getElementById('dvModalCard');
  const heading = document.getElementById('dvModalCardHeading');

  if (card) {
    heading.textContent = 'Edit Payment Card';
    document.getElementById('dvCardId').value = card.id;
    document.getElementById('dvCardHolder').value = card.cardholder || '';
    document.getElementById('dvCardNumber').value = card.cardNumber || '';
    document.getElementById('dvCardExpiry').value = card.expiry || '';
    document.getElementById('dvCardCvv').value = card.cvv || '';
    document.getElementById('dvCardBank').value = card.bank || '';
  } else {
    heading.textContent = 'Add Payment Card';
    document.getElementById('dvCardId').value = '';
    document.getElementById('dvCardHolder').value = '';
    document.getElementById('dvCardNumber').value = '';
    document.getElementById('dvCardExpiry').value = '';
    document.getElementById('dvCardCvv').value = '';
    document.getElementById('dvCardBank').value = '';
  }

  modal.classList.remove('hidden');
}

function closeCardModal() {
  document.getElementById('dvModalCard').classList.add('hidden');
}

function openNoteModal(note = null) {
  const modal = document.getElementById('dvModalNote');
  const heading = document.getElementById('dvModalNoteHeading');

  if (note) {
    heading.textContent = 'Edit Note';
    document.getElementById('dvNoteId').value = note.id;
    document.getElementById('dvNoteTitle').value = note.title || '';
    document.getElementById('dvNoteContent').value = note.notes || '';
  } else {
    heading.textContent = 'Add Secure Note';
    document.getElementById('dvNoteId').value = '';
    document.getElementById('dvNoteTitle').value = '';
    document.getElementById('dvNoteContent').value = '';
  }

  modal.classList.remove('hidden');
}

function closeNoteModal() {
  document.getElementById('dvModalNote').classList.add('hidden');
}

/**
 * Generator Tab
 */
function setupGenerator() {
  const lengthInput = document.getElementById('dvGenLength');
  const lengthVal = document.getElementById('dvGenLengthVal');
  lengthInput?.addEventListener('input', () => {
    lengthVal.textContent = lengthInput.value;
    triggerGen();
  });

  ['dvGenUpper', 'dvGenLower', 'dvGenNumbers', 'dvGenSymbols', 'dvGenAmbiguous', 'dvGenWords'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', triggerGen);
  });

  document.getElementById('btnDvRegen')?.addEventListener('click', triggerGen);
  document.getElementById('btnDvCopyPass')?.addEventListener('click', () => {
    const pwd = document.getElementById('dvGenPass').textContent;
    if (pwd) {
      navigator.clipboard.writeText(pwd);
      showToast('Password copied to clipboard!');
    }
  });

  triggerGen();
}

function triggerGen() {
  const isWords = document.getElementById('dvGenWords')?.checked;
  let pwd = '';
  if (isWords) {
    pwd = CryptoVault.generatePassphrase(4, true);
  } else {
    const length = parseInt(document.getElementById('dvGenLength')?.value || '18', 10);
    const uppercase = document.getElementById('dvGenUpper')?.checked;
    const lowercase = document.getElementById('dvGenLower')?.checked;
    const numbers = document.getElementById('dvGenNumbers')?.checked;
    const symbols = document.getElementById('dvGenSymbols')?.checked;
    const excludeAmbiguous = document.getElementById('dvGenAmbiguous')?.checked;
    pwd = CryptoVault.generatePassword({ length, uppercase, lowercase, numbers, symbols, excludeAmbiguous });
  }
  document.getElementById('dvGenPass').textContent = pwd;
}

/**
 * Cloud and Export
 */
function setupCloudAndExport() {
  document.getElementById('btnDvForceSync')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnDvForceSync');
    btn.textContent = '⏳ Refreshing from Firebase...';
    btn.disabled = true;

    try {
      await loadDashboardData();
      showToast('Refreshed from Firebase Database!');
    } catch (e) {
      showToast('Notice: ' + e.message);
    } finally {
      btn.textContent = '☁️ Force Firebase Sync Now';
      btn.disabled = false;
    }
  });

  document.getElementById('btnDvExportJson')?.addEventListener('click', async () => {
    const json = await vaultStore.exportVault('json');
    downloadBlob(json, 'dashguard-vault-backup.json', 'application/json');
  });

  document.getElementById('btnDvExportCsv')?.addEventListener('click', async () => {
    const csv = await vaultStore.exportVault('csv');
    downloadBlob(csv, 'dashguard-logins.csv', 'text/csv');
  });

  const importFile = document.getElementById('dvImportFile');
  document.getElementById('btnDvImportTrigger')?.addEventListener('click', () => importFile.click());
  importFile?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target.result;
        const format = file.name.endsWith('.csv') ? 'csv' : 'json';
        const count = await vaultStore.importVault(content, format);
        showToast(`Imported ${count} items directly to Firebase!`);
        await loadDashboardData();
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

async function updateCloudDetails() {
  const local = await chrome.storage.local.get(['dg_last_cloud_sync']);
  const time = local.dg_last_cloud_sync ? new Date(local.dg_last_cloud_sync).toLocaleTimeString() : 'Never';
  const el = document.getElementById('dvLastSyncTime');
  if (el) el.textContent = time;

  const cfg = vaultStore.firebase?.config || {};
  const projEl = document.getElementById('dvFirebaseProjId');
  if (projEl) projEl.textContent = cfg.projectId || 'Personal Project';
  const urlEl = document.getElementById('dvFirebaseDbUrl');
  if (urlEl) urlEl.textContent = cfg.databaseURL || 'Realtime Database';
  const domEl = document.getElementById('dvFirebaseAuthDomain');
  if (domEl) domEl.textContent = cfg.authDomain || 'firebaseapp.com';
}

function showToast(msg) {
  const toast = document.getElementById('dvToast');
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
