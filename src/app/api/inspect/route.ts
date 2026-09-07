import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { StatutoryRuleEngine } from '@/lib/metrology/ruleEngine';
import { ExtractedDeclarations } from '@/types/metrology';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY is not configured in .env.local' },
                { status: 500 }
            );
        }

        const body = await req.json();
        const { image } = body;

        if (!image || typeof image !== 'string') {
            return NextResponse.json(
                { error: 'A valid base64 image string is required.' },
                { status: 400 }
            );
        }

        // Strip out base64 metadata headers if present
        let base64Data = image;
        let mimeType = 'image/jpeg';

        if (image.includes(';base64,')) {
            const parts = image.split(';base64,');
            mimeType = parts[0].replace('data:', '') || 'image/jpeg';
            base64Data = parts[1];
        }

        // Initialize the official Google Gen AI SDK
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.1, // Low temperature for deterministic entity extraction
            },
        });

        const prompt = `
You are an expert Optical Entity Recognition engine for the Indian Department of Consumer Affairs, Legal Metrology Division.
Extract all statutory packaged commodity declarations from this product packaging image according to the Legal Metrology (Packaged Commodities) Rules, 2011.

You MUST extract and return a valid JSON object strictly matching this schema:
{
  "commodity_name": {
    "raw_text": "Generic or common name of product as printed",
    "is_detected": true
  },
  "manufacturer": {
    "raw_text": "Full manufacturer / packer name and address",
    "is_detected": true
  },
  "net_quantity": {
    "raw_text": "Raw net quantity string (e.g., '100 g', '500 ml', '100 gms')",
    "numeric_value": 100,
    "unit": "Exact unit as printed (e.g., 'g', 'gms', 'kg', 'ml', 'ltr')",
    "is_standard_unit": true
  },
  "mrp": {
    "raw_text": "Raw price string as printed (e.g., 'Rs. 40 incl. of all taxes')",
    "numeric_value": 40.0,
    "has_inclusive_of_taxes": true
  },
  "mfg_or_import_date": {
    "raw_text": "Month and year of manufacture or packing as printed",
    "is_detected": true
  },
  "consumer_care": {
    "raw_text": "Customer service phone, email, or physical address",
    "is_detected": true
  },
  "country_of_origin": {
    "raw_text": "Country of origin declaration (e.g., 'Made in India', 'Country of Origin: India')",
    "is_detected": true
  }
}

CRITICAL RULES:
1. If any field is missing or illegible, set "is_detected" to false and "raw_text" to "".
2. For "mrp", check carefully whether the statutory phrase "inclusive of all taxes" (or "incl. of all taxes") is physically present next to the price. Set "has_inclusive_of_taxes" to true ONLY if that exact phrase or common abbreviation appears.
3. For "net_quantity.unit", extract the EXACT letters printed (e.g., if it says "gms", return "gms"; do not normalize to "g").
4. Output strictly valid JSON. Do not include markdown formatting, backticks, or explanatory text.
`;

        // Dispatch request to Google AI Studio
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType,
                },
            },
        ]);

        const rawResponse = result.response.text();
        let cleanedText = rawResponse.trim();
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/^```/, '').replace(/```$/, '').trim();
        }

        const extractedData: ExtractedDeclarations = JSON.parse(cleanedText);

        // Pass extracted JSON into the deterministic Legal Metrology Rule Engine
        const auditResult = StatutoryRuleEngine.evaluatePackage(extractedData);

        return NextResponse.json({
            success: true,
            extracted: extractedData,
            audit: auditResult,
        });
    } catch (error: any) {
        console.error('Inspection API Error:', error);
        return NextResponse.json(
            {
                error: error.message || 'Failed to process packaging inspection.',
            },
            { status: 500 }
        );
    }
}