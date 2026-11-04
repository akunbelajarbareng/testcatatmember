/**
 * scripts/import-rekap-kupon-21okt.js
 * Eksekusi impor dan sinkronisasi komprehensif:
 * 1. Master Member & Outlet 4 Oktober 2026 (11 Grup Induk, 41 Outlet)
 * 2. Rekapan Kupon Undian 21 Oktober 2026 (120 Member, 163 Batch, 2.572 Kupon Fisik)
 */
const Database = require('better-sqlite3');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve('data/oriental_crm.db');
const db = new Database(dbPath);

// Enable WAL mode
db.pragma('journal_mode = WAL');

console.log('=====================================================');
console.log('🚀 MEMULAI EKSEKUSI IMPOR DATA REKAPAN 21 OKTOBER 2026');
console.log('=====================================================');

// 1. Validasi Keberadaan Berkas
let masterFile = 'c:/Users/Lenovo/Downloads/Oriental_Member_dan_Outlet_20261004.xlsx';
if (!fs.existsSync(masterFile)) {
  masterFile = path.resolve('Oriental_Member_dan_Outlet_20261004.xlsx');
}
const kuponFile = path.resolve('Oriental_Rekap_Kupon_Undian_20261021.xlsx');

if (!fs.existsSync(masterFile)) {
  console.error('❌ Berkas Master Member 4 Okt tidak ditemukan di:', masterFile);
  process.exit(1);
}
if (!fs.existsSync(kuponFile)) {
  console.error('❌ Berkas Rekapan Kupon 21 Okt tidak ditemukan di:', kuponFile);
  process.exit(1);
}

console.log('✓ Berkas Master:', masterFile);
console.log('✓ Berkas Kupon :', kuponFile);

