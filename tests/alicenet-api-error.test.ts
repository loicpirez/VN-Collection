import { describe, expect, it } from 'vitest';
import { aliceNetApiError } from '@/lib/alicenet-api-error';

async function errorText(error: unknown, fallback = 'fallback'): Promise<string> {
  const response = aliceNetApiError(error, fallback, 502);
  expect(response.status).toBe(502);
  const body = await response.json() as { error: string };
  return body.error;
}

describe('aliceNetApiError', () => {
  it('classifies common network and upstream failure modes', async () => {
    await expect(errorText(new Error('getaddrinfo ENOTFOUND alice.example'))).resolves.toBe(
      'AliceNet host could not be resolved. Check DNS, network, or proxy settings.',
    );
    await expect(errorText(new Error('fetch timeout after 15000ms'))).resolves.toBe(
      'AliceNet request timed out. Check the network or proxy, then retry.',
    );
    await expect(errorText(new Error('proxy connection refused'))).resolves.toBe(
      'AliceNet connection was refused. Check the configured proxy or source availability.',
    );
    await expect(errorText(new Error('HTTP 403 forbidden'))).resolves.toBe(
      'AliceNet rejected the request. Check source availability or proxy access.',
    );
    await expect(errorText(new Error('HTTP 404 not found'))).resolves.toBe(
      'AliceNet source page was not found. The source URL may have changed.',
    );
    await expect(errorText(new Error('malformed page: no rows'))).resolves.toBe(
      'AliceNet source page loaded, but no stock rows could be parsed.',
    );
  });

  it('sanitizes arbitrary thrown strings and falls back for empty values', async () => {
    await expect(
      errorText('failed /Users/example/private/file.html?token=abc123&key=secret'),
    ).resolves.toBe('failed [local path]');
    await expect(
      errorText('failed https://example.test/?token=abc123&key=secret'),
    ).resolves.toBe('failed https://example.test/?token=[redacted]&key=[redacted]');
    await expect(errorText({ cause: 'opaque' }, 'safe fallback')).resolves.toBe('safe fallback');
    await expect(errorText('', 'safe fallback')).resolves.toBe('safe fallback');
  });
});
