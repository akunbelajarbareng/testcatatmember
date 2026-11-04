/**
 * firebase-client.ts — Modular Firebase Web SDK Singleton
 * Digunakan untuk React + Vite (Pure Client SPA)
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyOrientalCrmDefaultWebKey',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'oriental-crm-221e3.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'oriental-crm-221e3',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'oriental-crm-221e3.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1029384756',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1029384756:web:abcdef123456',
};

const app: FirebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(app);

export const COLLECTIONS = {
  IDENTITIES: 'identities',
  OUTLETS: 'outlets',
  POS_ALIASES: 'pos_aliases',
  IMPORT_BATCHES: 'import_batches',
  INVOICES: 'invoices',
  EXCLUSIONS: 'exclusions',
  STATEMENTS: 'statements',
  RULES_CONFIG: 'rules_config',
  APPROVALS: 'approvals',
  AUDIT_LOG: 'audit_log',
  COUPON_BATCHES: 'coupon_batches',
  COUPONS: 'coupons',
  MEMBER_PENALTIES: 'member_penalties',
  WASTE_PURCHASES: 'waste_purchases',
  APP_USERS: 'app_users',
  APP_SESSIONS: 'app_sessions',
} as const;

export default db;

