/**
 * scripts/sync-all-penalties.js
 * Tool untuk audit & sinkronisasi data seluruh akun yang terkena sanksi:
 * 1. Memastikan seluruh invoice selama masa sanksi bernilai 0 poin, 0 kupon, is_excluded = 1
 * 2. Memastikan kupon fisik aktif otomatis berstatus void
 * 3. Menandai statement terkait sebagai perlu_revisi agar kalkulasi ter-refresh
 */
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'oriental_crm.db'));

console.log('=== AUDIT & SINKRONISASI AKUN SANKSI / DEVALUASI ===\n');

// Ambil semua member yang sedang disuspend atau memiliki riwayat sanksi
const identities = db.prepare(`
  SELECT DISTINCT i.id, i.nama_pemilik, i.is_suspended, i.suspend_type, i.suspend_dari, i.suspend_sampai, i.suspend_reset_points, i.suspend_reason
  FROM identities i
  LEFT JOIN member_penalties mp ON mp.identity_id = i.id
  WHERE i.is_suspended = 1 OR mp.id IS NOT NULL
`).all();

if (identities.length === 0) {
  console.log('Tidak ada akun yang sedang berstatus sanksi atau memiliki riwayat sanksi.');
  process.exit(0);
}

console.log(`Ditemukan ${identities.length} akun dengan status/riwayat sanksi:`);

for (const iden of identities) {
  console.log(`\n• [${iden.id}] ${iden.nama_pemilik}`);
  console.log(`  Status Sanksi: ${iden.is_suspended === 1 ? 'AKTIF (' + (iden.suspend_type || 'temporary') + ')' : 'NONAKTIF / TELAH DICABUT'}`);
  console.log(`  Periode: ${iden.suspend_dari || 'Awal Program'} s/d ${iden.suspend_sampai || 'Seterusnya'}`);
  console.log(`  Alasan: ${iden.suspend_reason || '—'}`);

  // Ambil penalties
  const penalties = db.prepare(`
    SELECT reset_saldo_lama, dari, sampai
    FROM member_penalties
    WHERE identity_id = ?
  `).all(iden.id);

  if (iden.is_suspended === 1) {
    penalties.push({
      reset_saldo_lama: iden.suspend_reset_points === 1 ? 1 : 0,
      dari: iden.suspend_dari || '2026-09-01',
      sampai: iden.suspend_type === 'permanent' ? null : (iden.suspend_sampai || null),
    });
  }

  let invoicesUpdated = 0;

  db.transaction(() => {
    for (const p of penalties) {
      if (p.reset_saldo_lama === 1) {
        const res = db.prepare(`
          UPDATE invoices
          SET poin = 0, kupon = 0, is_excluded = 1
          WHERE outlet_id IN (SELECT id FROM outlets WHERE identity_id = ?)
            AND (poin > 0 OR kupon > 0 OR is_excluded = 0)
            ${p.sampai ? 'AND tanggal <= ?' : ''}
        `).run(iden.id, ...(p.sampai ? [p.sampai] : []));
        invoicesUpdated += res.changes;
      } else {
        const res = db.prepare(`
          UPDATE invoices
          SET poin = 0, kupon = 0, is_excluded = 1
          WHERE outlet_id IN (SELECT id FROM outlets WHERE identity_id = ?)
            AND tanggal >= ?
            ${p.sampai ? 'AND tanggal <= ?' : ''}
            AND (poin > 0 OR kupon > 0 OR is_excluded = 0)
        `).run(iden.id, p.dari, ...(p.sampai ? [p.sampai] : []));
        invoicesUpdated += res.changes;
      }
    }

    let couponsVoided = 0;
    if (iden.is_suspended === 1) {
      const resC = db.prepare(`
        UPDATE coupons
        SET status = 'void', void_reason = ?
        WHERE identity_id = ? AND status = 'aktif'
      `).run(`Gugur akibat sanksi: ${iden.suspend_reason || 'Evaluasi Khusus'}`, iden.id);
      couponsVoided = resC.changes;

      db.prepare(`
        UPDATE coupon_batches
        SET status = 'void'
        WHERE identity_id = ? AND status = 'aktif'
      `).run(iden.id);
    }

    db.prepare(`
      UPDATE statements
      SET status = 'perlu_revisi', updated_at = datetime('now','localtime')
      WHERE identity_id = ?
    `).run(iden.id);

    console.log(`  -> Hasil sinkronisasi: ${invoicesUpdated} invoice di-void, ${couponsVoided} kupon fisik di-void, statements ditandai perlu revisi.`);
  })();
}

console.log('\nSelesai. Seluruh data sanksi telah tersinkronisasi.');
