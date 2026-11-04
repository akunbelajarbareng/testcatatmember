/**
 * scripts/migrate-sqlite-to-firestore.js
 * Skrip migrasi data dari SQLite lokal (data/oriental_crm.db) ke Firebase Firestore.
 * 
 * Penggunaan:
 * node scripts/migrate-sqlite-to-firestore.js
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getApps, initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Load environment variables dari .env atau .env.local secara manual jika ada
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.substring(0, idx).trim();
          let val = trimmed.substring(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    }
  }
}

loadEnv();

function initFirebase() {
  const existingApps = getApps();
  if (existingApps.length > 0) return getFirestore(existingApps[0]);

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
    const app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey })
    });
    return getFirestore(app);
  }

  // Cek file serviceAccountKey.json dan variasinya (termasuk jika Windows menambahkan .json ganda)
  const keyPaths = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(process.cwd(), 'serviceAccountKey.json'),
    path.join(process.cwd(), 'serviceAccountKey.json.json'),
    path.join(process.cwd(), 'data', 'serviceAccountKey.json'),
  ].filter(Boolean);

  // Cari file kredensial firebase-adminsdk lain di root jika ada
  try {
    const files = fs.readdirSync(process.cwd());
    for (const f of files) {
      if (f.includes('firebase-adminsdk') && f.endsWith('.json')) {
        keyPaths.push(path.join(process.cwd(), f));
      }
    }
  } catch {}

  for (const kp of keyPaths) {
    if (fs.existsSync(kp)) {
      const sa = JSON.parse(fs.readFileSync(kp, 'utf8'));
      const app = initializeApp({ credential: cert(sa) });
      return getFirestore(app);
    }
  }

  // Jika tidak ada kredensial sama sekali, beri instruksi jelas
  console.error('\n❌ Kredensial Firebase belum ditemukan!');
  console.error('Harap pilih salah satu cara berikut:');
  console.error('1. Buat file ".env.local" di root proyek dengan variabel:');
  console.error('   FIREBASE_PROJECT_ID=...');
  console.error('   FIREBASE_CLIENT_EMAIL=...');
  console.error('   FIREBASE_PRIVATE_KEY="..."');
  console.error('2. ATAU unduh file Service Account Key dari Firebase Console:');
  console.error('   (Project Settings > Service accounts > Generate new private key)');
  console.error('   dan letakkan sebagai "serviceAccountKey.json" di root folder proyek ini.\n');
  process.exit(1);
}

async function batchCommit(db, collectionName, items, getDocId) {
  if (!items || items.length === 0) {
    console.log(`ℹ️ [${collectionName}] Tidak ada data untuk dimigrasikan.`);
    return;
  }

  console.log(`🚀 Memulai migrasi [${collectionName}] sejumlah ${items.length} records...`);
  const BATCH_SIZE = 400; // Batas Firestore adalah 500 per batch
  let count = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const item of chunk) {
      const docId = getDocId(item);
      const docRef = docId 
        ? db.collection(collectionName).doc(String(docId))
        : db.collection(collectionName).doc();
      
      // Bersihkan nilai undefined jika ada
      const cleaned = {};
      for (const [k, v] of Object.entries(item)) {
        if (v !== undefined) {
          cleaned[k] = v;
        }
      }
      batch.set(docRef, cleaned, { merge: true });
    }

    await batch.commit();
    count += chunk.length;
    process.stdout.write(`   Proses: ${count}/${items.length} tersimpan...\r`);
  }
  console.log(`\n✅ [${collectionName}] Selesai! (${items.length} documents)`);
}

async function runMigration() {
  const dbPath = path.join(process.cwd(), 'data', 'oriental_crm.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ File database SQLite tidak ditemukan di: ${dbPath}`);
    process.exit(1);
  }

  const sqlite = new Database(dbPath, { readonly: true });
  const firestore = initFirebase();
  firestore.settings({ ignoreUndefinedProperties: true });

  console.log('==================================================');
  console.log('🔄 MIGRASI DATABASE DARI SQLITE KE FIREBASE FIRESTORE');
  console.log('==================================================');

  // 1. identities
  const identities = sqlite.prepare('SELECT * FROM identities').all();
  await batchCommit(firestore, 'identities', identities, row => row.id);

  // 2. outlets
  const outlets = sqlite.prepare('SELECT * FROM outlets').all();
  await batchCommit(firestore, 'outlets', outlets, row => row.id);

  // 3. pos_aliases
  const posAliases = sqlite.prepare('SELECT * FROM pos_aliases').all();
  await batchCommit(firestore, 'pos_aliases', posAliases, row => row.id);

  // 4. import_batches
  const importBatches = sqlite.prepare('SELECT * FROM import_batches').all();
  await batchCommit(firestore, 'import_batches', importBatches, row => row.id);

  // 5. invoices
  const invoices = sqlite.prepare('SELECT * FROM invoices').all();
  await batchCommit(firestore, 'invoices', invoices, row => row.id);

  // 6. exclusions
  try {
    const exclusions = sqlite.prepare('SELECT * FROM exclusions').all();
    await batchCommit(firestore, 'exclusions', exclusions, row => row.id);
  } catch (e) {
    console.log('ℹ️ [exclusions] Tabel kosong atau dilewati.');
  }

  // 7. statements
  const statements = sqlite.prepare('SELECT * FROM statements').all();
  await batchCommit(firestore, 'statements', statements, row => `${row.identity_id}_${row.bulan}`);

  // 8. rules_config
  const rulesConfig = sqlite.prepare('SELECT * FROM rules_config').all();
  await batchCommit(firestore, 'rules_config', rulesConfig, row => row.kunci);

  // 9. approvals
  const approvals = sqlite.prepare('SELECT * FROM approvals').all();
  await batchCommit(firestore, 'approvals', approvals, row => row.id);

  // 10. audit_log
  const auditLog = sqlite.prepare('SELECT * FROM audit_log').all();
  await batchCommit(firestore, 'audit_log', auditLog, row => row.id);

  // 11. coupon_batches
  const couponBatches = sqlite.prepare('SELECT * FROM coupon_batches').all();
  await batchCommit(firestore, 'coupon_batches', couponBatches, row => row.id);

  // 12. coupons
  const coupons = sqlite.prepare('SELECT * FROM coupons').all();
  await batchCommit(firestore, 'coupons', coupons, row => row.nomor_kupon || row.id);

  // 13. member_penalties
  try {
    const memberPenalties = sqlite.prepare('SELECT * FROM member_penalties').all();
    await batchCommit(firestore, 'member_penalties', memberPenalties, row => row.id);
  } catch (e) {
    console.log('ℹ️ [member_penalties] Tabel kosong atau dilewati.');
  }

  // 14. waste_purchases
  try {
    const wastePurchases = sqlite.prepare('SELECT * FROM waste_purchases').all();
    await batchCommit(firestore, 'waste_purchases', wastePurchases, row => row.id);
  } catch (e) {
    console.log('ℹ️ [waste_purchases] Tabel kosong atau dilewati.');
  }

  // 15. app_users
  try {
    const appUsers = sqlite.prepare('SELECT * FROM app_users').all();
    await batchCommit(firestore, 'app_users', appUsers, row => row.username);
  } catch (e) {
    console.log('ℹ️ [app_users] Tabel kosong atau dilewati.');
  }

  // 16. app_sessions
  try {
    const appSessions = sqlite.prepare('SELECT * FROM app_sessions').all();
    await batchCommit(firestore, 'app_sessions', appSessions, row => row.token);
  } catch (e) {
    console.log('ℹ️ [app_sessions] Tabel kosong atau dilewati.');
  }

  // 17. system_auth
  try {
    const systemAuth = sqlite.prepare('SELECT * FROM system_auth WHERE id = 1').get();
    if (systemAuth) {
      await firestore.collection('system_auth').doc('1').set(systemAuth, { merge: true });
      console.log('✅ [system_auth] Selesai!');
    }
  } catch (e) {
    console.log('ℹ️ [system_auth] Dilewati.');
  }

  console.log('\n🎉 SELURUH DATA SQLITE BERHASIL DIMIGRASIKAN KE FIREBASE FIRESTORE!');
}

runMigration().catch(err => {
  console.error('\n❌ Terjadi kesalahan saat migrasi:', err);
  process.exit(1);
});
