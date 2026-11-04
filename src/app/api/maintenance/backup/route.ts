/**
 * /api/maintenance/backup — API Cadangan Database SQLite (.db) Lokal
 * Khusus Role Admin / Owner
 * - GET ?action=list : Mengambil daftar cadangan lokal beserta ukuran & tanggal
 * - GET ?filename=xxx : Mengunduh file cadangan spesifik
 * - GET (default) : Snapshot instan dan unduh langsung melalui browser
 * - POST : Memicu pencadangan otomatis ke folder lokal (data/backups & C:\Oriental_CRM_Backups)
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/auth';
import {
  performLocalBackup,
  getLocalBackupsList,
  PRIMARY_BACKUP_DIR,
  SYSTEM_BACKUP_DIR,
} from '@/lib/backup-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const filename = url.searchParams.get('filename');

  try {
    // 1. Ambil daftar cadangan lokal
    if (action === 'list') {
      const backups = getLocalBackupsList();
      return NextResponse.json({
        success: true,
        total: backups.length,
        backups,
      });
    }

    // 2. Unduh file cadangan spesifik
    if (filename) {
      const cleanFilename = path.basename(filename);
      const possiblePaths = [
        path.join(PRIMARY_BACKUP_DIR, cleanFilename),
        path.join(SYSTEM_BACKUP_DIR, cleanFilename),
      ];

      const targetPath = possiblePaths.find((p) => fs.existsSync(p));
      if (!targetPath) {
        return NextResponse.json({ error: 'File cadangan tidak ditemukan' }, { status: 404 });
      }

      const fileBuffer = fs.readFileSync(targetPath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-sqlite3',
          'Content-Disposition': `attachment; filename="${cleanFilename}"`,
          'Content-Length': String(fileBuffer.length),
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    // 3. Mode default: Eksekusi snapshot lokal baru & langsung stream unduhan ke browser
    const result = await performLocalBackup(auth.user.username);
    const targetFile = result.savedLocations[0];
    const fileBuffer = fs.readFileSync(targetFile);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-sqlite3',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal memproses permintaan cadangan';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, { role: 'admin' });
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const result = await performLocalBackup(auth.user.username);
    const backups = getLocalBackupsList();

    return NextResponse.json({
      success: true,
      message: 'Database berhasil dicadangkan ke folder lokal',
      result,
      backups,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal melakukan pencadangan otomatis';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
