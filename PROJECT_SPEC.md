# PROJECT SPECIFICATION: SIH26034 LEGAL METROLOGY COMPLIANCE INSPECTOR

## 1. Executive Overview
- Problem Statement: SIH26034 (Ministry of Consumer Affairs, Food & Public Distribution)
- Target: Automated compliance inspector for packaged commodities under the Legal Metrology (Packaged Commodities) Rules, 2011 (LMPC Rules).
- Architecture Strategy: Hybrid Inspection Pipeline.
  - Optical Entity Extraction: Google Gemini 1.5 Flash (via @google/generative-ai) outputs structured JSON.
  - Statutory Evaluation: Deterministic TypeScript Rule Engine (src/lib/metrology/ruleEngine.ts). Never outsource legal compliance determinations to an LLM.

## 2. Technical Stack
- Framework: Next.js 14/15 (App Router, React 18/19, TypeScript)
- Styling: Tailwind CSS, Lucide React icons
- Multimodal SDK: @google/generative-ai
- Local Environment: macOS (Apple Silicon MacBook Air)
  - Default Webcam: Built-in FaceTime HD Camera (requires facingMode: 'user')

## 3. Statutory Compliance Rules (LMPC 2011)
The deterministic engine evaluates the extracted data against Rule 6(1):
1. Rule 6(1)(a): Complete name and physical address of the manufacturer/packer/importer.
2. Rule 6(1)(b): Generic or common name of the commodity printed prominently.
3. Rule 6(1)(c): Net quantity declared using legal SI metric units ('g', 'kg', 'ml', 'l'). Prohibit illegal abbreviations ('gm', 'gms', 'ltr', 'ltrs').
4. Rule 6(1)(d): Month and year of manufacture/packing (MM/YYYY).
5. Rule 6(1)(e): Maximum Retail Price (MRP) with the mandatory statutory phrase 'inclusive of all taxes' (Rule 2(m)).
6. Rule 6(1)(f): Consumer care contact details (valid phone number, address, and mandatory email).
7. Rule 6(1)(g): Country of Origin (mandatory for all goods, especially imported commodities).

## 4. File Structure & Boundaries
- `src/types/metrology.ts`: Static interfaces for extracted package data, bounding boxes, and violation records.
- `src/lib/metrology/ruleEngine.ts`: Pure TypeScript class (`StatutoryRuleEngine`) executing Rule 6 audits.
- `src/app/api/inspect/route.ts`: Node.js server route handling image payload, calling Gemini 1.5 Flash, and running `StatutoryRuleEngine.evaluatePackage()`.
- `src/components/scanner/CameraScanner.tsx`: Client component running `navigator.mediaDevices.getUserMedia` with fallback file upload.
- `src/app/page.tsx`: Two-column dashboard displaying the live camera/image input on the left and statutory audit cards on the right.

## 5. Agent Constraints
- Do NOT rewrite or remove `StatutoryRuleEngine` logic.
- Do NOT install native C/C++ Python bindings or heavy OpenCV packages on the Next.js runtime.
- Maintain strict typing with zero `any` declarations in production components.

# SIH26034: LEGAL METROLOGY COMPLIANCE INSPECTOR (PROJECT SPECIFICATION)

## 1. Statutory Context & Ministry Brief
- Problem Statement: SIH26034 (Ministry of Consumer Affairs, Food & Public Distribution)
- Mandate: Automated compliance audit of physical packaging and digital listings under the Legal Metrology (Packaged Commodities) Rules, 2011.
- Target Demo: 72-Hour College Internal Pitch with live physical product webcam scan.

