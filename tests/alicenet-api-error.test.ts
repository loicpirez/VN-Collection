import { describe, expect, it } from 'vitest';
import { aliceNetApiError } from '@/lib/alicenet-api-error';
import { decodeApiErrorBody, type DecodedApiErrorBody } from '@/lib/api-error-shape';

async function errorBody(error: unknown, fallback = 'fallback'): Promise<DecodedApiErrorBody> {
  const response = aliceNetApiError(error, fallback, 502, 'alicenet/test');
  expect(response.status).toBe(502);
  const value: unknown = await response.json();
  const body = decodeApiErrorBody(value);
  if (!body) throw new Error('AliceNet response did not use the API error contract');
  expect(body.context).toBe('alicenet/test');
  return body;
}

describe('aliceNetApiError', () => {
  it('uses the AliceNet operation context by default', async () => {
    const response = aliceNetApiError(new Error('operation failed'), 'fallback', 502);
    expect(response.status).toBe(502);
    const value: unknown = await response.json();
    const body = decodeApiErrorBody(value);
    expect(body?.context).toBe('alicenet');
  });

  it('classifies common network and upstream failure modes', async () => {
    await expect(errorBody(new Error('getaddrinfo ENOTFOUND alice.example'))).resolves.toMatchObject({
      error: 'AliceNet host could not be resolved. Check DNS, network, or proxy settings.',
      code: 'alicenet_dns_failure',
    });
    await expect(errorBody(new Error('fetch timeout after 15000ms'))).resolves.toMatchObject({
      error: 'AliceNet request timed out. Check the network or proxy, then retry.',
      code: 'alicenet_timeout',
    });
    await expect(errorBody(new Error('proxy connection refused'))).resolves.toMatchObject({
      error: 'AliceNet connection was refused. Check the configured proxy or source availability.',
      code: 'alicenet_connection_refused',
    });
    await expect(errorBody(new Error('AliceNet HTTP 429 Too Many Requests'))).resolves.toMatchObject({
      error: 'AliceNet is rate limiting requests. Wait before retrying or reduce the request rate.',
      code: 'alicenet_rate_limited',
    });
    await expect(errorBody(new Error('AliceNet HTTP 503'))).resolves.toMatchObject({
      error: 'AliceNet is temporarily unavailable. Retry later or check the AliceNet proxy settings.',
      code: 'alicenet_upstream_unavailable',
    });
    await expect(errorBody(new Error('HTTP 403 forbidden'))).resolves.toMatchObject({
      error: 'AliceNet rejected the request. Check source availability or proxy access.',
      code: 'alicenet_forbidden',
    });
    await expect(errorBody(new Error('HTTP 404 not found'))).resolves.toMatchObject({
      error: 'AliceNet source page was not found. The source URL may have changed.',
      code: 'alicenet_not_found',
    });
    await expect(errorBody(new Error('malformed page: no rows'))).resolves.toMatchObject({
      error: 'AliceNet source page loaded, but no stock rows could be parsed.',
      code: 'alicenet_parse_failed',
    });
  });

  it('sanitizes arbitrary thrown strings and falls back for empty values', async () => {
    await expect(
      errorBody('failed /Users/example/private/file.html?token=abc123&key=secret'),
    ).resolves.toMatchObject({ error: 'failed [local path]', code: 'alicenet_operation_failed' });
    await expect(
      errorBody('failed https://example.test/?token=abc123&key=secret'),
    ).resolves.toMatchObject({
      error: 'failed https://example.test/?token=[redacted]&key=[redacted]',
      code: 'alicenet_operation_failed',
    });
    await expect(errorBody({ cause: 'opaque' }, 'safe fallback')).resolves.toMatchObject({ error: 'safe fallback' });
    await expect(errorBody('', 'safe fallback')).resolves.toMatchObject({ error: 'safe fallback' });
  });
});
