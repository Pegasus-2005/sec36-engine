import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import { StatutoryRuleEngine } from '@/lib/metrology/ruleEngine';
import { ExtractedDeclarations, DocketEntry } from '@/types/metrology';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Schema fragments
// ---------------------------------------------------------------------------

const BOX_SCHEMA: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        ymin: { type: SchemaType.NUMBER },
        xmin: { type: SchemaType.NUMBER },
        ymax: { type: SchemaType.NUMBER },
        xmax: { type: SchemaType.NUMBER },
    },
    required: ['ymin', 'xmin', 'ymax', 'xmax'],
};

const DECLARATION_SCHEMA: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        raw_text: { type: SchemaType.STRING },
        is_detected: { type: SchemaType.BOOLEAN },
        confidence: { type: SchemaType.NUMBER },
        box_2d: BOX_SCHEMA,
    },
    required: ['raw_text', 'is_detected'],
};

/**
 * Full extraction schema — includes is_valid_package_image as the FIRST field
 * so the model pre-validates before extracting. Single API call, no two-phase.
 */
const FULL_SCHEMA: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        // ── Pre-validation gate ──────────────────────────────────────────────
        is_valid_package_image: { type: SchemaType.BOOLEAN },
        invalid_reason: { type: SchemaType.STRING },

        // ── Rule 8 — Placement & Grouping ────────────────────────────────────
        is_declarations_grouped: { type: SchemaType.BOOLEAN },

        // ── Readability ──────────────────────────────────────────────────────
        readability_issues: { type: SchemaType.STRING },

        // ── Rule 6(1)(b) — Commodity name ───────────────────────────────────
        commodity_name: DECLARATION_SCHEMA,

        // ── Rule 6(1)(a) — Manufacturer address ─────────────────────────────
        manufacturer: {
            type: SchemaType.OBJECT,
            properties: {
                raw_text: { type: SchemaType.STRING },
                is_detected: { type: SchemaType.BOOLEAN },
                has_pin_code: { type: SchemaType.BOOLEAN },
                has_state_or_city: { type: SchemaType.BOOLEAN },
                box_2d: BOX_SCHEMA,
            },
            required: ['raw_text', 'is_detected', 'has_pin_code', 'has_state_or_city'],
        },

        // ── Rule 6(1)(c) — Net quantity ──────────────────────────────────────
        net_quantity: {
            type: SchemaType.OBJECT,
            properties: {
                raw_text: { type: SchemaType.STRING },
                numeric_value: { type: SchemaType.NUMBER },
                unit: { type: SchemaType.STRING },
                is_standard_unit: { type: SchemaType.BOOLEAN },
                has_space_separation: { type: SchemaType.BOOLEAN },
                box_2d: BOX_SCHEMA,
            },
            required: ['raw_text', 'numeric_value', 'unit', 'is_standard_unit', 'has_space_separation'],
        },

        // ── Rule 6(1)(e) — MRP ───────────────────────────────────────────────
        mrp: {
            type: SchemaType.OBJECT,
            properties: {
                raw_text: { type: SchemaType.STRING },
                numeric_value: { type: SchemaType.NUMBER },
                currency: { type: SchemaType.STRING },
                has_inclusive_of_taxes: { type: SchemaType.BOOLEAN },
                box_2d: BOX_SCHEMA,
            },
            required: ['raw_text', 'numeric_value', 'has_inclusive_of_taxes'],
        },

        // ── Rule 6(11) — Unit Sale Price (Dec-2022 Amendment) ───────────────
        unit_sale_price: {
            type: SchemaType.OBJECT,
            properties: {
                raw_text: { type: SchemaType.STRING },
                is_declared: { type: SchemaType.BOOLEAN },
                price_per_unit: { type: SchemaType.NUMBER },
                unit: { type: SchemaType.STRING },
                box_2d: BOX_SCHEMA,
            },
            required: ['raw_text', 'is_declared'],
        },

        // ── Rule 6(1)(d) — MFG / Import date ────────────────────────────────
        mfg_or_import_date: {
            type: SchemaType.OBJECT,
            properties: {
                raw_text: { type: SchemaType.STRING },
                is_detected: { type: SchemaType.BOOLEAN },
                month: { type: SchemaType.NUMBER },
                year: { type: SchemaType.NUMBER },
                box_2d: BOX_SCHEMA,
            },
            required: ['raw_text', 'is_detected'],
        },

        // ── Rule 6(1)(da) — Expiry / Best Before ────────────────────────────
        expiry_or_best_before: {
            type: SchemaType.OBJECT,
            properties: {
                raw_text: { type: SchemaType.STRING },
                is_detected: { type: SchemaType.BOOLEAN },
                is_declared: { type: SchemaType.BOOLEAN },
                box_2d: BOX_SCHEMA,
            },
            required: ['raw_text', 'is_detected', 'is_declared'],
        },

        // ── Rule 6(2) — Consumer care ────────────────────────────────────────
        consumer_care: {
            type: SchemaType.OBJECT,
            properties: {
                raw_text: { type: SchemaType.STRING },
                has_phone: { type: SchemaType.BOOLEAN },
                has_email: { type: SchemaType.BOOLEAN },
                phone: { type: SchemaType.STRING },
                email: { type: SchemaType.STRING },
                address: { type: SchemaType.STRING },
                box_2d: BOX_SCHEMA,
            },
            required: ['raw_text', 'has_phone', 'has_email'],
        },

        // ── Rule 6(1)(aa) — Country of origin ───────────────────────────────
        country_of_origin: DECLARATION_SCHEMA,

        // ── Rule 7 — PDP bounding box for font-size estimation ───────────────
        package_pdp_box: BOX_SCHEMA,

        // ── Rule 6(1)(f) — Dimensions ────────────────────────────────────────
        dimensions: {
            type: SchemaType.OBJECT,
            properties: {
                raw_text: { type: SchemaType.STRING },
                is_declared: { type: SchemaType.BOOLEAN },
                values: { type: SchemaType.STRING },
                box_2d: BOX_SCHEMA,
            },
            required: ['raw_text', 'is_declared'],
        },

        // ── Rule 26 — Industrial / institutional exemption flag ───────────────
        is_industrial_institutional: { type: SchemaType.BOOLEAN },

        // ── Rule 26(b) — Fast food exemption ────────────────────────────────
        is_fast_food_exemption: { type: SchemaType.BOOLEAN },

        // ── Rule 26(c) — Scheduled drug exemption ───────────────────────────
        is_scheduled_drug_exemption: { type: SchemaType.BOOLEAN },

        // ── Rule 6(10) — E-Commerce ─────────────────────────────────────────
        is_e_commerce: { type: SchemaType.BOOLEAN },

        // ── Rule 27 — LMPC Registration ─────────────────────────────────────
        registration: DECLARATION_SCHEMA,

        // ── Rule 9(1) — Language compliance ─────────────────────────────────
        language_compliance: {
            type: SchemaType.OBJECT,
            properties: {
                is_english_or_hindi: { type: SchemaType.BOOLEAN },
                detected_languages: { type: SchemaType.STRING },
            },
            required: ['is_english_or_hindi', 'detected_languages'],
        },

        // ── Rule 18(2) / Rule 6(4) — Tampering / Overwriting ────────────────
        tampering_detected: {
            type: SchemaType.OBJECT,
            properties: {
                is_tampered: { type: SchemaType.BOOLEAN },
                description: { type: SchemaType.STRING },
                box_2d: BOX_SCHEMA,
            },
            required: ['is_tampered'],
        },
    },
    required: [
        'is_valid_package_image', 'invalid_reason',
        'commodity_name', 'manufacturer', 'net_quantity', 'mrp', 'unit_sale_price',
        'mfg_or_import_date', 'expiry_or_best_before', 'consumer_care',
        'country_of_origin', 'package_pdp_box', 'dimensions', 'is_industrial_institutional',
        'is_fast_food_exemption', 'is_scheduled_drug_exemption', 'is_e_commerce', 'registration',
        'language_compliance', 'tampering_detected', 'is_declarations_grouped', 'readability_issues',
    ],
};

