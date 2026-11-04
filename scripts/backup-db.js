/**
 * backup-db.js — Skrip Cadangan Otomatis Database SQLite CRM Oriental
 * Fitur:
 * 1. Snapshot aman (atomic online backup) menggunakan SQLite Backup API
 * 2. Multi-lokasi penyimpanan otomatis:
 *    - Folder sistem eksternal: C:/Oriental_CRM_Backups
 *    - Folder internal proyek : ./data/backups
 * 3. Rotasi Retensi 30 Hari (otomatis bersihkan cadangan yang lebih tua dari 30 hari)
 * 4. Catat riwayat log ke backup.log
 * 
 * Penggunaan:
 * node scripts/backup-db.js [target_directory]
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_SOURCE = path.join(__dirname, '..', 'data', 'oriental_crm.db');
const SYSTEM_BACKUP_DIR = process.argv[2] || path.join('C:', 'Oriental_CRM_Backups');
const PROJECT_BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const RETENTION_DAYS = 30;

async function runBackup() {
  const timestamp = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}_${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
  const backupFileName = `oriental_crm_backup_${dateStr}.db`;

  console.log(`[${new Date().toISOString()}] Memulai pencadangan database Oriental CRM...`);

  if (!fs.existsSync(DB_SOURCE)) {
    console.error(`[ERROR] File database sumber tidak ditemukan: ${DB_SOURCE}`);
    process.exit(1);
  }

  // Siapkan folder target
  const targetDirs = [];

  // 1. Folder Project
  try {
    if (!fs.existsSync(PROJECT_BACKUP_DIR)) {
      fs.mkdirSync(PROJECT_BACKUP_DIR, { recursive: true });
    }
    targetDirs.push(PROJECT_BACKUP_DIR);
  } catch (err) {
    console.warn(`[WARN] Gagal membuat direktori proyek: ${err.message}`);
  }

  // 2. Folder Eksternal C:\Oriental_CRM_Backups
  try {
    if (!fs.existsSync(SYSTEM_BACKUP_DIR)) {
      fs.mkdirSync(SYSTEM_BACKUP_DIR, { recursive: true });
    }
    targetDirs.push(SYSTEM_BACKUP_DIR);
  } catch (err) {
    console.warn(`[WARN] Gagal membuat direktori sistem di ${SYSTEM_BACKUP_DIR}: ${err.message}`);
  }

  if (targetDirs.length === 0) {
    console.error('[ERROR] Tidak ada direktori target yang dapat diakses untuk pencadangan.');
    process.exit(1);
  }

  const primaryDir = targetDirs[0];
  const primaryDestination = path.join(primaryDir, backupFileName);
  const logFile = path.join(SYSTEM_BACKUP_DIR, 'backup.log');

  const log = (msg) => {
    const line = `[${new Date().toLocaleString('id-ID')}] ${msg}\n`;
    console.log(msg);
    try {
      if (fs.existsSync(SYSTEM_BACKUP_DIR)) {
        fs.appendFileSync(logFile, line, 'utf-8');
      }
    } catch {}
  };

  try {
    const db = new Database(DB_SOURCE);
    log(`Membuat atomic snapshot dari: ${DB_SOURCE}`);
    log(`Menyimpan cadangan utama ke: ${primaryDestination}`);

    // Eksekusi API backup SQLite
    await db.backup(primaryDestination);
    db.close();

    const stats = fs.statSync(primaryDestination);
    const sizeKB = (stats.size / 1024).toFixed(1);
    log(`✓ Cadangan utama sukses dibuat! Ukuran: ${sizeKB} KB (${stats.size} bytes)`);

    // Gandakan ke direktori target lainnya jika ada
    for (let i = 1; i < targetDirs.length; i++) {
      const otherDir = targetDirs[i];
      const otherDest = path.join(otherDir, backupFileName);
      try {
        fs.copyFileSync(primaryDestination, otherDest);
        log(`✓ Berhasil disalin ke lokasi sekunder: ${otherDest}`);
      } catch (copyErr) {
        log(`[WARN] Gagal menyalin ke ${otherDest}: ${copyErr.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // Rotasi Retensi 30 Hari di Seluruh Direktori Target
    // -------------------------------------------------------------------------
    const cutoffTime = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);

    for (const dir of targetDirs) {
      log(`Memeriksa rotasi cadangan lama (> ${RETENTION_DAYS} hari) di ${dir}...`);
      try {
        const files = fs.readdirSync(dir);
        let deletedCount = 0;
        let retainedCount = 0;

        for (const file of files) {
          if (file.startsWith('oriental_crm_backup_') && file.endsWith('.db')) {
            const filePath = path.join(dir, file);
            const fStat = fs.statSync(filePath);
            if (fStat.mtimeMs < cutoffTime) {
              fs.unlinkSync(filePath);
              log(`  - Dihapus (kadaluwarsa): ${file}`);
              deletedCount++;
            } else {
              retainedCount++;
            }
          }
        }
        log(`  ✓ Lokasi ${dir}: ${retainedCount} cadangan aktif disimpan (${deletedCount} dihapus).`);
      } catch (rotErr) {
        log(`[WARN] Gagal rotasi di ${dir}: ${rotErr.message}`);
      }
    }

    log(`✓ Selesai! Pencadangan otomatis sukses di seluruh lokasi target.`);
    return { success: true, primaryDestination, targetDirs };
  } catch (err) {
    log(`[ERROR] Gagal melakukan pencadangan: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  runBackup();
}

module.exports = { runBackup };
