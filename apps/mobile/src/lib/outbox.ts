/**
 * Offline-first storage for the crew app (expo-sqlite).
 *  - route_cache: today's route + stops, so the crew can work without network
 *  - outbox: pickup scans waiting to be sent; each has a client_id so re-sending is safe (idempotent)
 */
import * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import type { FillLevel, RecordPickupResult } from '@sw/shared';
import { supabase, uploadEvidence } from './supabase';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
export function db() {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync('crew.db');
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS route_cache (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, saved_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (
        client_id TEXT PRIMARY KEY NOT NULL,
        qr TEXT NOT NULL, scanned_at TEXT NOT NULL, lat REAL, lng REAL, accuracy REAL,
        fill TEXT NOT NULL, sorted_ok INTEGER, photo_uri TEXT, photo_path TEXT,
        household_label TEXT, stop_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending', result TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
      );`);
    return d;
  })();
  return dbPromise;
}

export interface OutboxRow {
  client_id: string; qr: string; scanned_at: string; lat: number | null; lng: number | null; accuracy: number | null;
  fill: FillLevel; sorted_ok: number | null; photo_uri: string | null; photo_path: string | null;
  household_label: string | null; stop_id: string | null;
  status: 'pending' | 'sent' | 'rejected'; result: string | null; attempts: number; last_error: string | null;
}

export async function clearRouteCache() {
  await (await db()).runAsync('DELETE FROM route_cache');
}
export async function cacheSet(key: string, value: unknown) {
  await (await db()).runAsync('INSERT OR REPLACE INTO route_cache (key, json, saved_at) VALUES (?, ?, ?)', key, JSON.stringify(value), new Date().toISOString());
}
export async function cacheGet<T>(key: string): Promise<{ value: T; saved_at: string } | null> {
  const row = await (await db()).getFirstAsync<{ json: string; saved_at: string }>('SELECT json, saved_at FROM route_cache WHERE key = ?', key);
  return row ? { value: JSON.parse(row.json) as T, saved_at: row.saved_at } : null;
}

export async function queuePickup(p: { qr: string; lat: number | null; lng: number | null; accuracy: number | null; fill: FillLevel; sortedOk: boolean | null; photoUri: string | null; label: string | null; stopId: string | null }) {
  const id = randomUUID();
  await (await db()).runAsync(
    `INSERT INTO outbox (client_id, qr, scanned_at, lat, lng, accuracy, fill, sorted_ok, photo_uri, household_label, stop_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, p.qr, new Date().toISOString(), p.lat, p.lng, p.accuracy, p.fill, p.sortedOk == null ? null : p.sortedOk ? 1 : 0, p.photoUri, p.label, p.stopId,
  );
  return id;
}

export async function outboxRows(limit = 100) {
  return (await db()).getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY scanned_at DESC LIMIT ?', limit);
}
export async function pendingCount() {
  const r = await (await db()).getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'");
  return r?.n ?? 0;
}

let flushing: Promise<{ sent: number; failed: number }> | null = null;
/** Send every pending scan. Safe to call often; concurrent calls share one run. */
export function flushOutbox() {
  flushing ??= (async () => {
    const d = await db();
    const rows = await d.getAllAsync<OutboxRow>("SELECT * FROM outbox WHERE status = 'pending' ORDER BY scanned_at");
    let sent = 0, failed = 0;
    for (const r of rows) {
      try {
        let photoPath = r.photo_path;
        if (r.photo_uri && !photoPath) {
          photoPath = await uploadEvidence(r.photo_uri, 'pickup');
          await d.runAsync('UPDATE outbox SET photo_path = ? WHERE client_id = ?', photoPath, r.client_id);
        }
        const { data, error } = await supabase.rpc('record_pickup', {
          p_client_id: r.client_id, p_qr: r.qr, p_scanned_at: r.scanned_at, p_lat: r.lat, p_lng: r.lng, p_accuracy: r.accuracy,
          p_fill: r.fill, p_sorted_ok: r.sorted_ok == null ? null : r.sorted_ok === 1, p_photo_path: photoPath,
        });
        if (error) {
          // business errors (bad QR, wrong role) will never succeed: stop retrying
          const permanent = /QR|household|crew/i.test(error.message);
          await d.runAsync('UPDATE outbox SET attempts = attempts + 1, last_error = ?, status = ? WHERE client_id = ?', error.message, permanent ? 'rejected' : 'pending', r.client_id);
          failed++;
          continue;
        }
        const res = data as RecordPickupResult;
        await d.runAsync('UPDATE outbox SET status = ?, result = ?, last_error = NULL WHERE client_id = ?', res.valid ? 'sent' : 'rejected', JSON.stringify(res), r.client_id);
        sent++;
      } catch (e) {
        await d.runAsync('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE client_id = ?', (e as Error).message, r.client_id);
        failed++;
      }
    }
    return { sent, failed };
  })().finally(() => { flushing = null; });
  return flushing;
}