// ---------------------------------------------------------------------------
// Single combined prompt — validates AND extracts in one call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a forensic legal metrology vision extraction system for the Government of India, auditing packaged commodity labels under the Legal Metrology (Packaged Commodities) Rules, 2011.

You may be provided with one or more images of the same package from different angles. You must aggregate the visible information across ALL images to form a single cohesive extraction.

═══════════════════════════════════════════════════════════
STEP 0 — IMAGE VALIDITY CHECK  (answer this before everything else)
═══════════════════════════════════════════════════════════
Set is_valid_package_image = TRUE if ANY of the provided images shows ANY of:
  • A manufactured/processed product in any kind of packaging
  • A food, beverage, snack, medicine, cosmetic, FMCG, or household product
  • Any wrapper, pouch, box, bottle, can, sachet, jar, carton, tube, or container
  • The above even if held in a hand, at an angle, partially cropped, or blurry
  • The above even if only part of the label is visible
  • ANY physical object that looks like it could be a product you buy in a store.

Set is_valid_package_image = FALSE ONLY if ALL images are clearly and unmistakably:
  • A pure selfie of a person with NO objects held in their hands or in frame
  • A plain human hand or body part with NO product present
  • Scenery, a wall, an empty room, or a blank/solid-colour surface
  • A computer or phone screen with no product
  • Completely unidentifiable / too dark to see anything

