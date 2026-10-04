const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'oriental_crm.db');
const db = new Database(dbPath);

console.log('Starting FK migration on:', dbPath);

db.pragma('foreign_keys = OFF');

db.transaction(() => {
  // 1. outlets
  db.exec(`
    CREATE TABLE IF NOT EXISTS outlets_new (
      id            TEXT    PRIMARY KEY,
      identity_id   TEXT    NOT NULL REFERENCES identities(id) ON UPDATE CASCADE ON DELETE CASCADE,
      tipe          TEXT    NOT NULL,
      nama_outlet   TEXT    NOT NULL,
      id_pos_lama   TEXT,
      aktif         INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
  db.exec(`INSERT INTO outlets_new SELECT id, identity_id, tipe, nama_outlet, id_pos_lama, aktif, created_at, updated_at FROM outlets;`);
  db.exec(`DROP TABLE outlets;`);
  db.exec(`ALTER TABLE outlets_new RENAME TO outlets;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outlets_identity ON outlets(identity_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outlets_pos_lama ON outlets(id_pos_lama);`);

  // 2. pos_aliases
  db.exec(`
    CREATE TABLE IF NOT EXISTS pos_aliases_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nama_pos   TEXT    NOT NULL UNIQUE,
      outlet_id  TEXT    NOT NULL REFERENCES outlets(id) ON UPDATE CASCADE ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
  db.exec(`INSERT INTO pos_aliases_new SELECT id, nama_pos, outlet_id, created_at FROM pos_aliases;`);
  db.exec(`DROP TABLE pos_aliases;`);
  db.exec(`ALTER TABLE pos_aliases_new RENAME TO pos_aliases;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_aliases_outlet ON pos_aliases(outlet_id);`);

  // 3. invoices
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices_new (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      no_invoice  TEXT    NOT NULL,
      tanggal     TEXT    NOT NULL,
      nama_pos    TEXT    NOT NULL,
      jenis       TEXT    NOT NULL,
      jumlah      REAL    NOT NULL,
      batch_id    INTEGER NOT NULL REFERENCES import_batches(id),
      outlet_id   TEXT    REFERENCES outlets(id) ON UPDATE CASCADE ON DELETE SET NULL,
      poin        INTEGER NOT NULL DEFAULT 0,
      kupon       INTEGER NOT NULL DEFAULT 0,
      is_excluded INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(no_invoice, nama_pos, tanggal, jumlah, jenis)
    );
  `);
  db.exec(`INSERT INTO invoices_new SELECT id, no_invoice, tanggal, nama_pos, jenis, jumlah, batch_id, outlet_id, poin, kupon, is_excluded, created_at FROM invoices;`);
  db.exec(`DROP TABLE invoices;`);
  db.exec(`ALTER TABLE invoices_new RENAME TO invoices;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_outlet   ON invoices(outlet_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_tanggal  ON invoices(tanggal);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_batch    ON invoices(batch_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_no       ON invoices(no_invoice);`);

  // 4. exclusions
  db.exec(`
    CREATE TABLE IF NOT EXISTS exclusions_new (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id TEXT    NOT NULL REFERENCES identities(id) ON UPDATE CASCADE ON DELETE CASCADE,
      dari        TEXT    NOT NULL,
      sampai      TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
  db.exec(`INSERT INTO exclusions_new SELECT id, identity_id, dari, sampai, created_at FROM exclusions;`);
  db.exec(`DROP TABLE exclusions;`);
  db.exec(`ALTER TABLE exclusions_new RENAME TO exclusions;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_exclusions_identity ON exclusions(identity_id);`);

  // 5. statements
  db.exec(`
    CREATE TABLE IF NOT EXISTS statements_new (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id    TEXT    NOT NULL REFERENCES identities(id) ON UPDATE CASCADE ON DELETE CASCADE,
      bulan          TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'draft',
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
  `);
  db.exec(`INSERT INTO statements_new SELECT id, identity_id, bulan, status, revisi, total_transaksi, total_poin, total_kupon, kumulatif_poin, kumulatif_kupon, created_at, updated_at FROM statements;`);
  db.exec(`DROP TABLE statements;`);
  db.exec(`ALTER TABLE statements_new RENAME TO statements;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_statements_identity ON statements(identity_id);`);
})();

db.pragma('foreign_keys = ON');
const violations = db.pragma('foreign_key_check');
console.log('FK Violations:', violations);
if (violations.length === 0) {
  console.log('Migration successfully completed! All tables now have ON UPDATE CASCADE.');
} else {
  console.error('Migration finished with violations:', violations);
}
db.close();
