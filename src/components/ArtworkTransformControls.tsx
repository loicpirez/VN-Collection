'use client';
import { Crosshair, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { dispatchBannerEdit, dispatchCoverAction } from '@/lib/cover-banner-events';
import { useT } from '@/lib/i18n/client';

interface Props {
  /** VN whose resident artwork controls receive the delegated actions. */
  vnId: string;
}

const BUTTON_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-bg-elev/60 text-muted transition-colors hover:border-accent hover:text-white';

/** Compact transforms for the responsive artwork action sheet. */
export function ArtworkTransformControls({ vnId }: Props) {
  const t = useT();
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-t border-border/50 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{t.detail.cover}</span>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => dispatchCoverAction({ vnId, action: 'rotate-left' })}
          className={BUTTON_CLASS}
          title={t.coverActions.rotateLeft}
          aria-label={t.coverActions.rotateLeft}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => dispatchCoverAction({ vnId, action: 'rotate-right' })}
          className={BUTTON_CLASS}
          title={t.coverActions.rotateRight}
          aria-label={t.coverActions.rotateRight}
        >
          <RotateCw className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => dispatchCoverAction({ vnId, action: 'reset-rotation' })}
          className={BUTTON_CLASS}
          title={t.coverActions.resetRotation}
          aria-label={t.coverActions.resetRotation}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{t.banner.title}</span>
      <button
        type="button"
        onClick={() => dispatchBannerEdit({ vnId })}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-border bg-bg-elev/60 px-3 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-white"
      >
        <Crosshair className="h-4 w-4" aria-hidden />
        {t.banner.adjust}
      </button>
    </div>
  );
}
