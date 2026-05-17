import { NextResponse } from 'next/server';
import { downloadFullStaffInfo } from '@/lib/staff-full';
import { recordActivity } from '@/lib/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^s\d+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid staff id' }, { status: 400 });
  }
  try {
    const data = await downloadFullStaffInfo(id);
    try {
      recordActivity({
        kind: 'staff.full-download',
        entity: 'staff',
        entityId: id,
        label: 'Downloaded staff credits',
        payload: {
          productionCount: data.productionCredits.length,
          vaCount: data.vaCredits.length,
        },
      });
    } catch (e) {
      console.error(`[staff:${id}] activity log failed:`, (e as Error).message);
    }
    return NextResponse.json({
      ok: true,
      productionCount: data.productionCredits.length,
      vaCount: data.vaCredits.length,
      fetched_at: data.fetched_at,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
