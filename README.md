# 🛡️ DashGuard - Firebase Password Manager & Smart Autofill

> **Dashlane-inspired Zero-Knowledge Password Manager with In-Page Autofill & Google Firebase Cloud Database Sync.**

---

## 🌟 Name & Concept: "DashGuard"
We chose the name **DashGuard** (paying homage to Dashlane's speed, convenience, and military-grade defense):
- **Dash**: Fast, frictionless 1-click in-page autofill, instant password generation, and real-time cloud synchronization.
- **Guard**: Zero-Knowledge client-side AES-GCM-256 encryption with PBKDF2 (100,000 iterations). Your Master Password decrypts your credentials locally—neither Google Firebase nor anyone else can read your plaintext data.

---

## 🚀 Key Features

### 1. 🔒 Zero-Knowledge Cryptography (Client-Side)
- Master Password derives an AES-GCM 256-bit cryptographic key using WebCrypto PBKDF2 (SHA-256, 100,000 iterations, 16-byte random salt).
- Sensitive fields (`password`, `notes`) are encrypted locally with a fresh 12-byte initialization vector (IV) per entry.
- Auto-lock timeout resets the session key on inactivity.

### 2. ⚡ Intelligent In-Page Autofill & Form Capture (`content.js`)
- Renders a subtle green DashGuard shield badge inside login, email, and password inputs on any webpage.
- Clicking the badge opens a floating dropdown showing saved credentials for the current domain.
- Automatically fills username & password, triggering React, Vue, and standard DOM events.
- Quick "🔑 Generate Strong Password" button directly inside registration fields.
- Floating "Save to DashGuard?" banner automatically appears when submitting a new password on any website.

### 3. 🛡️ Built-in 2FA / TOTP Authenticator (Dashlane Premium Feature - 100% Free)
- Store TOTP Secret Keys directly inside your logins.
- Live RFC 6238-compliant 6-digit rotating verification codes with a 30-second circular countdown timer ring.
- **Smart 2FA Autofill**: When an OTP / 2FA field (`name="otp"`, `name="2fa"`, `maxlength="6"`) is focused on any website, DashGuard displays a floating 1-click **"Autofill 2FA Code"** chip!
- 1-click copy 2FA codes directly from popup, dropdown, or desktop vault.

### 4. ⚡ Smart Floating In-Field Password Suggestion Pill
- Focusing an empty password or signup input automatically displays a floating neon-emerald pill right below the field:
  `⚡ DashGuard: Generate [Strong Password] (Click to Fill & Confirm)`
- Clicking the pill automatically fills the password into **both** the password input and the "Confirm Password" input!
- Automatically saves to password generation history.

### 5. 🔍 Zero-Knowledge Dark Web & Breach Scanner (k-Anonymity)
- Audits your saved passwords against 10+ billion compromised credentials leaked in public data breaches using the HaveIBeenPwned API.
- **100% Zero-Knowledge Privacy**: Your passwords are never transmitted. Only the first 5 characters of a SHA-1 hash (prefix) are queried; matching is done entirely on your local machine.
- Highlights breached accounts with exact breach counts and 1-click "Change Password" buttons.

### 6. 💳 Digital Wallet: Payment Cards
- Safely store credit & debit cards (Visa, Mastercard, Amex, Discover).
- Realistic gradient card preview with chip illustration, masked card numbers, and 1-click reveal/copy.
- CVV hidden by default with hover/click peek toggle.
- 1-click card autofill on ecommerce checkout pages.

### 7. ⚡ 4-Digit Quick PIN Unlock
- Enables 1-second unlocking with a 4-digit PIN instead of entering a long Master Password on every browser session.

### 8. 🕒 Password Generation History Drawer
- Stores the last 15 generated passwords so you never lose a newly created password.

### 9. 🚀 1-Click "Fill & Submit" Form Submission
- In the in-field dropdown, click "⚡ Log In" to both fill credentials and automatically trigger the form submit button in one action.

---

## ⚙️ Quick Setup (For GitHub Users)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/dashguard.git
   cd dashguard
   ```

2. **Configure Firebase (Zero-Leak Security):**
   Copy the example configuration to `firebase-config.js` (this file is ignored by Git and will never be committed):
   ```bash
   cp firebase-config.example.js firebase-config.js
   ```
   Open `firebase-config.js` and add your Firebase Realtime Database credentials.

3. **Install in Google Chrome:**
   - Open Chrome and navigate to `chrome://extensions`.
   - Enable **Developer mode** (toggle in the top-right).
   - Click **"Load unpacked"** (top-left).
   - Select this folder.
   - Pin **DashGuard** 🛡️ to your Chrome toolbar.

---

## 🧪 Testing Autofill & In-Field Features

1. Start the included local test server:
   ```bash
   node serve-test.js
   ```
2. In Chrome, open:
   ```text
   http://localhost:3000
   ```
   *(Or directly open `test-autofill.html` in your browser)*
3. First, click the DashGuard icon in your toolbar to set your **Master Password**.
4. Test all forms on the playground:
   - **Sign In Form:** Click the green shield inside the field for 1-click autofill & submit.
   - **Create Account Form:** Focus the password field to see DashGuard's floating Smart Generator Pill.
   - **Payment Checkout:** 1-click autofill of credit/debit cards.
   - **2FA / OTP Form:** Floating 1-click 6-digit TOTP code autofill.

---

## 📂 Repository File Structure

```text
├── manifest.json             # Manifest V3 extension configuration
├── background.js            # Background service worker (shortcuts, messaging)
├── content.js               # In-field shield, smart generator pill, autofill dropdown
├── content.css              # Cyber-emerald scoped in-page styling
├── firebase-config.js       # YOUR real Firebase credentials (ignored by Git)
├── firebase-config.example.js # Safe template committed to Git
├── firebase.js              # Safe loader for Firebase config
├── .gitignore               # Strict leak-prevention rules
├── LICENSE                  # MIT License
├── README.md                # Comprehensive documentation
├── test-autofill.html       # Live test playground
├── serve-test.js            # Node test server
├── icons/                   # Chrome extension PNG icons (16, 48, 128px)
├── lib/
│   ├── crypto-vault.js      # AES-GCM-256 + PBKDF2 zero-knowledge encryption
│   ├── firebase-client.js   # Firebase Realtime Database sync engine
│   ├── totp.js              # RFC 6238 2FA / TOTP Authenticator engine
│   ├── breach-scanner.js    # HaveIBeenPwned k-anonymity dark web scanner
│   └── vault-store.js       # Local caching, master pass, CRUD, PIN, history
├── popup/
│   ├── popup.html           # Toolbar popup UI (PIN, logins, cards, 2FA, health)
│   ├── popup.css            # Dark glassmorphic styling
│   └── popup.js             # Toolbar popup controller
└── vault/
    ├── vault.html           # Full-screen desktop vault dashboard
    ├── vault.css            # Desktop dashboard styles
    └── vault.js             # Desktop dashboard controller
```
