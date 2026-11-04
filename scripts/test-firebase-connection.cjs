/**
 * scripts/test-firebase-connection.cjs
 * Skrip pengujian koneksi langsung ke Firebase Firestore
 */

const fs = require('fs');
const path = require('path');
const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

async function testConnection() {
  console.log('====================================================');
  console.log('🔍 PENGUJIAN STATUS KONEKSI DATABASE FIREBASE');
  console.log('====================================================\n');

  const keyPath = path.join(process.cwd(), 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    console.error('❌ File serviceAccountKey.json tidak ditemukan di root proyek!');
    process.exit(1);
  }

  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  console.log('📋 Informasi Kredensial:');
  console.log(`   - Project ID    : ${sa.project_id}`);
  console.log(`   - Client Email  : ${sa.client_email}`);
  console.log(`   - Private Key ID: ${sa.private_key_id.substring(0, 10)}...`);

  console.log('\n⏳ Menghubungkan ke Google Cloud Firebase Firestore...');
  const startTime = Date.now();

  const app = initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  // 1. Tes Tulis Dokumen Uji Ping
  const pingRef = db.collection('_connection_test').doc('ping');
  const timestamp = new Date().toISOString();
  await pingRef.set({
    status: 'connected',
    tested_at: timestamp,
    client: 'Antigravity Diagnostic Tool',
  });
  console.log('   ✅ Berhasil menulis dokumen uji (Write OK)');

  // 2. Tes Baca Dokumen Uji Ping
  const pingDoc = await pingRef.get();
  if (pingDoc.exists) {
    console.log('   ✅ Berhasil membaca dokumen uji (Read OK):', pingDoc.data());
  }

  // 3. Bersihkan dokumen uji ping
  await pingRef.delete();
  console.log('   ✅ Berhasil menghapus dokumen uji (Cleanup OK)');

  const latency = Date.now() - startTime;
  console.log(`\n⚡ Latensi Respon Cloud: ${latency} ms`);

  // 4. Periksa Dokumen di Setiap Koleksi Utama
  console.log('\n📊 Ringkasan Dokumen di Database Firebase Saat Ini:');
  const collections = [
    'identities',
    'outlets',
    'pos_aliases',
    'invoices',
    'coupons',
    'waste_purchases',
    'statements',
    'approvals',
    'rules_config',
    'app_users',
    'system_auth',
  ];

  for (const col of collections) {
    const snap = await db.collection(col).count().get();
    const count = snap.data().count;
    console.log(`   📁 Koleksi [${col.padEnd(16)}]: ${count} dokumen`);
  }

  console.log('\n====================================================');
  console.log('🎉 KESIMPULAN: DATABASE SUDAH 100% TERHUBUNG KE FIREBASE!');
  console.log('====================================================');
}

testConnection().catch(err => {
  console.error('\n❌ Gagal terhubung ke Firebase:', err.message);
  process.exit(1);
});
