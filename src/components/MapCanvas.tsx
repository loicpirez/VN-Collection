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
  focusId?: number | null;
  popupOpenLabel: string;
  popupStockLabel: (n: number) => string;
  popupBranchesLabel: (n: number) => string;
}

function buildPopup(
  place: PlaceWithLinks,
  popupStockLabel: (n: number) => string,
  popupBranchesLabel: (n: number) => string,
  popupOpenLabel: string,
): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  return `
    <div style="font-family:system-ui;min-width:160px">
      <strong style="display:block;margin-bottom:4px;font-size:13px">${escape(place.name)}</strong>
      ${place.name_ja ? `<span style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px">${escape(place.name_ja)}</span>` : ''}
      <span style="display:block;font-size:11px;color:#94a3b8">${escape(popupStockLabel(place.stock_count))}</span>
      <span style="display:block;font-size:11px;color:#94a3b8;margin-bottom:8px">${escape(popupBranchesLabel(place.provider_labels.length))}</span>
      <a href="/places/${place.id}" style="font-size:12px;color:#818cf8;text-decoration:underline">${escape(popupOpenLabel)}</a>
    </div>
  `;
}

export function MapCanvas({
  places,
  focusLat,
  focusLng,
  focusId,
  popupOpenLabel,
  popupStockLabel,
  popupBranchesLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const withCoords = places.filter((p) => p.lat != null && p.lng != null);
    const focusPlace = focusId != null ? withCoords.find((p) => p.id === focusId) : null;
    const defaultCenter: [number, number] =
      focusPlace
        ? [focusPlace.lat!, focusPlace.lng!]
        : focusLat != null && focusLng != null
          ? [focusLat, focusLng]
          : withCoords.length > 0
            ? [withCoords[0].lat!, withCoords[0].lng!]
            : [35.6894, 139.6917];

    const map = L.map(containerRef.current, {
      center: defaultCenter,
      zoom: focusPlace != null || focusLat != null ? 15 : 12,
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

    return () => {
      markersRef.current.clear();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const withCoords = places.filter((p) => p.lat != null && p.lng != null);
    const current = markersRef.current;
    const nextIds = new Set(withCoords.map((p) => p.id));
    for (const [id, marker] of current.entries()) {
      if (!nextIds.has(id)) {
        marker.remove();
        current.delete(id);
      }
    }
    for (const place of withCoords) {
      const html = buildPopup(place, popupStockLabel, popupBranchesLabel, popupOpenLabel);
      const existing = current.get(place.id);
      if (existing) {
        const [curLat, curLng] = [existing.getLatLng().lat, existing.getLatLng().lng];
        if (curLat !== place.lat || curLng !== place.lng) existing.setLatLng([place.lat!, place.lng!]);
        existing.setPopupContent(html);
      } else {
        const marker = L.marker([place.lat!, place.lng!]).addTo(map);
        marker.bindPopup(html);
        current.set(place.id, marker);
      }
    }
  }, [places, popupOpenLabel, popupStockLabel, popupBranchesLabel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (focusId != null) {
      const marker = markersRef.current.get(focusId);
      if (marker) {
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
        setTimeout(() => marker.openPopup(), 100);
        return;
      }
    }
    if (focusLat != null && focusLng != null) {
      map.setView([focusLat, focusLng], Math.max(map.getZoom(), 14));
    }
  }, [focusId, focusLat, focusLng, places]);

  return (
    <div
      ref={containerRef}
      className="h-[60vh] min-h-[400px] w-full rounded-xl border border-border overflow-hidden"
    />
  );
}
