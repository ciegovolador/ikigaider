import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  listSessions, getBytes, getActiveId,
  putSession, renameSession, deleteSession, setActiveId, migrateLegacy,
  _resetForTests,
} from './sessions.js';

// Fresh IndexedDB + dropped connection cache before each test.
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); _resetForTests(); });

const bytes = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe('sessions store — queries + commands (CQRS)', () => {
  it('puts and lists sessions (metadata only, no bytes, newest first)', async () => {
    const a = await putSession({ name: 'alpha', bytes: bytes('A') });
    const b = await putSession({ name: 'beta', bytes: bytes('B') });
    const list = await listSessions();
    expect(list.map((s) => s.id)).toEqual([b, a]); // newest first
    expect(list[0]).not.toHaveProperty('bytes');     // list is light
    expect(list[0].name).toBe('beta');
  });

  it('getBytes returns the stored journey blob', async () => {
    const id = await putSession({ name: 'x', bytes: bytes('hello') });
    expect([...(await getBytes(id))]).toEqual([...bytes('hello')]);
    expect(await getBytes('nope')).toBeNull();
  });

  it('upsert preserves name + createdAt, refreshes the bytes', async () => {
    const id = await putSession({ name: 'keep', bytes: bytes('1') });
    const created = (await listSessions())[0].createdAt;
    await new Promise((r) => setTimeout(r, 2));
    await putSession({ id, bytes: bytes('2') });               // save without a name
    const row = (await listSessions())[0];
    expect(row.name).toBe('keep');                              // name preserved
    expect(row.createdAt).toBe(created);                        // createdAt preserved
    expect([...(await getBytes(id))]).toEqual([...bytes('2')]); // bytes updated
  });

  it('renames; delete removes', async () => {
    const id = await putSession({ name: 'old', bytes: bytes('x') });
    await renameSession(id, 'new');
    expect((await listSessions())[0].name).toBe('new');
    await deleteSession(id);
    expect(await listSessions()).toEqual([]);
  });

  it('tracks the active id', async () => {
    expect(await getActiveId()).toBeNull();
    const id = await putSession({ name: 's', bytes: bytes('x') });
    await setActiveId(id);
    expect(await getActiveId()).toBe(id);
  });

  describe('migrateLegacy (don\'t-break-userspace)', () => {
    it('lifts a legacy journey into a first active session when empty', async () => {
      const id = await migrateLegacy(bytes('legacy'), 'My journey');
      expect(id).toBeTruthy();
      const list = await listSessions();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('My journey');
      expect(await getActiveId()).toBe(id);
      expect([...(await getBytes(id))]).toEqual([...bytes('legacy')]);
    });

    it('is a no-op when the library already has sessions', async () => {
      await putSession({ name: 'existing', bytes: bytes('e') });
      expect(await migrateLegacy(bytes('legacy'))).toBeNull();
      expect(await listSessions()).toHaveLength(1);
    });

    it('is a no-op when there is nothing to migrate', async () => {
      expect(await migrateLegacy(null)).toBeNull();
      expect(await listSessions()).toEqual([]);
    });
  });
});
