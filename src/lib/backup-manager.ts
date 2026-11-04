/**
 * backup-manager.ts — Layanan Manajemen & Pencadangan Otomatis Database SQLite Lokal
 * Mendukung:
 * 1. Snapshot aman (atomic online backup) menggunakan SQLite Backup API
 * 2. Multi-lokasi penyimpanan lokal:
 *    - Folder internal proyek: <cwd>/data/backups/
 *    - Folder sistem eksternal: C:/Oriental_CRM_Backups/
 * 3. Rotasi Retensi 30 Hari otomatis
 * 4. Pengecekan otomatis harian (auto-backup) di latar belakang saat aplikasi berjalan
 * 5. Integrasi Audit Log & API status
 */
import fs from 'fs';
import path from 'path';
import db from './db';

export const PRIMARY_BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
export const SYSTEM_BACKUP_DIR = path.join('C:', 'Oriental_CRM_Backups');
export const RETENTION_DAYS = 30;

let lastAutoCheckTime = 0;

export interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  path: string;
  location: 'project' | 'system';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Eksekusi pencadangan database SQLite secara aman (Non-blocking & Konsisten)
 */
export async function performLocalBackup(actor: string = 'system'): Promise<{
  success: boolean;
  filename: string;
  sizeBytes: number;
  savedLocations: string[];
}> {
  // 1. Pastikan folder cadangan tersedia
  if (!fs.existsSync(PRIMARY_BACKUP_DIR)) {
    fs.mkdirSync(PRIMARY_BACKUP_DIR, { recursive: true });
  }

  let hasSystemDir = false;
  try {
    if (!fs.existsSync(SYSTEM_BACKUP_DIR)) {
      fs.mkdirSync(SYSTEM_BACKUP_DIR, { recursive: true });
    }
    hasSystemDir = true;
  } catch {
    hasSystemDir = false;
  }

  // 2. Format nama file: oriental_crm_backup_YYYY-MM-DD_HHmmss.db
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `oriental_crm_backup_${dateStr}.db`;

  const primaryFile = path.join(PRIMARY_BACKUP_DIR, filename);
  const savedLocations: string[] = [];

  // 3. Buat Atomic Snapshot langsung ke folder proyek
  await db.backup(primaryFile);
  savedLocations.push(primaryFile);

  const stats = fs.statSync(primaryFile);
  const sizeBytes = stats.size;

  // 4. Salin juga ke folder sistem eksternal C:\Oriental_CRM_Backups jika tersedia
  if (hasSystemDir) {
    try {
      const systemFile = path.join(SYSTEM_BACKUP_DIR, filename);
      fs.copyFileSync(primaryFile, systemFile);
      savedLocations.push(systemFile);
    } catch {
      // Abaikan jika permission C:\ terbatas
    }
  }

  // 5. Catat audit log
  try {
    db.prepare(`
      INSERT INTO audit_log (aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run('backup', 'database', filename, `Pencadangan database lokal (${actor}) -> ${savedLocations.length} lokasi`);
  } catch {}

  // 6. Rotasi Retensi 30 Hari
  rotateOldBackups(PRIMARY_BACKUP_DIR);
  if (hasSystemDir) {
    rotateOldBackups(SYSTEM_BACKUP_DIR);
  }

  return {
    success: true,
    filename,
    sizeBytes,
    savedLocations,
  };
}

/**
 * Hapus file backup yang berumur lebih dari 30 hari
 */
function rotateOldBackups(dir: string): void {
  try {
    if (!fs.existsSync(dir)) return;
    const cutoffTime = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.startsWith('oriental_crm_backup_') && file.endsWith('.db')) {
        const filePath = path.join(dir, file);
        const fStat = fs.statSync(filePath);
        if (fStat.mtimeMs < cutoffTime) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch {}
}

/**
 * Ambil daftar cadangan lokal terbaru
 */
export function getLocalBackupsList(): BackupFileInfo[] {
  const result: BackupFileInfo[] = [];
  const seenFiles = new Set<string>();

  // Baca dari folder proyek
  if (fs.existsSync(PRIMARY_BACKUP_DIR)) {
    try {
      const files = fs.readdirSync(PRIMARY_BACKUP_DIR);
      for (const file of files) {
        if (file.startsWith('oriental_crm_backup_') && file.endsWith('.db')) {
          const filePath = path.join(PRIMARY_BACKUP_DIR, file);
          const stat = fs.statSync(filePath);
          result.push({
            filename: file,
            sizeBytes: stat.size,
            sizeFormatted: formatBytes(stat.size),
            createdAt: stat.mtime.toISOString(),
            path: filePath,
            location: 'project',
          });
          seenFiles.add(file);
        }
      }
    } catch {}
  }

  // Baca dari folder sistem eksternal
  if (fs.existsSync(SYSTEM_BACKUP_DIR)) {
    try {
      const files = fs.readdirSync(SYSTEM_BACKUP_DIR);
      for (const file of files) {
        if (file.startsWith('oriental_crm_backup_') && file.endsWith('.db') && !seenFiles.has(file)) {
          const filePath = path.join(SYSTEM_BACKUP_DIR, file);
          const stat = fs.statSync(filePath);
          result.push({
            filename: file,
            sizeBytes: stat.size,
            sizeFormatted: formatBytes(stat.size),
            createdAt: stat.mtime.toISOString(),
            path: filePath,
            location: 'system',
          });
          seenFiles.add(file);
        }
      }
    } catch {}
  }

  // Urutkan dari yang paling baru
  result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return result;
}

/**
 * Pengecekan otomatis (Auto-Backup Guard):
 * Jika dalam 20 jam terakhir belum ada backup yang dibuat,
 * otomatis jalankan pencadangan di latar belakang (background asynchronous).
 */
export function triggerBackgroundAutoBackupIfNeeded(): void {
  const now = Date.now();
  // Batasi pengecekan agar tidak mengecek file system setiap millisecond (maksimal 1x tiap 15 menit)
  if (now - lastAutoCheckTime < 15 * 60 * 1000) {
    return;
  }
  lastAutoCheckTime = now;

  setImmediate(async () => {
    try {
      const backups = getLocalBackupsList();
      const latest = backups[0];
      const twentyHoursAgo = Date.now() - 20 * 60 * 60 * 1000;

      if (!latest || new Date(latest.createdAt).getTime() < twentyHoursAgo) {
        console.log('[AutoBackup] Belum ada backup dalam 20 jam terakhir. Menjalankan auto-backup lokal...');
        const res = await performLocalBackup('in_app_scheduler');
        console.log(`[AutoBackup] Berhasil mencadangkan ke lokal: ${res.filename} (${formatBytes(res.sizeBytes)})`);
      }
    } catch (err) {
      console.error('[AutoBackup] Gagal menjalankan auto-backup latar belakang:', err);
    }
  });
}
