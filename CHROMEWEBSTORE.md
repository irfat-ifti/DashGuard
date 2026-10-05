# Chrome Web Store Listing: DashGuard

## Store Metadata

- **Name**: DashGuard - Firebase Password Manager & Autofill
- **Short Name**: DashGuard
- **Version**: 1.0.0
- **Primary Category**: Productivity
- **Secondary Category**: Privacy & Security
- **Pricing**: Free
- **Language**: English

---

## Detailed Description

### Summary (132 characters max)
Zero-knowledge encrypted password manager with intelligent in-page autofill, password health audit, and Firebase cloud synchronization.

### Detailed Description (Formatted for Store Listing)
DashGuard brings the gold standard of Dashlane-style password management directly to your browser, powered by end-to-end Zero-Knowledge encryption and real-time Firebase Cloud sync.

Take complete control of your digital security:
🔒 **Zero-Knowledge Architecture**: Your Master Password derives a military-grade 256-bit AES-GCM encryption key using PBKDF2 with 100,000 iterations. Your passwords are encrypted on your device before touching the cloud. Nobody—not even the database administrators—can ever access your unencrypted vault.

⚡ **Intelligent In-Page Autofill**: Seamlessly detects login, sign-up, and password fields. A subtle DashGuard shield badge appears in your inputs to autofill usernames and passwords in one click.

🛡️ **Password Health & Security Audit**: Real-time vulnerability scanner checks your stored credentials against common compromised passwords, identifies reused passwords, weak lengths, and outdated logins with an actionable security health score.

🔑 **Advanced Password Generator**: Generate ultra-secure passwords (8 to 64 characters) or memorable passphrase strings with real-time entropy calculation.

☁️ **Firebase Cloud Sync**: Automatically backs up and synchronizes your encrypted vault across all your devices using Google Firebase Realtime Database.

📝 **Secure Notes**: Encrypted storage for software licenses, Wi-Fi keys, server credentials, and recovery phrases.

📥 **Export & Import**: Full compatibility with JSON and CSV exports from Dashlane, Bitwarden, 1Password, and Chrome.

---

## Permissions Justification

| Permission | Plain-English Justification for Chrome Web Store Reviewers |
|---|---|
| `storage` | Required to store the locally encrypted vault items, user settings, auto-lock timeouts, and Firebase authentication session tokens. |
| `tabs` | Required to detect the active website domain (e.g. github.com) so DashGuard can instantly recommend and autofill the correct login for that site. |
| `activeTab` | Required to securely inject autofill credentials into form fields on the active webpage upon direct user interaction. |
| `scripting` | Required to autofill login credentials and copy generated passwords to the user's active page upon button press. |
| `clipboardWrite` | Required so users can copy generated passwords and usernames to their clipboard with one click. |
| `notifications` | Required to inform users when a generated password has been created or when passwords have been safely backed up to the cloud. |
| `alarms` | Required to run periodic background synchronization with Firebase Realtime Database to keep the vault up to date. |
| `contextMenus` | Adds a right-click menu item allowing users to instantly generate a strong password on any webpage or open their vault. |
| `host_permissions` (`https://*/*`, `http://*/*`) | Required for the content script to run on websites so it can detect login fields, display the DashGuard autofill icon, and offer to save new credentials. |

---

## Privacy & Data Use Disclosure

- **Does DashGuard collect personally identifiable information (PII)?** No. All passwords, usernames, and notes are encrypted client-side using WebCrypto AES-GCM-256 before any data is stored or transmitted.
- **Is data sold to third parties?** Absolutely not.
- **Where is the data stored?** Locally in Chrome's encrypted sandbox (`chrome.storage.local`) and synchronized in an encrypted blob to the developer's Google Firebase Realtime Database.

---

## Version History

- **v1.0.0** (2026-10-05): Initial production release.
  - Zero-Knowledge WebCrypto PBKDF2 + AES-GCM engine.
  - Dashlane-style dark glassmorphism popup UI and full-screen desktop dashboard.
  - Firebase Realtime Database & Auth REST synchronization.
  - In-page autofill badges and form submit save prompts.
  - Interactive password generator with entropy meter.
  - Security health audit system.
