// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://example.test/"}
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DisplaySettingsProvider } from '@/lib/settings/client';

describe('DisplaySettingsProvider secure persistence', () => {
  it('persists settings from an HTTPS document', () => {
    render(
      <DisplaySettingsProvider>
        <span>body</span>
      </DisplaySettingsProvider>,
    );
    expect(document.cookie).toContain('vn_display_settings_v1=');
  });
});
