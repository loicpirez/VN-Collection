import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addVnToList: vi.fn(),
  deleteUserList: vi.fn(),
  getUserList: vi.fn(),
  listUserListItems: vi.fn(),
  readBodyWithLimit: vi.fn(),
  recordActivity: vi.fn(),
  removeVnFromList: vi.fn(),
  reorderListItems: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
  updateUserList: vi.fn(),
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  addVnToList: mocks.addVnToList,
  deleteUserList: mocks.deleteUserList,
  getUserList: mocks.getUserList,
  listUserListItems: mocks.listUserListItems,
  removeVnFromList: mocks.removeVnFromList,
  reorderListItems: mocks.reorderListItems,
  updateUserList: mocks.updateUserList,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/read-limited-body', () => ({
  readBodyWithLimit: mocks.readBodyWithLimit,
}));

import {
  DELETE as listDELETE,
  GET as listGET,
  PATCH as listPATCH,
} from '@/app/api/lists/[id]/route';
import {
  DELETE as itemDELETE,
  POST as itemPOST,
} from '@/app/api/lists/[id]/items/route';

const LIST_ID = 55;
const VN_ID = 'v990901';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;
type UserList = {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  pinned: boolean;
};
type UserListItem = {
  list_id: number;
  vn_id: string;
  note: string | null;
  order_index: number;
};

function list(overrides: Partial<UserList> = {}): UserList {
  return {
    id: LIST_ID,
    name: 'List Fixture',
    description: null,
    color: null,
    icon: null,
    pinned: false,
    ...overrides,
  };
}

function item(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    list_id: LIST_ID,
    vn_id: VN_ID,
    note: null,
    order_index: 0,
    ...overrides,
  };
}

function ctx(id = String(LIST_ID)): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, body?: Body, url = `http://127.0.0.1/api/lists/${LIST_ID}`): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.getUserList.mockReturnValue(list());
  mocks.listUserListItems.mockReturnValue([item()]);
  mocks.updateUserList.mockReturnValue(list({ name: 'Updated list' }));
  mocks.deleteUserList.mockReturnValue(true);
  mocks.addVnToList.mockReturnValue(item({ note: 'Note' }));
  mocks.removeVnFromList.mockReturnValue(true);
  mocks.readBodyWithLimit.mockImplementation(async (request: Request) => Buffer.from(await request.arrayBuffer()));
});

describe('GET /api/lists/[id]', () => {
  it('rejects invalid ids and absent lists', async () => {
    const invalidResponse = await listGET(req('GET'), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid id' });

    mocks.getUserList.mockReturnValue(null);
    const missingResponse = await listGET(req('GET'), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not found' });
  });

  it('returns the list and its items', async () => {
    const response = await listGET(req('GET'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ list: list(), items: [item()] });
  });
});

describe('PATCH /api/lists/[id]', () => {
  it('returns auth and invalid id errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await listPATCH(req('PATCH', { name: 'Updated' }), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await listPATCH(req('PATCH', { name: 'Updated' }), ctx('0'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid id' });
  });

  it.each([
    [{ name: 12 }, 'name must be a string'],
    [{ name: '   ' }, 'name is required'],
    [{ description: 12 }, 'description must be a string or null'],
    [{ description: 'x'.repeat(2001) }, 'description too long (max 2000)'],
    [{ color: 12 }, 'color must be a string or null'],
    [{ color: 'x'.repeat(65) }, 'color too long (max 64)'],
    [{ color: 'not valid color!' }, 'invalid color'],
    [{ icon: 12 }, 'icon must be a string or null'],
    [{ icon: 'x'.repeat(65) }, 'icon too long (max 64)'],
    [{ icon: '1bad' }, 'invalid icon'],
    [{ pinned: 'yes' }, 'pinned must be boolean'],
  ] satisfies Array<[Body, string]>)('rejects malformed list patch %j', async (body, error) => {
    const response = await listPATCH(req('PATCH', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('returns 404 when the list update target is absent', async () => {
    mocks.updateUserList.mockReturnValue(null);
    const response = await listPATCH(req('PATCH', { name: 'Updated' }), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
  });

  it('updates list metadata and records activity', async () => {
    const response = await listPATCH(req('PATCH', {
      name: ' Updated list ',
      description: '',
      color: '#ffcc00',
      icon: '',
      pinned: true,
    }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ list: list({ name: 'Updated list' }) });
    expect(mocks.updateUserList).toHaveBeenCalledWith(LIST_ID, {
      name: 'Updated list',
      description: '',
      color: '#ffcc00',
      icon: null,
      pinned: true,
    });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'list.update',
      entity: 'list',
      entityId: String(LIST_ID),
      label: 'Updated list',
      payload: {
        name: 'Updated list',
        description: '',
        color: '#ffcc00',
        icon: null,
        pinned: true,
      },
    });
  });

  it('clears optional metadata fields with explicit null values', async () => {
    const response = await listPATCH(req('PATCH', {
      description: null,
      color: null,
      icon: null,
    }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ list: list({ name: 'Updated list' }) });
    expect(mocks.updateUserList).toHaveBeenCalledWith(LIST_ID, {
      description: null,
      color: null,
      icon: null,
    });
  });

  it('clears color from blank string values', async () => {
    const response = await listPATCH(req('PATCH', {
      color: '   ',
    }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ list: list({ name: 'Updated list' }) });
    expect(mocks.updateUserList).toHaveBeenCalledWith(LIST_ID, {
      color: null,
    });
  });

  it('returns 500 when list update or activity logging throws', async () => {
    mocks.updateUserList.mockImplementationOnce(() => {
      throw new Error('update failed');
    });
    const updateResponse = await listPATCH(req('PATCH', { name: 'Updated' }), ctx());
    expect(updateResponse.status).toBe(500);
    await expect(updateResponse.json()).resolves.toEqual({ error: 'could not update list' });

    mocks.recordActivity.mockImplementationOnce(() => {
      throw new Error('activity failed');
    });
    const activityResponse = await listPATCH(req('PATCH', { name: 'Updated' }), ctx());
    expect(activityResponse.status).toBe(500);
    await expect(activityResponse.json()).resolves.toEqual({ error: 'could not update list' });
  });
});

describe('DELETE /api/lists/[id]', () => {
  it('returns auth, invalid id, and not-found errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await listDELETE(req('DELETE'), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await listDELETE(req('DELETE'), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid id' });

    mocks.deleteUserList.mockReturnValue(false);
    const missingResponse = await listDELETE(req('DELETE'), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not found' });
  });

  it('deletes a list and records activity', async () => {
    const response = await listDELETE(req('DELETE'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'list.delete',
      entity: 'list',
      entityId: String(LIST_ID),
      label: 'List deleted',
    });
  });
});

