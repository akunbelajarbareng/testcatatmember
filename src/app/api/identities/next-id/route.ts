/**
 * GET /api/identities/next-id — Generate nomor ID One Identity berikutnya (102-YYMMDD-NN)
 */
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // optional YYYY-MM-DD

    let dateStr = '';
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split('-');
      dateStr = `${y.slice(2)}${m}${d}`;
    } else {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      dateStr = `${yy}${mm}${dd}`;
    }

    const prefix = `102-${dateStr}-`;

    const existing = db.prepare(`SELECT id FROM identities WHERE id LIKE ?`).all(`${prefix}%`) as { id: string }[];

    let maxSeq = 0;
    for (const row of existing) {
      // row.id like 102-YYMMDD-NN
      const parts = row.id.split('-');
      if (parts.length >= 3) {
        const seq = parseInt(parts[2], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }

    const nextSeq = String(maxSeq + 1).padStart(2, '0');
    const nextId = `${prefix}${nextSeq}`;

    return NextResponse.json({
      nextId,
      dateStr,
      seq: maxSeq + 1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
