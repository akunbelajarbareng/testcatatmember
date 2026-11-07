/**
 * firebase.ts — Firebase Admin SDK Singleton Connection
 * Dikelola untuk Next.js Server Components, Server Actions & API Routes.
 */
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, type Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

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
  BACKUPS: 'backups',
  APP_USERS: 'app_users',
  APP_SESSIONS: 'app_sessions',
} as const;

let initializedApp: App | null = null;

export function getFirebaseAdminApp(): App {
  if (initializedApp) return initializedApp;
  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    initializedApp = existingApps[0];
    return initializedApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // 1. Coba inisialisasi dari Environment Variables
  if (projectId && clientEmail && privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
    initializedApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return initializedApp;
  }

  // 2. Coba inisialisasi dari file serviceAccountKey.json lokal jika ada
  const customPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const potentialPaths = [
    customPath ? path.resolve(customPath) : null,
    path.join(process.cwd(), 'serviceAccountKey.json'),
    path.join(process.cwd(), 'serviceAccountKey.json.json'),
    path.join(process.cwd(), 'data', 'serviceAccountKey.json'),
  ].filter(Boolean) as string[];

  try {
    const files = fs.readdirSync(process.cwd());
    for (const f of files) {
      if (f.includes('firebase-adminsdk') && f.endsWith('.json')) {
        potentialPaths.push(path.join(process.cwd(), f));
      }
    }
  } catch {}

  for (const filePath of potentialPaths) {
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const serviceAccount = JSON.parse(fileContent);
        initializedApp = initializeApp({
          credential: cert(serviceAccount),
        });
        return initializedApp;
      } catch (err) {
        console.error(`[Firebase] Gagal membaca service account dari ${filePath}:`, err);
      }
    }
  }

  // Fallback demo/mock agar tidak error saat build atau tanpa config
  console.warn(
    '[Firebase] PERINGATAN: Kredensial Firebase belum terkonfigurasi. Sediakan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY di .env.local atau serviceAccountKey.json.'
  );
  initializedApp = initializeApp({
    projectId: projectId || 'demo-oriental-crm',
  });
  return initializedApp;
}

export function getFirestore(): Firestore {
  const app = getFirebaseAdminApp();
  const db = getAdminFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export const firestore = getFirestore();
export default firestore;
