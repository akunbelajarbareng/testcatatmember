/**
 * POST /api/import/transaksi
 * Upload monthly transaction Excel file
 * Body: multipart/form-data { file: File, bulan: 'YYYY-MM' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { importTransaksi } from '@/lib/importer';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bulan = formData.get('bulan') as string | null;

    if (!file) return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 });
    if (!bulan || !/^\d{4}-\d{2}$/.test(bulan)) {
      return NextResponse.json({ error: 'Parameter bulan harus format YYYY-MM' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(ext || '')) {
      return NextResponse.json({ error: 'Format file harus .xlsx atau .xls' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importTransaksi(buffer, file.name, bulan);

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
