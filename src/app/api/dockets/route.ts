import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'dockets.json');

let memoryDockets: any[] = [];

// Ensure DB file exists or fall back to memory
async function getDockets(): Promise<any[]> {
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
    // Return memory fallback on read-only environments
    return memoryDockets;
  }
}

export async function GET() {
  try {
    const dockets = await getDockets();
    return NextResponse.json({ success: true, dockets });
  } catch (error) {
    console.error('Error reading dockets DB:', error);
    return NextResponse.json({ success: true, dockets: memoryDockets });
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
    
    // Attempt save to file (will succeed locally, caught on Vercel read-only lambda)
    try {
      await fs.writeFile(dbPath, JSON.stringify(dockets, null, 2), 'utf8');
    } catch (fsErr) {
      console.warn('Filesystem write bypassed on serverless environment; persisted in memory:', fsErr);
    }
    
    return NextResponse.json({ success: true });
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
