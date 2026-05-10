'use client';
import { useState, type CSSProperties } from 'react';
import { Eye, EyeOff, ImageOff, ShieldAlert } from 'lucide-react';
import { isExplicit, useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';

export interface SafeImageProps {
  src?: string | null;
  localSrc?: string | null;
  alt: string;
  sexual?: number | null;
  className?: string;
  style?: CSSProperties;
  fit?: 'cover' | 'contain';
  onLoadError?: () => void;
}

function publicLocal(rel: string | null | undefined): string | null {
  if (!rel) return null;
  return `/api/files/${rel}`;
}

export function SafeImage({
  src,
  localSrc,
  alt,
  sexual,
  className = '',
  style,
  fit = 'cover',
  onLoadError,
}: SafeImageProps) {
  const t = useT();
  const { settings } = useDisplaySettings();
  const [reveal, setReveal] = useState(false);
  const [errored, setErrored] = useState(false);

  const local = publicLocal(localSrc);
  const url = settings.preferLocalImages ? local || src || '' : src || local || '';
  const explicit = isExplicit(sexual, settings.nsfwThreshold);
  const shouldBlur = explicit && settings.blurR18 && !reveal;

  if (settings.hideImages) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-bg-elev text-muted ${className}`}
        style={style}
        role="img"
        aria-label={alt}
      >
        <EyeOff className="h-6 w-6" aria-hidden />
        <span className="text-[11px]">{t.settings.hiddenImage}</span>
      </div>
    );
  }

  if (errored || !url) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-bg-elev text-muted ${className}`}
        style={style}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="h-6 w-6" aria-hidden />
        <span className="text-[11px]">{t.common.noImage}</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} transition-[filter,transform] duration-200 ${shouldBlur ? 'scale-105 blur-2xl' : ''}`}
        onError={() => {
          setErrored(true);
          onLoadError?.();
        }}
      />
      {shouldBlur && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setReveal(true);
          }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white backdrop-blur-sm hover:bg-black/40"
        >
          <ShieldAlert className="h-6 w-6 text-accent" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wider">{t.settings.r18Blurred}</span>
          <span className="inline-flex items-center gap-1 text-[11px] opacity-80">
            <Eye className="h-3 w-3" /> {t.settings.clickToReveal}
          </span>
        </button>
      )}
    </div>
  );
}
