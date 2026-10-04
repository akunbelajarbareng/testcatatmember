/**
 * backup-db.js — Skrip Cadangan Otomatis Database SQLite CRM Oriental
 * Fitur:
 * 1. Snapshot aman (atomic online backup) menggunakan SQLite Backup API
 * 2. Simpan cadangan ke folder arsip (default: C:/Oriental_CRM_Backups atau ./data/backups)
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
const DEFAULT_BACKUP_DIR = process.argv[2] || path.join('C:', 'Oriental_CRM_Backups');
const FALLBACK_BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
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

  // Tentukan direktori penyimpanan cadangan
  let targetDir = DEFAULT_BACKUP_DIR;
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  } catch (err) {
    console.warn(`[WARN] Tidak dapat membuat direktori di ${DEFAULT_BACKUP_DIR}: ${err.message}. Menggunakan fallback direktori proyek.`);
    targetDir = FALLBACK_BACKUP_DIR;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  }

  const destinationFile = path.join(targetDir, backupFileName);
  const logFile = path.join(targetDir, 'backup.log');

  const log = (msg) => {
    const line = `[${new Date().toLocaleString('id-ID')}] ${msg}\n`;
    console.log(msg);
    try {
      fs.appendFileSync(logFile, line, 'utf-8');
    } catch {}
  };

  try {
    const db = new Database(DB_SOURCE);
    log(`Membuat atomic snapshot dari: ${DB_SOURCE}`);
    log(`Menyimpan cadangan ke: ${destinationFile}`);

    // Eksekusi API backup SQLite
    await db.backup(destinationFile);
    db.close();

    const stats = fs.statSync(destinationFile);
    const sizeKB = (stats.size / 1024).toFixed(1);
    log(`✓ Cadangan sukses dibuat! Ukuran: ${sizeKB} KB (${stats.size} bytes)`);

    // -------------------------------------------------------------------------
    // Rotasi Retensi 30 Hari
    // -------------------------------------------------------------------------
    log(`Memeriksa rotasi cadangan lama (> ${RETENTION_DAYS} hari)...`);
    const files = fs.readdirSync(targetDir);
    const cutoffTime = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let deletedCount = 0;
    let retainedCount = 0;

    for (const file of files) {
      if (file.startsWith('oriental_crm_backup_') && file.endsWith('.db')) {
        const filePath = path.join(targetDir, file);
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

    log(`✓ Selesai! Cadangan aktif tersimpan: ${retainedCount} file (Dihapus: ${deletedCount} file lama).`);
    return { success: true, destinationFile, retainedCount };
  } catch (err) {
    log(`[ERROR] Gagal melakukan pencadangan: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  runBackup();
}

module.exports = { runBackup };
