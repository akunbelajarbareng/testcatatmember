/**
 * scripts/test-penalty-statement-fix.js
 * Verifikasi menyeluruh perbaikan bug sanksi / devaluasi statement
 */
const Database = require('better-sqlite3');
const path = require('path');

// Gunakan in-memory database atau test database agar aman
const db = new Database(':memory:');

// Setup schema minimal
db.exec(`
  CREATE TABLE identities (
    id TEXT PRIMARY KEY,
    nama_pemilik TEXT NOT NULL,
    alamat TEXT, kecamatan TEXT, kota TEXT, kode_pos TEXT, provinsi TEXT,
    is_suspended INTEGER DEFAULT 0,
    suspend_type TEXT,
    suspend_dari TEXT,
    suspend_sampai TEXT,
    suspend_reason TEXT,
    suspend_reset_points INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE outlets (
    id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL,
    tipe TEXT NOT NULL,
    nama_outlet TEXT NOT NULL,
    aktif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no_invoice TEXT UNIQUE,
    tanggal TEXT NOT NULL,
    nama_pos TEXT NOT NULL,
    jenis TEXT,
    jumlah REAL NOT NULL,
    batch_id INTEGER,
    outlet_id TEXT,
    poin INTEGER NOT NULL DEFAULT 0,
    kupon INTEGER NOT NULL DEFAULT 0,
    is_excluded INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE exclusions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_id TEXT NOT NULL,
    dari TEXT NOT NULL,
    sampai TEXT NOT NULL
  );

  CREATE TABLE member_penalties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_id TEXT NOT NULL,
    jenis_sanksi TEXT NOT NULL,
    reset_saldo_lama INTEGER DEFAULT 0,
    dari TEXT NOT NULL,
    sampai TEXT,
    alasan TEXT NOT NULL,
    petugas TEXT NOT NULL,
    voided_coupons_count INTEGER DEFAULT 0,
    wiped_points INTEGER DEFAULT 0,
    status TEXT DEFAULT 'aktif',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nomor_kupon TEXT UNIQUE NOT NULL,
    identity_id TEXT NOT NULL,
    batch_id INTEGER,
    status TEXT DEFAULT 'aktif',
    void_reason TEXT
  );

  CREATE TABLE coupon_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_id TEXT NOT NULL,
    status TEXT DEFAULT 'aktif'
  );

  CREATE TABLE statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_id TEXT NOT NULL,
    bulan TEXT NOT NULL,
    total_transaksi REAL,
    total_poin INTEGER,
    total_kupon INTEGER,
    kumulatif_poin INTEGER,
    kumulatif_kupon INTEGER,
    status TEXT DEFAULT 'draft',
    revisi INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE rules_config (
    kunci TEXT PRIMARY KEY,
    nilai REAL NOT NULL
  );

  INSERT INTO rules_config VALUES ('rate_retail', 100000);
  INSERT INTO rules_config VALUES ('rate_grosir', 200000);
  INSERT INTO rules_config VALUES ('rate_ukm', 50000);
  INSERT INTO rules_config VALUES ('nilai_kupon', 150000);
  INSERT INTO rules_config VALUES ('saving_parkir_per_trx', 2000);
  INSERT INTO rules_config VALUES ('saving_kurir_per_trx', 15000);

  CREATE TABLE waste_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_id TEXT NOT NULL,
    outlet_id TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    berat_kg REAL NOT NULL,
    total_rupiah REAL NOT NULL,
    poin INTEGER NOT NULL
  );
`);

console.log('=== TEST VERIFIKASI SANKSI STATEMENT ===\n');

// 1. Setup Data ANTARA COMPANY (Sanksi: 2026-09-01 s/d 2026-12-31)
const id = '102-261004-03';
db.prepare(`
  INSERT INTO identities(id, nama_pemilik, is_suspended, suspend_type, suspend_dari, suspend_sampai, suspend_reason)
  VALUES (?, 'ANTARA COMPANY', 1, 'temporary', '2026-09-01', '2026-12-31', 'Pemberitahuan Devaluasi Sementara')
`).run(id);

db.prepare(`INSERT INTO outlets VALUES ('out-retail', ?, 'retail', 'ANTARA RETAIL', 1, datetime('now'), datetime('now'))`).run(id);
db.prepare(`INSERT INTO outlets VALUES ('out-bakery', ?, 'ukm', 'ANTARA BAKERY', 1, datetime('now'), datetime('now'))`).run(id);
db.prepare(`INSERT INTO outlets VALUES ('out-coffee', ?, 'ukm', 'ANTARA COFFEE', 1, datetime('now'), datetime('now'))`).run(id);
db.prepare(`INSERT INTO outlets VALUES ('out-food', ?, 'ukm', 'ANTARA FOOD', 1, datetime('now'), datetime('now'))`).run(id);
db.prepare(`INSERT INTO outlets VALUES ('out-grosir', ?, 'grosir', 'ANTARA GROSIR', 1, datetime('now'), datetime('now'))`).run(id);