## 2. Statutory Rulebook (LMPC Rules, 2011)
The deterministic rule engine evaluates 7 mandatory declarations under Rule 6(1):
1. Rule 6(1)(a): Complete name & physical address of manufacturer/packer/importer.
2. Rule 6(1)(b): Generic/common name of commodity.
3. Rule 6(1)(c): Net quantity in legal metric units ('g', 'kg', 'ml', 'l'). Prohibit illegal units ('gm', 'gms', 'ltr', 'ltrs').
4. Rule 6(1)(d): Month & year of manufacture/packing (MM/YYYY).
5. Rule 6(1)(e): Maximum Retail Price (MRP) with statutory tax clause 'inclusive of all taxes'.
6. Rule 6(1)(f): Consumer care contact (valid phone number and email).
7. Rule 6(1)(g): Country of Origin (mandatory for all packaged commodities).

## 3. Architecture & Strict Constraints
- Framework: Next.js 14/15 App Router (TypeScript, Tailwind CSS, Lucide React).
- Vision Extraction: Gemini API (via @google/generative-ai) outputs structured JSON. Model: `gemini-1.5-flash` or `gemini-2.0-flash`.
- Compliance Evaluation: Pure deterministic TypeScript in `src/lib/metrology/ruleEngine.ts`. NEVER outsource legal compliance decisions to an LLM prompt.
- Webcam Constraints: Front-facing camera (`facingMode: 'user'`) for MacBook hardware.

## 4. Current State
- [x] TypeScript Schemas defined (`src/types/metrology.ts`)
- [x] Deterministic Rule Engine implemented (`src/lib/metrology/ruleEngine.ts`)
- [x] Vision API Route configured (`src/app/api/inspect/route.ts`)
- [x] Camera Scanner with front-facing feed (`src/components/scanner/CameraScanner.tsx`)
- [x] Dual-column inspection dashboard (`src/app/page.tsx`)

## 5. Remaining Roadmap to Finish the MVP
- Milestone 1: Visual Bounding Boxes & Confidence UI (Overlay OCR boxes on image).
- Milestone 2: Form-1 Statutory Notice Generator (One-click downloadable PDF under Section 36 of Legal Metrology Act, 2009 with embedded image evidence).
- Milestone 3: E-Commerce URL Audit Mode (Toggle to paste Amazon/Blinkit image URL).
- Milestone 4: Local offline mock fallbacks for pitch safety.

Background:

Packaged commodities are widely sold through retail stores, supermarkets and e-commerce platforms across India. Under the Legal Metrology Act, 2009 and the Legal Metrology(Packaged Commodities) Rules, 2011, every packaged commodity is required to bear mandatory declarations such as name and address of manufacturer/packer/importer, net quantity, Maximum Retail Price (MRP), month and year of manufacture/packing/import,consumer care details and other prescribed declarations in a specified format and manner.These declarations are important for ensuring transparency, fair trade practices and consumer protection. However, due to the large volume and variety of packaged products available in the market, manual inspection and compliance checking by enforcement agencies becomes time-consuming and resource intensive. Non-compliance such as missing declarations, incorrect font sizes, improper MRP declarations and other such practices are frequently observed.There is scope to develop a compliance checking system capable of scanning product labels,package images and product listings to identify violations under the Legal Metrology(Packaged Commodities) Rules, 2011. Accordingly, a software system capable of automatically detecting, extracting and validating mandatory declarations and identifying noncompliances in packaged commodities through image and label analysis can be developed.

Description:

Develop a software application capable of scanning packaged commodity labels, product images and product information to automatically assess compliance with the Legal Metrology(Packaged Commodities) Rules, 2011.

The system should be capable of:

• Scanning and analyzing images of packaged commodities.
• Detecting mandatory declarations prescribed under Legal Metrology rules.
• Checking correctness, completeness and placement of declarations.
• Identifying missing or non-compliant declarations.
• Checking readability and font size requirements.
• Generating compliance reports and violation summaries.
• Maintaining a repository of scanned products and compliance history.
• Providing dashboards for enforcement officials.

Expected Solution:

The proposed solution should include:

• User-friendly web and/or mobile-based software application.
• Automated extraction and validation of mandatory declarations.
• Rule-based compliance checking for Legal Metrology (Packaged Commodities)