IMPORTANT: If you can see ANY manufactured product or container at all in ANY image, even partially, set TRUE.
If is_valid_package_image = FALSE, set invalid_reason explaining why, and you may put empty defaults in all other fields.
If is_valid_package_image = TRUE, set invalid_reason to "" and proceed to Steps 1 and 2 below.

═══════════════════════════════════════════════════════════
STEP 1 — EXEMPTION DETECTION  (before individual field extraction)
═══════════════════════════════════════════════════════════
Set is_industrial_institutional = TRUE if ANY of the following phrases appear ANYWHERE on the package:
  "Not for retail sale" | "Not meant to be sold loose" | "Not for loose sale"
  "For industrial use" | "For industrial use only" | "Institutional pack"
  "For commercial use only" | "Not for individual sale"
  "For hotels / restaurants / caterers" | "HORECA"
  "Bulk pack" (when quantity > 25 kg or > 25 L)

Set is_fast_food_exemption = TRUE if the product is clearly fast food packed by a restaurant or hotel.
Set is_scheduled_drug_exemption = TRUE if the product is a scheduled drug formulation (e.g. Schedule H/H1/X drugs).

If ANY of these are TRUE → the package is exempt from most Rule 6 declarations. STILL extract whatever text is visible. Do NOT flag absence of MRP as a violation.

═══════════════════════════════════════════════════════════
STEP 2 — FULL LABEL EXTRACTION
═══════════════════════════════════════════════════════════
Inspect ALL visible surfaces across ALL provided images: front panel, back, sides, edges, seams, barcodes, batch-code stickers, and foil strips. Combine findings into a single response.

Extract:
1. commodity_name — Generic/common product name on the Principal Display Panel (NOT the brand name). E.g. for "Lay's Classic Salted" → commodity_name = "Potato Chips"
2. manufacturer — Complete name AND full postal address of manufacturer/packer/importer.
   - has_pin_code: TRUE only if a 6-digit Indian PIN code is present.
   - has_state_or_city: TRUE if any city, district, or state name is legible.
3. net_quantity — Exact quantity as printed.
   - numeric_value: the number. Return 0 only if genuinely absent.
   - unit: copy EXACTLY as printed ("gms" stays "gms", never normalise to "g").
   - is_standard_unit: TRUE only for: g, kg, ml, l, m, cm, mm, nos, pcs.
   - has_space_separation: TRUE if space separates numeral from unit ("100 g" → true, "100g" → false).
4. mrp — Maximum Retail Price.
   - numeric_value: the rupee amount. 0 only if genuinely absent (not if it is an exempt bulk pack).
   - has_inclusive_of_taxes: TRUE only if the EXACT phrase "inclusive of all taxes" or "incl. of all taxes" is physically printed next to the price.
   - MRP is often printed near or beside the barcode — look there carefully.
5. unit_sale_price — USP per g/ml or per kg/l (Dec-2022 Amendment). is_declared = TRUE if any such text is visible.
6. mfg_or_import_date — Month and year of manufacture/packing/import. month = 1-12, year = 4 digits. Return 0 if not parseable.
7. expiry_or_best_before — Expiry / Best Before / Use By. is_declared = TRUE if ANY such date is visible.
8. consumer_care — Helpline details. has_phone/has_email as appropriate.
9. country_of_origin — "Made in India" etc.
10. package_pdp_box — Normalised bounding box [0–1] of the full Principal Display Panel in this image.
11. dimensions — Physical dimensions if printed (e.g. "30 cm × 20 cm"). is_declared = TRUE if any are visible.
12. language_compliance — Identify the language(s) of the mandatory declarations. Set is_english_or_hindi to TRUE if the text is primarily in English or Hindi (Devnagri).
13. tampering_detected — Check for Rule 18(2) / Rule 6(4) violations. Set is_tampered to TRUE if you see:
    - MRP, Date, or other mandatory info smudged, scratched out, or overwritten with ink/marker.
    - A secondary sticker pasted OVER the original printed MRP/Date.
    - If true, provide a short description.
14. is_declarations_grouped — Rule 8. Set TRUE if key declarations (commodity name, net quantity, MRP, Date) are logically grouped together on the Principal Display Panel (PDP). Set FALSE if they are scattered arbitrarily.
15. readability_issues — Set to a descriptive string if the text is blurry, has poor contrast, or the font size appears extremely small/illegible. Otherwise set to empty string "".
16. is_e_commerce — Set TRUE if the image appears to be a screenshot of an e-commerce platform listing (e.g. Amazon, Flipkart, Blinkit, etc.).
17. registration — Extract LMPC Registration details if present (e.g. "LMPC Reg No.", "Registered under Legal Metrology", "Packer Reg. No.").

