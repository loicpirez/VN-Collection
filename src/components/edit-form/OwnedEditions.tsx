'use client';
import { memo } from 'react';
import { useT } from '@/lib/i18n/client';
import { TagInput } from '../TagInput';
import { BOX_TYPES, EDITION_TYPES, LOCATIONS, type BoxType, type EditionType, type Location } from '@/lib/types';

interface Props {
  location: Location;
  onLocationChange: (next: Location) => void;
  editionType: EditionType;
  onEditionTypeChange: (next: EditionType) => void;
  boxType: BoxType;
  onBoxTypeChange: (next: BoxType) => void;
  editionLabel: string;
  onEditionLabelChange: (next: string) => void;
  physicalLocations: string[];
  onPhysicalLocationsChange: (next: string[]) => void;
  knownPlaces: string[];
  downloadUrl: string;
  onDownloadUrlChange: (next: string) => void;
  dumped: boolean;
  onDumpedChange: (next: boolean) => void;
}

/**
 * P-157: memoized "My editions" inventory field group (location, edition
 * type/label, box type, physical locations, download URL, dumped flag).
 * State stays in EditForm; this block receives values plus stable setters
 * so typing in tracking/notes does not re-render these inputs.
 */
export const OwnedEditions = memo(function OwnedEditions({
  location,
  onLocationChange,
  editionType,
  onEditionTypeChange,
  boxType,
  onBoxTypeChange,
  editionLabel,
  onEditionLabelChange,
  physicalLocations,
  onPhysicalLocationsChange,
  knownPlaces,
  downloadUrl,
  onDownloadUrlChange,
  dumped,
  onDumpedChange,
}: Props) {
  const t = useT();
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">{t.form.inventoryTitle}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="label">{t.form.location}</span>
          <select className="input" value={location} onChange={(e) => onLocationChange(e.target.value as Location)}>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>{t.locations[l]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">{t.form.editionType}</span>
          <select className="input" value={editionType} onChange={(e) => onEditionTypeChange(e.target.value as EditionType)}>
            {EDITION_TYPES.map((e) => (
              <option key={e} value={e}>{t.editions[e]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">{t.form.boxType}</span>
          <select className="input" value={boxType} onChange={(e) => onBoxTypeChange(e.target.value as BoxType)}>
            {BOX_TYPES.map((b) => (
              <option key={b} value={b}>{t.boxTypes[b]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="label">{t.form.editionLabel}</span>
          <input
            className="input"
            type="text"
            autoComplete="off"
            placeholder={t.form.editionLabelPlaceholder}
            value={editionLabel}
            onChange={(e) => onEditionLabelChange(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="label">{t.form.physicalLocation}</span>
          <TagInput
            values={physicalLocations}
            onChange={onPhysicalLocationsChange}
            placeholder={t.form.physicalLocationPlaceholder}
            suggestions={knownPlaces}
            maxLength={200}
            maxValues={32}
          />
          <span className="text-[10px] text-muted/70">{t.form.physicalLocationHint}</span>
        </div>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="label">{t.form.downloadUrl}</span>
          <input
            className="input"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder={t.form.downloadUrlPlaceholder}
            value={downloadUrl}
            onChange={(e) => onDownloadUrlChange(e.target.value)}
            maxLength={2000}
            aria-label={t.form.downloadUrl}
          />
          <span className="text-[10px] text-muted/70">{t.form.downloadUrlHint}</span>
        </label>
        <label className="flex items-start gap-2 sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
            checked={dumped}
            onChange={(e) => onDumpedChange(e.target.checked)}
          />
          <div className="flex flex-col gap-0.5">
            <span className="label">{t.form.dumped}</span>
            <span className="text-[10px] text-muted/70">{t.form.dumpedHint}</span>
          </div>
        </label>
      </div>
    </div>
  );
});
