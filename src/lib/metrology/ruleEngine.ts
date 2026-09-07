/**
 * StatutoryRuleEngine
 *
 * Deterministic compliance checker for the Legal Metrology (Packaged
 * Commodities) Rules, 2011, Government of India.
 *
 * Each check corresponds to a specific mandatory declaration under Rule 6
 * (or sub-rules) of the LM(PC) Rules, 2011.
 */

import {
  ExtractedDeclarations,
  AuditReport,
  RuleCheckResult,
} from '@/types/metrology';

// ---------------------------------------------------------------------------
// Authoritative lists
// ---------------------------------------------------------------------------

/**
 * Standard units recognised by the Legal Metrology Act 2009 / LM(PC) Rules.
 * The unit extracted by Gemini is compared case-insensitively against this set.
 */
const STANDARD_UNITS = new Set([
  // Mass
  'mg', 'g', 'kg',
  // Volume (liquids)
  'ml', 'l', 'ltr', 'litre', 'litres', 'liter', 'liters',
  // Count / number
  'nos', 'no', 'pcs', 'pieces', 'piece',
  // Length
  'mm', 'cm', 'm',
]);

/** Common non-standard abbreviations that are *not* accepted by legal metrology. */
const NON_STANDARD_UNITS = new Set([
  'gms', 'grms', 'gm', 'grams', 'gram', 'kgs', 'mls',
]);

// ---------------------------------------------------------------------------
// Individual rule evaluators
// ---------------------------------------------------------------------------

function checkCommodityName(data: ExtractedDeclarations): RuleCheckResult {
  const passed =
    data.commodity_name.is_detected &&
    data.commodity_name.raw_text.trim().length > 0;
  return {
    rule_id: 'LM-R6(1)',
    rule_name: 'Generic/Common Name of Commodity',
    passed,
    detail: passed
      ? `Detected: "${data.commodity_name.raw_text}"`
      : 'Commodity name is absent or not legible on the package.',
  };
}

function checkManufacturer(data: ExtractedDeclarations): RuleCheckResult {
  const passed =
    data.manufacturer.is_detected &&
    data.manufacturer.raw_text.trim().length > 0;
  return {
    rule_id: 'LM-R6(2)',
    rule_name: 'Manufacturer / Packer Name and Address',
    passed,
    detail: passed
      ? `Detected: "${data.manufacturer.raw_text}"`
      : 'Manufacturer / packer name and address is missing or illegible.',
  };
}

function checkNetQuantity(data: ExtractedDeclarations): RuleCheckResult {
  const nq = data.net_quantity;
  const hasValue =
    nq.raw_text.trim().length > 0 &&
    nq.numeric_value !== null &&
    nq.numeric_value > 0;

  // Accept field-level flag first; fall back to our own lookup if Gemini
  // already normalised the unit.
  const unitLower = (nq.unit || '').toLowerCase().trim();
  const isStandard =
    nq.is_standard_unit ||
    (STANDARD_UNITS.has(unitLower) && !NON_STANDARD_UNITS.has(unitLower));

  const passed = hasValue && isStandard;

  let detail: string;
  if (!hasValue) {
    detail = 'Net quantity is absent or numeric value could not be extracted.';
  } else if (!isStandard) {
    detail = `Unit "${nq.unit}" is non-standard. Rule 2(1)(o) of LM(PC) Rules requires SI units (g, kg, ml, l, etc.).`;
  } else {
    detail = `Detected: "${nq.raw_text}" — numeric value ${nq.numeric_value} ${nq.unit}.`;
  }

  return {
    rule_id: 'LM-R6(3)',
    rule_name: 'Net Quantity in Standard Units',
    passed,
    detail,
  };
}

function checkMrp(data: ExtractedDeclarations): RuleCheckResult {
  const mrp = data.mrp;
  const hasValue =
    mrp.raw_text.trim().length > 0 &&
    mrp.numeric_value !== null &&
    mrp.numeric_value > 0;
  const hasTaxPhrase = mrp.has_inclusive_of_taxes;

  const passed = hasValue && hasTaxPhrase;

  let detail: string;
  if (!hasValue) {
    detail = 'MRP is absent or numeric value could not be extracted.';
  } else if (!hasTaxPhrase) {
    detail = `MRP detected as ₹${mrp.numeric_value} but the mandatory phrase "inclusive of all taxes" is missing (Rule 18 of LM(PC) Rules).`;
  } else {
    detail = `Detected: "${mrp.raw_text}" — ₹${mrp.numeric_value}, inclusive-of-taxes phrase present.`;
  }

  return {
    rule_id: 'LM-R18',
    rule_name: 'Maximum Retail Price (MRP) incl. of all taxes',
    passed,
    detail,
  };
}

function checkMfgDate(data: ExtractedDeclarations): RuleCheckResult {
  const passed =
    data.mfg_or_import_date.is_detected &&
    data.mfg_or_import_date.raw_text.trim().length > 0;
  return {
    rule_id: 'LM-R6(4)',
    rule_name: 'Month and Year of Manufacture / Packing / Import',
    passed,
    detail: passed
      ? `Detected: "${data.mfg_or_import_date.raw_text}"`
      : 'Month and year of manufacture or import is absent or illegible.',
  };
}

function checkConsumerCare(data: ExtractedDeclarations): RuleCheckResult {
  const passed =
    data.consumer_care.is_detected &&
    data.consumer_care.raw_text.trim().length > 0;
  return {
    rule_id: 'LM-R6(9)',
    rule_name: 'Consumer Care Details (Phone / Email / Address)',
    passed,
    detail: passed
      ? `Detected: "${data.consumer_care.raw_text}"`
      : 'Consumer care contact details are absent. Rule 6(9) requires a grievance contact.',
  };
}

function checkCountryOfOrigin(data: ExtractedDeclarations): RuleCheckResult {
  const passed =
    data.country_of_origin.is_detected &&
    data.country_of_origin.raw_text.trim().length > 0;
  return {
    rule_id: 'LM-R6(10)',
    rule_name: 'Country of Origin',
    passed,
    detail: passed
      ? `Detected: "${data.country_of_origin.raw_text}"`
      : 'Country of origin declaration is missing. Required by Rule 6(10) for all imported and domestic packaged commodities.',
  };
}

// ---------------------------------------------------------------------------
// Public engine
// ---------------------------------------------------------------------------

export const StatutoryRuleEngine = {
  /**
   * Runs all statutory checks against the extracted declarations and returns
   * a structured AuditReport.
   */
  evaluatePackage(data: ExtractedDeclarations): AuditReport {
    const checks: RuleCheckResult[] = [
      checkCommodityName(data),
      checkManufacturer(data),
      checkNetQuantity(data),
      checkMrp(data),
      checkMfgDate(data),
      checkConsumerCare(data),
      checkCountryOfOrigin(data),
    ];

    const passed_checks = checks.filter((c) => c.passed).length;
    const failed_checks = checks.length - passed_checks;

    return {
      overall_compliant: failed_checks === 0,
      total_checks: checks.length,
      passed_checks,
      failed_checks,
      checks,
    };
  },
};
