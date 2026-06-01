import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/components/StockPanel.tsx', import.meta.url), 'utf8');

describe('stock disclosure hydration', () => {
  it('loads persisted disclosure preferences after hydration', () => {
    expect(source).toContain("const [providerSetupOpen, setProviderSetupOpen] = useStockUiPreference('providerSetupOpen');");
    expect(source).toContain("const [searchSetupOpen, setSearchSetupOpen] = useStockUiPreference('searchSetupOpen');");
    expect(source).toContain("const [isOpen, setIsOpen] = useStockUiPreference('providerDiagOpen', defaultOpen ?? false);");
    expect(source).not.toMatch(/useState\(\(\) => \{\s*try \{\s*const raw = localStorage\.getItem\(STOCK_UI_KEY\)/);
  });

  it('validates stored preference values before use', () => {
    expect(source).toContain("typeof record.providerSetupOpen === 'boolean'");
    expect(source).toContain("typeof record.searchSetupOpen === 'boolean'");
    expect(source).toContain("typeof record.providerDiagOpen === 'boolean'");
  });
});
