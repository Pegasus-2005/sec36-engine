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

/** Fetch dockets from GitHub storage branch (works authenticated or public read) */
/** Fetch dockets from GitHub storage branch (works authenticated or public read) */
async function getGithubDockets(): Promise<{ dockets: any[]; tombstones: string[]; clearedAt: number; sha: string } | null> {
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
      console.warn(`[db:github] Contents fetch returned HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    lastGithubSha = data.sha || null;

    // Case 1: Direct content available (file <= 1MB)
    if (data.content && typeof data.content === 'string' && data.content.length > 0) {
      const parsed = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
      const dockets = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.dockets) ? parsed.dockets : []);
      const tombstones = Array.isArray(parsed?.tombstones) ? parsed.tombstones : [];
      const clearedAt = typeof parsed?.clearedAt === 'number' ? parsed.clearedAt : 0;
      return { dockets, tombstones, clearedAt, sha: data.sha };
    }

    // Case 2: File > 1MB: GitHub omits content and supplies download_url
    if (data.download_url) {
      const rawRes = await fetch(`${data.download_url}?_t=${Date.now()}`, {
        headers: GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {},
        cache: 'no-store',
      });
      if (rawRes.ok) {
        const rawContent = await rawRes.json();
        const dockets = Array.isArray(rawContent) ? rawContent : (Array.isArray(rawContent?.dockets) ? rawContent.dockets : []);
        const tombstones = Array.isArray(rawContent?.tombstones) ? rawContent.tombstones : [];
        const clearedAt = typeof rawContent?.clearedAt === 'number' ? rawContent.clearedAt : 0;
        return { dockets, tombstones, clearedAt, sha: data.sha };
      }
    }

    return null;
  } catch (err) {
    console.warn('[db:github] Read error:', err);
    return null;
  }
}

/** Persist dockets and tombstones to GitHub storage branch with size enforcement and conflict retry */
async function saveGithubDockets(dockets: any[], tombstones: string[] = [], clearedAt?: number): Promise<boolean> {
  if (!GITHUB_REPO || !GITHUB_TOKEN) return false;

  // Deduplicate redundant imageThumb if identical to images[0] to save ~300KB without losing visual data
  let bounded = dockets.slice(0, 35).map((entry) => {
    const clean = { ...entry };
    if (clean.images && Array.isArray(clean.images) && clean.images.length > 0 && clean.imageThumb === clean.images[0]) {
      delete clean.imageThumb;
    }
    return clean;
  });

  const payload: any = {
    dockets: bounded,
    tombstones: Array.from(new Set(tombstones)).slice(-100),
    lastUpdated: Date.now(),
  };
  if (clearedAt) payload.clearedAt = clearedAt;

  // Ensure total payload is strictly under 850KB by pruning older dockets if needed (GitHub 1MB limit is 1,000,000 bytes)
  let jsonString = JSON.stringify(payload, null, 2);
  while (Buffer.byteLength(jsonString) > 850000 && bounded.length > 3) {
    bounded = bounded.slice(0, bounded.length - 1);
    payload.dockets = bounded;
    jsonString = JSON.stringify(payload, null, 2);
  }

  const contentBase64 = Buffer.from(jsonString).toString('base64');

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let sha = lastGithubSha;
      if (!sha || attempt > 0) {
        const current = await getGithubDockets();
        sha = current?.sha || null;
      }
      if (!sha) {
        console.warn(`[db:github] No SHA available on attempt ${attempt + 1}`);
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }

      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'sec36-engine',
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          message: `sync: ledger update (${bounded.length} dockets, ${payload.tombstones.length} tombstones)`,
          branch: GITHUB_BRANCH,
          content: contentBase64,
          sha: sha,
        }),
      });

      if (res.status === 409) {
        console.warn(`[db:github] Conflict on attempt ${attempt + 1}, refreshing SHA...`);
        lastGithubSha = null;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[db:github] Save failed with HTTP ${res.status}:`, errText);
        lastGithubSha = null;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }

      const resData = await res.json();
      lastGithubSha = resData.content?.sha || null;
      return true;
    } catch (err) {
      console.warn(`[db:github] Write error on attempt ${attempt + 1}:`, err);
      lastGithubSha = null;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return false;
}

// In-memory set of recently deleted docket IDs to prevent race-condition resurrections
const serverTombstones = new Set<string>();
let memoryTombstones = new Set<string>();
let memoryClearedAt = 0;

