/**
 * StatutoryRuleEngine
 *
 * Deterministic compliance checker for the Legal Metrology
 * (Packaged Commodities) Rules, 2011, Government of India.
 *
 * Statutory rule matrix (exact citations):
 *  Rule 26        — Exemption for small / bulk / industrial-institutional packages
 *  Rule 6(1)(a)   — Manufacturer / packer / importer name and full postal address
 *  Rule 6(1)(aa)  — Country of origin (mandatory; CRITICAL for imported goods)
 *  Rule 6(1)(b)   — Generic / common name of commodity on PDP
 *  Rule 6(1)(c)   — Net quantity in standard SI units with correct space separation
 *  Rule 6(1)(d)   — Month and year of manufacture / packing / import
 *  Rule 6(1)(da)  — Best Before / Use By date (food, cosmetics, pharma)
 *  Rule 6(1)(e)   — MRP inclusive of all taxes
 *  Rule 6(11)     — Unit Sale Price (₹/g or ₹/kg) — Dec-2022 Amendment
 *  Rule 6(1)(f)   — Dimensions / sizes for relevant commodity categories
 *  Rule 6(2)      — Consumer care: phone, postal address, and email
 *  Rule 7         — Minimum font height estimation via PDP bounding-box ratio
 *
 * CRITICAL CONSTRAINT: This engine performs DETERMINISTIC statutory evaluation only.
 * No LLM is involved in any compliance determination made here.
 */

import {
  ExtractedDeclarations,
  InspectionAuditResult,
  ViolationRecord,
  ViolationSeverity,
  BoundingBox,
} from '@/types/metrology';

// ---------------------------------------------------------------------------
// Authoritative unit sets — Rule 2(1)(o), LM(PC) Rules 2011
// ---------------------------------------------------------------------------

/** SI units that are legally valid for net-quantity declarations. */
const STANDARD_UNITS = new Set([
  'g', 'kg', 'ml', 'l', 'm', 'cm', 'mm', 'n', 'u',
  'litre', 'litres', 'liter', 'liters',
  'nos', 'no', 'pcs', 'pieces', 'piece',
]);

/**
 * Unit abbreviations explicitly prohibited by LM(PC) Rules.
 * Each entry triggers a CRITICAL Rule 6(1)(c) violation.
 */
