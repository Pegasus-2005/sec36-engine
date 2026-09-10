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

// Cloud Database Configuration: Tier 1 (Vercel KV / Upstash Redis)
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Cloud Database Configuration: Tier 2 (GitHub Zero-Config DB Sync)
const GITHUB_REPO = process.env.GITHUB_REPO || 'Pegasus-2005/sec36-engine';
const GITHUB_BRANCH = process.env.GITHUB_DB_BRANCH || 'db-storage';
const GITHUB_FILE = 'data/dockets_cloud.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;

let lastGithubSha: string | null = null;

/** Execute an arbitrary Upstash / Vercel KV command over REST */
async function runKvCommand(command: any[]): Promise<any> {
  if (!KV_URL || !KV_TOKEN) return null;
  const cleanUrl = KV_URL.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}`, {
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

/** Fetch dockets from GitHub storage branch (public read, works unauthenticated) */
async function getGithubDockets(): Promise<{ dockets: any[]; sha: string } | null> {
  if (!GITHUB_REPO) return null;
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'sec36-engine',
      Accept: 'application/vnd.github.v3+json',
    };
    if (GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}&_t=${Date.now()}`,
      {
        headers,
        cache: 'no-store',
      }
    );
    if (!res.ok) {
      console.warn(`[db:github] Fetch returned HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data.content) return null;
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    lastGithubSha = data.sha;
    return { dockets: Array.isArray(content) ? content : [], sha: data.sha };
  } catch (err) {
    console.warn('[db:github] Read error:', err);
    return null;
  }
}

/** Persist dockets to GitHub storage branch */
async function saveGithubDockets(dockets: any[]): Promise<boolean> {
  if (!GITHUB_REPO || !GITHUB_TOKEN) return false;
  // Bound list to 50 latest entries to keep payload lean
  const bounded = dockets.slice(0, 50).map((entry) => {
    const clean = { ...entry };
    if (clean.imageThumb && typeof clean.imageThumb === 'string' && clean.imageThumb.length > 250000) {
      clean.imageThumb = clean.imageThumb.slice(0, 250000);
    }
    if (Array.isArray(clean.images)) {
      clean.images = clean.images.slice(0, 4).map((img: any) => {
        if (typeof img === 'string' && img.length > 250000) {
          return img.slice(0, 250000);
        }
        return img;
      });
    }
    return clean;
  });

  const contentBase64 = Buffer.from(JSON.stringify(bounded, null, 2)).toString('base64');

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let sha = lastGithubSha;
      if (!sha) {
        const current = await getGithubDockets();
        sha = current?.sha || null;
      }
      if (!sha) return false;

      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'sec36-engine',
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          message: `sync: ledger update (${bounded.length} dockets)`,
          branch: GITHUB_BRANCH,
          content: contentBase64,
          sha: sha,
        }),
      });

      if (res.status === 409) {
        // Conflict: remote was updated; refresh SHA and retry
        console.warn(`[db:github] Conflict on attempt ${attempt + 1}, refreshing SHA...`);
        lastGithubSha = null;
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      if (!res.ok) {
        console.warn(`[db:github] Save failed with HTTP ${res.status}`);
        return false;
      }

      const resData = await res.json();
      lastGithubSha = resData.content?.sha || null;
      return true;
    } catch (err) {
      console.warn(`[db:github] Write error on attempt ${attempt + 1}:`, err);
      lastGithubSha = null;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

// Ensure DB exists and retrieve latest records across GitHub, Cloud KV, local file, or memory
async function getDockets(): Promise<{ dockets: any[]; mode: string }> {
  const now = Date.now();
  if (memoryDockets.length > 0 && now - memoryLastFetched < CACHE_TTL_MS) {
    return { dockets: memoryDockets, mode: 'memory_cache' };
  }

  // 1. Check GitHub cloud database first (persisted on db-storage branch, accessible across all devices)
  const gh = await getGithubDockets();
  if (gh && Array.isArray(gh.dockets) && gh.dockets.length > 0) {
    memoryDockets = gh.dockets;
    memoryLastFetched = now;
    return { dockets: gh.dockets, mode: 'github_cloud_sync' };
  }

  // 2. Check KV / Upstash if configured
  if (KV_URL && KV_TOKEN) {
    try {
      const raw = await runKvCommand(['GET', 'sec36_dockets']);
      if (raw !== null && raw !== undefined) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          memoryDockets = parsed;
          memoryLastFetched = now;
          return { dockets: parsed, mode: 'cloud_kv' };
        }
      }
    } catch (err) {
      console.warn('Cloud KV read error:', err);
    }
  }

  // 3. Fall back to local filesystem (localhost development)
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      memoryDockets = parsed;
      memoryLastFetched = now;
      return { dockets: parsed, mode: 'local_file' };
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      try {
        await fs.writeFile(dbPath, '[]', 'utf8');
      } catch {
        // Read-only filesystem on Vercel
      }
    }
  }

  return { dockets: memoryDockets, mode: 'memory' };
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

    let saved = false;
    let storageMode = 'memory';

    // 1. Persist to GitHub cloud DB
    const ghSaved = await saveGithubDockets(updated);
    if (ghSaved) {
      saved = true;
      storageMode = 'github_cloud_sync';
    }

    // 2. Persist to KV if configured
    if (!saved && KV_URL && KV_TOKEN) {
      try {
        const res = await runKvCommand(['SET', 'sec36_dockets', JSON.stringify(updated)]);
        if (res !== null) {
          saved = true;
          storageMode = 'cloud_kv';
        }
      } catch (err) {
        console.warn('Cloud KV write error:', err);
      }
    }

    // 3. Local file write (for localhost)
    try {
      await fs.writeFile(dbPath, JSON.stringify(updated, null, 2), 'utf8');
      if (!saved) storageMode = 'local_file';
    } catch {
      // Handled gracefully on serverless read-only environments
    }

    return NextResponse.json({ success: true, storageMode, count: updated.length });
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
      await saveGithubDockets([]);
      if (KV_URL && KV_TOKEN) {
        try {
          await runKvCommand(['DEL', 'sec36_dockets']);
        } catch {}
      }
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

    await saveGithubDockets(filtered);
    if (KV_URL && KV_TOKEN) {
      try {
        await runKvCommand(['SET', 'sec36_dockets', JSON.stringify(filtered)]);
      } catch {}
    }
    try {
      await fs.writeFile(dbPath, JSON.stringify(filtered, null, 2), 'utf8');
    } catch {}

    return NextResponse.json({ success: true, count: filtered.length });
  } catch (error) {
    console.error('Error deleting from dockets DB:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete from database' }, { status: 500 });
  }
}
