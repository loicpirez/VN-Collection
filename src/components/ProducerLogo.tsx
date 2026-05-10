import { Building2 } from 'lucide-react';
import { publicUrlFor } from '@/lib/files';

interface Props {
  producer: { name: string; logo_path?: string | null };
  size?: number;
  className?: string;
}

export function ProducerLogo({ producer, size = 48, className = '' }: Props) {
  const url = publicUrlFor(producer.logo_path);
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={producer.name}
        width={size}
        height={size}
        className={`shrink-0 rounded-md border border-border bg-bg object-contain ${className}`}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  const initials = producer.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-md border border-border bg-bg-elev text-muted ${className}`}
      style={{ width: size, height: size }}
      aria-label={producer.name}
    >
      {initials ? (
        <span className="text-xs font-bold">{initials}</span>
      ) : (
        <Building2 className="h-4 w-4" aria-hidden />
      )}
    </div>
  );
}