// Jalankan dalam Database Transaction
const executeImport = db.transaction(() => {
  // A. BACA MASTER 4 OKT
  console.log('\n--- 1. MEMPROSES MASTER MEMBER & OUTLET (4 OKTOBER 2026) ---');
  const wbMaster = xlsx.readFile(masterFile);
  const masterRows = xlsx.utils.sheet_to_json(wbMaster.Sheets['Member & Outlets']);

  const insertIdentity = db.prepare(`
    INSERT INTO identities (
      id, nama_pemilik, alamat, kecamatan, kota, provinsi, kode_pos, status, created_at, updated_at
    ) VALUES (
      @id, @nama, @alamat, @kecamatan, @kota, @provinsi, @kode_pos, 'aktif', datetime('now','localtime'), datetime('now','localtime')
    )
    ON CONFLICT(id) DO UPDATE SET
      nama_pemilik = excluded.nama_pemilik,
      alamat = CASE WHEN excluded.alamat != '' AND excluded.alamat != '-' THEN excluded.alamat ELSE identities.alamat END,
      kecamatan = CASE WHEN excluded.kecamatan != '' AND excluded.kecamatan != '-' THEN excluded.kecamatan ELSE identities.kecamatan END,
      kota = CASE WHEN excluded.kota != '' AND excluded.kota != '-' THEN excluded.kota ELSE identities.kota END,
      updated_at = datetime('now','localtime')
  `);

  const insertOutlet = db.prepare(`
    INSERT INTO outlets (
      id, identity_id, tipe, nama_outlet, id_pos_lama, aktif, created_at, updated_at
    ) VALUES (
      @id, @identity_id, @tipe, @nama_outlet, @id_pos_lama, 1, datetime('now','localtime'), datetime('now','localtime')
    )
    ON CONFLICT(id) DO UPDATE SET
      identity_id = excluded.identity_id,
      tipe = excluded.tipe,
      nama_outlet = excluded.nama_outlet,
      id_pos_lama = CASE WHEN excluded.id_pos_lama != '-' THEN excluded.id_pos_lama ELSE outlets.id_pos_lama END,
      aktif = 1,
      updated_at = datetime('now','localtime')
  `);

  const insertAlias = db.prepare(`
    INSERT OR IGNORE INTO pos_aliases (nama_pos, outlet_id, created_at)
    VALUES (?, ?, datetime('now','localtime'))
  `);

  let masterIdCount = 0;
  let masterOutCount = 0;
  let masterAliasCount = 0;
  const processedIdentities = new Set();

  masterRows.forEach(r => {
    const mId = String(r['ID Akun Utama (One Identity)'] || '').trim();
    const mName = String(r['Nama Member (Pemilik)'] || '').trim();
    const oId = String(r['ID Outlet (POS Baru)'] || '').trim();
    const oName = String(r['Nama Outlet'] || '').trim();
    const lini = String(r['Lini Bisnis'] || 'RETAIL').toLowerCase();
    const posLama = String(r['ID POS Lama (Kode 131)'] || '-');
    const alias = String(r['Alias Kasir POS Terhubung'] || '').trim();

    if (mId && !processedIdentities.has(mId)) {
      insertIdentity.run({
        id: mId,
        nama: mName,
        alamat: String(r['Alamat'] || ''),
        kecamatan: String(r['Kecamatan'] || ''),
        kota: String(r['Kota'] || 'WATAMPONE'),
        provinsi: String(r['Provinsi'] || 'SULAWESI SELATAN'),
        kode_pos: String(r['Kode Pos'] || '')
      });
      processedIdentities.add(mId);
      masterIdCount++;
    }

    if (oId) {
      insertOutlet.run({
        id: oId,
        identity_id: mId,
        tipe: lini === 'grosir' ? 'grosir' : lini === 'ukm' ? 'ukm' : 'retail',
        nama_outlet: oName,
        id_pos_lama: posLama
      });
      masterOutCount++;

      if (alias && alias !== '-' && alias !== '(Belum Ada Alias)') {
        const resAl = insertAlias.run(alias, oId);
        if (resAl.changes > 0) masterAliasCount++;
      }
    }
  });

  console.log(`✓ Master diproses: ${masterIdCount} One Identity, ${masterOutCount} Outlet, ${masterAliasCount} Alias Baru`);

  // B. BACA KUPON 21 OKT
  console.log('\n--- 2. MEMPROSES REKAPAN KUPON (21 OKTOBER 2026) ---');
  const wbKupon = xlsx.readFile(kuponFile);
  const kuponRows = xlsx.utils.sheet_to_json(wbKupon.Sheets['Kupon Undian']);

  let kuponIdCount = 0;
  let kuponOutCount = 0;

  // Pass 1: Identitas & Outlet dari Kupon (jika belum ada)
  kuponRows.forEach(r => {
    const mId = String(r['ID Member'] || '').trim();
    const mName = String(r['Nama Member'] || '').trim();
    const oId = String(r['ID Outlet'] || '').trim();
    const oName = String(r['Outlet Asal'] || '').trim();
    const lini = String(r['Lini Bisnis'] || 'RETAIL').toLowerCase();
    const wa = String(r['No. WhatsApp'] || '').trim();

    if (mId) {
      const resId = insertIdentity.run({
        id: mId,
        nama: mName,
        alamat: String(r['Alamat'] || ''),
        kecamatan: String(r['Kecamatan'] || ''),
        kota: String(r['Kota'] || 'WATAMPONE'),
        provinsi: 'SULAWESI SELATAN',
        kode_pos: ''
      });
      if (resId.changes > 0) kuponIdCount++;

      // Simpan nomor whatsapp jika ada
      if (wa && wa !== '-') {
        db.prepare(`UPDATE identities SET whatsapp = ? WHERE id = ? AND (whatsapp IS NULL OR whatsapp = '')`).run(wa, mId);
      }
    }

    if (oId) {
      const resOut = insertOutlet.run({
        id: oId,
        identity_id: mId,
        tipe: lini === 'grosir' ? 'grosir' : lini === 'ukm' ? 'ukm' : 'retail',
        nama_outlet: oName,
        id_pos_lama: '-'
      });
      if (resOut.changes > 0) kuponOutCount++;
    }
  });

  console.log(`✓ Member & Outlet baru dari Rekap Kupon: ${kuponIdCount} One Identity, ${kuponOutCount} Outlet`);

  // C. RESET TABEL KUPON & BATCH TEST LAMA, KEMUDIAN ISI DENGAN DATA RESMI
  console.log('\n--- 3. MENGISI TABEL BATCH & KUPON FISIK RESMI ---');
  db.prepare(`DELETE FROM coupons`).run();
  db.prepare(`DELETE FROM coupon_batches`).run();

  // Susun Batch dari Kupon Rows
  const batchMap = new Map();
  kuponRows.forEach(r => {
    const bId = r['ID Batch'];
    if (!batchMap.has(bId)) {
      batchMap.set(bId, {
        id: bId,
        identity_id: String(r['ID Member']).trim(),
        outlet_asal_id: String(r['ID Outlet']).trim(),
        periode_kupon: String(r['Periode']).trim(),
        jumlah_kupon: 0,
        nomor_awal: String(r['Nomor Kupon']).trim(),
        nomor_akhir: String(r['Nomor Kupon']).trim(),
        keterangan: r['Keterangan'] ? String(r['Keterangan']).trim() : null,
        petugas: String(r['Petugas'] || 'Kasir').trim(),
        status: String(r['Status']).toUpperCase() === 'AKTIF' ? 'aktif' : 'void',
        created_at: r['Waktu Input'] ? String(r['Waktu Input']).trim() : `${r['Tanggal Serah']} 12:00:00`,
        whatsapp: r['No. WhatsApp'] && r['No. WhatsApp'] !== '-' ? String(r['No. WhatsApp']).trim() : null
      });
    }
    const b = batchMap.get(bId);
    b.jumlah_kupon++;
    const num = String(r['Nomor Kupon']).trim();
    if (num > b.nomor_akhir) b.nomor_akhir = num;
    if (num < b.nomor_awal) b.nomor_awal = num;
    if (String(r['Status']).toUpperCase() === 'AKTIF') {
      b.status = 'aktif';
    }
  });

  const insertBatchStmt = db.prepare(`
    INSERT INTO coupon_batches (
      id, identity_id, outlet_asal_id, periode_kupon, jumlah_kupon, nomor_awal, nomor_akhir, keterangan, petugas, whatsapp, status, created_at, tipe_penerima
    ) VALUES (
      @id, @identity_id, @outlet_asal_id, @periode_kupon, @jumlah_kupon, @nomor_awal, @nomor_akhir, @keterangan, @petugas, @whatsapp, @status, @created_at, 'member'
    )
  `);

  let batchCount = 0;
  for (const b of batchMap.values()) {
    insertBatchStmt.run(b);
    batchCount++;
  }
  console.log(`✓ Berhasil mengimpor ${batchCount} Batch Kupon`);

  // Insert Kupon Fisik
  const insertCouponStmt = db.prepare(`
    INSERT OR REPLACE INTO coupons (
      nomor_kupon, identity_id, outlet_asal_id, batch_id, periode_kupon, nomor_urut, status, petugas, whatsapp, tanggal_serah, created_at, tipe_penerima
    ) VALUES (
      @nomor_kupon, @identity_id, @outlet_asal_id, @batch_id, @periode_kupon, @nomor_urut, @status, @petugas, @whatsapp, @tanggal_serah, @created_at, 'member'
    )
  `);

  let kuponCount = 0;
  let activeCount = 0;
  let voidCount = 0;

  kuponRows.forEach(r => {
    const statusNorm = String(r['Status']).toUpperCase() === 'AKTIF' ? 'aktif' : 'void';
    insertCouponStmt.run({
      nomor_kupon: String(r['Nomor Kupon']).trim(),
      identity_id: String(r['ID Member']).trim(),
      outlet_asal_id: String(r['ID Outlet']).trim(),
      batch_id: r['ID Batch'],
      periode_kupon: String(r['Periode']).trim(),
      nomor_urut: r['Nomor Urut'],
      status: statusNorm,
      petugas: String(r['Petugas'] || 'Kasir').trim(),
      whatsapp: r['No. WhatsApp'] && r['No. WhatsApp'] !== '-' ? String(r['No. WhatsApp']).trim() : null,
      tanggal_serah: String(r['Tanggal Serah']).trim(),
      created_at: r['Waktu Input'] ? String(r['Waktu Input']).trim() : `${r['Tanggal Serah']} 12:00:00`
    });
    kuponCount++;
    if (statusNorm === 'aktif') activeCount++;
    else voidCount++;
  });

  console.log(`✓ Berhasil mengimpor ${kuponCount} Kupon (${activeCount} Aktif, ${voidCount} Void)`);

  // D. TANDAI STATEMENT PERLU REVISI AGAR DIHITUNG ULANG DENGAN KUPON BARU
  db.prepare(`UPDATE statements SET status = 'perlu_revisi', updated_at = datetime('now','localtime')`).run();

  // E. CATAT AUDIT LOG
  db.prepare(`
    INSERT INTO audit_log (aksi, tabel, record_id, keterangan)
    VALUES (?, ?, ?, ?)
  `).run(
    'import_rekap_kupon_21okt',
    'coupons',
    '2026-10-21',
    `Sinkronisasi penuh Master 4 Okt & Kupon 21 Okt: ${masterIdCount + kuponIdCount} member, ${batchCount} batch, ${kuponCount} kupon (${activeCount} aktif).`
  );
});

