# SEC36 LEGAL METROLOGY INSPECTOR: AGENT DIRECTIVES

## 1. Project Goal
You are building an automated statutory compliance engine for SIH Problem Statement SIH26034 (Legal Metrology Packaged Commodities Rules, 2011).

## 2. Technical Stack
- Framework: Next.js 14/15 App Router (TypeScript, Tailwind CSS)
- Multimodal Vision: Gemini 1.5 Flash via @google/generative-ai (Cloud API)
- Iconography: Lucide React
- Document Engine: jsPDF + jspdf-autotable (Client-side PDF generation)

## 3. Strict Architectural Boundary (CRITICAL)
- AI Vision (Gemini 1.5 Flash) is ONLY used for optical entity extraction to parse raw, noisy label text into strict JSON structures.
- Legal Compliance Evaluation is NEVER outsourced to generative LLM prompts. It MUST be computed deterministically via `src/lib/metrology/ruleEngine.ts` to prevent statutory hallucinations.

## 4. Coding Standards
- Always use Next.js App Router conventions (`src/app/api/.../route.ts`).
- Never use outdated `pages/` directory structures.
- Ensure all components using camera hardware or browser hooks declare `'use client';` at line 1.
- Do not add packages requiring native C/C++ compilation (node-gyp).