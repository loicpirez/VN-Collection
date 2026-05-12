import { NextResponse } from 'next/server';
import { downloadFullStaffInfo } from '@/lib/staff-full';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^s\d+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid staff id' }, { status: 400 });
  }
  try {
    const data = await downloadFullStaffInfo(id);
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
