/**
 * scripts/sync-unmapped-approvals.cjs
 * Skrip sinkronisasi 1x untuk memasukkan nama transaksi kasir yang belum terpetakan
 * ke dalam antrean approval ('nama_belum_dipetakan') dengan status 'menunggu'.
 */

const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const sa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'serviceAccountKey.json'), 'utf8'));
const app = initializeApp({ credential: cert(sa) });
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

async function syncUnmappedApprovals() {
  console.log('========================================================');
  console.log('🔄 SINKRONISASI TRANSAKSI UNMAPPED KE ANTREAN APPROVAL');
  console.log('========================================================\n');

  console.log('⏳ Mengambil data invoices, approvals, outlets, dan identities...');
  const [invSnap, outSnap, idSnap, apprSnap] = await Promise.all([
    db.collection('invoices').get(),
    db.collection('outlets').get(),
    db.collection('identities').get(),
    db.collection('approvals').get(),
  ]);

  console.log(`- Invoices   : ${invSnap.size} dokumen`);
  console.log(`- Approvals  : ${apprSnap.size} dokumen`);
  console.log(`- Outlets    : ${outSnap.size} dokumen`);
  console.log(`- Identities : ${idSnap.size} dokumen\n`);

  // 1. Kumpulkan nama master dari identities dan outlets
  const masterNamas = new Set();
  idSnap.forEach(d => {
    const data = d.data();
    if (data.nama_pemilik) masterNamas.add(data.nama_pemilik.toUpperCase().trim());
  });
  outSnap.forEach(d => {
    const data = d.data();
    if (data.nama_outlet) masterNamas.add(data.nama_outlet.toUpperCase().trim());
  });

  // 2. Kumpulkan approval yang sudah ada untuk jenis 'nama_belum_dipetakan'
  const existingApprNames = new Set();
  const docsMissingStatus = [];

  apprSnap.forEach(d => {
    const a = d.data();
    if (!a.status) {
      docsMissingStatus.push(d.ref);
    }
    if (a.jenis === 'nama_belum_dipetakan' && a.payload) {
      const p = typeof a.payload === 'string' ? JSON.parse(a.payload) : a.payload;
      if (p.nama_pos) existingApprNames.add(p.nama_pos.toUpperCase().trim());
    }
  });

  console.log(`ℹ️ Approval jenis 'nama_belum_dipetakan' yang sudah ada: ${existingApprNames.size}`);
  console.log(`ℹ️ Dokumen approval lama tanpa field 'status': ${docsMissingStatus.length}`);

  // 3. Kelompokkan invoice yang belum terpetakan
  const unmapped = new Map();
  invSnap.forEach(d => {
    const inv = d.data();
    const nama = (inv.nama_pos || '').trim();
    if (!inv.outlet_id && nama && nama.toUpperCase() !== 'CASH') {
      const cur = unmapped.get(nama) || { count: 0, total: 0, batch_id: inv.batch_id || 2 };
      cur.count += 1;
      cur.total += (Number(inv.jumlah) || 0);
      unmapped.set(nama, cur);
    }
  });

  console.log(`📊 Ditemukan ${unmapped.size} nama POS unik yang belum terpetakan.\n`);

  // 4. Batch update: Masukkan approval baru
  let batch = db.batch();
  let opCount = 0;
  let insertedCount = 0;

  for (const [nama, info] of unmapped.entries()) {
    if (existingApprNames.has(nama.toUpperCase())) continue;

    const adaDiMaster = masterNamas.has(nama.toUpperCase());
    const newRef = db.collection('approvals').doc();
    batch.set(newRef, {
      id: newRef.id,
      jenis: 'nama_belum_dipetakan',
      payload: {
        nama_pos: nama,
        ada_di_master: adaDiMaster,
        jumlah_transaksi: info.count,
        total_nilai: info.total,
        alasan: adaDiMaster
          ? 'Nama ada di master, perlu dipetakan ke outlet/lini bisnis spesifik.'
          : 'Nama baru tidak ditemukan di master, perlu dipetakan ke outlet tujuan.',
      },
      status: 'menunggu',
      batch_id: info.batch_id || 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    insertedCount++;
    opCount++;

    if (opCount >= 400) {
      await batch.commit();
      console.log(`   💾 Berhasil menyimpan ${opCount} data ke Firestore...`);
      batch = db.batch();
      opCount = 0;
    }
  }

  // 5. Update status: 'menunggu' untuk approval lama yang belum memiliki field status
  for (const ref of docsMissingStatus) {
    batch.update(ref, {
      status: 'menunggu',
      updated_at: new Date().toISOString(),
    });
    opCount++;

    if (opCount >= 400) {
      await batch.commit();
      console.log(`   💾 Berhasil memperbarui status ${opCount} dokumen approval lama...`);
      batch = db.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
    console.log(`   💾 Berhasil menyimpan commit terakhir (${opCount} operasi).`);
  }

  console.log('\n========================================================');
  console.log(`✅ SINKRONISASI SELESAI`);
  console.log(`- Nama POS baru disinkronkan ke Approval: ${insertedCount}`);
  console.log(`- Approval lama yang distandarisasi statusnya: ${docsMissingStatus.length}`);
  console.log('========================================================\n');
}

syncUnmappedApprovals()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Gagal sinkronisasi:', err);
    process.exit(1);
  });
