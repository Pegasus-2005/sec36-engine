import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const dbPath = path.join(process.cwd(), 'data', 'dockets.json');

// Local serverless memory fallback cache
let memoryDockets: any[] = [];

// Cloud Database Configuration (Vercel KV / Upstash Redis)
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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

/** Fetch dockets from Cloud Database (Vercel KV / Upstash) if configured */
async function getCloudDockets(): Promise<any[] | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const raw = await runKvCommand(['GET', 'sec36_dockets']);
    if (raw === null || raw === undefined) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Cloud KV read error, falling back to local storage:', err);
    return null;
  }
}

/** Save dockets to Cloud Database (Vercel KV / Upstash) if configured */
async function saveCloudDockets(dockets: any[]): Promise<boolean> {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const res = await runKvCommand(['SET', 'sec36_dockets', JSON.stringify(dockets)]);
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

// Ensure DB exists and retrieve latest records across Cloud KV, local file, or memory
async function getDockets(): Promise<any[]> {
  // 1. Check Cloud Database first (synced across all mobile/laptop clients)
  const cloudData = await getCloudDockets();
  if (cloudData !== null) {
    memoryDockets = cloudData;
    return cloudData;
  }

  // 2. Fall back to local filesystem (localhost development)
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      memoryDockets = parsed;
      return parsed;
    }
    return memoryDockets;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      try {
        await fs.writeFile(dbPath, '[]', 'utf8');
      } catch {
        // Read-only filesystem (e.g. Vercel serverless)
      }
      return memoryDockets;
    }
    return memoryDockets;
  }
}

export async function GET() {
  try {
    const dockets = await getDockets();
    return NextResponse.json(
      {
        success: true,
        dockets,
        storageMode: KV_URL ? 'cloud_kv' : 'local_file',
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
      { success: true, dockets: memoryDockets },
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
    
    // Read current data
    const dockets = await getDockets();
    
    // Add new docket at the beginning (newest first)
    dockets.unshift(docketData);
    memoryDockets = dockets;
    
    // 1. Persist to Cloud Database (real-time sync across mobile & laptop)
    await saveCloudDockets(dockets);
    
    // 2. Persist to local filesystem when available
    try {
      await fs.writeFile(dbPath, JSON.stringify(dockets, null, 2), 'utf8');
    } catch {
      // Handled gracefully on serverless read-only environments
    }
    
    return NextResponse.json({ success: true, storageMode: KV_URL ? 'cloud_kv' : 'local_file' });
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
      await clearCloudDockets();
      try {
        await fs.writeFile(dbPath, '[]', 'utf8');
      } catch {
        // ignore on serverless
      }
      return NextResponse.json({ success: true, message: 'All dockets cleared' });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing docket id' }, { status: 400 });
    }

    const dockets = await getDockets();
    const filtered = dockets.filter((d: any) => {
      const docketId = d.result?.inspection_id || d.inspection_id || d.id;
      return docketId !== id;
    });
    memoryDockets = filtered;

    await saveCloudDockets(filtered);

    try {
      await fs.writeFile(dbPath, JSON.stringify(filtered, null, 2), 'utf8');
    } catch {
      // ignore on serverless
    }

    return NextResponse.json({ success: true, count: filtered.length });
  } catch (error) {
    console.error('Error deleting from dockets DB:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete from database' }, { status: 500 });
  }
}
