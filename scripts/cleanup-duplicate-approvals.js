/**
 * scripts/cleanup-duplicate-approvals.js
 * Membersihkan antrean approval duplikat dan approval kode 131 yang sudah terpetakan di CRM.
 */
const Database = require('better-sqlite3');
const db = new Database('./data/oriental_crm.db');

console.log('=== MEMULAI PEMBERSIHAN ANTREAN APPROVAL DUPLIKAT ===');

const rows = db.prepare('SELECT id, jenis, status, payload, batch_id, created_at FROM approvals ORDER BY id ASC').all();
console.log(`Total data approval saat ini: ${rows.length}`);

const seen = new Map();
const toDelete = [];

for (const r of rows) {
  let key = '';
  try {
    const p = JSON.parse(r.payload);
    if (r.jenis === 'kode_lama_131') {
      key = `131:${p.kode}`;
      // Cek apakah sudah terdaftar di outlets atau pos_aliases
      const outlet = db.prepare('SELECT id FROM outlets WHERE id = ? OR id_pos_lama = ?').get(p.kode, p.kode);
      const alias = db.prepare('SELECT id FROM pos_aliases WHERE nama_pos = ? OR outlet_id = ?').get(p.nama, p.kode);
      if (outlet || alias) {
        if (r.status === 'menunggu') {
          toDelete.push({ id: r.id, reason: `Kode 131 (${p.kode}) sudah terpetakan di CRM` });
          continue;
        }
      }
    } else if (r.jenis === 'anomali_master') {
      key = `anomali:${p.kode}`;
    } else if (r.jenis === 'kode_tabrakan') {
      key = `tabrakan:${p.kode}`;
    } else if (r.jenis === 'outlet_tanpa_induk') {
      key = `tanpa_induk:${p.kode}`;
    } else if (r.jenis === 'nama_belum_dipetakan') {
      key = `unmapped:${p.nama_pos}`;
      const alias = db.prepare('SELECT id FROM pos_aliases WHERE nama_pos = ?').get(p.nama_pos);
      if (alias && r.status === 'menunggu') {
        toDelete.push({ id: r.id, reason: `Nama POS (${p.nama_pos}) sudah terpetakan di pos_aliases` });
        continue;
      }
    } else {
      key = `${r.jenis}:${r.payload}`;
    }

    if (seen.has(key)) {
      const prev = seen.get(key);
      // Prioritaskan yang sudah diputuskan (disetujui, ditolak, diabaikan)
      if (prev.status !== 'menunggu' && r.status === 'menunggu') {
        toDelete.push({ id: r.id, reason: `Duplikat antrean menunggu dari approval selesai #${prev.id} (${prev.status})` });
      } else if (prev.status === 'menunggu' && r.status !== 'menunggu') {
        toDelete.push({ id: prev.id, reason: `Digantikan oleh approval selesai #${r.id} (${r.status})` });
        seen.set(key, r);
      } else {
        // Status sama, hapus yang duplikat
        toDelete.push({ id: r.id, reason: `Duplikat identik dari #${prev.id}` });
      }
    } else {
      seen.set(key, r);
    }
  } catch (e) {
    console.error(`Gagal parse payload id ${r.id}:`, e.message);
  }
}

console.log(`Ditemukan ${toDelete.length} approval duplikat/usang yang akan dibersihkan.`);

if (toDelete.length > 0) {
  const deleteStmt = db.prepare('DELETE FROM approvals WHERE id = ?');
  const deleteTx = db.transaction(() => {
    for (const item of toDelete) {
      deleteStmt.run(item.id);
    }
  });
  deleteTx();
  console.log(`Berhasil menghapus ${toDelete.length} data approval duplikat/usang.`);
}

const remaining = db.prepare('SELECT jenis, status, COUNT(*) as cnt FROM approvals GROUP BY jenis, status').all();
console.log('\nRingkasan status approval setelah pembersihan:');
console.table(remaining);
console.log('=== PEMBERSIHAN SELESAI ===');
