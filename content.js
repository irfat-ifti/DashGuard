/**
 * DashGuard Advanced In-Page Content Script
 * - Dashlane-style in-field shield icon with real-time domain account counter
 * - Interactive autofill dropdown with Logins AND Payment Cards
 * - Instant 1-Click "Fill & Submit" form submission
 * - Live inline password strength analyzer as user types
 * - Keyboard shortcut (Ctrl+Shift+L / Cmd+Shift+L) listener
 */

(() => {
  if (window.__dashguard_injected) return;
  window.__dashguard_injected = true;

  const SHIELD_SVG = `<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.66 0 3 1.34 3 3 0 1.13-.63 2.11-1.56 2.62l.56 2.38h-4l.56-2.38A2.99 2.99 0 0 1 9 10c0-1.66 1.34-3 3-3z"/></svg>`;

  let activeDropdown = null;
  let activeInlineStrength = null;
  const attachedInputs = new Map(); // input -> icon element
  let cachedLogins = [];
  let cachedCards = [];

  // Initial fetch of matching logins for this domain
  chrome.runtime.sendMessage({ type: 'GET_MATCHING_LOGINS', url: window.location.href }, (res) => {
    if (res && res.success) {
      cachedLogins = res.logins || [];
      cachedCards = res.cards || [];
      updateAllIcons();
    }
  });

  let activeSmartPill = null;

  /**
   * Scan page and attach in-field shield icons
   */
  function scanAndAttachIcons() {
    const inputs = document.querySelectorAll('input:not([data-dg-attached])');

    inputs.forEach(input => {
      const type = (input.type || '').toLowerCase();
      const isPassword = type === 'password';
      const isUsername = (type === 'email' || type === 'text' || type === 'tel') && isLoginField(input);
      const isCardField = isPaymentField(input);
      const isOtp = isTwoFactorField(input);

      if (isPassword || isUsername || isCardField || isOtp) {
        input.setAttribute('data-dg-attached', 'true');
        attachIconToInput(input, isPassword, isCardField, isOtp);
      }
    });
  }

  function isLoginField(input) {
    const str = `${input.name} ${input.id} ${input.placeholder} ${input.autocomplete} ${input.className}`.toLowerCase();
    return str.includes('user') || str.includes('login') || str.includes('email') ||
           str.includes('account') || str.includes('auth') || str.includes('identifier');
  }

  function isPaymentField(input) {
    const str = `${input.name} ${input.id} ${input.placeholder} ${input.autocomplete}`.toLowerCase();
    return str.includes('card') || str.includes('cc-') || str.includes('cvv') || str.includes('exp');
  }

  function isTwoFactorField(input) {
    const str = `${input.name} ${input.id} ${input.placeholder} ${input.autocomplete}`.toLowerCase();
    return str.includes('otp') || str.includes('2fa') || str.includes('totp') ||
           str.includes('code') || str.includes('token') || str.includes('verify') ||
           input.autocomplete === 'one-time-code';
  }

  /**
   * Attach and position Dashlane-style shield icon inside input field
   */
  function attachIconToInput(input, isPassword = false, isCardField = false, isOtp = false) {
    const icon = document.createElement('div');
    icon.className = 'dg-field-icon';
    icon.title = 'DashGuard - Click to autofill credentials & cards';
    icon.innerHTML = SHIELD_SVG;

    // Show count badge if matching logins exist
    if (cachedLogins.length > 0 && !isCardField) {
      const pill = document.createElement('span');
      pill.className = 'dg-icon-counter';
      pill.textContent = cachedLogins.length;
      icon.appendChild(pill);
    }

    document.body.appendChild(icon);
    attachedInputs.set(input, icon);

    // Padding on input so text doesn't overlap icon
    const currentPad = parseInt(window.getComputedStyle(input).paddingRight, 10) || 0;
    if (currentPad < 34) {
      input.style.paddingRight = '36px';
    }

    updateIconPosition(input, icon);

    // Click icon -> open dropdown
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openAutofillDropdown(input, isCardField ? 'cards' : 'logins');
    });

    // Focus / blur pulse and Smart Pills
    input.addEventListener('focus', () => {
      icon.classList.add('pulse');
      if (isPassword && !input.value) {
        showSmartPasswordPill(input);
      } else if (isOtp) {
        showOtpPill(input);
      }
    });

    input.addEventListener('blur', () => {
      icon.classList.remove('pulse');
      setTimeout(removeInlineStrengthMeter, 200);
      setTimeout(removeSmartPasswordPill, 350);
    });

    // Live password strength indicator while user types in password field
    if (isPassword) {
      input.addEventListener('input', () => {
        showInlineStrengthMeter(input);
        if (input.value) removeSmartPasswordPill();
      });
    }
  }

  /**
   * Smart Password Suggestion Pill (Floating right below input)
   */
  function showSmartPasswordPill(input) {
    if (input.value) return;
    removeSmartPasswordPill();

    chrome.runtime.sendMessage({ type: 'GENERATE_PASSWORD', options: { length: 18 } }, (res) => {
      if (!res || !res.password || !input.isConnected) return;
      const generated = res.password;

      const pill = document.createElement('div');
      pill.className = 'dg-smart-pill';
      pill.innerHTML = `
        <span>⚡ DashGuard: Generate <strong>${escapeHtml(generated.substring(0, 8))}•••</strong></span>
        <button class="dg-pill-btn">Use Strong Password</button>
      `;

      document.body.appendChild(pill);
      activeSmartPill = pill;

      const rect = input.getBoundingClientRect();
      pill.style.top = `${rect.bottom + window.scrollY + 6}px`;
      pill.style.left = `${Math.max(10, rect.left + window.scrollX)}px`;

      pill.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        fillField(input, generated);

        // Find confirm password field in same form/page
        const form = input.form || input.closest('form') || document;
        const otherPass = Array.from(form.querySelectorAll('input[type="password"]')).filter(p => p !== input);
        if (otherPass.length > 0) {
          fillField(otherPass[0], generated);
        }

        navigator.clipboard.writeText(generated);
        chrome.runtime.sendMessage({ type: 'SAVE_HISTORY', password: generated });
        showNotification('Strong password generated & filled!');
        removeSmartPasswordPill();
      });
    });
  }

  /**
   * 2FA / OTP Autofill Pill
   */
  function showOtpPill(input) {
    const loginWithTotp = cachedLogins.find(l => l.totpSecret);
    if (!loginWithTotp) return;

    chrome.runtime.sendMessage({ type: 'GET_TOTP', secret: loginWithTotp.totpSecret }, (res) => {
      if (!res || !res.code || res.code === '------' || !input.isConnected) return;

      removeSmartPasswordPill();
      const pill = document.createElement('div');
      pill.className = 'dg-otp-pill';
      pill.innerHTML = `
        <span>🛡️ DashGuard 2FA: <strong>${res.code.slice(0, 3)} ${res.code.slice(3)}</strong> (${res.remainingSeconds}s)</span>
        <button class="dg-pill-btn" style="background:#38bdf8;">Autofill 2FA</button>
      `;

      document.body.appendChild(pill);
      activeSmartPill = pill;

      const rect = input.getBoundingClientRect();
      pill.style.top = `${rect.bottom + window.scrollY + 6}px`;
      pill.style.left = `${Math.max(10, rect.left + window.scrollX)}px`;

      pill.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        fillField(input, res.code);
        navigator.clipboard.writeText(res.code);
        showNotification(`Autofilled 2FA code: ${res.code}!`);
        removeSmartPasswordPill();
      });
    });
  }

  function removeSmartPasswordPill() {
    if (activeSmartPill) {
      activeSmartPill.remove();
      activeSmartPill = null;
    }
  }

  /**
   * Calculate exact position inside the input
   */
  function updateIconPosition(input, icon) {
    if (!input.isConnected) {
      icon.remove();
      attachedInputs.delete(input);
      return;
    }

    const rect = input.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || input.offsetParent === null) {
      icon.style.display = 'none';
      return;
    }

    icon.style.display = 'flex';
    const iconSize = Math.min(24, Math.max(16, rect.height - 8));
    icon.style.width = `${iconSize}px`;
    icon.style.height = `${iconSize}px`;

    const top = rect.top + window.scrollY + (rect.height - iconSize) / 2;
    const left = rect.left + window.scrollX + rect.width - iconSize - 7;

    icon.style.top = `${top}px`;
    icon.style.left = `${left}px`;
  }

  function updateAllIcons() {
    for (const [input, icon] of attachedInputs.entries()) {
      updateIconPosition(input, icon);
    }
  }

  window.addEventListener('scroll', updateAllIcons, { passive: true });
  window.addEventListener('resize', updateAllIcons, { passive: true });
  setInterval(updateAllIcons, 1000);

  /**
   * Live Inline Strength Meter as user types into password fields
   */
  function showInlineStrengthMeter(input) {
    const val = input.value;
    if (!val) {
      removeInlineStrengthMeter();
      return;
    }

    const rect = input.getBoundingClientRect();
    if (!activeInlineStrength) {
      activeInlineStrength = document.createElement('div');
      activeInlineStrength.className = 'dg-inline-strength';
      document.body.appendChild(activeInlineStrength);
    }

    // Evaluate strength
    let pool = 0;
    if (/[a-z]/.test(val)) pool += 26;
    if (/[A-Z]/.test(val)) pool += 26;
    if (/[0-9]/.test(val)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(val)) pool += 33;
    const entropy = Math.round(val.length * (pool > 0 ? Math.log2(pool) : 0));

    let score = 'Weak';
    let color = '#ef4444';
    let width = '25%';

    if (val.length >= 12 && entropy >= 60) {
      score = 'God-Tier';
      color = '#10b981';
      width = '100%';
    } else if (val.length >= 10 && entropy >= 45) {
      score = 'Strong';
      color = '#10b981';
      width = '75%';
    } else if (val.length >= 7 && entropy >= 28) {
      score = 'Medium';
      color = '#f59e0b';
      width = '50%';
    }

    activeInlineStrength.innerHTML = `
      <div class="dg-inline-bar">
        <div class="dg-inline-bar-fill" style="width: ${width}; background-color: ${color};"></div>
      </div>
      <span style="color: ${color}; font-weight: 700;">${score}</span>
    `;

    activeInlineStrength.style.top = `${rect.bottom + window.scrollY + 4}px`;
    activeInlineStrength.style.left = `${rect.left + window.scrollX}px`;
  }

  function removeInlineStrengthMeter() {
    if (activeInlineStrength) {
      activeInlineStrength.remove();
      activeInlineStrength = null;
    }
  }

  /**
   * Open Dashlane-style floating autofill dropdown (with Logins & Cards tabs)
   */
  async function openAutofillDropdown(targetInput, defaultTab = 'logins') {
    closeDropdown();

    const rect = targetInput.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'dg-dropdown-container';

    const top = rect.bottom + window.scrollY + 6;
    const left = Math.max(10, rect.left + window.scrollX);

    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;

    dropdown.innerHTML = `
      <div class="dg-dropdown-header">
        <div class="dg-dropdown-tabs">
          <button class="dg-dd-tab ${defaultTab === 'logins' ? 'active' : ''}" id="ddTabLogins">🔑 Logins</button>
          <button class="dg-dd-tab ${defaultTab === 'cards' ? 'active' : ''}" id="ddTabCards">💳 Cards</button>
        </div>
        <button class="dg-dropdown-close" id="dgCloseBtn">&times;</button>
      </div>

      <div id="dgListContainer">
        <!-- Logins or Cards -->
      </div>

      <div class="dg-dropdown-footer">
        <button class="dg-action-btn" id="dgGenPassBtn">
          ⚡ Generate Ultra-Strong Password
        </button>
        <button class="dg-action-btn" id="dgOpenVaultBtn" style="border-style: solid; font-size:11px;">
          🛡️ Open DashGuard Vault
        </button>
      </div>
    `;

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    dropdown.querySelector('#dgCloseBtn').addEventListener('click', closeDropdown);

    dropdown.querySelector('#dgOpenVaultBtn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_VAULT' });
      closeDropdown();
    });

    dropdown.querySelector('#dgGenPassBtn').addEventListener('click', async (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'GENERATE_PASSWORD', options: { length: 18 } }, (res) => {
        if (res && res.password) {
          fillField(targetInput, res.password);
          navigator.clipboard.writeText(res.password);
          closeDropdown();
          showNotification('Strong password generated and copied to clipboard!');
        }
      });
    });

    let currentTab = defaultTab;

    function renderTabContent() {
      const container = dropdown.querySelector('#dgListContainer');
      if (!container) return;

      if (currentTab === 'logins') {
        if (!cachedLogins || cachedLogins.length === 0) {
          container.innerHTML = `
            <div class="dg-empty-state">
              No saved logins for this domain.<br/>
              <span style="font-size:11px; color:#10b981; cursor:pointer;" id="dgOpenExtension">Open DashGuard Vault</span>
            </div>
          `;
          container.querySelector('#dgOpenExtension')?.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'OPEN_VAULT' });
            closeDropdown();
          });
          return;
        }

        const list = document.createElement('ul');
        list.className = 'dg-account-list';

        cachedLogins.forEach(login => {
          const li = document.createElement('li');
          li.className = 'dg-account-item';
          li.innerHTML = `
            <div class="dg-acc-info">
              <span class="dg-acc-user">${escapeHtml(login.username || login.title)}</span>
              <span class="dg-acc-site">${escapeHtml(login.title || 'Login')}</span>
            </div>
            <div class="dg-fill-group">
              ${login.totpSecret ? `<button class="dg-acc-fill-btn btn-totp-copy" title="Copy 2FA Verification Code" style="background:rgba(56,189,248,0.18); border-color:#38bdf8; color:#38bdf8;">🛡️ 2FA</button>` : ''}
              <button class="dg-acc-fill-btn btn-just-fill" title="Autofill form">Fill</button>
              <button class="dg-acc-fill-submit btn-fill-submit" title="Autofill and automatically submit">⚡ Log In</button>
            </div>
          `;

          // Copy 2FA Code
          if (login.totpSecret) {
            li.querySelector('.btn-totp-copy')?.addEventListener('click', (e) => {
              e.stopPropagation();
              chrome.runtime.sendMessage({ type: 'GET_TOTP', secret: login.totpSecret }, (res) => {
                if (res && res.code) {
                  navigator.clipboard.writeText(res.code);
                  showNotification(`Copied 2FA Code: ${res.code} (${res.remainingSeconds}s left)!`);
                  closeDropdown();
                }
              });
            });
          }

          // Fill only
          li.querySelector('.btn-just-fill').addEventListener('click', (e) => {
            e.stopPropagation();
            autofillCredentials(login, false);
            closeDropdown();
          });

          // Fill & Submit
          li.querySelector('.btn-fill-submit').addEventListener('click', (e) => {
            e.stopPropagation();
            autofillCredentials(login, true);
            closeDropdown();
          });

          list.appendChild(li);
        });

        container.innerHTML = '';
        container.appendChild(list);
      } else {
        // Cards Tab
        if (!cachedCards || cachedCards.length === 0) {
          container.innerHTML = `
            <div class="dg-empty-state">
              No payment cards saved.<br/>
              <span style="font-size:11px; color:#10b981; cursor:pointer;" id="dgAddCardLink">Add Card in DashGuard</span>
            </div>
          `;
          container.querySelector('#dgAddCardLink')?.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'OPEN_VAULT' });
            closeDropdown();
          });
          return;
        }

        const list = document.createElement('ul');
        list.className = 'dg-account-list';

        cachedCards.forEach(card => {
          const li = document.createElement('li');
          li.className = 'dg-account-item';
          const last4 = (card.cardNumber || '').slice(-4);
          li.innerHTML = `
            <div class="dg-acc-info">
              <span class="dg-acc-user">${escapeHtml(card.bank || 'Card')} •••• ${last4}</span>
              <span class="dg-acc-site">${escapeHtml(card.cardholder || 'Holder')} &bull; Exp: ${card.expiry || '--/--'}</span>
            </div>
            <button class="dg-acc-fill-btn">Autofill</button>
          `;

          li.addEventListener('click', (e) => {
            e.stopPropagation();
            autofillPaymentCard(card);
            closeDropdown();
          });

          list.appendChild(li);
        });

        container.innerHTML = '';
        container.appendChild(list);
      }
    }

    dropdown.querySelector('#ddTabLogins').addEventListener('click', (e) => {
      e.stopPropagation();
      currentTab = 'logins';
      dropdown.querySelector('#ddTabLogins').classList.add('active');
      dropdown.querySelector('#ddTabCards').classList.remove('active');
      renderTabContent();
    });

    dropdown.querySelector('#ddTabCards').addEventListener('click', (e) => {
      e.stopPropagation();
      currentTab = 'cards';
      dropdown.querySelector('#ddTabCards').classList.add('active');
      dropdown.querySelector('#ddTabLogins').classList.remove('active');
      renderTabContent();
    });

    renderTabContent();

    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 10);
  }

  function handleOutsideClick(e) {
    if (activeDropdown && !activeDropdown.contains(e.target) && !e.target.closest('.dg-field-icon')) {
      closeDropdown();
    }
  }

  function closeDropdown() {
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
      document.removeEventListener('click', handleOutsideClick);
    }
  }

  /**
   * Autofill credentials into page inputs with optional Auto-Submit!
   */
  function autofillCredentials(login, autoSubmit = false) {
    const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
    const allInputs = Array.from(document.querySelectorAll('input:not([type="password"]):not([type="hidden"])'));

    let filledForm = null;

    // Fill password field
    passwordInputs.forEach(passInput => {
      if (passInput.offsetParent !== null) {
        fillField(passInput, login.password);
        filledForm = passInput.form || filledForm;
      }
    });

    // Fill username / email field
    if (login.username) {
      for (const input of allInputs) {
        if (isLoginField(input) && input.offsetParent !== null) {
          fillField(input, login.username);
          filledForm = input.form || filledForm;
          break;
        }
      }
    }

    showNotification(`Autofilled ${login.username || login.title}!`);

    // Instant Auto-Submit (Dashlane Power Feature!)
    if (autoSubmit && filledForm) {
      setTimeout(() => {
        const submitBtn = filledForm.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
          submitBtn.click();
        } else {
          filledForm.submit();
        }
      }, 300);
    }
  }

  /**
   * Autofill payment card details (Card Number, Exp, CVV, Name)
   */
  function autofillPaymentCard(card) {
    const inputs = Array.from(document.querySelectorAll('input'));

    inputs.forEach(input => {
      const str = `${input.name} ${input.id} ${input.placeholder} ${input.autocomplete}`.toLowerCase();
      if (str.includes('card') || str.includes('number') || str.includes('cc-number')) {
        fillField(input, card.cardNumber);
      } else if (str.includes('exp') || str.includes('cc-exp')) {
        fillField(input, card.expiry);
      } else if (str.includes('cvv') || str.includes('cvc') || str.includes('code') || str.includes('security')) {
        fillField(input, card.cvv);
      } else if (str.includes('name') || str.includes('holder') || str.includes('cc-name')) {
        fillField(input, card.cardholder);
      }
    });

    showNotification(`Autofilled ${card.bank || 'Payment Card'}!`);
  }

  function fillField(input, value) {
    if (!value) return;
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /**
   * Keyboard Shortcut Listener: Ctrl+Shift+L or Cmd+Shift+L
   */
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      if (cachedLogins.length > 0) {
        autofillCredentials(cachedLogins[0], false);
      }
    }
  });

  /**
   * Form submit detection for saving credentials to Firebase
   */
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;

    const passInput = form.querySelector('input[type="password"]');
    if (!passInput || !passInput.value) return;

    let userInput = form.querySelector('input[type="email"]') ||
                    form.querySelector('input[name*="user" i]') ||
                    form.querySelector('input[name*="email" i]') ||
                    form.querySelector('input[name*="login" i]');

    const username = userInput ? userInput.value : '';
    const password = passInput.value;

    if (password.length >= 4) {
      promptSavePassword({
        website: window.location.href,
        username,
        password,
        title: document.title || window.location.hostname
      });
    }
  }, true);

  /**
   * Floating Save Password banner
   */
  function promptSavePassword(credential) {
    const existing = document.getElementById('dgSaveBanner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'dgSaveBanner';
    banner.className = 'dg-save-banner';
    banner.innerHTML = `
      <div class="dg-save-header">
        <div class="dg-save-brand">
          ${SHIELD_SVG} DashGuard
        </div>
        <button class="dg-dropdown-close" id="dgCloseBanner">&times;</button>
      </div>
      <div class="dg-save-body">
        Would you like to save this password to your DashGuard Firebase Database?
        <div class="dg-save-cred-preview">
          👤 ${escapeHtml(credential.username || 'User')} &bull; 🌐 ${escapeHtml(window.location.hostname || 'Website')}
        </div>
      </div>
      <div class="dg-save-actions">
        <button class="dg-btn-save" id="dgConfirmSave">Save Password</button>
        <button class="dg-btn-cancel" id="dgDismissSave">Never</button>
      </div>
    `;

    document.body.appendChild(banner);

    banner.querySelector('#dgCloseBanner').addEventListener('click', () => banner.remove());
    banner.querySelector('#dgDismissSave').addEventListener('click', () => banner.remove());

    banner.querySelector('#dgConfirmSave').addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'SAVE_CREDENTIAL',
        payload: credential
      }, (res) => {
        banner.remove();
        if (res && res.success) {
          showNotification('Saved directly to Firebase Database!');
        } else {
          showNotification(res?.error || 'Could not save.');
        }
      });
    });

    setTimeout(() => {
      if (banner.isConnected) banner.remove();
    }, 15000);
  }

  function showNotification(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0b132b;
      color: #10b981;
      border: 1.5px solid #10b981;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      z-index: 2147483647;
      box-shadow: 0 4px 15px rgba(0,0,0,0.6);
      font-family: sans-serif;
    `;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
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

  scanAndAttachIcons();
  const observer = new MutationObserver(() => scanAndAttachIcons());
  observer.observe(document.body, { childList: true, subtree: true });
})();
