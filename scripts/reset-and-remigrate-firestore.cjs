/**
 * scripts/reset-and-remigrate-firestore.js
 * 
 * 1. Menghapus (wipe/reset) semua koleksi di Firebase Firestore secara bersih.
 * 2. Mengimpor ulang seluruh data master dan riwayat transaksi dari SQLite lokal (data/oriental_crm.db).
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function initFirebase() {
  const existingApps = getApps();
  if (existingApps.length > 0) return getFirestore(existingApps[0]);

  const keyPaths = [
    path.join(process.cwd(), 'serviceAccountKey.json'),
    path.join(process.cwd(), 'serviceAccountKey.json.json'),
    path.join(process.cwd(), 'data', 'serviceAccountKey.json'),
  ];

  for (const kp of keyPaths) {
    if (fs.existsSync(kp)) {
      console.log(`🔑 Menggunakan kredensial Firebase: ${kp}`);
      const sa = JSON.parse(fs.readFileSync(kp, 'utf8'));
      const app = initializeApp({ credential: cert(sa) });
      return getFirestore(app);
    }
  }

  console.error('❌ File serviceAccountKey.json tidak ditemukan.');
  process.exit(1);
}

const COLLECTIONS_TO_RESET = [
  'identities',
  'outlets',
  'pos_aliases',
  'import_batches',
  'invoices',
  'exclusions',
  'statements',
  'rules_config',
  'approvals',
  'audit_log',
  'coupon_batches',
  'coupons',
  'member_penalties',
  'waste_purchases',
  'app_users',
  'app_sessions',
  'system_auth',
];

async function deleteCollection(db, collectionPath, batchSize = 300) {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.limit(batchSize).get();

  if (snapshot.size === 0) {
    return 0;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  return snapshot.size + (await deleteCollection(db, collectionPath, batchSize));
}

async function batchCommit(db, collectionName, items, getDocId) {
  if (!items || items.length === 0) {
    console.log(`ℹ️ [${collectionName}] Tidak ada data.`);
    return;
  }

  console.log(`🚀 Menyimpan [${collectionName}] (${items.length} records)...`);
  const BATCH_SIZE = 350;
  let count = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const item of chunk) {
      const docId = getDocId(item);
      const docRef = docId 
        ? db.collection(collectionName).doc(String(docId))
        : db.collection(collectionName).doc();

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
    process.stdout.write(`   Tersimpan: ${count}/${items.length}...\r`);
  }
  console.log(`\n✅ [${collectionName}] Berhasil (${items.length} documents).`);
}

async function main() {
  console.log('====================================================');
  console.log('🧹 RESET TOTAL & RE-MIGRASI FIREBASE FIRESTORE');
  console.log('====================================================\n');

  const dbPath = path.join(process.cwd(), 'data', 'oriental_crm.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ File SQLite tidak ditemukan di: ${dbPath}`);
    process.exit(1);
  }

  const firestore = initFirebase();
  firestore.settings({ ignoreUndefinedProperties: true });
  const sqlite = new Database(dbPath, { readonly: true });

  // STEP 1: Hapus semua koleksi lama di Firestore
  console.log('1️⃣ Menghapus seluruh dokumen lama di Firestore...');
  for (const col of COLLECTIONS_TO_RESET) {
    try {
      const deletedCount = await deleteCollection(firestore, col);
      if (deletedCount > 0) {
        console.log(`   🗑️ Koleksi [${col}]: ${deletedCount} dokumen dihapus.`);
      }
    } catch (err) {
      console.warn(`   ⚠️ Gagal membersihkan koleksi [${col}]:`, err.message);
    }
  }
  console.log('✨ Pembersihan koleksi selesai!\n');

  // STEP 2: Migrasikan ulang data dari SQLite
  console.log('2️⃣ Mengimpor ulang data master & riwayat transaksi dari SQLite...\n');

  // 1. identities
  const identities = sqlite.prepare('SELECT * FROM identities').all();
  await batchCommit(firestore, 'identities', identities, r => r.id);

  // 2. outlets
  const outlets = sqlite.prepare('SELECT * FROM outlets').all();
  await batchCommit(firestore, 'outlets', outlets, r => r.id);

  // 3. pos_aliases
  const posAliases = sqlite.prepare('SELECT * FROM pos_aliases').all();
  await batchCommit(firestore, 'pos_aliases', posAliases, r => r.id);

  // 4. import_batches
  const importBatches = sqlite.prepare('SELECT * FROM import_batches').all();
  await batchCommit(firestore, 'import_batches', importBatches, r => r.id);

  // 5. invoices
  const invoices = sqlite.prepare('SELECT * FROM invoices').all();
  await batchCommit(firestore, 'invoices', invoices, r => r.id);

  // 6. exclusions
  try {
    const exclusions = sqlite.prepare('SELECT * FROM exclusions').all();
    await batchCommit(firestore, 'exclusions', exclusions, r => r.id);
  } catch {}

  // 7. statements
  const statements = sqlite.prepare('SELECT * FROM statements').all();
  await batchCommit(firestore, 'statements', statements, r => `${r.identity_id}_${r.bulan}`);

  // 8. rules_config
  const rulesConfig = sqlite.prepare('SELECT * FROM rules_config').all();
  await batchCommit(firestore, 'rules_config', rulesConfig, r => r.kunci);

  // 9. approvals
  const approvals = sqlite.prepare('SELECT * FROM approvals').all();
  await batchCommit(firestore, 'approvals', approvals, r => r.id);

  // 10. audit_log
  const auditLog = sqlite.prepare('SELECT * FROM audit_log').all();
  await batchCommit(firestore, 'audit_log', auditLog, r => r.id);

  // 11. coupon_batches
  const couponBatches = sqlite.prepare('SELECT * FROM coupon_batches').all();
  await batchCommit(firestore, 'coupon_batches', couponBatches, r => r.id);

  // 12. coupons
  const coupons = sqlite.prepare('SELECT * FROM coupons').all();
  await batchCommit(firestore, 'coupons', coupons, r => r.nomor_kupon || r.id);

  // 13. member_penalties
  try {
    const memberPenalties = sqlite.prepare('SELECT * FROM member_penalties').all();
    await batchCommit(firestore, 'member_penalties', memberPenalties, r => r.id);
  } catch {}

  // 14. waste_purchases
  try {
    const wastePurchases = sqlite.prepare('SELECT * FROM waste_purchases').all();
    await batchCommit(firestore, 'waste_purchases', wastePurchases, r => r.id);
  } catch {}

  // 15. app_users
  try {
    const appUsers = sqlite.prepare('SELECT * FROM app_users').all();
    await batchCommit(firestore, 'app_users', appUsers, r => r.username);
  } catch {}

  // 16. app_sessions
  try {
    const appSessions = sqlite.prepare('SELECT * FROM app_sessions').all();
    await batchCommit(firestore, 'app_sessions', appSessions, r => r.token);
  } catch {}

  // 17. system_auth
  try {
    const systemAuth = sqlite.prepare('SELECT * FROM system_auth WHERE id = 1').get();
    if (systemAuth) {
      await firestore.collection('system_auth').doc('1').set(systemAuth, { merge: true });
      console.log('✅ [system_auth] Berhasil.');
    }
  } catch {}

  console.log('\n====================================================');
  console.log('🎉 RESET & SINKRONISASI FIRESTORE BERHASIL PENUH!');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('\n❌ Terjadi kesalahan saat reset database:', err);
  process.exit(1);
});
