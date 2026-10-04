/**
 * POST /api/aliases/transfer — Pindahkan alias ke outlet lain
 * Berlaku surut, menghitung ulang poin/kupon seluruh invoice terkait
 */
import { NextRequest, NextResponse } from 'next/server';
import { transferAlias } from '@/lib/identity-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { alias_id, nama_pos, target_outlet_id } = body;

    const identifier = alias_id !== undefined ? alias_id : nama_pos;
    if (!identifier || !target_outlet_id) {
      return NextResponse.json({ error: 'alias_id/nama_pos dan target_outlet_id wajib diisi' }, { status: 400 });
    }

    const result = transferAlias(identifier, target_outlet_id);

    return NextResponse.json({
      success: true,
      message: `Alias "${result.nama_pos}" berhasil dipindahkan ke outlet ${target_outlet_id} (${result.updatedInvoices} invoice diperbarui)`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
