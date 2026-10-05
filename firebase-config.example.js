/**
 * DashGuard Firebase Database Configuration (TEMPLATE / EXAMPLE)
 *
 * HOW TO CONFIGURE:
 * 1. Copy this file and rename it to "firebase-config.js":
 *      cp firebase-config.example.js firebase-config.js
 * 2. Replace the placeholder values below with your Firebase Realtime Database project credentials.
 * 3. Never commit "firebase-config.js" with real keys to public repositories.
 */

export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

export default firebaseConfig;