// Ensure DB exists and retrieve latest records across GitHub, Cloud KV, local file, or memory
async function getDockets(): Promise<{ dockets: any[]; tombstones: string[]; clearedAt: number; mode: string }> {
  const now = Date.now();
  if (memoryDockets.length > 0 && now - memoryLastFetched < CACHE_TTL_MS) {
    return {
      dockets: sanitizeDockets(memoryDockets),
      tombstones: Array.from(memoryTombstones),
      clearedAt: memoryClearedAt,
      mode: 'memory_cache',
    };
  }

  // 1. Check GitHub cloud database first (persisted on db-storage branch, accessible across all devices)
  const gh = await getGithubDockets();
  if (gh && Array.isArray(gh.dockets)) {
    memoryDockets = gh.dockets;
    memoryTombstones = new Set([...Array.from(memoryTombstones), ...gh.tombstones]);
    if (gh.clearedAt) memoryClearedAt = gh.clearedAt;
    memoryLastFetched = now;
    return {
      dockets: sanitizeDockets(gh.dockets),
      tombstones: Array.from(memoryTombstones),
      clearedAt: memoryClearedAt,
      mode: 'github_cloud_sync',
    };
  }

  // 2. Check KV / Upstash if configured
  if (KV_URL && KV_TOKEN) {
    try {
      const raw = await runKvCommand(['GET', 'sec36_dockets']);
      if (raw !== null && raw !== undefined) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const dockets = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.dockets) ? parsed.dockets : []);
        const tombstones = Array.isArray(parsed?.tombstones) ? parsed.tombstones : [];
        if (parsed?.clearedAt) memoryClearedAt = parsed.clearedAt;
        memoryDockets = dockets;
        memoryTombstones = new Set([...Array.from(memoryTombstones), ...tombstones]);
        memoryLastFetched = now;
        return {
          dockets: sanitizeDockets(dockets),
          tombstones: Array.from(memoryTombstones),
          clearedAt: memoryClearedAt,
          mode: 'cloud_kv',
        };
      }
    } catch (err) {
      console.warn('Cloud KV read error:', err);
    }
  }

  // 3. Fall back to local filesystem (localhost development)
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(data);
    const dockets = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.dockets) ? parsed.dockets : []);
    const tombstones = Array.isArray(parsed?.tombstones) ? parsed.tombstones : [];
    if (parsed?.clearedAt) memoryClearedAt = parsed.clearedAt;
    memoryDockets = dockets;
    memoryTombstones = new Set([...Array.from(memoryTombstones), ...tombstones]);
    memoryLastFetched = now;
    return {
      dockets: sanitizeDockets(dockets),
      tombstones: Array.from(memoryTombstones),
      clearedAt: memoryClearedAt,
      mode: 'local_file',
    };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      try {
        await fs.writeFile(dbPath, '{"dockets":[],"tombstones":[]}', 'utf8');
      } catch {
        // Read-only filesystem on Vercel
      }
    }
  }

  return {
    dockets: sanitizeDockets(memoryDockets),
    tombstones: Array.from(memoryTombstones),
    clearedAt: memoryClearedAt,
    mode: 'memory',
  };
}

/** Ensure both imageThumb and images are populated with complete valid data URIs and respect tombstones */
function sanitizeDockets(dockets: any[]): any[] {
  return (dockets || [])
    .filter((d: any) => {
      const id = d.result?.inspection_id || d.inspection_id || d.id;
      return !id || (!serverTombstones.has(id) && !memoryTombstones.has(id));
    })
    .map((d: any) => {
      const entry = { ...d };
      if (!entry.imageThumb && Array.isArray(entry.images) && entry.images.length > 0) {
        entry.imageThumb = entry.images[0];
      }
      if ((!entry.images || entry.images.length === 0) && entry.imageThumb) {
        entry.images = [entry.imageThumb];
      }
      return entry;
    });
}

