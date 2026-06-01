# Internationalization audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| I18NA-001 | HIGH | A stock marketplace parser depends on an English display string, coupling logic to one locale. Parse structured source attributes and translate only at render time. | `src/lib/stock.ts` | TODO |
| I18NA-002 | MEDIUM | Sparkline date formatting is hardcoded to `ja-JP`, producing the wrong locale outside Japanese mode. Pass the active locale into the formatter. | `src/components/Sparkline.tsx` | TODO |
| I18NA-003 | MEDIUM | Stock price presentation manually prefixes yen symbols and calls locale formatting inconsistently. Centralize currency formatting with `Intl.NumberFormat`. | `src/components/StockPanel.tsx`, `src/lib/format.ts` | TODO |
| I18NA-004 | MEDIUM | Download-status labels are persisted or emitted as English strings rather than translation keys. Store stable job codes and translate in the client. | `src/lib/download-status.ts`, `src/components/DownloadStatusBar.tsx` | TODO |
| I18NA-005 | MEDIUM | Activity labels are persisted as English presentation text, preventing locale changes from applying consistently. Persist event codes and translate on render. | `src/lib/db.ts`, `src/components/ActivityFeed.tsx` | TODO |
| I18NA-006 | LOW | Map geocoding always requests Japanese and English results, ignoring the active application locale. Build `Accept-Language` from locale settings. | `src/components/MapClient.tsx` | TODO |
| I18NA-007 | LOW | Stock timestamps use local ad-hoc formatting rather than the shared locale-aware date helpers. Reuse one application formatter. | `src/components/StockPanel.tsx`, `src/lib/format.ts` | TODO |
