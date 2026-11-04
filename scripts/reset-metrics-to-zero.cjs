/**
 * scripts/reset-metrics-to-zero.cjs
 * 
 * Mengosongkan seluruh data transaksi, kupon undian, riwayat import, waste purchase,
 * dan approval dari database Firebase Firestore & SQLite lokal, sehingga seluruh
 * angka di dashboard mulai dari 0 (fresh start).
 * 
 * Master data yang DIPERTAHANKAN:
 * - identities (Data Member)
 * - outlets (Data Toko/Outlet)
 * - pos_aliases (Pemetaan Nama Kasir ke Outlet)
 * - rules_config (Aturan perhitungan poin & kupon)
 * - app_users & system_auth (Akun login & password Owner)
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function initFirebase() {
  const existingApps = getApps();
  if (existingApps.length > 0) return getFirestore(existingApps[0]);

  const keyPath = path.join(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(keyPath)) {
    const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const app = initializeApp({ credential: cert(sa) });
    return getFirestore(app);
  }

  console.error('❌ serviceAccountKey.json tidak ditemukan.');
  process.exit(1);
}

const TRANSACTION_COLLECTIONS = [
  'invoices',
  'coupons',
  'coupon_batches',
  'waste_purchases',
  'statements',
  'approvals',
  'audit_log',
  'import_batches',
  'member_penalties',
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

async function main() {
  console.log('====================================================');
  console.log('🔄 RESET SELURUH ANGKA & TRANSAKSI KE 0 (FRESH START)');
  console.log('====================================================\n');

  // 1. Backup SQLite sebelum reset
  const dbPath = path.join(process.cwd(), 'data', 'oriental_crm.db');
  if (fs.existsSync(dbPath)) {
    const backupDir = path.join(process.cwd(), 'data', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `oriental_crm_backup_before_zero_reset_${Date.now()}.db`);
    fs.copyFileSync(dbPath, backupFile);
    console.log(`📦 Backup SQLite tersimpan di: ${backupFile}`);

    // Bersihkan tabel transaksi di SQLite
    const sqlite = new Database(dbPath);
    sqlite.pragma('foreign_keys = OFF');
    sqlite.exec(`
      DELETE FROM invoices;
      DELETE FROM coupons;
      DELETE FROM coupon_batches;
      DELETE FROM waste_purchases;
      DELETE FROM statements;
      DELETE FROM approvals;
      DELETE FROM audit_log;
      DELETE FROM import_batches;
      DELETE FROM member_penalties;
      DELETE FROM sqlite_sequence WHERE name IN (
        'invoices', 'coupons', 'coupon_batches', 'waste_purchases',
        'statements', 'approvals', 'audit_log', 'import_batches', 'member_penalties'
      );
    `);
    sqlite.pragma('foreign_keys = ON');
    sqlite.close();
    console.log('✅ Tabel riwayat transaksi di SQLite telah dikosongkan (0 baris).\n');
  }

  // 2. Bersihkan koleksi transaksi di Firebase Firestore
  console.log('🧹 Menghapus riwayat transaksi di Firebase Firestore...');
  const firestore = initFirebase();
  firestore.settings({ ignoreUndefinedProperties: true });

  for (const col of TRANSACTION_COLLECTIONS) {
    try {
      const deleted = await deleteCollection(firestore, col);
      console.log(`   🗑️ Koleksi [${col}]: ${deleted} dokumen dihapus -> SEKARANG 0`);
    } catch (err) {
      console.warn(`   ⚠️ Koleksi [${col}] kendala:`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 SEMUA ANGKA & RIWAYAT TRANSAKSI BERHASIL DIRESET KE 0!');
  console.log('====================================================');
}

main().catch(err => {
  console.error('❌ Gagal mereset transaksi:', err);
  process.exit(1);
});