FAILURE PROTOCOL — if a field is genuinely absent:
  raw_text → ""  |  is_detected/is_declared → false  |  numeric values → 0  |  booleans → false  |  box_2d → omit

ACCURACY RULES:
• Never fabricate text. Only report what is physically visible.
• Never flag absent MRP if is_industrial_institutional is true.
• Separate brand name from commodity name.
• MRP is frequently printed near the barcode — always check there.

Return ONLY the JSON object. No markdown, no explanation.`;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY is not configured in .env.local' }, { status: 500 });
        }

        const body = await req.json();
        const { images } = body;
        if (!images || !Array.isArray(images) || images.length === 0) {
            // Support legacy single image
            const { image } = body;
            if (!image || typeof image !== 'string') {
                return NextResponse.json({ error: 'A valid array of base64 images is required.' }, { status: 400 });
            }
            images.push(image);
        }

        const inlineDataParts = images.map((img: string) => {
            let base64Data = img;
            let mimeType = 'image/jpeg';
            if (img.includes(';base64,')) {
                const parts = img.split(';base64,');
                mimeType = parts[0].replace('data:', '') || 'image/jpeg';
                base64Data = parts[1];
            }
            return { inlineData: { data: base64Data, mimeType } };
        });

        // ── Model — gemini-3.6-flash (current stable, as per API directive) ───
        const MODEL      = 'gemini-3.6-flash';
        const MAX_RETRIES = 3;
        const RETRY_MS    = 1500;

        const genAI = new GoogleGenerativeAI(apiKey);

        function isRetryable(err: unknown): boolean {
            const msg = err instanceof Error ? err.message : String(err);
            return msg.includes('503') || msg.includes('Service Unavailable') ||
                   msg.includes('429') || msg.includes('Too Many Requests') ||
                   msg.includes('overloaded');
        }
        const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

        // ── Single API call with retry ───────────────────────────────────────
        const genConfig = {
            responseMimeType: 'application/json' as const,
            temperature: 0.1,
            responseSchema: FULL_SCHEMA,
        };
        const payload = [SYSTEM_PROMPT, ...inlineDataParts];

        let raw: string | null = null;
        let lastErr: unknown;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const model = genAI.getGenerativeModel({ model: MODEL, generationConfig: genConfig });
                const result = await model.generateContent(payload);
                raw = result.response.text();
                break;
            } catch (err) {
                lastErr = err;
                if (isRetryable(err) && attempt < MAX_RETRIES) {
                    console.warn(`[inspect] Attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${RETRY_MS}ms…`);
                    await sleep(RETRY_MS);
                } else {
                    break;
                }
            }
        }

        if (!raw) {
            const msg = lastErr instanceof Error ? lastErr.message : 'Gemini API unavailable after retries.';
            console.error('[inspect] All retries exhausted:', msg);
            return NextResponse.json({ error: msg }, { status: 503 });
        }

        // ── Parse response ───────────────────────────────────────────────────
        const parsed = JSON.parse(raw) as ExtractedDeclarations & {
            is_valid_package_image: boolean;
            invalid_reason: string;
        };

        // ── Image validity gate ──────────────────────────────────────────────
        if (!parsed.is_valid_package_image) {
            return NextResponse.json({
                success: false,
                invalid_image: true,
                reason: parsed.invalid_reason || 'The image does not appear to contain a packaged commodity. Please photograph a product label or packaging.',
            }, { status: 200 });
        }

        // ── Strip extra fields before passing to rule engine ─────────────────
        const { is_valid_package_image: _v, invalid_reason: _r, ...extractedData } = parsed;
        void _v; void _r;

        // ── Deterministic statutory evaluation ───────────────────────────────
        const auditResult = StatutoryRuleEngine.evaluatePackage(extractedData as ExtractedDeclarations);

        // ── Save to local repository ─────────────────────────────────────────
        const docketEntry: DocketEntry = {
            result: auditResult,
            commodityLabel: auditResult.extracted_data.commodity_name?.raw_text || 'Unknown Commodity',
            manufacturerLabel: auditResult.extracted_data.manufacturer?.raw_text || 'Unknown Manufacturer',
            imageThumb: `data:${inlineDataParts[0]?.inlineData.mimeType || 'image/jpeg'};base64,${inlineDataParts[0]?.inlineData.data || ''}`,
        };

        try {
            await fetch(new URL('/api/dockets', req.url), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(docketEntry),
            });
        } catch (dbErr) {
            console.error('[inspect] Failed to save docket to local database:', dbErr);
            // Non-fatal error, continue
        }

        return NextResponse.json({ success: true, audit: auditResult });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to process packaging inspection.';
        console.error('Inspection API Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}