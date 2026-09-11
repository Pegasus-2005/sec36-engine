/**
 * Statutory Schema — Legal Metrology (Packaged Commodities) Rules, 2011
 * Government of India, Ministry of Consumer Affairs, Food & Public Distribution.
 *
 * This file is the single source of truth for all data shapes used by:
 *  - Gemini vision extraction (responseSchema)
 *  - StatutoryRuleEngine deterministic audit
 *  - Form-1 PDF generator
 *  - Dashboard UI
 */

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/**
 * Normalised 0–1 bounding box returned by Gemini's grounding/localisation,
 * matching the ymin/xmin/ymax/xmax convention from the Gemini API.
 */
export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  /** 0-based surface/image index where this declaration physically appears (e.g. 0 = Front PDP, 1 = Back, 2 = Flap). */
  image_index?: number;
}

/**
 * Generic wrapper for any single statutory declaration field.
 * T defaults to `string` for raw text fields; use number/boolean for
 * computed value types where applicable.
 */
export interface StatutoryDeclaration<T = string> {
  raw_text: string;
  is_detected: boolean;
  value?: T;
  box_2d?: BoundingBox;
  confidence?: number;
}

// ---------------------------------------------------------------------------
// Specialised declaration sub-types
// ---------------------------------------------------------------------------

export interface NetQuantityDetails {
  raw_text: string;
  numeric_value: number;
  unit: string;
  is_standard_unit: boolean;
  /** True when a space separates the numeric value and the unit (e.g. "100 g", not "100g"). */
  has_space_separation: boolean;
  box_2d?: BoundingBox;
}

export interface MRPDetails {
  raw_text: string;
  numeric_value: number;
  currency?: string;
  /** True ONLY if "inclusive of all taxes" or "incl. of all taxes" is physically present. */
  has_inclusive_of_taxes: boolean;
  box_2d?: BoundingBox;
}

/** Rule 6(1)(e) Dec-2022 Amendment — Unit Sale Price (₹ per g/ml or ₹ per kg/l). */
export interface UnitSalePriceDetails {
  raw_text: string;
  is_declared: boolean;
  price_per_unit?: number;
  unit?: string;
  box_2d?: BoundingBox;
}

export interface ConsumerCareDetails {
  raw_text: string;
  has_phone: boolean;
  has_email: boolean;
  phone?: string;
  email?: string;
  address?: string;
  box_2d?: BoundingBox;
}

/** Rule 6(1)(f) — Dimensions or sizes (applicable to sheets, wipes, bags, containers). */
export interface DimensionDetails {
  raw_text: string;
  is_declared: boolean;
  values?: string;           // e.g. "30 cm × 20 cm" or "A4 (210 × 297 mm)"
  box_2d?: BoundingBox;
}

// ---------------------------------------------------------------------------
// Root extracted document
// ---------------------------------------------------------------------------

export interface ExtractedDeclarations {
  /** Rule 6(1)(b) — Generic / common name of commodity on the PDP. */
  commodity_name: StatutoryDeclaration;

  /** Rule 6(1)(a) — Manufacturer / packer / importer name and full postal address. */
  manufacturer: StatutoryDeclaration & {
    has_pin_code: boolean;
    has_state_or_city: boolean;
  };

  /** Rule 6(1)(c) — Net quantity in standard SI units with correct space separation. */
  net_quantity: NetQuantityDetails;

  /** Rule 6(1)(e) — MRP inclusive of all taxes. */
  mrp: MRPDetails;

  /** Rule 6(11) — Unit Sale Price (₹/g or ₹/kg); Dec-2022 Amendment. */
  unit_sale_price: UnitSalePriceDetails;

  /** Rule 6(1)(d) — Month and year of manufacture / packing / import. */
  mfg_or_import_date: StatutoryDeclaration & {
    month?: number;
    year?: number;
  };

  /** Rule 6(1)(da) — Best Before / Use By date (CRITICAL for food, cosmetics, pharma). */
  expiry_or_best_before: StatutoryDeclaration & {
    is_declared: boolean;
  };

  /** Rule 6(2) — Consumer care details: must have phone, address, AND email. */
  consumer_care: ConsumerCareDetails;

  /** Rule 6(1)(aa) — Country of origin (CRITICAL for imported goods). */
  country_of_origin: StatutoryDeclaration;

  /** Rule 6(1)(f) — Dimensions / sizes (for dimensional items: sheets, wipes, bags). */
  dimensions: DimensionDetails;

  /**
   * Rule 26 — Set true if the package is intended for industrial or institutional
   * consumers, which exempts it from most mandatory Rule 6 declarations.
   */
  is_industrial_institutional: boolean;

  /**
   * Rule 26(b) — Set true if it's fast food packed by restaurants/hotels.
   */
  is_fast_food_exemption: boolean;

  /**
   * Rule 26(c) — Set true if it's a scheduled drug formulation.
   */
  is_scheduled_drug_exemption: boolean;

  /**
   * Rule 6(10) — Set true if the image is a screenshot of an e-commerce platform.
   */
  is_e_commerce: boolean;

  /**
   * Rule 27 — LMPC Registration details.
   */
  registration: StatutoryDeclaration;

  /**
   * Rule 9(1) — Language compliance: Declarations must be in Hindi or English.
   */
  language_compliance: {
    is_english_or_hindi: boolean;
    detected_languages: string;
  };

  /**
   * Rule 18(2) / Rule 6(4) — Tampering or overwriting of declarations (e.g. MRP).
   */
  tampering_detected: {
    is_tampered: boolean;
    description: string;
    box_2d?: BoundingBox;
  };

  /**
   * Rule 8 — Principal Display Panel Grouping.
   * Are the mandatory declarations logically grouped on the PDP?
   */
  is_declarations_grouped: boolean;

  /**
   * General readability and contrast check.
   * If there are issues (too small, blurry, bad contrast), this should contain a description.
   * Otherwise, empty string.
   */
  readability_issues: string;

  /**
   * Bounding box of the Principal Display Panel (PDP) in 0–1 normalised coords.
   * Required by the Rule 7 minimum font-height check and Rule 8 grouping check.
   */
  package_pdp_box: BoundingBox;
}

// ---------------------------------------------------------------------------
// Audit result types
// ---------------------------------------------------------------------------

export type ViolationSeverity = 'CRITICAL' | 'MAJOR' | 'MODERATE';

export interface DocketEntry {
  id?: string;
  result: InspectionAuditResult;
  commodityLabel: string;
  manufacturerLabel: string;
  imageThumb?: string;
  images?: string[];
}
export type ComplianceStatus = 'COMPLIANT' | 'NON_COMPLIANT' | 'ACTION_REQUIRED';

export interface ViolationRecord {
  rule: string;
  statutory_citation: string;
  severity: ViolationSeverity;
  message: string;
  detected_text?: string;
  remedial_action?: string;
}

/**
 * Complete enriched result produced by StatutoryRuleEngine.evaluatePackage().
 * Returned directly to the client by /api/inspect.
 */
export interface InspectionAuditResult {
  inspection_id: string;
  timestamp: string;
  overall_status: ComplianceStatus;
  compliance_score: number;
  total_rules_checked: number;
  violations: ViolationRecord[];
  passed_rules: string[];
  applicable_penal_sections?: string[];
  extracted_data: ExtractedDeclarations;
}
