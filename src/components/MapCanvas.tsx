'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PlaceWithLinks } from '@/lib/db';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface Props {
  places: PlaceWithLinks[];
  focusLat?: number | null;
  focusLng?: number | null;
  popupOpenLabel: string;
  popupStockLabel: (n: number) => string;
  popupBranchesLabel: (n: number) => string;
}

export function MapCanvas({
  places,
  focusLat,
  focusLng,
  popupOpenLabel,
  popupStockLabel,
  popupBranchesLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const withCoords = places.filter((p) => p.lat != null && p.lng != null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const defaultCenter: [number, number] =
      focusLat != null && focusLng != null
        ? [focusLat, focusLng]
        : withCoords.length > 0
          ? [withCoords[0].lat!, withCoords[0].lng!]
          : [35.6894, 139.6917];

    const map = L.map(containerRef.current, {
      center: defaultCenter,
      zoom: focusLat != null ? 14 : 12,
      scrollWheelZoom: true,
    });
    mapRef.current = map;

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      },
    ).addTo(map);

    for (const place of withCoords) {
      const marker = L.marker([place.lat!, place.lng!]).addTo(map);
      marker.bindPopup(`
        <div style="font-family:system-ui;min-width:160px">
          <strong style="display:block;margin-bottom:4px;font-size:13px">${place.name}</strong>
          ${place.name_ja ? `<span style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px">${place.name_ja}</span>` : ''}
          <span style="display:block;font-size:11px;color:#94a3b8">${popupStockLabel(place.stock_count)}</span>
          <span style="display:block;font-size:11px;color:#94a3b8;margin-bottom:8px">${popupBranchesLabel(place.provider_labels.length)}</span>
          <a href="/places/${place.id}" style="font-size:12px;color:#818cf8;text-decoration:underline">${popupOpenLabel}</a>
        </div>
      `);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-[60vh] min-h-[400px] w-full rounded-xl border border-border overflow-hidden"
    />
  );
}