const ILLEGAL_UNITS: string[] = [
  'gm', 'gms', 'grm', 'grms', 'kgm', 'kgs', 'kilo',
  'ltr', 'ltrs', 'ml.', 'cu.cm',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function passed(citation: string, detail: string): string {
  return `${citation}: ${detail}`;
}

function v(
  citation: string,
  rule: string,
  severity: ViolationSeverity,
  message: string,
  detected_text?: string,
  remedial_action?: string,
): ViolationRecord {
  return { statutory_citation: citation, rule, severity, message, detected_text, remedial_action };
}

function boxHeight(box: BoundingBox): number {
  return Math.max(0, box.ymax - box.ymin);
}

// ---------------------------------------------------------------------------
// Rule 26 — Exemption gate
// ---------------------------------------------------------------------------

/**
 * Returns true if the package falls within a Rule 26 exemption category:
 * (a) Small packs: net_quantity ≤ 10 g or ≤ 10 ml
 * (b) Bulk packs:  net_quantity > 25 kg or > 25 l
 * (c) Industrial / institutional packages
 */
function isRule26Exempt(data: ExtractedDeclarations): boolean {
  if (data.is_industrial_institutional) return true;
  if (data.is_fast_food_exemption) return true;
  if (data.is_scheduled_drug_exemption) return true;

  const val = data.net_quantity.numeric_value;
  const unit = (data.net_quantity.unit || '').toLowerCase().trim();

  // Small packs (≤ 10 g or ≤ 10 ml)
  if ((unit === 'g' || unit === 'ml') && val > 0 && val <= 10) return true;

  // Bulk / industrial packs (> 25 kg or > 25 l)
  if ((unit === 'kg' || unit === 'l' || unit === 'litre' || unit === 'litres') && val > 25)
    return true;

  return false;
}

// ---------------------------------------------------------------------------
// Individual rule evaluators
// Each returns [violations, passed_rules]
// ---------------------------------------------------------------------------

/** Rule 6(1)(a) — Manufacturer / packer / importer name and full postal address */
function checkManufacturer(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const mfr = data.manufacturer;
  const V: ViolationRecord[] = [];
  const P: string[] = [];

  if (!mfr.is_detected || !mfr.raw_text.trim()) {
    V.push(v(
      'LM-R6(1)(a)',
      'Manufacturer / Packer / Importer Name and Address',
      'CRITICAL',
      'Manufacturer / packer / importer name and address is absent or illegible. ' +
        'Mandatory under Rule 6(1)(a) of LM(PC) Rules, 2011.',
      mfr.raw_text || undefined,
      'Print the complete name and full postal address (with PIN code and state) of the ' +
        'manufacturer, packer, or importer on the package.',
    ));
    return [V, P];
  }

  P.push(passed('LM-R6(1)(a)', `Manufacturer detected: "${mfr.raw_text}"`));

  if (!mfr.has_pin_code) {
    V.push(v(
      'LM-R6(1)(a)-PIN',
      'Manufacturer Address — PIN Code Missing',
      'MAJOR',
      'The manufacturer / packer address is present but does not include a PIN code. ' +
        'Rule 6(1)(a) requires a complete postal address.',
      mfr.raw_text,
      'Add the 6-digit PIN code of the manufacturer / packer address to the label.',
    ));
  } else {
    P.push(passed('LM-R6(1)(a)-PIN', 'PIN code present in manufacturer address.'));
  }

  if (!mfr.has_state_or_city) {
    V.push(v(
      'LM-R6(1)(a)-LOC',
      'Manufacturer Address — City / State Missing',
      'MAJOR',
      'Manufacturer address does not specify a city or state. ' +
        'Rule 6(1)(a) requires a complete postal address.',
      mfr.raw_text,
      'Add the city and state name to the manufacturer / packer address.',
    ));
  } else {
    P.push(passed('LM-R6(1)(a)-LOC', 'City / state present in manufacturer address.'));
  }

  return [V, P];
}

/** Rule 6(1)(aa) — Country of origin (CRITICAL for imported goods) */
function checkCountryOfOrigin(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const co = data.country_of_origin;
  if (!co.is_detected || !co.raw_text.trim()) {
    return [[v(
      'LM-R6(1)(aa)',
      'Country of Origin',
      'CRITICAL',
      'Country of origin declaration is absent. Rule 6(1)(aa) of LM(PC) Rules requires this ' +
        'declaration on all packaged commodities; it is especially critical for imported goods.',
      undefined,
      'Print "Made in India" or the appropriate country of origin declaration on the package.',
    )], []];
  }
  return [[], [passed('LM-R6(1)(aa)', `Country of origin: "${co.raw_text}"`)]];
}

/** Rule 6(1)(b) — Generic / common name of the commodity on the PDP */
function checkCommodityName(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const cn = data.commodity_name;
  if (!cn.is_detected || !cn.raw_text.trim()) {
    return [[v(
      'LM-R6(1)(b)',
      'Generic / Common Name of Commodity',
      'MAJOR',
      'The generic or common name of the commodity is absent from the Principal Display Panel. ' +
        'Mandatory under Rule 6(1)(b) of LM(PC) Rules, 2011.',
      undefined,
      'Print the generic or common name of the commodity prominently on the Principal Display Panel.',
    )], []];
  }
  return [[], [passed('LM-R6(1)(b)', `Commodity name: "${cn.raw_text}"`)]];
}

/** Rule 6(1)(c) — Net quantity in standard SI units */
function checkNetQuantity(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const nq = data.net_quantity;
  const V: ViolationRecord[] = [];
  const P: string[] = [];
  const unitLower = (nq.unit || '').toLowerCase().trim();

  if (!nq.raw_text.trim() || nq.numeric_value <= 0) {
    V.push(v(
      'LM-R6(1)(c)',
      'Net Quantity Declaration',
      'CRITICAL',
      'Net quantity is absent or the numeric value could not be determined. ' +
        'Mandatory under Rule 6(1)(c) of LM(PC) Rules, 2011.',
      nq.raw_text || undefined,
      'Declare the net quantity with a numeric value and a standard SI unit on the package.',
    ));
    return [V, P];
  }

  const illegalMatch = ILLEGAL_UNITS.find((u) => unitLower === u);
  if (illegalMatch) {
    V.push(v(
      'LM-R12',
      'Net Quantity — Prohibited Unit Abbreviation',
      'CRITICAL',
      `Unit "${nq.unit}" is an illegal abbreviation prohibited under Rule 12 of LM(PC) Rules. ` +
        'Only standard metric SI units are legally permitted.',
      nq.raw_text,
      `Replace "${nq.unit}" with the correct SI unit (e.g. "g" for grams, "kg" for kilograms, "ml" for millilitres).`,
    ));
  } else if (!STANDARD_UNITS.has(unitLower)) {
    V.push(v(
      'LM-R12',
      'Net Quantity — Non-Standard Unit',
      'CRITICAL',
      `Unit "${nq.unit}" is not a recognised SI unit under Rule 12 of LM(PC) Rules.`,
      nq.raw_text,
      'Use only legally recognised SI units for net quantity declarations.',
    ));
  } else {
    P.push(passed('LM-R6(1)(c)', `Net quantity: "${nq.raw_text}" — unit "${nq.unit}" is standard.`));
  }

  if (!nq.has_space_separation) {
    V.push(v(
      'LM-R6(1)(c)-SPACE',
      'Net Quantity — Missing Space Between Numeral and Unit',
      'MODERATE',
      `Net quantity "${nq.raw_text}" does not separate the numeral and unit with a space ` +
        '(e.g. "100g" should be "100 g") as required by SI convention under LM(PC) Rules.',
      nq.raw_text,
      'Insert a space between the numeric value and the unit symbol (e.g. "200 g", "500 ml").',
    ));
  } else {
    P.push(passed('LM-R6(1)(c)-SPACE', 'Numeral–unit space separation is correct.'));
  }

  return [V, P];
}

/** Rule 6(1)(d) — Month and year of manufacture / packing / import */
function checkMfgDate(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const d = data.mfg_or_import_date;
  if (!d.is_detected || !d.raw_text.trim()) {
    return [[v(
      'LM-R6(1)(d)',
      'Month and Year of Manufacture / Packing / Import',
      'MAJOR',
      'Month and year of manufacture, packing, or import is absent or illegible. ' +
        'Mandatory under Rule 6(1)(d) of LM(PC) Rules, 2011.',
      undefined,
      'Declare the month and year of manufacture or packing on the label (e.g. "Mfg: JAN 2024").',
    )], []];
  }
  return [[], [passed('LM-R6(1)(d)', `Manufacture / import date: "${d.raw_text}"`)]];
}

/** Rule 6(1)(da) — Best Before / Use By date (CRITICAL for food, cosmetics, pharma) */
function checkExpiry(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const exp = data.expiry_or_best_before;
  if (!exp.is_declared || !exp.is_detected || !exp.raw_text.trim()) {
    return [[v(
      'LM-R6(1)(da)',
      '"Best Before" / "Use By" Date',
      'CRITICAL',
      '"Best Before" or "Use By" date is absent. Rule 6(1)(da) of LM(PC) Rules mandates ' +
        'this declaration on all food products, cosmetics, and pharmaceutical packaged commodities.',
      undefined,
      'Print the expiry / "Best Before" date on the package in the format "BB: MM/YYYY" or "Exp: MM/YYYY".',
    )], []];
  }
  return [[], [passed('LM-R6(1)(da)', `Best Before / Use By date: "${exp.raw_text}"`)]];
}

/** Rule 6(1)(e) — MRP inclusive of all taxes */
function checkMrp(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const mrp = data.mrp;
  const V: ViolationRecord[] = [];
  const P: string[] = [];

  if (!mrp.raw_text.trim() || mrp.numeric_value <= 0) {
    V.push(v(
      'LM-R6(1)(e)',
      'Maximum Retail Price (MRP)',
      'CRITICAL',
      'MRP declaration is absent or numeric value is zero. ' +
        'Mandatory under Rule 6(1)(e) of LM(PC) Rules, 2011.',
      mrp.raw_text || undefined,
      'Print the MRP with the phrase "inclusive of all taxes" on the package.',
    ));
    return [V, P];
  }

  P.push(passed('LM-R6(1)(e)', `MRP detected: "${mrp.raw_text}" — ₹${mrp.numeric_value}`));

  if (!mrp.has_inclusive_of_taxes) {
    V.push(v(
      'LM-R2(m)-TAX',
      'MRP — Mandatory Tax Inclusion Phrase Missing',
      'MAJOR',
      `MRP of ₹${mrp.numeric_value} is present but the mandatory phrase ` +
        '"inclusive of all taxes" or "incl. of all taxes" is not printed adjacent to the price, ' +
        'as required by the definition of Retail Sale Price under Rule 2(m) of LM(PC) Rules.',
      mrp.raw_text,
      'Print "incl. of all taxes" or "inclusive of all taxes" immediately adjacent to the MRP figure.',
    ));
  } else {
    P.push(passed('LM-R6(1)(e)-TAX', 'MRP tax inclusion phrase "inclusive of all taxes" is present.'));
  }

  return [V, P];
}

/** Rule 6(11) — Unit Sale Price (₹/g or ₹/kg); Dec-2022 Amendment */
function checkUnitSalePrice(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const usp = data.unit_sale_price;
  const V: ViolationRecord[] = [];
  const P: string[] = [];

  if (!usp.is_declared || !usp.raw_text.trim()) {
    V.push(v(
      'LM-R6(11)',
      'Unit Sale Price (USP)',
      'MAJOR',
      'Unit Sale Price (₹ per g/ml or ₹ per kg/l) is not declared. The December 2022 amendment ' +
        'to Rule 6(11) makes USP mandatory on all pre-packaged commodities.',
      undefined,
      'Declare the Unit Sale Price (e.g. "₹ 8 per 100 g") on the package as per the Dec-2022 LM(PC) Amendment.',
    ));
    return [V, P];
  }

  P.push(passed('LM-R6(11)', `Unit Sale Price detected: "${usp.raw_text}"`));

  // Verify USP is rounded to two decimal places when a numeric value is present
  if (usp.price_per_unit !== undefined && usp.price_per_unit !== null) {
    const rounded = Math.round(usp.price_per_unit * 100) / 100;
    if (Math.abs(rounded - usp.price_per_unit) > 0.005) {
      V.push(v(
        'LM-R6(11)-ROUNDING',
        'Unit Sale Price — Incorrect Rounding',
        'MODERATE',
        `USP value ${usp.price_per_unit} is not rounded to two decimal places as required by Rule 6(11).`,
        usp.raw_text,
        'Round the Unit Sale Price to a maximum of two decimal places (e.g. ₹ 1.25 per g).',
      ));
    } else {
      P.push(passed('LM-R6(11)-ROUNDING', `USP value ${usp.price_per_unit} is correctly rounded.`));
    }
  }

  return [V, P];
}

/** Rule 6(1)(f) — Dimensions / sizes for relevant commodity categories */
function checkDimensions(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const dim = data.dimensions;
  // MODERATE — only applicable to dimensional items (sheets, wipes, bags, containers)
  if (!dim.is_declared || !dim.raw_text.trim()) {
    return [[v(
      'LM-R6(1)(f)',
      'Dimensions / Sizes',
      'MODERATE',
      'Dimensions or sizes are not declared. Rule 6(1)(f) of LM(PC) Rules requires dimensional ' +
        'details on packages of items sold by size (sheets, wipes, bags, containers, fabrics).',
      undefined,
      'Declare the dimensions or size of the commodity on the label (e.g. "30 cm × 20 cm", "A4").',
    )], []];
  }
  return [[], [passed('LM-R6(1)(f)', `Dimensions declared: "${dim.raw_text}"`)]];
}

/** Rule 6(2) — Consumer care: phone, postal address, AND email */
function checkConsumerCare(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const cc = data.consumer_care;
  const V: ViolationRecord[] = [];
  const P: string[] = [];

  if (!cc.raw_text.trim() && !cc.has_phone && !cc.has_email) {
    V.push(v(
      'LM-R6(2)',
      'Consumer Care Contact Details — Completely Absent',
      'CRITICAL',
      'No consumer care contact details (phone, email, or address) are declared. ' +
        'Rule 6(2) of LM(PC) Rules mandates a consumer grievance contact on all packaged commodities.',
      undefined,
      'Print a consumer care phone number, email address, and postal address on the package.',
    ));
    return [V, P];
  }

  P.push(passed('LM-R6(2)', `Consumer care detected: "${cc.raw_text}"`));

  if (!cc.has_email) {
    V.push(v(
      'LM-R6(2)-EMAIL',
      'Consumer Care — Email ID Missing',
      'CRITICAL',
      'Consumer care email ID is absent. Rule 6(2) read with the 2022 amendment specifically ' +
        'requires an email address for consumer grievance redressal.',
      cc.raw_text || undefined,
      'Add a dedicated consumer care email address to the package label.',
    ));
  } else {
    P.push(passed('LM-R6(2)-EMAIL', `Consumer care email: ${cc.email ?? 'detected'}`));
  }

  if (!cc.has_phone) {
    V.push(v(
      'LM-R6(2)-PHONE',
      'Consumer Care — Phone / Helpline Missing',
      'MAJOR',
      'Consumer care phone number or helpline is absent. Required by Rule 6(2).',
      cc.raw_text || undefined,
      'Print a consumer care helpline number on the package.',
    ));
  } else {
    P.push(passed('LM-R6(2)-PHONE', `Consumer care phone: ${cc.phone ?? 'detected'}`));
  }

  if (!cc.address) {
    V.push(v(
      'LM-R6(2)-ADDR',
      'Consumer Care — Postal Address Missing',
      'MAJOR',
      'Consumer care postal address is absent. Rule 6(2) requires a complete consumer grievance address.',
      cc.raw_text || undefined,
      'Add the consumer care postal address to the package label.',
    ));
  } else {
    P.push(passed('LM-R6(2)-ADDR', `Consumer care address: ${cc.address}`));
  }

  return [V, P];
}

/**
 * Rule 7 — Minimum font height estimation.
 * ratio = (text_box height) / (PDP box height)
 * Thresholds: net weight ≤ 200 g → ratio ≥ 0.025 | net weight > 200 g → ratio ≥ 0.045
 */
function checkFontSize(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const V: ViolationRecord[] = [];
  const P: string[] = [];
  const pdp = data.package_pdp_box;
  const pdpH = boxHeight(pdp);

  if (pdpH <= 0) return [V, P]; // No PDP box available — skip

  const nq = data.net_quantity;
  const unitLower = (nq.unit || '').toLowerCase().trim();
  const isGrams = unitLower === 'g' || unitLower === 'gm' || unitLower === 'gms';
  const weightInGrams = isGrams ? nq.numeric_value : nq.numeric_value * 1000;
  const threshold = weightInGrams <= 200 ? 0.025 : 0.045;
  const weightLabel = weightInGrams <= 200 ? '≤ 200 g' : '> 200 g';

  const candidates: { label: string; box: BoundingBox | undefined }[] = [
    { label: 'Net Quantity',        box: nq.box_2d },
    { label: 'MRP',                 box: data.mrp.box_2d },
    { label: 'Best Before / Expiry', box: data.expiry_or_best_before.box_2d },
  ];

  for (const { label, box } of candidates) {
    if (!box) continue;
    const ratio = boxHeight(box) / pdpH;
    if (ratio < threshold) {
      V.push(v(
        'LM-R7-FONT',
        `Rule 7 Minimum Font Height — ${label}`,
        'MAJOR',
        `Font height ratio for "${label}" is ${ratio.toFixed(4)}, below the Rule 7 minimum of ` +
          `${threshold} for packages ${weightLabel}. High-risk font size violation.`,
        undefined,
        `Increase the printed font size for "${label}" so its height ratio exceeds ${threshold} ` +
          'relative to the Principal Display Panel area.',
      ));
    } else {
      P.push(passed('LM-R7-FONT', `${label} font ratio ${ratio.toFixed(4)} meets Rule 7 minimum (${threshold}).`));
    }
  }

  // ── Readability Check ────────────────────────────────────────────────────
  if (data.readability_issues && data.readability_issues.trim().length > 0) {
    V.push(v(
      'LM-R9',
      'Rule 9 Manner of Declarations',
      'MODERATE',
      `Readability issue detected: ${data.readability_issues}. Rule 9 requires declarations to be legible, prominent, definite, plain, not obscured, and in high contrast to the background.`,
      undefined,
      'Ensure all mandatory declarations are printed clearly with adequate contrast against the background.'
    ));
  } else {
    P.push(passed('LM-R9', 'Text appears clear, legible, and has sufficient contrast as per Rule 9.'));
  }

  return [V, P];
}

/**
 * Rule 9(1) — Language compliance.
 * Declarations must be in Hindi (Devnagri) or English.
 */
function checkLanguage(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const V: ViolationRecord[] = [];
  const P: string[] = [];

  const lang = data.language_compliance;
  if (!lang) return [V, P];

  if (!lang.is_english_or_hindi) {
    V.push(v(
      'LM-R9-LANG',
      'Rule 9(1) Language of Declarations',
      'MAJOR',
      `Declarations detected in: ${lang.detected_languages || 'unknown language'}. Mandatory declarations must be in Hindi (Devnagri script) or English.`,
      undefined,
      'Ensure all mandatory declarations are printed in either English or Hindi (Devnagri).'
    ));
  } else {
    P.push(passed('LM-R9-LANG', 'Mandatory declarations are in English or Hindi.'));
  }

  return [V, P];
}

/**
 * Rule 18(2) / Rule 6(4) — Tampering / Stickers.
 * Prohibition on smudging, overwriting, or affixing secondary stickers over MRP/Dates.
 */
function checkTampering(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const V: ViolationRecord[] = [];
  const P: string[] = [];

  const tamper = data.tampering_detected;
  if (!tamper) return [V, P];

  if (tamper.is_tampered) {
    V.push(v(
      'LM-R18-TAMPER',
      'Rule 18(2) / 6(4) Tampering or Overwriting',
      'CRITICAL',
      `Tampering detected: ${tamper.description}. Smudging, overwriting, or affixing individual stickers to alter mandatory declarations is strictly prohibited.`,
      undefined,
      'Remove unauthorized stickers or smudges. Ensure original printed declarations are clearly visible and unaltered.'
    ));
  } else {
    P.push(passed('LM-R18-TAMPER', 'No signs of tampering, overwriting, or unauthorized stickers detected.'));
  }

  return [V, P];
}

/**
 * Rule 8 — Principal Display Panel Grouping.
 * Mandatory declarations must be grouped together on the PDP.
 */
function checkDeclarationGrouping(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const V: ViolationRecord[] = [];
  const P: string[] = [];

  if (data.is_declarations_grouped) {
    P.push(passed('LM-R8-GROUP', 'Key mandatory declarations (Name, Qty, MRP, Date) are logically grouped together on the Principal Display Panel.'));
  } else {
    V.push(v(
      'LM-R8-GROUP',
      'Rule 8 Principal Display Panel Grouping',
      'MAJOR',
      'Mandatory declarations are scattered and not logically grouped together on the Principal Display Panel.',
      undefined,
      'Group the mandatory declarations (Commodity Name, Net Quantity, MRP, Date) closely together on the Principal Display Panel (PDP).'
    ));
  }

  return [V, P];
}

/**
 * Rule 6(10) — E-Commerce Entity Mandate
 * E-commerce listings must display all declarations except month/year of manufacture.
 */
function checkECommerce(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const V: ViolationRecord[] = [];
  const P: string[] = [];

  if (!data.is_e_commerce) return [V, P]; // Only applies to digital e-commerce listings

  P.push(passed('LM-R6(10)', 'Identified as an E-Commerce platform listing. Checking digital declarations.'));

  // The absence of these in e-commerce is a specific 6(10) violation.
  const required = [
    { key: data.manufacturer, name: 'Manufacturer Details' },
    { key: data.net_quantity, name: 'Net Quantity', check: data.net_quantity.numeric_value > 0 },
    { key: data.mrp, name: 'MRP', check: data.mrp.numeric_value > 0 },
    { key: data.country_of_origin, name: 'Country of Origin' },
  ];

  const missing = required.filter(r => (r.check !== undefined ? !r.check : (!r.key.is_detected || !r.key.raw_text.trim())));

  if (missing.length > 0) {
    const missingNames = missing.map(m => m.name).join(', ');
    V.push(v(
      'LM-R6(10)',
      'E-Commerce Entity Mandate',
      'CRITICAL',
      `E-commerce listing is missing mandatory declarations: ${missingNames}. Rule 6(10) mandates e-commerce entities to display all declarations on their digital listings.`,
      undefined,
      `Update the digital listing to include the missing declarations: ${missingNames}.`
    ));
  } else {
    P.push(passed('LM-R6(10)', 'All mandatory digital declarations are present on the e-commerce listing.'));
  }

  return [V, P];
}

/**
 * Rule 27 — Registration
 * Every manufacturer/packer/importer must register their premises.
 */
function checkRegistration(data: ExtractedDeclarations): [ViolationRecord[], string[]] {
  const V: ViolationRecord[] = [];
  const P: string[] = [];

  const reg = data.registration;
  if (!reg || !reg.is_detected || !reg.raw_text.trim()) {
    V.push(v(
      'LM-R27',
      'Rule 27 Registration',
      'MAJOR',
      'LMPC Registration details are absent. Rule 27 requires manufacturers, packers, or importers to register their premises with the Director/Controller of Legal Metrology.',
      undefined,
      'Ensure the package or listing bears the valid Legal Metrology Registration Number.'
    ));
  } else {
    P.push(passed('LM-R27', `LMPC Registration detected: "${reg.raw_text}"`));
  }

  return [V, P];
}

// ---------------------------------------------------------------------------
// Public engine
// ---------------------------------------------------------------------------

export const StatutoryRuleEngine = {
  /**
   * Runs the complete statutory check matrix (Rules 26, 6, 7) against the
   * Gemini-extracted declarations and returns a fully assembled InspectionAuditResult.
   *
   * DETERMINISTIC ONLY — no LLM involvement from this point forward.
   */
  evaluatePackage(data: ExtractedDeclarations): InspectionAuditResult {
    const base = {
      inspection_id: `INSP-${Date.now().toString().slice(-8)}`,
      timestamp: new Date().toISOString(),
      extracted_data: data,
    };

    // ── Rule 26 Exemption Gate ──────────────────────────────────────────────
    if (isRule26Exempt(data)) {
      let reason = 'Exempt from mandatory Rule 6 declarations under Rule 26 of LM(PC) Rules, 2011.';
      if (data.is_industrial_institutional) {
        reason += ' Package is intended for industrial or institutional consumers.';
      } else {
        const val = data.net_quantity.numeric_value;
        const unit = (data.net_quantity.unit || '').toLowerCase().trim();
        reason += ` Net quantity: ${val} ${unit}.`;
      }

      return {
        ...base,
        overall_status: 'COMPLIANT',
        compliance_score: 100,
        total_rules_checked: 0,
        violations: [],
        passed_rules: [reason],
      };
    }

    // ── Full Rule 6 / Rule 7 Matrix ─────────────────────────────────────────
    const allViolations: ViolationRecord[] = [];
    const allPassed: string[] = [];

    const checks: Array<(d: ExtractedDeclarations) => [ViolationRecord[], string[]]> = [
      checkManufacturer,       // LM-R6(1)(a)
      checkCountryOfOrigin,    // LM-R6(1)(aa)
      checkCommodityName,      // LM-R6(1)(b)
      checkNetQuantity,        // LM-R6(1)(c)
      checkMfgDate,            // LM-R6(1)(d)
      checkExpiry,             // LM-R6(1)(da)
      checkMrp,                // LM-R6(1)(e)
      checkUnitSalePrice,      // LM-R6(11)
      checkDimensions,         // LM-R6(1)(f)
      checkConsumerCare,       // LM-R6(2)
      checkFontSize,           // LM-R7
      checkLanguage,           // LM-R9(1)
      checkTampering,          // LM-R18(2)
      checkDeclarationGrouping,// LM-R8
      checkECommerce,          // LM-R6(10)
      checkRegistration,       // LM-R27
    ];

    for (const check of checks) {
      const [V, P] = check(data);
      allViolations.push(...V);
      allPassed.push(...P);
    }

    const total = allViolations.length + allPassed.length;
    const score = total > 0 ? Math.round((allPassed.length / total) * 100) : 100;
    const hasCritical = allViolations.some((vr) => vr.severity === 'CRITICAL');
    const overall_status =
      allViolations.length === 0
        ? 'COMPLIANT'
        : hasCritical
        ? 'NON_COMPLIANT'
        : 'ACTION_REQUIRED';

    const applicable_penal_sections: string[] = [];
    if (overall_status !== 'COMPLIANT') {
      applicable_penal_sections.push(
        'Section 18, Legal Metrology Act, 2009 (Prohibition of manufacture/sale of non-standard packages)',
        'Section 36(1), Legal Metrology Act, 2009 (Penalty for non-standard packages)',
        'Section 48, Legal Metrology Act, 2009 (Compounding of offences)',
        'Section 49, Legal Metrology Act, 2009 (Offence by companies)',
        'Rule 32, Legal Metrology (Packaged Commodities) Rules, 2011 (General Penalties)'
      );
    }

    return {
      ...base,
      overall_status,
      compliance_score: score,
      total_rules_checked: total,
      violations: allViolations,
      passed_rules: allPassed,
      applicable_penal_sections,
    };
  },
};
