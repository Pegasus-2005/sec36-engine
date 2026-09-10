# Technical Architecture

## Overview
This document describes the software architecture of the `eMaap 2.0 LMO Terminal` — an AI-powered compliance surveillance engine built for the Legal Metrology Division. It was developed to fulfill the Ministry of Consumer Affairs SIH26034 problem statement.

The system automates the inspection of packaged commodities using a combination of **Gemini 3.6 Flash Vision** for data extraction and a **Deterministic Statutory Rule Engine** to evaluate compliance against the Legal Metrology (Packaged Commodities) Rules, 2011.

---

## 1. System Architecture

### 1.1 Frontend (Presentation Layer)
- **Framework:** Next.js (App Router), React 19
- **Styling:** Tailwind CSS, adhering to National Informatics Centre (NIC) UXDT guidelines (color palettes, accessibility, typography).
- **Core Views:**
  1. **Inspection Terminal (`src/app/page.tsx`):** A single-page application dashboard that handles image capture/upload, bounding box overlays, and draft amendments.
  2. **Enforcement Ledger (`src/components/audit/DocketRepository.tsx`):** A searchable, filterable repository of historical inspections.
  3. **Jan Parichay Login (`src/app/login/page.tsx`):** A secure role-based login portal for Inspectors and Administrators.

### 1.2 API Gateway & Extraction Pipeline
- **Endpoint:** `POST /api/inspect`
- **Model:** `gemini-3.6-flash`
- **Process:**
  1. **Validation Gate:** The model acts as a preliminary gate, rejecting images that do not contain a packaged commodity.
  2. **Extraction:** It uses a strictly typed `FULL_SCHEMA` (JSON Schema) and a comprehensive system prompt to extract raw texts, numeric values, units, and coordinates.
  3. **Zero-Hallucination Policy:** The LLM is instructed to *never* infer or guess missing values. If a declaration is missing, the LLM returns an empty field, failing open for the deterministic rule engine to catch.

### 1.3 Deterministic Rule Engine (Business Logic)
- **Module:** `src/lib/metrology/ruleEngine.ts`
- **Philosophy:** The LLM does *not* make legal determinations. It only extracts data. The TypeScript rule engine evaluates the extracted structured data against the law.
- **Coverage:**
  - **Rule 6(1)(a):** Manufacturer/Packer Address, Pin Code, City/State requirements.
  - **Rule 6(1)(b):** Generic/Common Name declaration.
  - **Rule 6(1)(c) & Rule 11:** Net Quantity, Standard Units, spacing requirements.
  - **Rule 6(1)(d):** Date of Manufacture/Import.
  - **Rule 6(1)(e):** Maximum Retail Price (MRP), including "Inclusive of all taxes" and currency format.
  - **Rule 6(1)(aa):** Country of Origin for imported goods.
  - **Rule 6(2):** Consumer Care Phone and Email.
  - **Rule 6(11):** Unit Sale Price.
  - **Rule 9(1):** Language Compliance (Hindi/English).
  - **Rule 8:** Declaration Grouping (Principal Display Panel).
  - **Rule 18(2) & 6(4):** Tampering Detection (smudges, stickers, overwriting).

### 1.4 Persistence & Storage
- **Database:** Local JSON File DB (`data/dockets.json`).
- **Endpoints:** `GET /api/dockets`, `POST /api/dockets`.
- **Reasoning:** A local JSON store was chosen for the prototype to ensure zero setup friction, high portability, and immunity to native binding errors during the hackathon demonstration.

### 1.5 Security & Authentication
- **Middleware:** `src/middleware.ts` enforces route protection.
- **Mechanism:** HTTP-Only, Secure cookies (`auth_token`).
- **Roles:** `inspector`, `admin`.

---

## 2. Data Flow
1. **Inspector** captures an image via the camera or uploads a file on the Dashboard.
2. The image is compressed, converted to Base64, and sent to `POST /api/inspect`.
3. `POST /api/inspect` calls `gemini-3.6-flash` via the `@google/generative-ai` SDK with the image and `FULL_SCHEMA`.
4. The API receives a structured JSON response (the extraction) from Gemini.
5. The API passes the extraction to `StatutoryRuleEngine.evaluatePackage()`.
6. The Rule Engine processes 11+ statutory checks, assigns a Compliance Score, and generates remedial actions.
7. The API saves the `InspectionAuditResult` to the Local JSON Database via internal fetch.
8. The API returns the `InspectionAuditResult` to the Frontend.
9. The Frontend displays the results, bounding boxes, and provides options to amend the data or generate a PDF Form-1 Notice.

---

## 3. Deployment
- **Command:** `npm run dev` or `npm run start` after `npm run build`.
- **Requirements:** A valid `GEMINI_API_KEY` in the `.env.local` file.
