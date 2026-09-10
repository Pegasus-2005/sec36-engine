'use client';

import { useState, useRef } from 'react';
import { Eye, EyeOff, Ruler, Scale, Check, Info, Maximize, Maximize2, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { ExtractedDeclarations, ViolationRecord, BoundingBox } from '../../types/metrology';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BoundingBoxOverlayProps {
  imageSrc: string;
  declarations?: ExtractedDeclarations;
  violations?: ViolationRecord[];
  surfaceLabel?: string;
  onApplyFontMeasurement?: (result: {
    measuredMm: number;
    requiredMm: number;
    isCompliant: boolean;
    ratio: number;
  }) => void;
  onFullscreenToggle?: () => void;
}

interface BoxEntry {
  /** Human-readable label rendered as the SVG badge. */
  label: string;
  box: BoundingBox;
  /**
   * Statutory citation prefixes used to match against `violations`.
   * Empty array means the box is never coloured as violated (e.g. PDP outline).
   */
  citationPrefixes: string[];
  /** Renders as a dashed blue outline — used for the package PDP box only. */
  isPdpBox?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Gemini returns 0-1000 integer coordinates in [ymin, xmin, ymax, xmax] order.
 * The SVG viewBox is "0 0 1000 1000" so coordinates map 1:1 — no scaling needed.
 */

/** Returns true if any CRITICAL or MAJOR violation matches one of the given citation prefixes. */
function isFieldViolated(violations: ViolationRecord[], prefixes: string[]): boolean {
  if (prefixes.length === 0) return false;
  return violations.some(
    (v) =>
      (v.severity === 'CRITICAL' || v.severity === 'MAJOR') &&
      prefixes.some((p) => v.statutory_citation.startsWith(p)),
  );
}

function getMandatedMinFontHeight(netQtyGrams?: number): number {
  if (!netQtyGrams || netQtyGrams <= 50) return 1.0;
  if (netQtyGrams <= 200) return 2.0;
  if (netQtyGrams <= 1000) return 4.0;
  return 6.0;
}

/** Builds the list of BoxEntry objects from ExtractedDeclarations, skipping absent box_2d fields. */
function buildBoxEntries(decls?: ExtractedDeclarations): BoxEntry[] {
  if (!decls) return [];
  const entries: BoxEntry[] = [];

  // Package PDP outline — always first so field boxes render on top
  if (decls.package_pdp_box) {
    entries.push({
      label: 'Package PDP',
      box: decls.package_pdp_box,
      citationPrefixes: [],
      isPdpBox: true,
    });
  }

  const fieldMap: Array<{
    label: string;
    box: BoundingBox | undefined;
    prefixes: string[];
  }> = [
    {
      label: 'Manufacturer · R6(1)(a)',
      box: decls.manufacturer.box_2d,
      prefixes: ['LM-R6(1)(a)'],
    },
    {
      label: 'Country of Origin · R6(1)(aa)',
      box: decls.country_of_origin.box_2d,
      prefixes: ['LM-R6(1)(aa)'],
    },
    {
      label: 'Commodity Name · R6(1)(b)',
      box: decls.commodity_name.box_2d,
      prefixes: ['LM-R6(1)(b)'],
    },
    {
      label: 'Net Qty · R6(1)(c)',
      box: decls.net_quantity.box_2d,
      prefixes: ['LM-R6(1)(c)'],
    },
    {
      label: 'Mfg Date · R6(1)(d)',
      box: decls.mfg_or_import_date.box_2d,
      prefixes: ['LM-R6(1)(d)'],
    },
    {
      label: 'Best Before · R6(1)(da)',
      box: decls.expiry_or_best_before.box_2d,
      prefixes: ['LM-R6(1)(da)'],
    },
    {
      label: 'MRP · R6(1)(e)',
      box: decls.mrp.box_2d,
      prefixes: ['LM-R6(1)(e)'],
    },
    {
      label: 'USP · R6(11)',
      box: decls.unit_sale_price.box_2d,
      prefixes: ['LM-R6(11)'],
    },
    {
      label: 'Dimensions · R6(1)(f)',
      box: decls.dimensions.box_2d,
      prefixes: ['LM-R6(1)(f)'],
    },
    {
      label: 'Consumer Care · R6(2)',
      box: decls.consumer_care.box_2d,
      prefixes: ['LM-R6(2)'],
    },
  ];

  for (const { label, box, prefixes } of fieldMap) {
    if (!box) continue;
    entries.push({ label, box, citationPrefixes: prefixes });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Sub-component: single SVG bounding box + label badge
// ---------------------------------------------------------------------------

interface BoxRectProps {
  entry: BoxEntry;
  isViolated: boolean;
}

function BoxRect({ entry, isViolated }: BoxRectProps) {
  const { box, label, isPdpBox } = entry;
  const x = box.xmin;
  const y = box.ymin;
  const w = box.xmax - box.xmin;
  const h = box.ymax - box.ymin;

  // Guard: skip degenerate boxes
  if (w <= 0 || h <= 0) return null;

  // Visual style tokens
  const stroke = isPdpBox ? '#3b82f6' : isViolated ? '#f43f5e' : '#10b981';
  const fill = isPdpBox
    ? 'rgba(59,130,246,0.05)'
    : isViolated
    ? 'rgba(244,63,94,0.15)'
    : 'rgba(16,185,129,0.12)';
  const strokeWidth = isPdpBox ? 1.5 : isViolated ? 3 : 2;
  const strokeDasharray = isPdpBox ? '14 7' : undefined;

  // Badge geometry (in 0-1000 SVG space)
  const BADGE_H = 32;
  const CHAR_W = 11; // approximate character width at fontSize 20
  const BADGE_W = label.length * CHAR_W + 12;
  // Clamp badge so it doesn't overflow right edge
  const badgeX = Math.min(x + 2, 1000 - BADGE_W - 2);
  // Place badge above the box if there's room, else inside top
  const badgeY = y >= BADGE_H + 2 ? y - BADGE_H - 1 : y + 1;
  const textY = badgeY + BADGE_H - 9;

  const badgeFill = isPdpBox
    ? 'rgba(30,64,175,0.85)'
    : isViolated
    ? 'rgba(159,18,57,0.90)'
    : 'rgba(6,78,59,0.90)';

  return (
    <g>
      {/* Field bounding rectangle */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        rx={4}
      />

      {/* Label badge background */}
      <rect
        x={badgeX}
        y={badgeY}
        width={BADGE_W}
        height={BADGE_H}
        fill={badgeFill}
        rx={4}
      />

      {/* Label text */}
      <text
        x={badgeX + 6}
        y={textY}
        fontSize={20}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight="600"
        fill="#ffffff"
        letterSpacing={0.3}
      >
        {label}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BoundingBoxOverlay({
  imageSrc,
  declarations,
  violations = [],
  surfaceLabel,
  onApplyFontMeasurement,
  onFullscreenToggle,
}: BoundingBoxOverlayProps) {
  const [showOverlay, setShowOverlay] = useState(true);
  const [caliperMode, setCaliperMode] = useState(false);
  const [caliperStart, setCaliperStart] = useState<{ x: number; y: number } | null>(null);
  const [caliperEnd, setCaliperEnd] = useState<{ x: number; y: number } | null>(null);
  const [caliperActive, setCaliperActive] = useState(false);
  const [appliedFeedback, setAppliedFeedback] = useState(false);
  const [precisionModalOpen, setPrecisionModalOpen] = useState(false);
  const [precisionZoom, setPrecisionZoom] = useState(1.5);
  
  const svgRef = useRef<SVGSVGElement>(null);
  const modalSvgRef = useRef<SVGSVGElement>(null);

  const entries = buildBoxEntries(declarations);
  const pdpBox = declarations?.package_pdp_box;

  // Rule 7 Caliper calculations
  const caliperH = (caliperStart && caliperEnd) ? Math.abs(caliperEnd.y - caliperStart.y) : 0;
  const pdpH = (pdpBox && pdpBox.ymax > pdpBox.ymin) ? (pdpBox.ymax - pdpBox.ymin) : 800;
  const ratio = pdpH ? (caliperH / pdpH) : 0;
  const measuredMm = Math.max(0.5, Math.round(ratio * 150 * 10) / 10);
  const requiredMm = getMandatedMinFontHeight(declarations?.net_quantity?.numeric_value);
  const isCompliant = measuredMm >= requiredMm;

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!caliperMode || !svgRef.current) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    if (cursorPt) {
      setCaliperStart({ x: cursorPt.x, y: cursorPt.y });
      setCaliperEnd({ x: cursorPt.x, y: cursorPt.y });
      setCaliperActive(true);
      setAppliedFeedback(false);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!caliperMode || !caliperActive || !svgRef.current) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    if (cursorPt) {
      setCaliperEnd({ x: cursorPt.x, y: cursorPt.y });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!caliperMode) return;
    setCaliperActive(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleModalPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!modalSvgRef.current) return;
    const svg = modalSvgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    if (cursorPt) {
      setCaliperStart({ x: cursorPt.x, y: cursorPt.y });
      setCaliperEnd({ x: cursorPt.x, y: cursorPt.y });
      setCaliperActive(true);
      setAppliedFeedback(false);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handleModalPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!caliperActive || !modalSvgRef.current) return;
    const svg = modalSvgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    if (cursorPt) {
      setCaliperEnd({ x: cursorPt.x, y: cursorPt.y });
    }
  };

  const handleModalPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setCaliperActive(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 flex flex-col">
      {/* Top action header: Surface Label, Micrometer & Overlay toggles */}
      <div className="absolute top-2 inset-x-2 z-20 flex items-center justify-between pointer-events-none">
        {surfaceLabel ? (
          <div className="px-2.5 py-1 bg-slate-900/90 border border-slate-700 text-slate-200 text-xs font-mono font-bold rounded-lg backdrop-blur-sm pointer-events-auto">
            {surfaceLabel}
          </div>
        ) : <div />}

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Mobile Precision Mode Trigger */}
          <button
            type="button"
            onClick={() => {
              setPrecisionModalOpen(true);
              setCaliperMode(true);
              setShowOverlay(true);
            }}
            title="Expand / Fullscreen Precision Mode"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-sm border transition-all duration-200 cursor-pointer bg-amber-950/80 border-amber-600/80 text-amber-300 hover:bg-amber-900/90 md:hidden"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Precision Mode</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCaliperMode((v) => !v);
              if (!caliperMode) setShowOverlay(true);
            }}
            title={caliperMode ? 'Exit Micrometer mode' : 'Rule 7 Optical Micrometer'}
            className={[
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-sm border transition-all duration-200 cursor-pointer',
              caliperMode
                ? 'bg-amber-950/90 border-amber-500 text-amber-300 hover:bg-amber-900/90 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:bg-slate-800/80',
            ].join(' ')}
          >
            <Ruler className="w-3.5 h-3.5" />
            {caliperMode ? 'Micrometer ON' : 'Micrometer'}
          </button>

          <button
            type="button"
            onClick={() => setShowOverlay((v) => !v)}
            title={showOverlay ? 'Hide bounding boxes' : 'Show bounding boxes'}
            className={[
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-sm border transition-all duration-200 cursor-pointer',
              showOverlay
                ? 'bg-blue-950/80 border-blue-700 text-blue-300 hover:bg-blue-900/80'
                : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:bg-slate-800/80',
            ].join(' ')}
          >
            {showOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {showOverlay ? 'Overlays ON' : 'Overlays OFF'}
          </button>
          {onFullscreenToggle && (
            <button
              type="button"
              onClick={onFullscreenToggle}
              title="View Fullscreen"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-sm border transition-all duration-200 cursor-pointer bg-slate-900/80 border-slate-700 text-slate-400 hover:bg-slate-800/80 hover:text-white"
            >
              <Maximize className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Fullscreen</span>
            </button>
          )}
        </div>
      </div>

      {/* Main image container */}
      <div className="relative w-full overflow-hidden bg-black flex items-center justify-center">
        <img
          src={imageSrc}
          alt="Scanned product packaging"
          className="w-full h-auto block max-h-[70vh] object-contain"
          style={{ display: 'block' }}
        />

        {/* SVG bounding box overlay */}
        {(showOverlay || caliperMode) && (
          <svg
            ref={svgRef}
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className={`absolute inset-0 w-full h-full touch-none select-none ${caliperMode ? 'cursor-crosshair' : 'pointer-events-none'}`}
            style={{ position: 'absolute', top: 0, left: 0, touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {showOverlay && entries.map((entry, i) => (
              <BoxRect
                key={i}
                entry={entry}
                isViolated={isFieldViolated(violations, entry.citationPrefixes)}
              />
            ))}

            {/* Render Caliper */}
            {caliperMode && caliperStart && caliperEnd && (
              <g>
                <line 
                  x1={caliperStart.x} y1={caliperStart.y} 
                  x2={caliperEnd.x} y2={caliperEnd.y} 
                  stroke="#f59e0b" strokeWidth="4" 
                />
                <circle cx={caliperStart.x} cy={caliperStart.y} r="6" fill="#f59e0b" />
                <circle cx={caliperEnd.x} cy={caliperEnd.y} r="6" fill="#f59e0b" />
                
                {/* Badge for Caliper */}
                {(() => {
                  const midX = (caliperStart.x + caliperEnd.x) / 2;
                  const midY = (caliperStart.y + caliperEnd.y) / 2;
                  
                  return (
                    <g transform={`translate(${Math.min(820, midX + 10)}, ${Math.max(20, midY)})`}>
                      <rect x="0" y="-14" width="160" height="42" fill="rgba(15, 23, 42, 0.95)" rx="4" stroke="#f59e0b" strokeWidth="1.5" />
                      <text x="8" y="2" fontSize="13" fontWeight="bold" fill="#f59e0b" fontFamily="monospace">
                        ~{measuredMm} mm ({Math.round(ratio * 1000) / 10}%)
                      </text>
                      <text x="8" y="18" fontSize="10" fill={isCompliant ? '#4ade80' : '#f87171'} fontFamily="sans-serif">
                        {isCompliant ? '✓ Satisfies Rule 7' : '⚠️ Below Min Height'}
                      </text>
                    </g>
                  );
                })()}
              </g>
            )}
          </svg>
        )}

        {/* Legend strip at bottom */}
        {showOverlay && !caliperMode && (
          <div className="absolute bottom-0 inset-x-0 flex items-center gap-4 px-3 py-1.5 bg-slate-950/80 backdrop-blur-sm text-[10px] font-medium pointer-events-none">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="inline-block w-3 h-3 rounded border-2 border-rose-500 bg-rose-500/20" />
              Violation
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="inline-block w-3 h-3 rounded border-2 border-emerald-500 bg-emerald-500/15" />
              Compliant
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span
                className="inline-block w-3 h-3 rounded border-2 border-blue-500 bg-blue-500/10"
                style={{ borderStyle: 'dashed' }}
              />
              PDP Outline
            </span>
          </div>
        )}
      </div>

      {/* ── Rule 7 Optical Micrometer Inspector HUD ───────────────────────────── */}
      {caliperMode && (
        <div className="p-3 bg-slate-950 border-t border-amber-500/50 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400 shrink-0">
              <Ruler className="w-4 h-4" />
            </div>
            <div>
              {caliperStart && caliperEnd && caliperH > 5 ? (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100 text-xs">Rule 7 Digital Caliper:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${isCompliant ? 'bg-emerald-950 text-emerald-300 border border-emerald-500' : 'bg-rose-950 text-rose-300 border border-rose-500'}`}>
                      {isCompliant ? 'COMPLIANT' : 'NON-COMPLIANT (Under-sized Font)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Measured: <strong className="text-amber-400">{measuredMm} mm</strong> ({Math.round(ratio * 1000) / 10}% PDP) &nbsp;·&nbsp;
                    Mandated Min: <strong className="text-slate-200">{requiredMm} mm</strong> under Rule 7 Table I/II
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-300/90 text-xs">
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Click and drag vertically across any declaration text on the package to measure font height.</span>
                </div>
              )}
            </div>
          </div>

          {caliperStart && caliperEnd && caliperH > 5 && onApplyFontMeasurement && (
            <button
              type="button"
              onClick={() => {
                onApplyFontMeasurement({ measuredMm, requiredMm, isCompliant, ratio });
                setAppliedFeedback(true);
                setTimeout(() => setAppliedFeedback(false), 3000);
              }}
              className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded text-xs font-bold transition-all shadow-md cursor-pointer ${
                appliedFeedback
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              {appliedFeedback ? <Check className="w-3.5 h-3.5" /> : <Scale className="w-3.5 h-3.5" />}
              {appliedFeedback ? 'Applied to Official Audit!' : 'Apply Measurement to Rule 7 Audit'}
            </button>
          )}
        </div>
      )}

      {/* ── Fullscreen Micrometer & Rule 7 Precision Calibrator Modal (Mobile) ──────── */}
      {precisionModalOpen && (
        <div className="fixed inset-0 z-[250] bg-slate-950 p-2 sm:p-4 flex flex-col text-slate-100 select-none animate-in fade-in duration-200">
          {/* Top Bar: Controls & Statutory Readout */}
          <div className="shrink-0 bg-slate-900 border border-slate-800 rounded-xl p-3 mb-2 shadow-lg flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Ruler className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                    <span>Precision Mode · Rule 7 Calibrator</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
                      {Math.round(precisionZoom * 100)}%
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400">Drag micrometer across letters to calibrate height</p>
                </div>
              </div>

              {/* Zoom & Close controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrecisionZoom((z) => Math.max(1.0, Math.round((z - 0.25) * 100) / 100))}
                  disabled={precisionZoom <= 1.0}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center text-slate-300 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPrecisionZoom((z) => Math.min(3.5, Math.round((z + 0.25) * 100) / 100))}
                  disabled={precisionZoom >= 3.5}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center text-slate-300 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPrecisionZoom(1.0)}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 cursor-pointer"
                  title="Reset Zoom (1x)"
                >
                  1x
                </button>
                <button
                  type="button"
                  onClick={() => setPrecisionModalOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-rose-900/80 hover:text-rose-200 flex items-center justify-center text-slate-400 cursor-pointer ml-1"
                  title="Close Precision View"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mini Readout: Active Ratio, Table 1 Threshold, Estimated Height in mm */}
            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono">
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap text-[11px]">
                <span>
                  <span className="text-slate-400">Ratio: </span>
                  <strong className="text-amber-400">{Math.round(ratio * 1000) / 10}% PDP</strong>
                </span>
                <span className="text-slate-700">|</span>
                <span>
                  <span className="text-slate-400">Table 1 Min: </span>
                  <strong className="text-slate-200">{requiredMm} mm</strong>
                </span>
                <span className="text-slate-700">|</span>
                <span>
                  <span className="text-slate-400">Measured: </span>
                  <strong className="text-amber-400">{measuredMm} mm</strong>
                </span>
              </div>

              <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                isCompliant
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                  : 'bg-rose-950 text-rose-300 border border-rose-500'
              }`}>
                {isCompliant ? 'PASS' : 'FLAG'}
              </span>
            </div>
          </div>

          {/* Center: Zoomable & Pannable Canvas */}
          <div className="flex-1 min-h-0 relative overflow-auto bg-black rounded-xl border border-slate-800 flex items-start justify-center touch-pan-x touch-pan-y p-2">
            <div
              className="relative transition-all duration-75 origin-top-center"
              style={{
                width: `${precisionZoom * 100}%`,
                minWidth: '100%',
              }}
            >
              <img
                src={imageSrc}
                alt="Precision Calibrator View"
                className="w-full h-auto block select-none pointer-events-none"
                draggable={false}
              />

              <svg
                ref={modalSvgRef}
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full touch-none select-none cursor-crosshair"
                style={{ position: 'absolute', top: 0, left: 0, touchAction: 'none' }}
                onPointerDown={handleModalPointerDown}
                onPointerMove={handleModalPointerMove}
                onPointerUp={handleModalPointerUp}
              >
                {/* SVG Bounding Boxes */}
                {showOverlay && entries.map((entry, i) => (
                  <BoxRect
                    key={i}
                    entry={entry}
                    isViolated={isFieldViolated(violations, entry.citationPrefixes)}
                  />
                ))}

                {/* Tactile Caliper Visuals with Finger Clearance */}
                {caliperStart && caliperEnd && (
                  <g>
                    {/* Vertical Caliper Guide */}
                    <line
                      x1={caliperStart.x}
                      y1={caliperStart.y}
                      x2={caliperEnd.x}
                      y2={caliperEnd.y}
                      stroke="#f59e0b"
                      strokeWidth="5"
                    />

                    {/* Top & Bottom T-Calipers */}
                    <line
                      x1={caliperStart.x - 36}
                      y1={caliperStart.y}
                      x2={caliperStart.x + 36}
                      y2={caliperStart.y}
                      stroke="#f59e0b"
                      strokeWidth="3.5"
                    />
                    <line
                      x1={caliperEnd.x - 36}
                      y1={caliperEnd.y}
                      x2={caliperEnd.x + 36}
                      y2={caliperEnd.y}
                      stroke="#f59e0b"
                      strokeWidth="3.5"
                    />

                    {/* Large touch targets */}
                    <circle cx={caliperStart.x} cy={caliperStart.y} r="12" fill="#f59e0b" stroke="#ffffff" strokeWidth="2.5" />
                    <circle cx={caliperEnd.x} cy={caliperEnd.y} r="12" fill="#f59e0b" stroke="#ffffff" strokeWidth="2.5" />

                    {/* Caliper HUD label offset to the right so fingers don't obscure it */}
                    {(() => {
                      const midX = (caliperStart.x + caliperEnd.x) / 2;
                      const midY = (caliperStart.y + caliperEnd.y) / 2;
                      const badgeX = Math.min(760, Math.max(20, midX + 35));
                      const badgeY = Math.max(30, midY - 20);

                      return (
                        <g transform={`translate(${badgeX}, ${badgeY})`}>
                          <rect
                            x="0"
                            y="-16"
                            width="210"
                            height="54"
                            fill="rgba(2, 6, 23, 0.95)"
                            rx="6"
                            stroke="#f59e0b"
                            strokeWidth="2"
                          />
                          <text x="12" y="5" fontSize="16" fontWeight="bold" fill="#f59e0b" fontFamily="monospace">
                            ~{measuredMm} mm ({Math.round(ratio * 1000) / 10}%)
                          </text>
                          <text
                            x="12"
                            y="25"
                            fontSize="11"
                            fontWeight="bold"
                            fill={isCompliant ? '#4ade80' : '#f87171'}
                            fontFamily="sans-serif"
                          >
                            {isCompliant ? '✓ Satisfies Rule 7 (Table 1)' : '⚠️ Below Mandated Min Height'}
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                )}
              </svg>
            </div>
          </div>

          {/* Bottom Bar: Action Buttons */}
          <div className="shrink-0 pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (caliperStart && caliperEnd && caliperH > 5 && onApplyFontMeasurement) {
                  onApplyFontMeasurement({ measuredMm, requiredMm, isCompliant, ratio });
                  setAppliedFeedback(true);
                  setTimeout(() => setAppliedFeedback(false), 3000);
                }
                setPrecisionModalOpen(false);
              }}
              className="flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save Calibration &amp; Return</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCaliperStart(null);
                setCaliperEnd(null);
              }}
              className="py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              title="Reset Caliper"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
