/**
 * db.ts — Singleton better-sqlite3 connection + schema initialisation
 * Runs in Node.js (Next.js Route Handlers / Server Actions).
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'oriental_crm.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Singleton pattern — reuse connection across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

function getDb(): Database.Database {
  if (global.__db) return global.__db;
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  global.__db = db;
  return db;
}

export const db = getDb();

// ---------------------------------------------------------------------------
// Schema initialisation — idempotent (CREATE TABLE IF NOT EXISTS)
// ---------------------------------------------------------------------------
function initSchema(db: Database.Database) {
  db.exec(`
    /* -----------------------------------------------------------------------
       identities — satu baris per One Identity (1 KTP)
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS identities (
      id            TEXT    PRIMARY KEY,          -- 102-YYMMDD-NN
      nama_pemilik  TEXT    NOT NULL,
      alamat        TEXT,
      kecamatan     TEXT,
      kota          TEXT,
      kode_pos      TEXT,
      provinsi      TEXT,
      nik_encrypted TEXT,                          -- AES-256, key terpisah
      status        TEXT    NOT NULL DEFAULT 'aktif', -- aktif | nonaktif
      nonaktif_tipe TEXT,                          -- manual | otomatis
      nonaktif_alasan TEXT,
      nonaktif_tanggal TEXT,
      nonaktif_oleh TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    /* -----------------------------------------------------------------------
       outlets — unit usaha di bawah One Identity
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS outlets (
      id            TEXT    PRIMARY KEY,          -- 102-YYMMDD-NN[-01-900|-nn-100]
      identity_id   TEXT    NOT NULL REFERENCES identities(id) ON UPDATE CASCADE ON DELETE CASCADE,
      tipe          TEXT    NOT NULL,             -- retail | grosir | ukm
      nama_outlet   TEXT    NOT NULL,
      id_pos_lama   TEXT,                         -- kode 131-XXXXXX dari POS lama
      aktif         INTEGER NOT NULL DEFAULT 1,
      nonaktif_tipe TEXT,                          -- manual | otomatis
      nonaktif_alasan TEXT,
      nonaktif_tanggal TEXT,
      nonaktif_oleh TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_outlets_identity ON outlets(identity_id);
    CREATE INDEX IF NOT EXISTS idx_outlets_pos_lama ON outlets(id_pos_lama);
    CREATE INDEX IF NOT EXISTS idx_outlets_aktif    ON outlets(aktif);

    /* -----------------------------------------------------------------------
       pos_aliases — nama customer di export POS → outlet
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS pos_aliases (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nama_pos   TEXT    NOT NULL UNIQUE,         -- exact-match dari kolom "Nama Customer"
      outlet_id  TEXT    NOT NULL REFERENCES outlets(id) ON UPDATE CASCADE ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_aliases_outlet ON pos_aliases(outlet_id);

    /* -----------------------------------------------------------------------
       import_batches — metadata tiap unggahan file
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS import_batches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tipe        TEXT    NOT NULL,               -- master_customer | transaksi
      filename    TEXT    NOT NULL,
      bulan       TEXT,                           -- YYYY-MM, null untuk master
      total_baris INTEGER NOT NULL DEFAULT 0,
      baris_ok    INTEGER NOT NULL DEFAULT 0,
      baris_skip  INTEGER NOT NULL DEFAULT 0,
      baris_warn  INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'selesai', -- selesai | gagal
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    /* -----------------------------------------------------------------------
       invoices — baris transaksi dari export POS
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS invoices (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      no_invoice  TEXT    NOT NULL,
      tanggal     TEXT    NOT NULL,               -- ISO date YYYY-MM-DD
      nama_pos    TEXT    NOT NULL,               -- raw dari POS
      jenis       TEXT    NOT NULL,               -- TUNAI | KREDIT | CAMPUR
      jumlah      REAL    NOT NULL,
      batch_id    INTEGER NOT NULL REFERENCES import_batches(id),
      outlet_id   TEXT    REFERENCES outlets(id) ON UPDATE CASCADE ON DELETE SET NULL, -- NULL = belum terpetakan
      poin        INTEGER NOT NULL DEFAULT 0,
      kupon       INTEGER NOT NULL DEFAULT 0,
      is_excluded INTEGER NOT NULL DEFAULT 0,     -- 1 = kena exclusion rule
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(no_invoice, nama_pos, tanggal, jumlah, jenis)  -- deduplikasi
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_outlet   ON invoices(outlet_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_tanggal  ON invoices(tanggal);
    CREATE INDEX IF NOT EXISTS idx_invoices_batch    ON invoices(batch_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_no       ON invoices(no_invoice);

    /* -----------------------------------------------------------------------
       exclusions — periode pengecualian per identity
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS exclusions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id TEXT    NOT NULL REFERENCES identities(id) ON UPDATE CASCADE ON DELETE CASCADE,
      dari        TEXT    NOT NULL,               -- ISO date
      sampai      TEXT    NOT NULL,               -- ISO date (inclusive)
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_exclusions_identity ON exclusions(identity_id);

    /* -----------------------------------------------------------------------
       statements — status statement per identity per bulan
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS statements (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id    TEXT    NOT NULL REFERENCES identities(id) ON UPDATE CASCADE ON DELETE CASCADE,
      bulan          TEXT    NOT NULL,            -- YYYY-MM
      status         TEXT    NOT NULL DEFAULT 'draft', -- draft|final|perlu_revisi
      revisi         INTEGER NOT NULL DEFAULT 0,
      total_transaksi REAL   NOT NULL DEFAULT 0,
      total_poin     INTEGER NOT NULL DEFAULT 0,
      total_kupon    INTEGER NOT NULL DEFAULT 0,
      kumulatif_poin INTEGER NOT NULL DEFAULT 0,
      kumulatif_kupon INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(identity_id, bulan)
    );
    CREATE INDEX IF NOT EXISTS idx_statements_identity ON statements(identity_id);

    /* -----------------------------------------------------------------------
       rules_config — rate poin dan nilai kupon (bisa diubah Owner)
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS rules_config (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kunci       TEXT    NOT NULL UNIQUE,        -- e.g. rate_retail, rate_ukm, rate_grosir, nilai_kupon
      nilai       REAL    NOT NULL,
      keterangan  TEXT,
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_by  TEXT    NOT NULL DEFAULT 'system'
    );

    /* -----------------------------------------------------------------------
       approvals — antrean persetujuan Owner
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS approvals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      jenis       TEXT    NOT NULL,               -- nama_mirip | nama_ganda | invoice_berubah | kode_tabrakan | anomali_master
      payload     TEXT    NOT NULL,               -- JSON blob
      status      TEXT    NOT NULL DEFAULT 'menunggu', -- menunggu | disetujui | ditolak | diabaikan
      resolved_at TEXT,
      resolved_note TEXT,
      batch_id    INTEGER REFERENCES import_batches(id),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

    /* -----------------------------------------------------------------------
       audit_log — jejak semua perubahan penting
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      aksi        TEXT    NOT NULL,               -- create | update | delete | import | approve | finalize
      tabel       TEXT,
      record_id   TEXT,
      sebelum     TEXT,                           -- JSON
      sesudah     TEXT,                           -- JSON
      keterangan  TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

    /* -----------------------------------------------------------------------
       Seed data: rules_config default (sesuai PRD Bagian 5)
    ----------------------------------------------------------------------- */
    INSERT OR IGNORE INTO rules_config(kunci, nilai) VALUES
      ('rate_retail',  100000),
      ('rate_ukm',      50000),
      ('rate_grosir',  200000),
      ('nilai_kupon',  150000);

    /* -----------------------------------------------------------------------
       system_auth — Password persetujuan Owner universal
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS system_auth (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      password   TEXT    NOT NULL DEFAULT 'oriental2026',
      updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    INSERT OR IGNORE INTO system_auth(id, password) VALUES (1, 'oriental2026');

    /* -----------------------------------------------------------------------
       coupon_batches — kelompok penyerahan kupon fisik per serah-terima
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS coupon_batches (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id    TEXT    NOT NULL REFERENCES identities(id) ON UPDATE CASCADE ON DELETE CASCADE,
      outlet_asal_id TEXT    NOT NULL REFERENCES outlets(id) ON UPDATE CASCADE ON DELETE CASCADE,
      periode_kupon  TEXT    NOT NULL,               -- e.g. 2026-09
      jumlah_kupon   INTEGER NOT NULL,
      nomor_awal     TEXT,
      nomor_akhir    TEXT,
      keterangan     TEXT,
      petugas        TEXT    NOT NULL,
      whatsapp       TEXT,
      status         TEXT    NOT NULL DEFAULT 'aktif', -- aktif | void
      created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_coupon_batches_identity ON coupon_batches(identity_id);

    /* -----------------------------------------------------------------------
       coupons — nomor fisik kupon unik (ORT-KUPYYMM-NNNN)
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS coupons (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      nomor_kupon    TEXT    NOT NULL,                -- ORT-KUP2609-0001
      identity_id    TEXT    NOT NULL REFERENCES identities(id) ON UPDATE CASCADE ON DELETE CASCADE,
      outlet_asal_id TEXT    NOT NULL REFERENCES outlets(id) ON UPDATE CASCADE ON DELETE CASCADE,
      batch_id       INTEGER REFERENCES coupon_batches(id) ON DELETE SET NULL,
      periode_kupon  TEXT    NOT NULL,                -- e.g. 2026-09
      nomor_urut     INTEGER NOT NULL,                -- 1..2500
      status         TEXT    NOT NULL DEFAULT 'aktif', -- aktif | void
      void_reason    TEXT,                            -- alasan pembatalan / sanksi
      petugas        TEXT    NOT NULL,
      whatsapp       TEXT,
      tanggal_serah  TEXT    NOT NULL DEFAULT (date('now','localtime')),
      created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_coupons_identity ON coupons(identity_id);
    CREATE INDEX IF NOT EXISTS idx_coupons_periode  ON coupons(periode_kupon);
    CREATE INDEX IF NOT EXISTS idx_coupons_status   ON coupons(status);
    -- Unique constraint hanya untuk kupon yang berstatus aktif (memungkinkan reuse jika void)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_active_nomor ON coupons(nomor_kupon) WHERE status = 'aktif';

    /* -----------------------------------------------------------------------
       member_penalties — riwayat penjatuhan sanksi / penangguhan member
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS member_penalties (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id          TEXT    NOT NULL REFERENCES identities(id) ON UPDATE CASCADE ON DELETE CASCADE,
      jenis_sanksi         TEXT    NOT NULL,               -- temporary | permanent
      reset_saldo_lama     INTEGER NOT NULL DEFAULT 0,     -- 1 = hangus saldo lama
      dari                 TEXT    NOT NULL,               -- ISO date
      sampai               TEXT,                           -- ISO date (null jika permanent)
      alasan               TEXT    NOT NULL,
      petugas              TEXT    NOT NULL,
      voided_coupons_count INTEGER NOT NULL DEFAULT 0,
      wiped_points         INTEGER NOT NULL DEFAULT 0,
      status               TEXT    NOT NULL DEFAULT 'aktif', -- aktif | dicabut
      revoked_at           TEXT,
      revoked_by           TEXT,
      revoked_reason       TEXT,
      created_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_penalties_identity ON member_penalties(identity_id);
    CREATE INDEX IF NOT EXISTS idx_penalties_status   ON member_penalties(status);

    /* -----------------------------------------------------------------------
       waste_purchases — transaksi pembelian limbah (UCO) per outlet
    ----------------------------------------------------------------------- */
    CREATE TABLE IF NOT EXISTS waste_purchases (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      outlet_id     TEXT    NOT NULL REFERENCES outlets(id) ON UPDATE CASCADE ON DELETE CASCADE,
      identity_id   TEXT    NOT NULL REFERENCES identities(id) ON UPDATE CASCADE ON DELETE CASCADE,
      tanggal       TEXT    NOT NULL,               -- ISO date YYYY-MM-DD
      jenis_waste   TEXT    NOT NULL DEFAULT 'UCO', -- UCO | dsb
      berat_kg      REAL    NOT NULL,
      harga_per_kg  REAL    NOT NULL,
      total_rupiah  REAL    NOT NULL,
      poin          INTEGER NOT NULL DEFAULT 0,     -- Rp 10.000 = 1 Poin (0 kupon)
      no_timbangan  TEXT,
      catatan       TEXT,
      petugas       TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_waste_outlet ON waste_purchases(outlet_id);
    CREATE INDEX IF NOT EXISTS idx_waste_identity ON waste_purchases(identity_id);
    CREATE INDEX IF NOT EXISTS idx_waste_tanggal ON waste_purchases(tanggal);
  `);

  // Inisialisasi default rules baru jika belum ada
  db.exec(`
    INSERT OR IGNORE INTO rules_config(kunci, nilai) VALUES
      ('rate_retail',  100000),
      ('rate_ukm',      50000),
      ('rate_grosir',  200000),
      ('nilai_kupon',  150000),
      ('harga_uco_per_kg', 8000),
      ('rate_waste_poin', 10000),
      ('saving_parkir_per_trx', 2000),
      ('saving_kurir_per_trx', 15000),
      ('periode_tidak_aktif_bulan', 3);
  `);

  // Migrasi kolom whatsapp pada identities jika belum ada
  try {
    db.exec(`ALTER TABLE identities ADD COLUMN whatsapp TEXT;`);
  } catch {
    // Kolom sudah ada, abaikan
  }

  // Migrasi kolom sanksi pada identities jika belum ada
  const identityPenaltyCols = [
    'is_suspended INTEGER NOT NULL DEFAULT 0',
    'suspend_type TEXT',
    'suspend_dari TEXT',
    'suspend_sampai TEXT',
    'suspend_reason TEXT',
    'suspend_reset_points INTEGER NOT NULL DEFAULT 0',
    'suspended_at TEXT',
    'suspended_by TEXT',
  ];

  for (const col of identityPenaltyCols) {
    try {
      db.exec(`ALTER TABLE identities ADD COLUMN ${col};`);
    } catch {
      // Kolom sudah ada
    }
  }

  // Migrasi kolom nonaktif pada identities & outlets jika belum ada
  const deactivationCols = [
    'nonaktif_tipe TEXT',
    'nonaktif_alasan TEXT',
    'nonaktif_tanggal TEXT',
    'nonaktif_oleh TEXT',
  ];

  for (const col of deactivationCols) {
    try {
      db.exec(`ALTER TABLE identities ADD COLUMN ${col};`);
    } catch {
      // Kolom sudah ada
    }
    try {
      db.exec(`ALTER TABLE outlets ADD COLUMN ${col};`);
    } catch {
      // Kolom sudah ada
    }
  }

  // Migrasi kolom void_reason pada coupons jika belum ada
  try {
    db.exec(`ALTER TABLE coupons ADD COLUMN void_reason TEXT;`);
  } catch {
    // Kolom sudah ada
  }

  // Migrasi kolom keterangan pada rules_config jika belum ada
  try {
    db.exec(`ALTER TABLE rules_config ADD COLUMN keterangan TEXT;`);
  } catch {
    // Kolom sudah ada
  }
}

export default db;
