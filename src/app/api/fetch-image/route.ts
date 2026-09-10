import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'Missing `url` query parameter.' }, { status: 400 });
    }

    let parsed: URL;
    try {
        parsed = new URL(targetUrl);
    } catch {
        return NextResponse.json({ error: 'Invalid URL format.' }, { status: 400 });
    }

    const browserHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
    };

    // Helper to fetch and encode an image URL to base64
    const fetchAndEncodeImage = async (imgUrl: string) => {
        const upstream = await fetch(imgUrl, { headers: browserHeaders, signal: AbortSignal.timeout(10_000) });
        if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
        const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
        const buffer = await upstream.arrayBuffer();
        return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
    };

    try {
        // Step 1: Try fetching the initial URL
        let upstream = await fetch(targetUrl, {
            headers: browserHeaders,
            signal: AbortSignal.timeout(8_000),
        });

        // If blocked by WAF (403 Forbidden / 503 Service Unavailable), throw to trigger fallback
        if (upstream.status === 403 || upstream.status === 503 || upstream.status === 401) {
            throw new Error(`WAF blocked request with HTTP ${upstream.status}`);
        }

        if (!upstream.ok) {
            throw new Error(`HTTP ${upstream.status}`);
        }

        const contentType = upstream.headers.get('content-type') || '';
        let finalImageUrl = targetUrl;

        // Step 2: If HTML, scrape for og:image
        if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
            const html = await upstream.text();
            const $ = cheerio.load(html);
            
            let scrapedUrl = $('meta[property="og:image"]').attr('content') || 
                             $('meta[name="twitter:image"]').attr('content') ||
                             $('link[rel="image_src"]').attr('href');

            if (!scrapedUrl) {
                // If it's Amazon, maybe try other selectors
                scrapedUrl = $('#landingImage').attr('src') || $('#imgBlkFront').attr('src');
                if (!scrapedUrl) {
                    throw new Error('No product image found on the provided page. Try uploading a screenshot.');
                }
            }

            if (scrapedUrl.startsWith('/')) {
                scrapedUrl = new URL(scrapedUrl, parsed.origin).href;
            }
            finalImageUrl = scrapedUrl;
        }

        // Step 3: Fetch the actual image and encode
        const dataUri = await fetchAndEncodeImage(finalImageUrl);
        return NextResponse.json({ success: true, dataUri, mimeType: 'image/jpeg' });

    } catch (err: unknown) {
        console.warn(`[eMaap Proxy] Target fetch failed: ${err instanceof Error ? err.message : String(err)}`);
        return NextResponse.json({ 
            error: 'Failed to fetch the image. The URL may be blocked by a firewall (WAF) or is not a direct image link. Please try downloading the image and uploading it directly instead.',
            details: err instanceof Error ? err.message : String(err)
        }, { status: 400 });
    }
}
