import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

// In student-app, read from ../firebase-applet-config.json or fallback
let firebaseConfig: any = {
  projectId: "gen-lang-client-0459117571",
  appId: "1:504702168474:web:0ee362a8f3651c1a80de23",
  apiKey: "AIzaSyAbuxaEBpt164ic_8bKCFxPwgn_zLma1bE",
  authDomain: "gen-lang-client-0459117571.firebaseapp.com",
  storageBucket: "gen-lang-client-0459117571.firebasestorage.app",
  messagingSenderId: "504702168474"
};

try {
  // If running in development with parent access
  const dynamicConfig = import.meta.glob('../../firebase-applet-config.json', { eager: true });
  const keys = Object.keys(dynamicConfig);
  if (keys.length > 0 && (dynamicConfig[keys[0]] as any).default) {
    firebaseConfig = (dynamicConfig[keys[0]] as any).default;
  }
} catch {}

let firestoreInstance: Firestore | null = null;

try {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  firestoreInstance = getFirestore(app);
} catch (err) {
  console.warn('Failed to initialize Firebase Firestore in student app:', err);
}

export const db = firestoreInstance as Firestore;
export const isFirebaseConfigured = Boolean(firestoreInstance && firebaseConfig.projectId);
export { firebaseConfig };
