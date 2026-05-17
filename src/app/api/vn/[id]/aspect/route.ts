import { NextRequest, NextResponse } from 'next/server';
import { deriveVnAspectKey, getVnAspectOverride, setVnAspectOverride } from '@/lib/db';
import { ASPECT_KEYS, isAspectKey } from '@/lib/aspect-ratio';
import { recordActivity } from '@/lib/activity';
import { validateVnIdOr400 } from '@/lib/vn-id';

function logAspect(kind: 'aspect.set' | 'aspect.clear', id: string, aspectKey?: string) {
  try {
    recordActivity({
      kind,
      entity: 'vn',
      entityId: id,
      label: kind === 'aspect.set' ? 'Set aspect override' : 'Cleared aspect override',
      payload: aspectKey ? { aspect_key: aspectKey } : {},
    });
  } catch (e) {
    console.error(`[aspect:${id}] activity log failed:`, (e as Error).message);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET → returns the user's manual VN-level aspect override (if any)
 *       plus the currently derived aspect (manual → owned override →
 *       cached release resolution → screenshot dims) so the UI can
 *       show both "what we think" and "what the user overrode".
 *
 * PATCH { aspect_key: AspectKey | null, note?: string|null }
 *       → set or clear the override.
 *
 * DELETE → clear the override (sugar — same as PATCH null).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  const override = getVnAspectOverride(id);
  const derived = deriveVnAspectKey(id);
  return NextResponse.json({ override, derived });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = body.aspect_key;
  if (raw == null) {
    setVnAspectOverride({ vnId: id, aspectKey: null });
    logAspect('aspect.clear', id);
  } else if (typeof raw === 'string' && isAspectKey(raw) && raw !== 'unknown') {
    setVnAspectOverride({
      vnId: id,
      aspectKey: raw,
      note: typeof body.note === 'string' ? body.note : null,
    });
    logAspect('aspect.set', id, raw);
  } else {
    return NextResponse.json(
      { error: `aspect_key must be one of: ${ASPECT_KEYS.filter((k) => k !== 'unknown').join(', ')} (or null to clear)` },
      { status: 400 },
    );
  }
  return NextResponse.json({
    override: getVnAspectOverride(id),
    derived: deriveVnAspectKey(id),
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  setVnAspectOverride({ vnId: id, aspectKey: null });
  logAspect('aspect.clear', id);
  return NextResponse.json({ override: null, derived: deriveVnAspectKey(id) });
}