// Eksekusi Transaction
try {
  executeImport();
  console.log('\n=====================================================');
  console.log('✅ IMPOR DAN SINKRONISASI BERHASIL 100%!');
  console.log('=====================================================');

  // Ringkasan Database Sekarang
  const idTotal = db.prepare('SELECT count(*) as c FROM identities').get().c;
  const outTotal = db.prepare('SELECT count(*) as c FROM outlets').get().c;
  const batchTotal = db.prepare('SELECT count(*) as c FROM coupon_batches').get().c;
  const cpnTotal = db.prepare('SELECT count(*) as c FROM coupons').get().c;
  const cpnAktif = db.prepare("SELECT count(*) as c FROM coupons WHERE status = 'aktif'").get().c;
  const cpnVoid = db.prepare("SELECT count(*) as c FROM coupons WHERE status = 'void'").get().c;
  const invTotal = db.prepare('SELECT count(*) as c FROM invoices').get().c;

  console.log('📊 STATUS BASIS DATA SAAT INI:');
  console.log(`- Total One Identity : ${idTotal} Akun`);
  console.log(`- Total Unit Usaha   : ${outTotal} Outlet`);
  console.log(`- Total Batch Kupon  : ${batchTotal} Batch`);
  console.log(`- Total Kupon Fisik  : ${cpnTotal} Kupon`);
  console.log(`  * Kupon Aktif      : ${cpnAktif} Kupon`);
  console.log(`  * Kupon Void/Batal : ${cpnVoid} Kupon`);
  console.log(`- Total Faktur POS   : ${invTotal} Faktur (Utuh Aman)`);
  console.log('=====================================================\n');
} catch (err) {
  console.error('\n❌ TERJADI KESALAHAN SAAT IMPOR:', err);
  process.exit(1);
}
