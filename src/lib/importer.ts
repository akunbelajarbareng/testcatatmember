/**
 * importer.ts — Excel import engine
 * Handles PRD Section 6: Master Customer & Transaksi import
 * Robust against biltinId style corruption (PRD 6.2)
 */
import * as XLSX from 'xlsx';
import db from './db';
import { hitungInvoice, recalcOutlet } from './calc';
import type { OutletTipe } from './calc';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ImportResult {
  batchId: number;
  totalBaris: number;
  barisOk: number;
  barisSkip: number;
  barisWarn: number;
  peringatan: string[];
  approvalCount: number;
}

interface RawCustomerRow {
  Kode?: string;
  Nama?: string;
  Alamat?: string;
  Kota?: string;
  Kategori?: string;
  Kontak?: string;
  HP?: string;
}

interface RawTrxRow {
  No?: number | string;
  Tanggal?: number | string;
  'No Invoice'?: string;
  'Nama Customer'?: string;
  Jenis?: string;
  Jumlah?: number | string;
}

// ---------------------------------------------------------------------------
// Helper: Excel serial date → ISO string YYYY-MM-DD
// ---------------------------------------------------------------------------
function excelDateToISO(serial: number): string {
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Helper: Derive outlet tipe dari Kategori POS
// PRD 4.6: PC=UKM, PA=Grosir, RET=Retail — tipe FINAL ditetapkan Owner
// Ini hanya hint awal
// ---------------------------------------------------------------------------
function kategoriToTipe(kat: string): OutletTipe {
  const k = (kat || '').toUpperCase().trim();
  if (k === 'PA') return 'grosir';
  if (k === 'RET') return 'retail';
  return 'ukm'; // PC dan default
}

// ---------------------------------------------------------------------------
// Parse kode 102 — kembalikan segmen atau null jika invalid
// Format valid:
//   102-YYMMDD-NN            → Akun Utama (Retail)
//   102-YYMMDD-NN-01-900     → Grosir
//   102-YYMMDD-NN-nn-100     → UKM ke-n
// ---------------------------------------------------------------------------
type KodeInfo =
  | { tipe: 'akun_utama'; parent: string; clean: string }
  | { tipe: 'grosir'; parent: string; clean: string }
  | { tipe: 'ukm'; parent: string; clean: string }
  | { tipe: 'invalid'; reason: string; clean: string };

function parseKode102(rawKode: string): KodeInfo {
  const clean = rawKode.trim();
  const seg = clean.split('-');

  if (seg[0] !== '102') return { tipe: 'invalid', reason: 'prefix bukan 102', clean };

  if (seg.length === 3) {
    // Validasi YYMMDD
    if (!/^\d{6}$/.test(seg[1])) return { tipe: 'invalid', reason: 'segmen tanggal tidak valid', clean };
    if (!/^\d+$/.test(seg[2])) return { tipe: 'invalid', reason: 'segmen nomor tidak valid', clean };
    return { tipe: 'akun_utama', parent: clean, clean };
  }

  if (seg.length === 5) {
    if (!/^\d{6}$/.test(seg[1])) return { tipe: 'invalid', reason: 'segmen tanggal tidak valid', clean };
    if (!/^\d+$/.test(seg[2])) return { tipe: 'invalid', reason: 'segmen nomor tidak valid', clean };
    const parent = seg.slice(0, 3).join('-');
    if (seg[4] === '900') return { tipe: 'grosir', parent, clean };
    if (seg[4] === '100') return { tipe: 'ukm', parent, clean };
    return { tipe: 'invalid', reason: 'suffix bukan 900 atau 100', clean };
  }

  return { tipe: 'invalid', reason: `jumlah segmen tidak valid (${seg.length})`, clean };
}

// ---------------------------------------------------------------------------
// IMPORT MASTER CUSTOMER
// ---------------------------------------------------------------------------
export async function importMasterCustomer(buffer: Buffer, filename: string): Promise<ImportResult> {
  const wb = XLSX.read(buffer, { type: 'buffer', cellStyles: false }); // tahan biltinId
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<RawCustomerRow>(ws);

  const peringatan: string[] = [];
  let barisOk = 0, barisSkip = 0, barisWarn = 0, approvalCount = 0;

  // Buat batch record
  const batch = db
    .prepare(`INSERT INTO import_batches(tipe, filename, total_baris) VALUES (?, ?, ?)`)
    .run('master_customer', filename, rawRows.length);
  const batchId = Number(batch.lastInsertRowid);

  // Kumpulkan kode 102 bersih untuk cek tabrakan
  const kode102Map: Map<string, string[]> = new Map(); // parent → [nama]
  for (const row of rawRows) {
    const kode = (row.Kode || '').trim();
    if (!kode.startsWith('102-')) continue;
    const info = parseKode102(kode);
    if (info.tipe !== 'invalid') {
      const existing = kode102Map.get(info.clean) || [];
      existing.push(row.Nama || '[KOSONG]');
      kode102Map.set(info.clean, existing);
    }
  }

  // Deteksi tabrakan
  const tabrakanKode = new Set<string>();
  for (const [kode, namas] of kode102Map) {
    if (namas.length > 1) {
      tabrakanKode.add(kode);
    }
  }

  // Proses per baris dalam satu transaksi
  const doImport = db.transaction(() => {
    for (const row of rawRows) {
      const kode = (row.Kode || '').trim();
      const nama = (row.Nama || '').trim();

      // Skip baris Sum dan baris tanpa kode
      if (!kode || kode.toLowerCase() === 'sum') {
        barisSkip++;
        continue;
      }

      // Anomali: nama kosong
      if (!nama) {
        barisWarn++;
        peringatan.push(`Nama kosong untuk kode: ${kode}`);
        const existingAnomali = db
          .prepare(`SELECT id FROM approvals WHERE jenis = 'anomali_master' AND json_extract(payload, '$.kode') = ?`)
          .get(kode);
        if (!existingAnomali) {
          db.prepare(`INSERT INTO approvals(jenis, payload, batch_id) VALUES (?, ?, ?)`)
            .run('anomali_master', JSON.stringify({ kode, nama: '', alamat: row.Alamat, kategori: row.Kategori, alasan: 'Nama kosong' }), batchId);
          approvalCount++;
        }
        continue;
      }

      // Anomali: kode tidak lazim (bukan 131- atau 102-)
      if (!kode.startsWith('131-') && !kode.startsWith('102-')) {
        barisWarn++;
        peringatan.push(`Kode tidak lazim: ${kode} (${nama})`);
        const existingAnomali = db
          .prepare(`SELECT id FROM approvals WHERE jenis = 'anomali_master' AND json_extract(payload, '$.kode') = ?`)
          .get(kode);
        if (!existingAnomali) {
          db.prepare(`INSERT INTO approvals(jenis, payload, batch_id) VALUES (?, ?, ?)`)
            .run('anomali_master', JSON.stringify({ kode, nama, alamat: row.Alamat, kategori: row.Kategori, alasan: 'Kode tidak lazim' }), batchId);
          approvalCount++;
        }
        continue;
      }

      if (kode.startsWith('102-')) {
        const info = parseKode102(kode);

        // Format salah
        if (info.tipe === 'invalid') {
          barisWarn++;
          peringatan.push(`Format kode 102 tidak valid: ${kode} (${nama}) — ${info.reason}`);
          const existingAnomali = db
            .prepare(`SELECT id FROM approvals WHERE jenis = 'anomali_master' AND json_extract(payload, '$.kode') = ?`)
            .get(kode);
          if (!existingAnomali) {
            db.prepare(`INSERT INTO approvals(jenis, payload, batch_id) VALUES (?, ?, ?)`)
              .run('anomali_master', JSON.stringify({ kode, nama, alamat: row.Alamat, kategori: row.Kategori, alasan: info.reason }), batchId);
            approvalCount++;
          }
          continue;
        }

        // Tabrakan (kode sama, nama beda — setelah trim)
        if (tabrakanKode.has(info.clean)) {
          barisWarn++;
          peringatan.push(`Kode 102 tabrakan: ${kode} dipakai oleh ${kode102Map.get(info.clean)?.join(', ')}`);
          // Masukkan ke approval satu kali per kode tabrakan (lintas semua status)
          const existingApproval = db
            .prepare(`SELECT id FROM approvals WHERE jenis = 'kode_tabrakan' AND json_extract(payload, '$.kode') = ?`)
            .get(info.clean);
          if (!existingApproval) {
            db.prepare(`INSERT INTO approvals(jenis, payload, batch_id) VALUES (?, ?, ?)`)
              .run('kode_tabrakan', JSON.stringify({
                kode: info.clean,
                namas: kode102Map.get(info.clean),
                alasan: 'Satu nomor kode 102 digunakan oleh beberapa nama berbeda di file Excel',
              }), batchId);
            approvalCount++;
          }
          // JANGAN simpan atau overwrite otomatis jika terjadi tabrakan kode!
          continue;
        }

        // Upsert identitas dan outlet berdasarkan tipe 102
        if (info.tipe === 'akun_utama') {
          // Identity (akun utama = induk)
          const existingIdentity = db.prepare(`SELECT id, nama_pemilik FROM identities WHERE id = ?`).get(info.clean) as { id: string; nama_pemilik: string } | undefined;
          if (!existingIdentity) {
            db.prepare(`
              INSERT INTO identities(id, nama_pemilik, alamat, kota)
              VALUES (?, ?, ?, ?)
            `).run(info.clean, nama, row.Alamat || '', row.Kota || '');
          } else {
            // Update alamat & kota tanpa menimpa nama_pemilik yang mungkin sudah dirapikan Owner
            db.prepare(`
              UPDATE identities SET
                alamat = CASE WHEN ? != '' THEN ? ELSE alamat END,
                kota   = CASE WHEN ? != '' THEN ? ELSE kota END,
                updated_at = datetime('now','localtime')
              WHERE id = ?
            `).run(row.Alamat || '', row.Alamat || '', row.Kota || '', row.Kota || '', info.clean);
          }
          // Retail outlet
          const outletId = info.clean; // Akun utama kode = outlet Retail ID
          const existingOutlet = db.prepare(`SELECT id FROM outlets WHERE id = ?`).get(outletId);
          if (!existingOutlet) {
            db.prepare(`
              INSERT INTO outlets(id, identity_id, tipe, nama_outlet)
              VALUES (?, ?, 'retail', ?)
            `).run(outletId, info.clean, nama);
          }
          barisOk++;
        } else {
          // Grosir atau UKM — pastikan parent identity ada
          const identityId = info.parent;
          const existingIdentity = db.prepare(`SELECT id FROM identities WHERE id = ?`).get(identityId);
          if (!existingIdentity) {
            // SPRINT 4 RULE: JANGAN buat ghost identity otomatis dengan nama kontak!
            barisWarn++;
            peringatan.push(`Outlet ${info.clean} (${nama}) tidak memiliki Akun Utama (${identityId}) di CRM`);
            const existingApproval = db
              .prepare(`SELECT id FROM approvals WHERE jenis = 'outlet_tanpa_induk' AND json_extract(payload, '$.kode') = ?`)
              .get(info.clean);
            if (!existingApproval) {
              db.prepare(`INSERT INTO approvals(jenis, payload, batch_id) VALUES (?, ?, ?)`)
                .run('outlet_tanpa_induk', JSON.stringify({
                  kode: info.clean,
                  nama,
                  parent: identityId,
                  tipe: info.tipe,
                  alamat: row.Alamat || '',
                  kota: row.Kota || '',
                  alasan: `Akun Utama induk (${identityId}) belum terdaftar di CRM. Buat Akun Utama terlebih dahulu.`,
                }), batchId);
              approvalCount++;
            }
            continue; // Jangan masukkan outlet tanpa induk yang sah
          }

          const tipe: OutletTipe = info.tipe === 'grosir' ? 'grosir' : 'ukm';

          // Validasi: hanya 1 Grosir per identity (PRD 4.4)
          if (tipe === 'grosir') {
            const existingGrosir = db.prepare(`SELECT id FROM outlets WHERE identity_id = ? AND tipe = 'grosir' AND id != ? AND aktif = 1`).get(identityId, info.clean);
            if (existingGrosir) {
              barisWarn++;
              peringatan.push(`Identity ${identityId} sudah memiliki outlet Grosir lain. Outlet ${info.clean} dilewati.`);
              continue;
            }
          }

          const existingOutlet = db.prepare(`SELECT id FROM outlets WHERE id = ?`).get(info.clean);
          if (!existingOutlet) {
            db.prepare(`
              INSERT INTO outlets(id, identity_id, tipe, nama_outlet)
              VALUES (?, ?, ?, ?)
            `).run(info.clean, identityId, tipe, nama);
          } else {
            db.prepare(`
              UPDATE outlets SET nama_outlet = ?, tipe = ?, updated_at = datetime('now','localtime')
              WHERE id = ?
            `).run(nama, tipe, info.clean);
          }
          barisOk++;
        }
      } else {
        // Kode 131 — simpan ke approvals sebagai kode POS lama untuk referensi pemetaan
        barisOk++;
        // Cek apakah kode POS lama (131) ini sudah terdaftar sebagai outlet atau terpetakan di pos_aliases
        const existingOutlet131 = db.prepare(`SELECT id FROM outlets WHERE id = ? OR id_pos_lama = ?`).get(kode, kode);
        const existingAlias131 = db.prepare(`SELECT id FROM pos_aliases WHERE nama_pos = ? OR outlet_id = ?`).get(nama, kode);

        if (!existingOutlet131 && !existingAlias131) {
          const existingApproval = db
            .prepare(`SELECT id FROM approvals WHERE jenis = 'kode_lama_131' AND json_extract(payload, '$.kode') = ?`)
            .get(kode);
          if (!existingApproval) {
            db.prepare(`INSERT INTO approvals(jenis, payload, batch_id) VALUES (?, ?, ?)`)
              .run('kode_lama_131', JSON.stringify({
                kode,
                nama,
                alamat: row.Alamat || '',
                kota: row.Kota || '',
                kategori: row.Kategori || '',
                alasan: 'Customer terdaftar dengan kode POS lama (131). Dapat dipetakan ke Akun Utama CRM.',
              }), batchId);
            approvalCount++;
          }
        }
      }
    }
  });

  doImport();

  // Update batch summary
  db.prepare(`
    UPDATE import_batches
    SET total_baris = ?, baris_ok = ?, baris_skip = ?, baris_warn = ?, status = 'selesai'
    WHERE id = ?
  `).run(rawRows.length, barisOk, barisSkip, barisWarn, batchId);

  // Audit log
  db.prepare(`INSERT INTO audit_log(aksi, tabel, keterangan) VALUES (?, ?, ?)`)
    .run('import', 'import_batches', `Import master customer: ${filename}, OK=${barisOk}, WARN=${barisWarn}`);

  return {
    batchId,
    totalBaris: rawRows.length,
    barisOk,
    barisSkip,
    barisWarn,
    peringatan,
    approvalCount,
  };
}

// ---------------------------------------------------------------------------
// IMPORT TRANSAKSI BULANAN
// ---------------------------------------------------------------------------
export async function importTransaksi(buffer: Buffer, filename: string, bulan: string): Promise<ImportResult> {
  // bulan: YYYY-MM
  const wb = XLSX.read(buffer, { type: 'buffer', cellStyles: false }); // tahan biltinId
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Validasi header (PRD 6.2)
  const required = ['Tanggal', 'No Invoice', 'Nama Customer', 'Jenis', 'Jumlah'];
  const headerRow = (XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][])[0] as string[];
  for (const col of required) {
    if (!headerRow.includes(col)) {
      throw new Error(`Header tidak valid: kolom "${col}" tidak ditemukan. File ditolak.`);
    }
  }

  const rawRows = XLSX.utils.sheet_to_json<RawTrxRow>(ws);
  const peringatan: string[] = [];
  let barisOk = 0, barisSkip = 0, barisWarn = 0, approvalCount = 0;

  const batch = db
    .prepare(`INSERT INTO import_batches(tipe, filename, bulan, total_baris) VALUES (?, ?, ?, ?)`)
    .run('transaksi', filename, bulan, rawRows.length);
  const batchId = Number(batch.lastInsertRowid);

  // Ambil semua alias yang sudah ada → Map<nama_pos, outlet_id>
  const aliasMap = new Map<string, string>();
  const aliasRows = db.prepare(`SELECT nama_pos, outlet_id FROM pos_aliases`).all() as { nama_pos: string; outlet_id: string }[];
  for (const a of aliasRows) aliasMap.set(a.nama_pos, a.outlet_id);

  // Ambil semua nama di master customer
  const masterNamas = new Set<string>();
  const outletNamas = db.prepare(`SELECT nama_outlet FROM outlets`).all() as { nama_outlet: string }[];
  for (const o of outletNamas) masterNamas.add(o.nama_outlet);

  // Collect outlet metadata untuk status keaktifan, kalkulasi & exclusion
  interface OutletMeta {
    id: string;
    tipe: OutletTipe;
    identity_id: string;
    nama_outlet: string;
    aktif: number;
    nonaktif_tipe: 'manual' | 'otomatis' | null;
    nonaktif_alasan: string | null;
    nonaktif_tanggal: string | null;
  }

  interface IdentityMeta {
    id: string;
    nama_pemilik: string;
    status: string;
    nonaktif_tipe: 'manual' | 'otomatis' | null;
    nonaktif_alasan: string | null;
  }

  const outletMap = new Map<string, OutletMeta>();
  const outletRows = db.prepare(`SELECT id, tipe, identity_id, nama_outlet, aktif, nonaktif_tipe, nonaktif_alasan, nonaktif_tanggal FROM outlets`).all() as OutletMeta[];
  for (const o of outletRows) {
    outletMap.set(o.id, o);
  }

  const identityMap = new Map<string, IdentityMeta>();
  const identityRows = db.prepare(`SELECT id, nama_pemilik, status, nonaktif_tipe, nonaktif_alasan FROM identities`).all() as IdentityMeta[];
  for (const iden of identityRows) {
    identityMap.set(iden.id, iden);
  }

  // Preload exclusions per identity
  const exclusionsMap = new Map<string, { dari: string; sampai: string }[]>();
  const allExclusions = db.prepare(`SELECT identity_id, dari, sampai FROM exclusions`).all() as { identity_id: string; dari: string; sampai: string }[];
  for (const ex of allExclusions) {
    const list = exclusionsMap.get(ex.identity_id) || [];
    list.push({ dari: ex.dari, sampai: ex.sampai });
    exclusionsMap.set(ex.identity_id, list);
  }

  const insertInvoice = db.prepare(`
    INSERT OR IGNORE INTO invoices(no_invoice, tanggal, nama_pos, jenis, jumlah, batch_id, outlet_id, poin, kupon, is_excluded)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const doImport = db.transaction(() => {
    for (const row of rawRows) {
      // Skip baris Sum
      if (String(row.No || '').toLowerCase() === 'sum' || !row.Tanggal) {
        barisSkip++;
        continue;
      }

      const tanggalRaw = row.Tanggal;
      const noInvoice = (row['No Invoice'] || '').toString().trim();
      const namaCustomer = (row['Nama Customer'] || '').trim();
      const jenis = (row.Jenis || '').trim().toUpperCase();
      const jumlah = Number(row.Jumlah) || 0;

      // Skip CASH (tidak dihitung, tidak perlu peringatan per baris)
      if (namaCustomer === 'CASH' || namaCustomer === '') {
        barisSkip++;
        continue;
      }

      // Konversi tanggal
      let tanggal: string;
      if (typeof tanggalRaw === 'number') {
        tanggal = excelDateToISO(tanggalRaw);
      } else {
        tanggal = String(tanggalRaw).slice(0, 10);
      }

      // Cek pemetaan alias
      let targetOutletId = aliasMap.get(namaCustomer) || null;

      let poin = 0;
      let kupon = 0;
      let isExcluded = 0;

      if (targetOutletId) {
        const outlet = outletMap.get(targetOutletId);
        const identity = outlet ? identityMap.get(outlet.identity_id) : null;

        const isOutletManualClosed = outlet && outlet.aktif === 0 && outlet.nonaktif_tipe === 'manual';
        const isIdentityManualClosed = identity && identity.status === 'nonaktif' && identity.nonaktif_tipe === 'manual';

        const isOutletAutoClosed = outlet && outlet.aktif === 0 && outlet.nonaktif_tipe === 'otomatis';
        const isIdentityAutoClosed = identity && identity.status === 'nonaktif' && identity.nonaktif_tipe === 'otomatis';

        if (isOutletManualClosed || isIdentityManualClosed) {
          // =========================================================================
          // OPSI 1: Outlet / Akun ditutup MANUAL oleh Owner
          // Transaksi TIDAK langsung di-link & TIDAK auto-reopen secara diam-diam.
          // Masuk ke antrean approval 'transaksi_outlet_nonaktif' untuk diverifikasi Owner.
          // =========================================================================
          barisWarn++;

          const existingApproval = db.prepare(`
            SELECT id FROM approvals
            WHERE jenis = 'transaksi_outlet_nonaktif'
              AND json_extract(payload, '$.no_invoice') = ?
              AND json_extract(payload, '$.nama_pos') = ?
          `).get(noInvoice, namaCustomer);

          if (!existingApproval) {
            const alasanNonaktif = outlet?.nonaktif_alasan || identity?.nonaktif_alasan || 'Ditutup secara manual oleh Owner';
            peringatan.push(`Transaksi ${noInvoice} (${namaCustomer}) masuk untuk outlet nonaktif manual ${targetOutletId}. Butuh persetujuan Owner.`);
            db.prepare(`INSERT INTO approvals(jenis, payload, batch_id) VALUES (?, ?, ?)`).run(
              'transaksi_outlet_nonaktif',
              JSON.stringify({
                outlet_id: targetOutletId,
                identity_id: outlet?.identity_id,
                nama_outlet: outlet?.nama_outlet,
                nama_pemilik: identity?.nama_pemilik,
                no_invoice: noInvoice,
                tanggal,
                jumlah,
                jenis_pembayaran: jenis,
                nama_pos: namaCustomer,
                alasan_nonaktif: alasanNonaktif,
                nonaktif_tanggal: outlet?.nonaktif_tanggal,
                keterangan: `Faktur POS masuk untuk outlet yang telah dinonaktifkan manual oleh Owner (${alasanNonaktif}). Perlu ditinjau apakah toko beroperasi kembali.`,
              }),
              batchId
            );
            approvalCount++;
          }

          // Jangan kaitkan ke outlet yang tutup manual (tahan transaksi sampai disetujui Owner)
          targetOutletId = null;
          poin = 0;
          kupon = 0;

        } else {
          // Jika outlet nonaktif OTOMATIS (inaktivitas > 3 bulan) -> AUTO REOPEN!
          if (isOutletAutoClosed || isIdentityAutoClosed) {
            if (outlet && outlet.aktif === 0) {
              db.prepare(`
                UPDATE outlets SET
                  aktif = 1,
                  nonaktif_tipe = NULL,
                  nonaktif_alasan = NULL,
                  nonaktif_tanggal = NULL,
                  nonaktif_oleh = NULL,
                  updated_at = datetime('now','localtime')
                WHERE id = ?
              `).run(targetOutletId);
              outlet.aktif = 1;
              outlet.nonaktif_tipe = null;
              outlet.nonaktif_alasan = null;
            }

            if (identity && identity.status === 'nonaktif') {
              db.prepare(`
                UPDATE identities SET
                  status = 'aktif',
                  nonaktif_tipe = NULL,
                  nonaktif_alasan = NULL,
                  nonaktif_tanggal = NULL,
                  nonaktif_oleh = NULL,
                  updated_at = datetime('now','localtime')
                WHERE id = ?
              `).run(identity.id);
              identity.status = 'aktif';
              identity.nonaktif_tipe = null;
              identity.nonaktif_alasan = null;
            }

            db.prepare(`
              INSERT INTO audit_log(aksi, tabel, record_id, keterangan)
              VALUES (?, ?, ?, ?)
            `).run(
              'auto_reactivate',
              'outlets',
              targetOutletId,
              `Auto-reaktivasi outlet ${targetOutletId} (${outlet?.nama_outlet}) dan akun ${identity?.id} karena transaksi baru (${noInvoice}, ${tanggal}) pada import batch ${batchId}.`
            );
          }

          // Proses hitung poin & kupon seperti biasa
          const tipe = outlet?.tipe;
          const identityId = outlet?.identity_id;
          const userExclusions = identityId ? exclusionsMap.get(identityId) || [] : [];
          const isDateExcluded = userExclusions.some(ex => tanggal >= ex.dari && tanggal <= ex.sampai);

          if (isDateExcluded) {
            isExcluded = 1;
            poin = 0;
            kupon = 0;
          } else if (tipe) {
            const hasil = hitungInvoice(jumlah, tipe);
            poin = hasil.poin;
            kupon = hasil.kupon;
          }
        }
      } else {
        // Nama belum terpetakan — beri peringatan (tidak menghalangi impor)
        barisWarn++;
        // Cek apakah sudah ada antrean approval untuk nama ini (lintas batch)
        const existingWarn = db
          .prepare(`SELECT id FROM approvals WHERE jenis = 'nama_belum_dipetakan' AND json_extract(payload, '$.nama_pos') = ?`)
          .get(namaCustomer);
        if (!existingWarn) {
          peringatan.push(`Nama belum terpetakan: "${namaCustomer}"`);
          db.prepare(`INSERT INTO approvals(jenis, payload, batch_id) VALUES (?, ?, ?)`)
            .run('nama_belum_dipetakan',
              JSON.stringify({ nama_pos: namaCustomer, ada_di_master: masterNamas.has(namaCustomer) }),
              batchId
            );
          approvalCount++;
        }
      }

      // Insert invoice (UNIQUE constraint akan skip duplikat otomatis)
      const result = insertInvoice.run(noInvoice, tanggal, namaCustomer, jenis, jumlah, batchId, targetOutletId, poin, kupon, isExcluded);
      if (result.changes > 0) {
        barisOk++;
      } else {
        barisSkip++;
      }
    }
  });

  doImport();

  // Update batch summary
  db.prepare(`
    UPDATE import_batches
    SET total_baris = ?, baris_ok = ?, baris_skip = ?, baris_warn = ?, status = 'selesai'
    WHERE id = ?
  `).run(rawRows.length, barisOk, barisSkip, barisWarn, batchId);

  // Audit log
  db.prepare(`INSERT INTO audit_log(aksi, tabel, keterangan) VALUES (?, ?, ?)`)
    .run('import', 'invoices', `Import transaksi ${bulan}: ${filename}, OK=${barisOk}, SKIP=${barisSkip}, WARN=${barisWarn}`);

  return {
    batchId,
    totalBaris: rawRows.length,
    barisOk,
    barisSkip,
    barisWarn,
    peringatan,
    approvalCount,
  };
}

// ---------------------------------------------------------------------------
// Petakan alias nama POS ke outlet (dipanggil dari UI approval/pemetaan)
// Menggunakan transferAlias untuk update konsisten dan berlaku surut
// ---------------------------------------------------------------------------
import { transferAlias } from './identity-manager';

export function petakanAlias(namaPos: string, outletId: string): void {
  transferAlias(namaPos, outletId);
}

