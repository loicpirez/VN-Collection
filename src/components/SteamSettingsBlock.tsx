'use client';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

interface ServerSettings {
  steam_api_key?: { hasKey: boolean; preview: string | null };
  steam_id?: string;
}

/**
 * Inline Steam credentials editor surfaced on the `/data` page. The
 * SettingsButton modal has its own copy of the same control; we mirror it
 * here so users following the "Steam → /data → ⚙" instructions don't have
 * to hunt for the gear icon.
 */
export function SteamSettingsBlock() {
  const t = useT();
  const toast = useToast();
  const [server, setServer] = useState<ServerSettings | null>(null);
  const [key, setKey] = useState('');
  const [steamId, setSteamId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/settings', { cache: 'no-store' });
      if (!r.ok) return;
      const d = (await r.json()) as ServerSettings;
      setServer(d);
      setSteamId(d.steam_id ?? '');
    } catch {
      // silent — block just stays blank
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      if (key && !key.startsWith('…')) patch.steam_api_key = key;
      if (steamId !== (server?.steam_id ?? '')) patch.steam_id = steamId || null;
      if (Object.keys(patch).length === 0) {
        toast.success(t.toast.saved);
        return;
      }
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      setKey('');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const placeholder = server?.steam_api_key?.hasKey
    ? server.steam_api_key.preview ?? t.settings.steamKeyPlaceholder
    : t.settings.steamKeyPlaceholder;

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <input
        type="text"
        className="input"
        placeholder={placeholder}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <input
        type="text"
        className="input"
        placeholder={t.settings.steamIdPlaceholder}
        value={steamId}
        onChange={(e) => setSteamId(e.target.value)}
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="btn btn-primary sm:col-span-2 sm:w-fit"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {t.common.save}
      </button>
    </div>
  );
}
