import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockPayloadTooLargeError extends Error {}
  class MockUnsupportedFileType extends Error {}

  return {
    fetchProducer: vi.fn(),
    getProducer: vi.fn(),
    recordActivity: vi.fn(),
    requireLocalhostOrToken: vi.fn(),
    reparseWithLimit: vi.fn(),
    saveUpload: vi.fn(),
    setProducerLogo: vi.fn(),
    upsertProducer: vi.fn(),
    PayloadTooLargeError: MockPayloadTooLargeError,
    UnsupportedFileType: MockUnsupportedFileType,
  };
});

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  getProducer: mocks.getProducer,
  setProducerLogo: mocks.setProducerLogo,
  upsertProducer: mocks.upsertProducer,
}));

vi.mock('@/lib/vndb', () => ({
  getProducer: mocks.fetchProducer,
}));

vi.mock('@/lib/files', () => ({
  saveUpload: mocks.saveUpload,
  UnsupportedFileType: mocks.UnsupportedFileType,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/read-limited-body', () => ({
  PayloadTooLargeError: mocks.PayloadTooLargeError,
  reparseWithLimit: mocks.reparseWithLimit,
}));

import {
  DELETE,
  POST,
} from '@/app/api/producer/[id]/logo/route';

const PRODUCER_ID = 'p990301';
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

type FormFields = {
  file?: File | null;
  formDataThrows?: boolean;
};

class HugeFile extends File {
  get size(): number {
    return MAX_LOGO_BYTES + 1;
  }
}

function producerRow(): { id: string; name: string; logo: string | null } {
  return { id: PRODUCER_ID, name: 'Producer Fixture', logo: null };
}

function ctx(id = PRODUCER_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function req(method: 'POST' | 'DELETE', headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/producer/${PRODUCER_ID}/logo`, {
    method,
    headers,
    body: method === 'POST' ? '' : undefined,
  });
}

function boundedRequest(fields: FormFields): Request {
  const form = new FormData();
  if (fields.file) form.set('file', fields.file);
  const request = new Request(`http://127.0.0.1/api/producer/${PRODUCER_ID}/logo`, { method: 'POST' });
  Object.defineProperty(request, 'formData', {
    value: fields.formDataThrows
      ? async () => {
        throw new Error('bad form');
      }
      : async () => form,
  });
  return request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.getProducer.mockReturnValue(producerRow());
  mocks.fetchProducer.mockResolvedValue(producerRow());
  mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
    file: new File(['logo'], 'logo.png', { type: 'image/png' }),
  }));
  mocks.saveUpload.mockResolvedValue('producer/p990301.png');
});

describe('POST /api/producer/[id]/logo route branches', () => {
  it('returns the auth gate response before parsing upload data', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);
    const response = await POST(req('POST'), ctx());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    expect(mocks.getProducer).not.toHaveBeenCalled();
  });

  it('rejects declared logo payloads above the image limit', async () => {
    const response = await POST(req('POST', { 'content-length': String(MAX_LOGO_BYTES + 1) }), ctx());
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'payload too large (5.0 MB, max 5.0 MB)',
    });
  });

  it('rejects malformed producer ids', async () => {
    const response = await POST(req('POST'), ctx('bad'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid id' });
  });

  it('returns 404 when VNDB cannot hydrate a missing producer', async () => {
    mocks.getProducer.mockReturnValue(null);
    mocks.fetchProducer.mockResolvedValue(null);
    const response = await POST(req('POST'), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'producer not found' });
  });

  it('returns a sanitized upstream error when producer hydration fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getProducer.mockReturnValue(null);
    mocks.fetchProducer.mockRejectedValue(new Error('upstream detail'));
    const response = await POST(req('POST'), ctx());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'upstream service unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:producer/[id]/logo] upstream detail');
    consoleSpy.mockRestore();
  });

  it('hydrates missing producers before saving a logo', async () => {
    mocks.getProducer
      .mockReturnValueOnce(null)
      .mockReturnValue(producerRow());
    const response = await POST(req('POST'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ producer: producerRow() });
    expect(mocks.upsertProducer).toHaveBeenCalledWith(producerRow());
    expect(mocks.setProducerLogo).toHaveBeenCalledWith(PRODUCER_ID, 'producer/p990301.png');
  });

  it('maps reparse limit failures to the upload-specific 413 response', async () => {
    mocks.reparseWithLimit.mockRejectedValue(new mocks.PayloadTooLargeError('too large'));
    const response = await POST(req('POST'), ctx());
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'file too large (max 5MB)' });
  });

  it('rethrows unexpected request reparse failures', async () => {
    mocks.reparseWithLimit.mockRejectedValue(new Error('unexpected reparse failure'));
    await expect(POST(req('POST'), ctx())).rejects.toThrow('unexpected reparse failure');
  });

  it('rejects malformed multipart data, missing files, and oversized files', async () => {
    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({ formDataThrows: true }));
    const invalidResponse = await POST(req('POST'), ctx());
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid form data' });

    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({}));
    const missingResponse = await POST(req('POST'), ctx());
    expect(missingResponse.status).toBe(400);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'missing file' });

    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
      file: new HugeFile(['logo'], 'huge.png', { type: 'image/png' }),
    }));
    const oversizedResponse = await POST(req('POST'), ctx());
    expect(oversizedResponse.status).toBe(400);
    await expect(oversizedResponse.json()).resolves.toEqual({ error: 'file too large (max 5MB)' });
  });

  it('rejects unsupported logo file types', async () => {
    mocks.saveUpload.mockRejectedValue(new mocks.UnsupportedFileType('bad type'));
    const response = await POST(req('POST'), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'must be an image' });
  });

  it('rethrows unexpected logo persistence failures', async () => {
    mocks.saveUpload.mockRejectedValue(new Error('unexpected persistence failure'));
    await expect(POST(req('POST'), ctx())).rejects.toThrow('unexpected persistence failure');
  });

  it('saves a logo and records activity', async () => {
    const response = await POST(req('POST'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ producer: producerRow() });
    expect(mocks.saveUpload).toHaveBeenCalledWith('producerLogo', expect.any(File), PRODUCER_ID);
    expect(mocks.setProducerLogo).toHaveBeenCalledWith(PRODUCER_ID, 'producer/p990301.png');
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'producer.logo-set',
      entity: 'producer',
      entityId: PRODUCER_ID,
      label: 'Uploaded producer logo',
      payload: { bytes: 4 },
    });
  });

  it('still returns success when activity logging fails after saving', async () => {
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await POST(req('POST'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ producer: producerRow() });
  });
});

describe('DELETE /api/producer/[id]/logo route branches', () => {
  it('returns the auth gate response before validating the id', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
  });

  it('rejects malformed producer ids', async () => {
    const response = await DELETE(req('DELETE'), ctx('bad'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid id' });
  });

  it('returns 404 when the producer row is absent', async () => {
    mocks.getProducer.mockReturnValue(null);
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'producer not found' });
  });

  it('clears the stored producer logo and records activity', async () => {
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ producer: producerRow() });
    expect(mocks.setProducerLogo).toHaveBeenCalledWith(PRODUCER_ID, null);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'producer.logo-clear',
      entity: 'producer',
      entityId: PRODUCER_ID,
      label: 'Cleared producer logo',
    });
  });

  it('still clears the logo when activity logging fails', async () => {
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ producer: producerRow() });
  });
});