export async function GET() {
  try {
    const { dockets, tombstones, clearedAt, mode } = await getDockets();
    return NextResponse.json(
      {
        success: true,
        dockets,
        tombstones,
        clearedAt,
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
      {
        success: true,
        dockets: sanitizeDockets(memoryDockets),
        tombstones: Array.from(memoryTombstones),
        clearedAt: memoryClearedAt,
        storageMode: 'error_fallback',
      },
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

    // Read current state
    const { dockets, tombstones, clearedAt } = await getDockets();

    // Check if this docket was explicitly deleted
    const docketId = docketData.result?.inspection_id || docketData.inspection_id || docketData.id;
    if (docketId && (serverTombstones.has(docketId) || memoryTombstones.has(docketId) || tombstones.includes(docketId))) {
      return NextResponse.json({ success: true, ignored: true, message: 'Docket was permanently deleted' });
    }

    // Check if docket was created before a repository-wide clear
    const docketTime = docketData.result?.timestamp ? new Date(docketData.result.timestamp).getTime() : 0;
    if (clearedAt && docketTime && docketTime < clearedAt) {
      return NextResponse.json({ success: true, ignored: true, message: 'Docket was created before repository clear' });
    }

    // Deduplicate: if docket already exists by inspection_id, update it; otherwise unshift
    const filtered = docketId
      ? dockets.filter((d: any) => (d.result?.inspection_id || d.inspection_id || d.id) !== docketId)
      : dockets;

    const updated = [docketData, ...filtered].slice(0, 35);
    memoryDockets = updated;
    memoryLastFetched = Date.now();

    let saved = false;
    let storageMode = 'memory';

    // 1. Persist to GitHub cloud DB
    const ghSaved = await saveGithubDockets(updated, tombstones, clearedAt);
    if (ghSaved) {
      saved = true;
      storageMode = 'github_cloud_sync';
    }

    // 2. Persist to KV if configured
    if (!saved && KV_URL && KV_TOKEN) {
      try {
        const res = await runKvCommand([
          'SET',
          'sec36_dockets',
          JSON.stringify({ dockets: updated, tombstones, clearedAt }),
        ]);
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
      await fs.writeFile(dbPath, JSON.stringify({ dockets: updated, tombstones, clearedAt }, null, 2), 'utf8');
      if (!saved) storageMode = 'local_file';
    } catch {
      // Handled gracefully on serverless read-only environments
    }

    return NextResponse.json({ success: true, saved, storageMode, count: updated.length });
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

    const { dockets, tombstones } = await getDockets();

    if (all === 'true') {
      serverTombstones.clear();
      memoryDockets = [];
      memoryClearedAt = Date.now();
      memoryLastFetched = Date.now();

      const allIds = dockets.map((d: any) => d.result?.inspection_id || d.inspection_id || d.id).filter(Boolean);
      const updatedTombstones = Array.from(new Set([...tombstones, ...allIds, ...Array.from(memoryTombstones)])).slice(-100);
      memoryTombstones = new Set(updatedTombstones);

      await saveGithubDockets([], updatedTombstones, memoryClearedAt);
      if (KV_URL && KV_TOKEN) {
        try {
          await runKvCommand([
            'SET',
            'sec36_dockets',
            JSON.stringify({ dockets: [], tombstones: updatedTombstones, clearedAt: memoryClearedAt }),
          ]);
        } catch {}
      }
      try {
        await fs.writeFile(
          dbPath,
          JSON.stringify({ dockets: [], tombstones: updatedTombstones, clearedAt: memoryClearedAt }, null, 2),
          'utf8'
        );
      } catch {}
      return NextResponse.json({ success: true, message: 'All dockets cleared everywhere' });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing docket id' }, { status: 400 });
    }

    serverTombstones.add(id);
    memoryTombstones.add(id);

    const updatedTombstones = Array.from(new Set([...tombstones, id, ...Array.from(memoryTombstones)])).slice(-100);

    const filtered = dockets.filter((d: any) => {
      const docketId = d.result?.inspection_id || d.inspection_id || d.id;
      return docketId !== id;
    });

    memoryDockets = filtered;
    memoryLastFetched = Date.now();

    await saveGithubDockets(filtered, updatedTombstones);
    if (KV_URL && KV_TOKEN) {
      try {
        await runKvCommand([
          'SET',
          'sec36_dockets',
          JSON.stringify({ dockets: filtered, tombstones: updatedTombstones }),
        ]);
      } catch {}
    }
    try {
      await fs.writeFile(
        dbPath,
        JSON.stringify({ dockets: filtered, tombstones: updatedTombstones }, null, 2),
        'utf8'
      );
    } catch {}

    return NextResponse.json({ success: true, count: filtered.length, deletedId: id });
  } catch (error) {
    console.error('Error deleting from dockets DB:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete from database' }, { status: 500 });
  }
}

