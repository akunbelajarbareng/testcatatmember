/**
 * scripts/wipe-firebase-fresh-install.cjs
 * 
 * Melakukan RESET TOTAL Firebase Firestore:
 * 1. Mengosongkan seluruh Member (identities = 0)
 * 2. Mengosongkan seluruh Outlet (outlets = 0)
 * 3. Mengosongkan seluruh Alias Kasir (pos_aliases = 0)
 * 4. Mengosongkan seluruh Transaksi & Invoices (invoices = 0)
 * 5. Mengosongkan seluruh Kupon & Batches (coupons = 0, coupon_batches = 0)
 * 6. Mengosongkan Waste, Statements, Approvals, Audit Log, Sessions
 * 7. Menyisakan dan menyiapkan konfigurasi aturan default (rules_config)
 * 8. Menyiapkan akun login default:
 *    - admin / oriental2026
 *    - kasir / kasir2026
 */

const fs = require('fs');
const path = require('path');
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

const COLLECTIONS_TO_EMPTY = [
  'identities',
  'outlets',
  'pos_aliases',
  'import_batches',
  'invoices',
  'exclusions',
  'statements',
  'approvals',
  'audit_log',
  'coupon_batches',
  'coupons',
  'member_penalties',
  'waste_purchases',
  'app_sessions',
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
  console.log('⚡ RESET TOTAL DATABASE FIREBASE FIRESTORE');
  console.log('====================================================\n');

  const firestore = initFirebase();
  firestore.settings({ ignoreUndefinedProperties: true });

  console.log('1️⃣ Menghapus seluruh data master & transaksi...');
  for (const col of COLLECTIONS_TO_EMPTY) {
    try {
      const deleted = await deleteCollection(firestore, col);
      console.log(`   🗑️ Koleksi [${col}]: ${deleted} dokumen dihapus -> SEKARANG 0`);
    } catch (err) {
      console.warn(`   ⚠️ Koleksi [${col}]:`, err.message);
    }
  }

  console.log('\n2️⃣ Menyiapkan aturan default (rules_config)...');
  const defaultRules = [
    { kunci: 'rate_retail', nilai: 100000, keterangan: 'Rate belanja Lini Retail per 1 poin (Rp 100.000)' },
    { kunci: 'rate_ukm', nilai: 50000, keterangan: 'Rate belanja Lini UKM per 1 poin (Rp 50.000)' },
    { kunci: 'rate_grosir', nilai: 200000, keterangan: 'Rate belanja Lini Grosir per 1 poin (Rp 200.000)' },
    { kunci: 'nilai_kupon', nilai: 150000, keterangan: 'Kelipatan belanja fisik per 1 kupon undian (Rp 150.000)' },
    { kunci: 'waste_rate_poin', nilai: 10000, keterangan: 'Rate pembelian waste per 1 poin (Rp 10.000)' },
  ];

  for (const rule of defaultRules) {
    await firestore.collection('rules_config').doc(rule.kunci).set({
      ...rule,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  }
  console.log('   ✅ Aturan default rules_config tersimpan.');

  console.log('\n3️⃣ Menyiapkan akun pengguna login (app_users & system_auth)...');
  await firestore.collection('app_users').doc('admin').set({
    id: 1,
    username: 'admin',
    nama: 'Administrator (Owner)',
    role: 'admin',
    password: 'oriental2026',
    created_at: new Date().toISOString(),
  }, { merge: true });

  await firestore.collection('app_users').doc('kasir').set({
    id: 2,
    username: 'kasir',
    nama: 'Petugas CRM / Kasir',
    role: 'staff',
    password: 'kasir2026',
    created_at: new Date().toISOString(),
  }, { merge: true });

  await firestore.collection('system_auth').doc('1').set({
    id: 1,
    password: 'oriental2026',
    updated_at: new Date().toISOString(),
  }, { merge: true });
  console.log('   ✅ Akun admin & kasir siap digunakan.');

  console.log('\n====================================================');
  console.log('🎉 FIREBASE FIRESTORE SELESAI DIRESET TOTAL KE 0!');
  console.log('   - Members: 0');
  console.log('   - Outlets: 0');
  console.log('   - Transaksi POS: 0');
  console.log('   - Kupon Undian: 0');
  console.log('   - Akun Admin: Aktif (admin / oriental2026)');
  console.log('====================================================');
}

main().catch(err => {
  console.error('❌ Gagal mereset Firebase:', err);
  process.exit(1);
});
