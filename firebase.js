/**
 * Firebase App Initialization loader
 * Imports active user configuration from firebase-config.js (or fallback)
 */

import { firebaseConfig as activeConfig } from "./firebase-config.js";

export const firebaseConfig = activeConfig;
export default firebaseConfig;