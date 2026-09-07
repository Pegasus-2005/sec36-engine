/**
 * Extracted statutory declarations from a packaged commodity label,
 * as returned by the Gemini OCR prompt in /api/inspect.
 * Schema mirrors the Legal Metrology (Packaged Commodities) Rules, 2011.
 */

export interface DetectedField {
  raw_text: string;
  is_detected: boolean;
}

export interface NetQuantityField {
  raw_text: string;
  numeric_value: number | null;
  unit: string;
  is_standard_unit: boolean;
}

export interface MrpField {
  raw_text: string;
  numeric_value: number | null;
  has_inclusive_of_taxes: boolean;
}

export interface ExtractedDeclarations {
  commodity_name: DetectedField;
  manufacturer: DetectedField;
  net_quantity: NetQuantityField;
  mrp: MrpField;
  mfg_or_import_date: DetectedField;
  consumer_care: DetectedField;
  country_of_origin: DetectedField;
}

/** Result produced by the StatutoryRuleEngine for a single rule check. */
export interface RuleCheckResult {
  rule_id: string;
  rule_name: string;
  passed: boolean;
  detail: string;
}

/** Aggregate audit report returned by StatutoryRuleEngine.evaluatePackage(). */
export interface AuditReport {
  overall_compliant: boolean;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  checks: RuleCheckResult[];
}