Rules, 2011.

• Generation of digital compliance reports in PDF and editable formats.
• Dashboard for monitoring inspections, violations and product compliance details.
• Search and retrieval facility for previously scanned products and reports.
• Technical documentation describing software architecture and deployment framework.

Key Functional Requirements:

• Image upload and product scanning functionality.
• Extraction of declarations from labels and packaging and detection of mandatory declarations
• Font size and readability analysis.
• Detection of missing, misleading or non-standard declarations.
• Generation of compliance/non-compliance reports.
• Attachment of photographs and supporting evidence.
• Repository of scanned products and inspection history.
• Role-based user access and secure authentication.
• Dashboard for monitoring compliance status and enforcement activities.
• Export of reports to PDF and editable formats.
# SIH26034: LEGAL METROLOGY COMPLIANCE INSPECTOR (PROJECT SPECIFICATION)

## 1. Project & Regulatory Identity
- Problem Statement: SIH26034 (Ministry of Consumer Affairs, Food & Public Distribution)
- Mandate: Automated compliance audit of packaged commodities under Legal Metrology (Packaged Commodities) Rules, 2011 (LMPC Rules).
- Target: 72-Hour Internal College Evaluation Pitch & SIH National MVP.

## 2. Technical Stack
- Framework: Next.js 14/15 App Router (TypeScript, Tailwind CSS, Lucide React).
- Optical Extraction: Google Gemini Flash / Pro via `@google/generative-ai` with structured JSON schema enforcement.
- Regulatory Engine: Deterministic TypeScript validator (`src/lib/metrology/ruleEngine.ts`). Legal decisions are NEVER outsourced to generative LLM prompts.
- Notice Engine: Client-side Form-1 Section 36 Show-Cause Legal Notice PDF generator.
- Target Camera: WebRTC facingMode 'user' for Apple Silicon MacBook FaceTime HD hardware.

## 3. Statutory Rules Encoded
- Rule 26: Exemption checks (<= 10g/ml, > 25kg/l, industrial packages).
- Rule 6(1)(a): Manufacturer/Packer/Importer complete name, address, PIN code, and State.
- Rule 6(1)(aa): Country of Origin declaration.
- Rule 6(1)(b): Generic/common commodity name on Principal Display Panel (PDP).
- Rule 6(1)(c): Net quantity in legal SI metric units (banning 'gm', 'gms', 'ltr', 'ltrs') with space separation.
- Rule 6(1)(d): Month and year of manufacture/packing.
- Rule 6(1)(da): Best Before / Expiry date for consumable and perishable items.
- Rule 6(1)(e): MRP with mandatory statutory phrase 'inclusive of all taxes'.
- Rule 6(11): Unit Sale Price (USP) per g/ml or kg/l rounded to 2 decimal places.
- Rule 6(2): Consumer Care details (postal address, phone helpline, and mandatory email).
- Rule 7: Font size ratio estimation: (Bounding Box Text Height / PDP Height).

## 4. Active Build State
- [x] TypeScript Schemas verified (`src/types/metrology.ts`)
- [x] Deterministic Rule Engine verified (`src/lib/metrology/ruleEngine.ts`)
- [x] Vision API Route configured (`src/app/api/inspect/route.ts`)
- [x] Working WebRTC Camera Scanner (`src/components/scanner/CameraScanner.tsx`)
- [x] Dual-column inspection dashboard (`src/app/page.tsx`)
- [x] Form-1 Notice of Offence PDF download operational

## 5. Sprint Milestones For Today
- Milestone 1: Visual Bounding Box SVG Overlays (`src/components/scanner/BoundingBoxOverlay.tsx`).
- Milestone 2: Offline Demo Mode Fallback (pitch resilience toggle with mock audit data).
- Milestone 3: E-Commerce Image URL Audit Input (Rule 18 / Rule 6(10) compliance).