describe('POST /api/lists/[id]/items', () => {
  it('returns auth, invalid id, and list-not-found errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await itemPOST(req('POST', { vn_id: VN_ID }), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await itemPOST(req('POST', { vn_id: VN_ID }), ctx('0'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid id' });

    mocks.getUserList.mockReturnValue(null);
    const missingResponse = await itemPOST(req('POST', { vn_id: VN_ID }), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'list not found' });
  });

  it.each([
    [{ order: 'bad' }, 'order must be an array of VN ids'],
    [{ order: Array.from({ length: 10001 }, (_value, index) => `v${990000 + index}`) }, 'order array too long (max 10000)'],
    [{ order: ['bad'] }, 'order must contain only VN ids'],
    [{ order: [VN_ID, VN_ID.toUpperCase()] }, 'order must not contain duplicates'],
  ] satisfies Array<[Body, string]>)('rejects malformed reorder body %j', async (body, error) => {
    const response = await itemPOST(req('POST', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('reorders list items and records activity', async () => {
    const response = await itemPOST(req('POST', { order: [VN_ID, 'V990902'] }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.reorderListItems).toHaveBeenCalledWith(LIST_ID, [VN_ID, 'v990902']);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'list.reorder',
      entity: 'list',
      entityId: String(LIST_ID),
      label: 'List items reordered',
      payload: { count: 2 },
    });
  });

  it.each([
    [{}, 'invalid vn_id'],
    [{ vn_id: 'bad' }, 'invalid vn_id'],
    [{ vn_id: VN_ID, note: 12 }, 'note must be a string or null'],
    [{ vn_id: VN_ID, note: 'x'.repeat(2001) }, 'note too long (max 2000)'],
  ] satisfies Array<[Body, string]>)('rejects malformed add-item body %j', async (body, error) => {
    const response = await itemPOST(req('POST', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('returns 404 when the VN cannot be added to the list', async () => {
    mocks.addVnToList.mockReturnValue(null);
    const response = await itemPOST(req('POST', { vn_id: VN_ID }), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
  });

  it('adds a VN to the list and records activity', async () => {
    const response = await itemPOST(req('POST', { vn_id: VN_ID.toUpperCase(), note: 'Note' }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ item: item({ note: 'Note' }) });
    expect(mocks.addVnToList).toHaveBeenCalledWith(LIST_ID, VN_ID, 'Note');
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'list.item.add',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Added to list',
      payload: { list_id: LIST_ID },
    });
  });

  it('returns sanitized internal errors from list item writes', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.addVnToList.mockImplementation(() => {
      throw new Error('add failed');
    });
    const response = await itemPOST(req('POST', { vn_id: VN_ID }), ctx());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:lists.items.POST] add failed');
    consoleSpy.mockRestore();
  });
});

describe('DELETE /api/lists/[id]/items', () => {
  it('returns auth, invalid id, invalid VN, and not-in-list errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await itemDELETE(req('DELETE', undefined, `http://127.0.0.1/api/lists/${LIST_ID}/items?vn=${VN_ID}`), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidListResponse = await itemDELETE(req('DELETE', undefined, `http://127.0.0.1/api/lists/${LIST_ID}/items?vn=${VN_ID}`), ctx('bad'));
    expect(invalidListResponse.status).toBe(400);
    await expect(invalidListResponse.json()).resolves.toEqual({ error: 'invalid id' });

    const invalidVnResponse = await itemDELETE(req('DELETE', undefined, `http://127.0.0.1/api/lists/${LIST_ID}/items?vn=bad`), ctx());
    expect(invalidVnResponse.status).toBe(400);
    await expect(invalidVnResponse.json()).resolves.toEqual({ error: 'invalid vn query param' });

    mocks.removeVnFromList.mockReturnValue(false);
    const missingResponse = await itemDELETE(req('DELETE', undefined, `http://127.0.0.1/api/lists/${LIST_ID}/items?vn=${VN_ID}`), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in list' });
  });

  it('removes a VN from the list and records activity', async () => {
    const response = await itemDELETE(req('DELETE', undefined, `http://127.0.0.1/api/lists/${LIST_ID}/items?vn=${VN_ID.toUpperCase()}`), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.removeVnFromList).toHaveBeenCalledWith(LIST_ID, VN_ID);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'list.item.remove',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Removed from list',
      payload: { list_id: LIST_ID },
    });
  });

  it('returns sanitized internal errors from list item deletion', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.removeVnFromList.mockImplementation(() => {
      throw new Error('remove failed');
    });
    const response = await itemDELETE(req('DELETE', undefined, `http://127.0.0.1/api/lists/${LIST_ID}/items?vn=${VN_ID}`), ctx());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:lists.items.DELETE] remove failed');
    consoleSpy.mockRestore();
  });
});
