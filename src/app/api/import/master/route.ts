/**
 * POST /api/import/master
 * Upload master customer Excel file
 */
import { NextRequest, NextResponse } from 'next/server';
import { importMasterCustomer } from '@/lib/importer';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(ext || '')) {
      return NextResponse.json({ error: 'Format file harus .xlsx atau .xls' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importMasterCustomer(buffer, file.name);

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