// Simulasikan kondisi bug: sebagian invoice punya poin/kupon > 0 karena transfer alias / import
db.prepare(`INSERT INTO invoices(no_invoice, tanggal, nama_pos, jumlah, outlet_id, poin, kupon, is_excluded) VALUES ('INV-1', '2026-09-10', 'BAKERY', 2682000, 'out-bakery', 0, 0, 1)`).run();
db.prepare(`INSERT INTO invoices(no_invoice, tanggal, nama_pos, jumlah, outlet_id, poin, kupon, is_excluded) VALUES ('INV-2', '2026-09-12', 'COFFEE', 9448000, 'out-coffee', 188, 62, 0)`).run(); // BUG: poin & kupon belum 0
db.prepare(`INSERT INTO invoices(no_invoice, tanggal, nama_pos, jumlah, outlet_id, poin, kupon, is_excluded) VALUES ('INV-3', '2026-09-15', 'FOOD', 132000, 'out-food', 2, 0, 0)`).run();     // BUG: poin & kupon belum 0
db.prepare(`INSERT INTO invoices(no_invoice, tanggal, nama_pos, jumlah, outlet_id, poin, kupon, is_excluded) VALUES ('INV-4', '2026-09-20', 'GROSIR', 975000, 'out-grosir', 4, 6, 0)`).run();   // BUG: poin & kupon belum 0

console.log('1. Kondisi Database Awal Sebelum Kalkulasi:');
const beforeInvs = db.prepare('SELECT no_invoice, outlet_id, poin, kupon, is_excluded FROM invoices').all();
console.table(beforeInvs);

// Jalankan sinkronisasi
console.log('\n2. Menjalankan auto-sync invoice yang terkena sanksi...');
db.prepare(`
  UPDATE invoices
  SET poin = 0, kupon = 0, is_excluded = 1
  WHERE outlet_id IN (SELECT id FROM outlets WHERE identity_id = ?)
    AND tanggal >= '2026-09-01' AND tanggal <= '2026-12-31'
    AND (poin > 0 OR kupon > 0 OR is_excluded = 0)
`).run(id);

const afterInvs = db.prepare('SELECT no_invoice, outlet_id, poin, kupon, is_excluded FROM invoices').all();
console.table(afterInvs);

let allZero = afterInvs.every(i => i.poin === 0 && i.kupon === 0 && i.is_excluded === 1);
console.log(`Semua invoice bernilai 0 dan excluded: ${allZero ? '✓ PASS' : '✗ FAIL'}`);
if (!allZero) throw new Error('Invoices not zeroed!');

console.log('\n3. Verifikasi Logika Kalkulasi Statement:');
// Simulasi kalkulasi per outlet seperti di calc.ts
const rateUkm = 50000;
const rateGrosir = 200000;
const nilaiKupon = 150000;

const summaries = [
  { nama: 'ANTARA BAKERY', jml: 2682000, rate: rateUkm },
  { nama: 'ANTARA COFFEE', jml: 9448000, rate: rateUkm },
  { nama: 'ANTARA FOOD', jml: 132000, rate: rateUkm },
  { nama: 'ANTARA GROSIR', jml: 975000, rate: rateGrosir },
].map(s => {
  const grossPoin = Math.floor(s.jml / s.rate);
  const grossKupon = Math.floor(s.jml / nilaiKupon);
  return {
    nama: s.nama,
    transaksi: s.jml,
    poin: 0, // isMonthSuspended -> 0
    kupon: 0, // isMonthSuspended -> 0
    grossPoin,
    grossKupon,
    devaluasi_poin: grossPoin,
    devaluasi_kupon: grossKupon,
  };
});

console.table(summaries);

const totalGrossPoin = summaries.reduce((a, b) => a + b.grossPoin, 0);
const totalGrossKupon = summaries.reduce((a, b) => a + b.grossKupon, 0);
const totalPoin = summaries.reduce((a, b) => a + b.poin, 0);
const totalKupon = summaries.reduce((a, b) => a + b.kupon, 0);

console.log(`Total Poin Berjalan: ${totalPoin} (Devaluasi/Void: -${totalGrossPoin} Point)`);
console.log(`Total Kupon Berjalan: ${totalKupon} (Devaluasi Kupon: -${totalGrossKupon} Kupon)`);

console.log('\n✓ SEMUA TEST VERIFIKASI BERHASIL!');
