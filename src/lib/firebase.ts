import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

interface ExtendedFirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
  firestoreDatabaseId?: string;
}

const config = firebaseConfig as ExtendedFirebaseConfig;

let firestoreInstance: Firestore | null = null;

try {
  const app = getApps().length > 0 ? getApp() : initializeApp(config as any);
  // Support custom databaseId if configured, or default
  if (config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)') {
    firestoreInstance = getFirestore(app, config.firestoreDatabaseId);
  } else {
    firestoreInstance = getFirestore(app);
  }
} catch (err) {
  console.error('Failed to initialize Firebase Firestore:', err);
}

export const db = firestoreInstance as Firestore;
export const isFirebaseConfigured = Boolean(firestoreInstance && config.projectId);
export { firebaseConfig };
