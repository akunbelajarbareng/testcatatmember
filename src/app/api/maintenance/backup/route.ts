/**
 * GET /api/maintenance/backup — Unduh Snapshot File Database SQLite (.db)
 * Khusus Role Admin / Owner
 * Menggunakan SQLite Backup API bawaan better-sqlite3 (Non-blocking & Konsisten)
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // 1. Verifikasi Session Admin
  const auth = requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const backupDir = path.join(process.cwd(), 'data', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Format nama file: oriental_crm_YYYY-MM-DD_HHmmss.db
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `oriental_crm_backup_${dateStr}.db`;
    const tempBackupPath = path.join(backupDir, filename);

    // 2. Eksekusi Snapshot Aman dengan db.backup()
    await db.backup(tempBackupPath);

    // 3. Catat ke Audit Log
    db.prepare(`
      INSERT INTO audit_log(aksi, tabel, record_id, keterangan)
      VALUES (?, ?, ?, ?)
    `).run('backup', 'database', filename, `Unduh manual cadangan database oleh ${auth.user.username}`);

    // 4. Baca file dan kirimkan sebagai binary stream download
    const fileBuffer = fs.readFileSync(tempBackupPath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-sqlite3',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal membuat cadangan database';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
