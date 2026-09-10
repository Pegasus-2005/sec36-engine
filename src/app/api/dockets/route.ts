import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const dbPath = path.join(process.cwd(), 'data', 'dockets.json');

// In-memory cache for fast local responses within the same container
let memoryDockets: any[] = [];
let memoryLastFetched = 0;
const CACHE_TTL_MS = 1500; // 1.5s cache to keep rapid polls instantaneous

// Dedicated Cloud Database Configuration (Upstash Redis / Vercel KV)
const DEFAULT_KV_URL = 'https://legal-mackerel-165431.upstash.io';
const DEFAULT_KV_TOKEN = 'gQAAAAAAAoY3AQIgcDE3ZTEzNzFkZTM1OTc0ZDhkYmY1MDEzMWIzYjM2ZTVhZg';

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || DEFAULT_KV_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || DEFAULT_KV_TOKEN;

/** Execute an arbitrary Upstash / Vercel KV command over REST */
async function runKvCommand(command: any[]): Promise<any> {
  if (!KV_URL || !KV_TOKEN) return null;
  const cleanUrl = KV_URL.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`KV command failed with HTTP ${res.status}`);
  }
  const data = await res.json();
  return data?.result;
}

/** Fetch dockets from Cloud Database (synced in real-time across mobile and laptop) */
async function getCloudDockets(): Promise<any[] | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const raw = await runKvCommand(['GET', 'sec36_dockets']);
    if (raw === null || raw === undefined) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Cloud KV read error, falling back to local storage:', err);
    return null;
  }
}

/** Save dockets to Cloud Database */
async function saveCloudDockets(dockets: any[]): Promise<boolean> {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    // Keep max 50 entries to keep payload fast and lightweight
    const bounded = dockets.slice(0, 50);
    const res = await runKvCommand(['SET', 'sec36_dockets', JSON.stringify(bounded)]);
    return res !== null;
  } catch (err) {
    console.warn('Cloud KV write error:', err);
    return false;
  }
}

/** Clear all dockets from Cloud Database */
async function clearCloudDockets(): Promise<boolean> {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const res = await runKvCommand(['DEL', 'sec36_dockets']);
    return res !== null;
  } catch (err) {
    console.warn('Cloud KV delete error:', err);
    return false;
  }
}

// Retrieve latest records across Cloud KV, local file, or memory
async function getDockets(): Promise<{ dockets: any[]; mode: string }> {
  const now = Date.now();
  if (memoryDockets.length > 0 && now - memoryLastFetched < CACHE_TTL_MS) {
    return { dockets: memoryDockets, mode: 'memory_cache' };
  }

  // 1. Check Cloud Database first (synced across all mobile/laptop clients)
  const cloudData = await getCloudDockets();
  if (cloudData !== null) {
    memoryDockets = cloudData;
    memoryLastFetched = now;
    return { dockets: cloudData, mode: 'cloud_kv' };
  }

  // 2. Fall back to local filesystem (localhost development)
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      memoryDockets = parsed;
      memoryLastFetched = now;
      return { dockets: parsed, mode: 'local_file' };
    }
    return { dockets: memoryDockets, mode: 'memory' };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      try {
        await fs.writeFile(dbPath, '[]', 'utf8');
      } catch {
        // Read-only filesystem (e.g. Vercel serverless)
      }
    }
    return { dockets: memoryDockets, mode: 'memory' };
  }
}

export async function GET() {
  try {
    const { dockets, mode } = await getDockets();
    return NextResponse.json(
      {
        success: true,
        dockets,
        storageMode: mode,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error) {
    console.error('Error reading dockets DB:', error);
    return NextResponse.json(
      { success: true, dockets: memoryDockets, storageMode: 'error_fallback' },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        },
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const docketData = await request.json();
    if (!docketData || typeof docketData !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid docket data' }, { status: 400 });
    }

    // Read current data
    const { dockets } = await getDockets();

    // Deduplicate: if docket already exists by inspection_id, update it; otherwise unshift
    const docketId = docketData.result?.inspection_id || docketData.inspection_id || docketData.id;
    const filtered = docketId
      ? dockets.filter((d: any) => (d.result?.inspection_id || d.inspection_id || d.id) !== docketId)
      : dockets;

    const updated = [docketData, ...filtered].slice(0, 50);
    memoryDockets = updated;
    memoryLastFetched = Date.now();

    // 1. Persist to Cloud Database (real-time sync across mobile & laptop)
    const cloudSaved = await saveCloudDockets(updated);

    // 2. Persist to local filesystem when available
    try {
      await fs.writeFile(dbPath, JSON.stringify(updated, null, 2), 'utf8');
    } catch {
      // Handled gracefully on serverless read-only environments
    }

    return NextResponse.json({
      success: true,
      storageMode: cloudSaved ? 'cloud_kv' : 'local_file',
      count: updated.length,
    });
  } catch (error) {
    console.error('Error writing to dockets DB:', error);
    return NextResponse.json({ success: false, error: 'Failed to write to database' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const all = searchParams.get('all');

    if (all === 'true') {
      memoryDockets = [];
      memoryLastFetched = Date.now();
      await clearCloudDockets();
      try {
        await fs.writeFile(dbPath, '[]', 'utf8');
      } catch {}
      return NextResponse.json({ success: true, message: 'All dockets cleared' });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing docket id' }, { status: 400 });
    }

    const { dockets } = await getDockets();
    const filtered = dockets.filter((d: any) => {
      const docketId = d.result?.inspection_id || d.inspection_id || d.id;
      return docketId !== id;
    });

    memoryDockets = filtered;
    memoryLastFetched = Date.now();

    await saveCloudDockets(filtered);

    try {
      await fs.writeFile(dbPath, JSON.stringify(filtered, null, 2), 'utf8');
    } catch {}

    return NextResponse.json({ success: true, count: filtered.length });
  } catch (error) {
    console.error('Error deleting from dockets DB:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete from database' }, { status: 500 });
  }
}
