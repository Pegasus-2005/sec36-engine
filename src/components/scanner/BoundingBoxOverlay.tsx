'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Eye,
  EyeOff,
  Ruler,
  Scale,
  Check,
  Info,
  Maximize,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Target,
  ChevronUp,
  ChevronDown,
  Crosshair,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { ExtractedDeclarations, ViolationRecord, BoundingBox, DimensionDetails } from '../../types/metrology';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BoundingBoxOverlayProps {
  imageSrc: string;
  declarations?: ExtractedDeclarations;
  violations?: ViolationRecord[];
  surfaceLabel?: string;
  surfaceIndex?: number;
  onApplyFontMeasurement?: (result: {
    measuredMm: number;
    requiredMm: number;
    isCompliant: boolean;
    ratio: number;
  }) => void;
  onFullscreenToggle?: () => void;
}

interface BoxEntry {
  label: string;
  box: BoundingBox;
  citationPrefixes: string[];
  isPdpBox?: boolean;
}

// ---------------------------------------------------------------------------
// Statutory Calibration & Metric Helpers
// ---------------------------------------------------------------------------

/**
 * Returns estimated physical PDP height (in mm) based on commodity metadata,
 * net quantity, packaging geometry, or Rule 6(1)(f) dimension declarations.
 */
function getEstimatedPdpHeightMm(declarations?: ExtractedDeclarations): number {
  if (!declarations) return 120;

  // 1. Explicit Rule 6(1)(f) dimension values take top priority
  if (declarations.dimensions?.is_declared && declarations.dimensions.values) {
    const dimStr = declarations.dimensions.values.toLowerCase();
    const cmMatches = Array.from(dimStr.matchAll(/(\d+(?:\.\d+)?)\s*(?:cm|centimeter)/g)).map((m) =>
      parseFloat(m[1])
    );
    if (cmMatches.length > 0) {
      const maxCm = Math.max(...cmMatches);
      if (maxCm >= 3 && maxCm <= 100) return Math.round(maxCm * 10);
    }
    const mmMatches = Array.from(dimStr.matchAll(/(\d+(?:\.\d+)?)\s*(?:mm|millimeter)/g)).map((m) =>
      parseFloat(m[1])
    );
    if (mmMatches.length > 0) {
      const maxMm = Math.max(...mmMatches);
      if (maxMm >= 30 && maxMm <= 1000) return Math.round(maxMm);
    }
  }

  // 2. Commodity-aware packaging physical standard height mapping
  const commodity = (declarations.commodity_name?.raw_text || '').toLowerCase();
  const netQty = declarations.net_quantity?.numeric_value || 0;
  const unit = (declarations.net_quantity?.unit || '').toLowerCase();

  if (commodity.includes('toothpaste') || commodity.includes('paste') || commodity.includes('brush')) {
    return netQty >= 200 ? 180 : 150;
  }
  if (
    commodity.includes('biscuit') ||
    commodity.includes('cookie') ||
    commodity.includes('cracker') ||
    commodity.includes('rusk')
  ) {
    return netQty >= 250 ? 120 : 95;
  }
  if (commodity.includes('soap') || commodity.includes('bar') || commodity.includes('detergent bar')) {
    return 75;
  }
  if (commodity.includes('snack') || commodity.includes('chip') || commodity.includes('namkeen') || commodity.includes('puff')) {
    return netQty >= 100 ? 220 : 160;
  }
  if (commodity.includes('cereal') || commodity.includes('flake') || commodity.includes('muesli') || commodity.includes('oats')) {
    return 220;
  }
  if (commodity.includes('oil') || commodity.includes('ghee') || commodity.includes('milk') || commodity.includes('beverage')) {
    return unit.includes('l') || netQty >= 1000 ? 220 : 150;
  }
  if (commodity.includes('tea') || commodity.includes('coffee')) {
    return netQty >= 500 ? 180 : 150;
  }
  if (commodity.includes('cream') || commodity.includes('gel') || commodity.includes('ointment') || commodity.includes('jar')) {
    return 120;
  }

  // 3. Fallback based on net mass or volume
  if (unit === 'kg' || unit === 'l' || (unit === 'g' && netQty >= 1000)) return 220;
  if (netQty >= 500) return 180;
  if (netQty >= 200) return 150;
  if (netQty >= 100) return 120;
  return 95;
}

/**
 * Computes Rule 7 minimum mandated font heights under both Table I (Area) & Table II (Net Qty).
 */
function getMandatedMinFontHeight(netQtyVal?: number, dimensions?: DimensionDetails): {
  requiredMm: number;
  minTable1: number;
  minTable2: number;
} {
  let minTable2 = 2.0;
  if (typeof netQtyVal === 'number' && netQtyVal > 0) {
    if (netQtyVal <= 50) minTable2 = 1.0;
    else if (netQtyVal <= 100) minTable2 = 1.5;
    else if (netQtyVal <= 200) minTable2 = 2.0;
    else if (netQtyVal <= 500) minTable2 = 4.0;
    else minTable2 = 6.0;
  }

  let minTable1 = 2.0;
  if (dimensions?.values) {
    const dims = dimensions.values.match(/(\d+(?:\.\d+)?)/g);
    if (dims && dims.length >= 2) {
      const areaCm2 = parseFloat(dims[0]) * parseFloat(dims[1]);
      if (areaCm2 <= 50) minTable1 = 1.0;
      else if (areaCm2 <= 100) minTable1 = 1.5;
      else if (areaCm2 <= 500) minTable1 = 2.5;
      else if (areaCm2 <= 2500) minTable1 = 4.0;
      else minTable1 = 6.0;
    }
  }

  const requiredMm = Math.max(minTable1, minTable2);
  return { requiredMm, minTable1, minTable2 };
}

/** Returns true if any CRITICAL or MAJOR violation matches citation prefixes */
function isFieldViolated(violations: ViolationRecord[], prefixes: string[]): boolean {
  if (prefixes.length === 0) return false;
  return violations.some(
    (v) =>
      (v.severity === 'CRITICAL' || v.severity === 'MAJOR') &&
      prefixes.some((p) => v.statutory_citation.startsWith(p))
  );
}

/**
 * Builds list of BoxEntry objects from ExtractedDeclarations for the current surface.
 * ZERO-HALLUCINATION:
 * 1. Only includes declarations that are physically detected with non-empty text.
 * 2. Only renders boxes on the surface/image matching their image_index.
 * 3. Omitted/absent declarations produce NO boxes.
 */
function buildBoxEntries(decls?: ExtractedDeclarations, surfaceIndex: number = 0): BoxEntry[] {
  if (!decls) return [];
  const entries: BoxEntry[] = [];

  // Package PDP outline should only appear on Surface 0 (Front PDP)
  if (decls.package_pdp_box) {
    const pdpImgIdx = decls.package_pdp_box.image_index;
    if (pdpImgIdx === undefined ? surfaceIndex === 0 : pdpImgIdx === surfaceIndex) {
      entries.push({
        label: 'Package PDP',
        box: decls.package_pdp_box,
        citationPrefixes: [],
        isPdpBox: true,
      });
    }
  }

  const isValidBox = (b?: BoundingBox) => {
    if (!b) return false;
    if (b.ymin === 0 && b.xmin === 0 && b.ymax === 0 && b.xmax === 0) return false;
    if (b.ymax <= b.ymin || b.xmax <= b.xmin) return false;
    // Multi-surface filtering: if box specifies an image_index, it must match active surface
    if (b.image_index !== undefined && b.image_index !== surfaceIndex) return false;
    return true;
  };

  const fieldList: Array<{
    label: string;
    box: BoundingBox | undefined;
    isDetected: boolean;
    prefixes: string[];
  }> = [
    {
      label: 'Manufacturer · R6(1)(a)',
      box: decls.manufacturer?.box_2d,
      isDetected: Boolean(decls.manufacturer?.is_detected && decls.manufacturer?.raw_text?.trim()),
      prefixes: ['LM-R6(1)(a)'],
    },
    {
      label: 'Country of Origin · R6(1)(aa)',
      box: decls.country_of_origin?.box_2d,
      isDetected: Boolean(decls.country_of_origin?.is_detected && decls.country_of_origin?.raw_text?.trim()),
      prefixes: ['LM-R6(1)(aa)'],
    },
    {
      label: 'Commodity Name · R6(1)(b)',
      box: decls.commodity_name?.box_2d,
      isDetected: Boolean(decls.commodity_name?.is_detected && decls.commodity_name?.raw_text?.trim()),
      prefixes: ['LM-R6(1)(b)'],
    },
    {
      label: 'Net Qty · R6(1)(c)',
      box: decls.net_quantity?.box_2d,
      isDetected: Boolean((decls.net_quantity?.numeric_value ?? 0) > 0 && decls.net_quantity?.raw_text?.trim()),
      prefixes: ['LM-R6(1)(c)'],
    },
    {
      label: 'Mfg Date · R6(1)(d)',
      box: decls.mfg_or_import_date?.box_2d,
      isDetected: Boolean(decls.mfg_or_import_date?.is_detected && decls.mfg_or_import_date?.raw_text?.trim()),
      prefixes: ['LM-R6(1)(d)'],
    },
    {
      label: 'Best Before · R6(1)(da)',
      box: decls.expiry_or_best_before?.box_2d,
      isDetected: Boolean(decls.expiry_or_best_before?.is_declared && decls.expiry_or_best_before?.raw_text?.trim()),
      prefixes: ['LM-R6(1)(da)'],
    },
    {
      label: 'MRP · R6(1)(e)',
      box: decls.mrp?.box_2d,
      isDetected: Boolean((decls.mrp?.numeric_value ?? 0) > 0 && decls.mrp?.raw_text?.trim()),
      prefixes: ['LM-R6(1)(e)'],
    },
    {
      label: 'USP · R6(11)',
      box: decls.unit_sale_price?.box_2d,
      isDetected: Boolean(decls.unit_sale_price?.is_declared && decls.unit_sale_price?.raw_text?.trim()),
      prefixes: ['LM-R6(11)'],
    },
    {
      label: 'Dimensions · R6(1)(f)',
      box: decls.dimensions?.box_2d,
      isDetected: Boolean(decls.dimensions?.is_declared && decls.dimensions?.raw_text?.trim()),
      prefixes: ['LM-R6(1)(f)'],
    },
    {
      label: 'Consumer Care · R6(2)',
      box: decls.consumer_care?.box_2d,
      isDetected: Boolean(
        (decls.consumer_care?.has_phone || decls.consumer_care?.has_email) && decls.consumer_care?.raw_text?.trim()
      ),
      prefixes: ['LM-R6(2)'],
    },
  ];

  for (const { label, box, isDetected, prefixes } of fieldList) {
    if (!isDetected || !isValidBox(box)) continue;
    entries.push({ label, box: box!, citationPrefixes: prefixes });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Box Rect Component
// ---------------------------------------------------------------------------

function BoxRect({ entry, isViolated }: { entry: BoxEntry; isViolated: boolean }) {
  const { box, label, isPdpBox } = entry;
  const x = box.xmin;
  const y = box.ymin;
  const w = box.xmax - box.xmin;
  const h = box.ymax - box.ymin;

  if (w <= 0 || h <= 0) return null;

  const stroke = isPdpBox ? '#3b82f6' : isViolated ? '#f43f5e' : '#10b981';
  const fill = isPdpBox
    ? 'rgba(59,130,246,0.05)'
    : isViolated
    ? 'rgba(244,63,94,0.15)'
    : 'rgba(16,185,129,0.12)';
  const strokeWidth = isPdpBox ? 1.5 : isViolated ? 3 : 2;
  const strokeDasharray = isPdpBox ? '14 7' : undefined;

  const BADGE_H = 32;
  const CHAR_W = 11;
  const BADGE_W = label.length * CHAR_W + 12;
  const badgeX = Math.min(x + 2, 1000 - BADGE_W - 2);
  const badgeY = y >= BADGE_H + 2 ? y - BADGE_H - 1 : y + 1;
  const textY = badgeY + BADGE_H - 9;

  const badgeFill = isPdpBox
    ? 'rgba(30,64,175,0.85)'
    : isViolated
    ? 'rgba(159,18,57,0.90)'
    : 'rgba(6,78,59,0.90)';

  return (
    <g>
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
      <rect x={badgeX} y={badgeY} width={BADGE_W} height={BADGE_H} fill={badgeFill} rx={4} />
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
// Main Component
// ---------------------------------------------------------------------------

export function BoundingBoxOverlay({
  imageSrc,
  declarations,
  violations = [],
  surfaceLabel,
  surfaceIndex = 0,
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

  // Dynamic Physical Calibration State (Eliminates arbitrary static 150mm guess)
  const [pdpScaleMm, setPdpScaleMm] = useState<number>(() => getEstimatedPdpHeightMm(declarations));
  const [fineTuneOffsetMm, setFineTuneOffsetMm] = useState<number>(0);
  const [activeSnapField, setActiveSnapField] = useState<string | null>(null);
  const [showLoupe, setShowLoupe] = useState(false);
  const [loupeCoord, setLoupeCoord] = useState<{ x: number; y: number }>({ x: 500, y: 500 });

  const svgRef = useRef<SVGSVGElement>(null);
  const modalSvgRef = useRef<SVGSVGElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  const entries = buildBoxEntries(declarations, surfaceIndex);
  const pdpBox = declarations?.package_pdp_box;

  // Auto-sync calibration scale when a new declaration result is loaded
  useEffect(() => {
    if (declarations) {
      setPdpScaleMm(getEstimatedPdpHeightMm(declarations));
      setFineTuneOffsetMm(0);
    }
  }, [declarations]);

  // Optical Caliper Mathematical Calculations (0.05 mm Resolution)
  const caliperH = caliperStart && caliperEnd ? Math.abs(caliperEnd.y - caliperStart.y) : 0;
  const pdpH = pdpBox && pdpBox.ymax > pdpBox.ymin ? pdpBox.ymax - pdpBox.ymin : 800;
  const ratio = pdpH > 0 ? caliperH / pdpH : 0;

  // Exact physical millimeter conversion with user scale calibration and vernier offset
  const rawMeasuredMm = ratio * pdpScaleMm;
  const measuredMm = Math.max(0.1, Math.round((rawMeasuredMm + fineTuneOffsetMm) * 10) / 10);

  const { requiredMm, minTable1, minTable2 } = getMandatedMinFontHeight(
    declarations?.net_quantity?.numeric_value,
    declarations?.dimensions
  );
  const isCompliant = measuredMm >= requiredMm;

  // Update real-time optical loupe (4x high-contrast reticle)
  const updateLoupe = useCallback((svgX: number, svgY: number) => {
    setLoupeCoord({ x: svgX, y: svgY });
    if (!loupeCanvasRef.current || !imgRef.current) return;
    const canvas = loupeCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imgRef.current;
    if (!ctx || !img.naturalWidth || !img.naturalHeight) return;

    const naturalX = (svgX / 1000) * img.naturalWidth;
    const naturalY = (svgY / 1000) * img.naturalHeight;

    const sampleSize = 36;
    const sx = Math.max(0, Math.min(img.naturalWidth - sampleSize, naturalX - sampleSize / 2));
    const sy = Math.max(0, Math.min(img.naturalHeight - sampleSize, naturalY - sampleSize / 2));

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx, sy, sampleSize, sampleSize, 0, 0, canvas.width, canvas.height);

    // Render crosshair reticle
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy);
    ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx, cy + 16);
    ctx.stroke();

    // Measurement reference guideline
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(canvas.width, cy);
    ctx.stroke();
    ctx.setLineDash([]);
  }, []);

  // Snap micrometer directly to detected text declarations
  const snapToField = (fieldKey: string, box?: BoundingBox) => {
    if (!box) return;
    const midX = (box.xmin + box.xmax) / 2;
    setCaliperStart({ x: midX, y: box.ymin });
    setCaliperEnd({ x: midX, y: box.ymax });
    setFineTuneOffsetMm(0);
    setActiveSnapField(fieldKey);
    setCaliperMode(true);
    setShowOverlay(true);
    updateLoupe(midX, box.ymin);
  };

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
      setShowLoupe(true);
      setAppliedFeedback(false);
      setFineTuneOffsetMm(0);
      setActiveSnapField(null);
      updateLoupe(cursorPt.x, cursorPt.y);
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
      updateLoupe(cursorPt.x, cursorPt.y);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!caliperMode) return;
    setCaliperActive(false);
    setTimeout(() => setShowLoupe(false), 1200);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
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
      setShowLoupe(true);
      setAppliedFeedback(false);
      setFineTuneOffsetMm(0);
      setActiveSnapField(null);
      updateLoupe(cursorPt.x, cursorPt.y);
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
      updateLoupe(cursorPt.x, cursorPt.y);
    }
  };

  const handleModalPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setCaliperActive(false);
    setTimeout(() => setShowLoupe(false), 1200);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 flex flex-col">
      {/* Top action header: Surface Label, Micrometer & Overlay toggles */}
      <div className="absolute top-2 inset-x-2 z-20 flex items-center justify-between pointer-events-none">
        {surfaceLabel ? (
          <div className="px-2.5 py-1 bg-slate-900/90 border border-slate-700 text-slate-200 text-xs font-mono font-bold rounded-lg backdrop-blur-sm pointer-events-auto">
            {surfaceLabel}
          </div>
        ) : (
          <div />
        )}

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
          ref={imgRef}
          src={imageSrc}
          alt="Scanned product packaging"
          className="w-full h-auto block max-h-[70vh] object-contain"
          style={{ display: 'block' }}
        />

        {/* 4x Optical Reticle Loupe (Shows sub-pixel character boundaries) */}
        {caliperMode && (caliperActive || showLoupe) && (
          <div
            className="absolute z-30 pointer-events-none rounded-xl overflow-hidden border-2 border-amber-400 bg-black/90 shadow-[0_4px_20px_rgba(0,0,0,0.8)] backdrop-blur-sm flex flex-col items-center p-1"
            style={{
              width: 128,
              height: 148,
              top: Math.max(10, Math.min(window.innerHeight - 200, (loupeCoord.y / 1000) * 350 - 150)),
              left: Math.max(10, Math.min(window.innerWidth - 150, (loupeCoord.x / 1000) * 500 + 40)),
            }}
          >
            <div className="text-[9px] font-mono font-bold text-amber-300 pb-0.5 uppercase tracking-wider flex items-center gap-1">
              <Crosshair className="w-2.5 h-2.5 text-amber-400" />
              <span>4x Optical Loupe</span>
            </div>
            <canvas ref={loupeCanvasRef} width={120} height={120} className="rounded-lg bg-black block" />
          </div>
        )}

        {/* SVG bounding box overlay & Vernier Optical Caliper */}
        {(showOverlay || caliperMode) && (
          <svg
            ref={svgRef}
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className={`absolute inset-0 w-full h-full touch-none select-none ${
              caliperMode ? 'cursor-crosshair' : 'pointer-events-none'
            }`}
            style={{ position: 'absolute', top: 0, left: 0, touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <defs>
              <marker id="arrow-start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#f59e0b" />
              </marker>
              <marker id="arrow-end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#f59e0b" />
              </marker>
            </defs>

            {showOverlay &&
              entries.map((entry, i) => (
                <BoxRect key={i} entry={entry} isViolated={isFieldViolated(violations, entry.citationPrefixes)} />
              ))}

            {/* Render Precision Optical Caliper */}
            {caliperMode && caliperStart && caliperEnd && (
              <g>
                {/* Measuring span vertical dimension line */}
                <line
                  x1={caliperStart.x}
                  y1={caliperStart.y}
                  x2={caliperEnd.x}
                  y2={caliperEnd.y}
                  stroke="#f59e0b"
                  strokeWidth="3.5"
                  markerStart="url(#arrow-start)"
                  markerEnd="url(#arrow-end)"
                />

                {/* Top Caliper Horizontal Jaw with Vernier ticks */}
                <line
                  x1={caliperStart.x - 45}
                  y1={caliperStart.y}
                  x2={caliperStart.x + 45}
                  y2={caliperStart.y}
                  stroke="#38bdf8"
                  strokeWidth="3"
                />
                <line x1={caliperStart.x - 30} y1={caliperStart.y - 6} x2={caliperStart.x - 30} y2={caliperStart.y + 6} stroke="#38bdf8" strokeWidth="1.5" />
                <line x1={caliperStart.x} y1={caliperStart.y - 8} x2={caliperStart.x} y2={caliperStart.y + 8} stroke="#38bdf8" strokeWidth="2" />
                <line x1={caliperStart.x + 30} y1={caliperStart.y - 6} x2={caliperStart.x + 30} y2={caliperStart.y + 6} stroke="#38bdf8" strokeWidth="1.5" />

                {/* Bottom Caliper Horizontal Jaw with Vernier ticks */}
                <line
                  x1={caliperEnd.x - 45}
                  y1={caliperEnd.y}
                  x2={caliperEnd.x + 45}
                  y2={caliperEnd.y}
                  stroke="#38bdf8"
                  strokeWidth="3"
                />
                <line x1={caliperEnd.x - 30} y1={caliperEnd.y - 6} x2={caliperEnd.x - 30} y2={caliperEnd.y + 6} stroke="#38bdf8" strokeWidth="1.5" />
                <line x1={caliperEnd.x} y1={caliperEnd.y - 8} x2={caliperEnd.x} y2={caliperEnd.y + 8} stroke="#38bdf8" strokeWidth="2" />
                <line x1={caliperEnd.x + 30} y1={caliperEnd.y - 6} x2={caliperEnd.x + 30} y2={caliperEnd.y + 6} stroke="#38bdf8" strokeWidth="1.5" />

                {/* Tactile Grab Handles */}
                <circle cx={caliperStart.x} cy={caliperStart.y} r="8" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
                <circle cx={caliperEnd.x} cy={caliperEnd.y} r="8" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />

                {/* Floating Metric Readout Badge */}
                {(() => {
                  const midX = (caliperStart.x + caliperEnd.x) / 2;
                  const midY = (caliperStart.y + caliperEnd.y) / 2;
                  const badgeX = Math.min(780, Math.max(20, midX + 25));
                  const badgeY = Math.max(25, midY - 20);

                  return (
                    <g transform={`translate(${badgeX}, ${badgeY})`}>
                      <rect
                        x="0"
                        y="-16"
                        width="190"
                        height="52"
                        fill="rgba(15, 23, 42, 0.95)"
                        rx="6"
                        stroke={isCompliant ? '#10b981' : '#f59e0b'}
                        strokeWidth="2"
                      />
                      <text x="10" y="4" fontSize="15" fontWeight="bold" fill="#f59e0b" fontFamily="monospace">
                        {measuredMm.toFixed(1)} mm ({Math.round(ratio * 1000) / 10}%)
                      </text>
                      <text
                        x="10"
                        y="23"
                        fontSize="10"
                        fontWeight="bold"
                        fill={isCompliant ? '#4ade80' : '#f87171'}
                        fontFamily="sans-serif"
                      >
                        {isCompliant
                          ? `Rule 7 Pass (≥ ${requiredMm} mm)`
                          : `Non-Compliant (< ${requiredMm} mm)`}
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

      {/* ── Rule 7 Precision Optical Micrometer Inspector HUD ───────────────────────────── */}
      {caliperMode && (
        <div className="p-3 bg-slate-950 border-t border-amber-500/50 flex flex-col gap-3 text-xs">
          {/* Row 1: Scale Calibration & AI Snap Pill Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {/* Physical Calibration Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Sliders className="w-3 h-3 text-amber-400" />
                <span>Reference Scale:</span>
              </span>
              {[75, 95, 120, 150, 180, 220].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPdpScaleMm(preset)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    pdpScaleMm === preset
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-slate-850 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  {preset}mm
                </button>
              ))}
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="number"
                  min="20"
                  max="1000"
                  value={pdpScaleMm}
                  onChange={(e) => setPdpScaleMm(Math.max(20, Math.min(1000, Number(e.target.value) || 100)))}
                  className="w-14 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-900 border border-slate-700 text-amber-300 rounded text-center"
                />
                <span className="text-[10px] text-slate-400">mm PDP</span>
              </div>
            </div>

            {/* AI Text Auto-Snap Shortcuts */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>Snap to:</span>
              </span>
              {declarations?.net_quantity?.box_2d &&
                (declarations.net_quantity.box_2d.image_index === undefined ||
                  declarations.net_quantity.box_2d.image_index === surfaceIndex) &&
                Boolean((declarations.net_quantity.numeric_value ?? 0) > 0 && declarations.net_quantity.raw_text?.trim()) && (
                  <button
                    type="button"
                    onClick={() => snapToField('net_qty', declarations.net_quantity.box_2d)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                      activeSnapField === 'net_qty'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/60'
                    }`}
                  >
                    Net Qty
                  </button>
                )}
              {declarations?.mrp?.box_2d &&
                (declarations.mrp.box_2d.image_index === undefined ||
                  declarations.mrp.box_2d.image_index === surfaceIndex) &&
                Boolean((declarations.mrp.numeric_value ?? 0) > 0 && declarations.mrp.raw_text?.trim()) && (
                  <button
                    type="button"
                    onClick={() => snapToField('mrp', declarations.mrp.box_2d)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                      activeSnapField === 'mrp'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/60'
                    }`}
                  >
                    MRP
                  </button>
                )}
              {declarations?.mfg_or_import_date?.box_2d &&
                (declarations.mfg_or_import_date.box_2d.image_index === undefined ||
                  declarations.mfg_or_import_date.box_2d.image_index === surfaceIndex) &&
                Boolean(declarations.mfg_or_import_date.is_detected && declarations.mfg_or_import_date.raw_text?.trim()) && (
                  <button
                    type="button"
                    onClick={() => snapToField('mfg', declarations.mfg_or_import_date.box_2d)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                      activeSnapField === 'mfg'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/60'
                    }`}
                  >
                    Date
                  </button>
                )}
            </div>
          </div>

          {/* Row 2: Measurement Readout, Vernier Micro-Steppers & Apply Action */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-850">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400 shrink-0">
                <Ruler className="w-4 h-4" />
              </div>

              <div>
                {caliperStart && caliperEnd && caliperH > 4 ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-xs">Rule 7 Optical Micrometer:</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                          isCompliant
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                            : 'bg-rose-950 text-rose-300 border border-rose-500'
                        }`}
                      >
                        {isCompliant ? 'COMPLIANT (Rule 7 Satisfied)' : 'NON-COMPLIANT (Under-sized Font)'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Measured Height: <strong className="text-amber-400 text-xs font-mono">{measuredMm.toFixed(1)} mm</strong>
                      &nbsp;({Math.round(ratio * 1000) / 10}% of {pdpScaleMm}mm PDP) &nbsp;·&nbsp; Mandated Min:{' '}
                      <strong className="text-slate-100">{requiredMm.toFixed(1)} mm</strong> under Table I/II
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-amber-300/90 text-xs">
                    <Info className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Drag vertically across any printed numeral or letter, or click a <strong>Snap to</strong> shortcut above.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Vernier Micro-Steppers (+/- 0.1 mm precision fine-tuning) */}
            {caliperStart && caliperEnd && caliperH > 4 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-slate-400">Micro-Step:</span>
                <button
                  type="button"
                  onClick={() => setFineTuneOffsetMm((v) => Math.round((v - 0.1) * 10) / 10)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold rounded border border-slate-700 cursor-pointer"
                  title="Nudge height down 0.1mm"
                >
                  -0.1 mm
                </button>
                <button
                  type="button"
                  onClick={() => setFineTuneOffsetMm((v) => Math.round((v + 0.1) * 10) / 10)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold rounded border border-slate-700 cursor-pointer"
                  title="Nudge height up 0.1mm"
                >
                  +0.1 mm
                </button>
                <button
                  type="button"
                  onClick={() => setFineTuneOffsetMm(0)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded border border-slate-700 cursor-pointer"
                  title="Reset fine-tune offset"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {caliperStart && caliperEnd && caliperH > 4 && onApplyFontMeasurement && (
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
        </div>
      )}

      {/* ── Fullscreen Precision Mode Modal (Mobile & High-Precision Desktop) ──────── */}
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
                    <span>Precision Mode · Rule 7 Optical Micrometer</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
                      {Math.round(precisionZoom * 100)}%
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400">Drag micrometer or tap shortcuts below to calibrate height</p>
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

            {/* Scale Calibration & AI Shortcuts inside Modal */}
            <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-950/70 p-2 rounded-lg border border-slate-800/80 text-[11px]">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400 font-bold">Scale:</span>
                {[75, 95, 120, 150, 180, 220].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPdpScaleMm(preset)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                      pdpScaleMm === preset ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {preset}mm
                  </button>
                ))}
              </div>

              {/* Snap buttons inside modal */}
              <div className="flex items-center gap-1">
                {declarations?.net_quantity?.box_2d &&
                  (declarations.net_quantity.box_2d.image_index === undefined ||
                    declarations.net_quantity.box_2d.image_index === surfaceIndex) &&
                  Boolean((declarations.net_quantity.numeric_value ?? 0) > 0 && declarations.net_quantity.raw_text?.trim()) && (
                    <button
                      type="button"
                      onClick={() => snapToField('net_qty', declarations.net_quantity.box_2d)}
                      className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-semibold text-[10px] cursor-pointer"
                    >
                      Net Qty
                    </button>
                  )}
                {declarations?.mrp?.box_2d &&
                  (declarations.mrp.box_2d.image_index === undefined ||
                    declarations.mrp.box_2d.image_index === surfaceIndex) &&
                  Boolean((declarations.mrp.numeric_value ?? 0) > 0 && declarations.mrp.raw_text?.trim()) && (
                    <button
                      type="button"
                      onClick={() => snapToField('mrp', declarations.mrp.box_2d)}
                      className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-semibold text-[10px] cursor-pointer"
                    >
                      MRP
                    </button>
                  )}
                {declarations?.mfg_or_import_date?.box_2d &&
                  (declarations.mfg_or_import_date.box_2d.image_index === undefined ||
                    declarations.mfg_or_import_date.box_2d.image_index === surfaceIndex) &&
                  Boolean(declarations.mfg_or_import_date.is_detected && declarations.mfg_or_import_date.raw_text?.trim()) && (
                    <button
                      type="button"
                      onClick={() => snapToField('mfg', declarations.mfg_or_import_date.box_2d)}
                      className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-semibold text-[10px] cursor-pointer"
                    >
                      Date
                    </button>
                  )}
              </div>
            </div>

            {/* Mini Readout: Active Ratio, Table 1 Threshold, Estimated Height in mm */}
            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono">
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap text-[11px]">
                <span>
                  <span className="text-slate-400">Measured: </span>
                  <strong className="text-amber-400 text-sm">{measuredMm.toFixed(1)} mm</strong>
                </span>
                <span className="text-slate-700">|</span>
                <span>
                  <span className="text-slate-400">Table I/II Min: </span>
                  <strong className="text-slate-200">{requiredMm.toFixed(1)} mm</strong>
                </span>
                <span className="text-slate-700">|</span>
                <span>
                  <span className="text-slate-400">Ratio: </span>
                  <strong className="text-slate-300">{Math.round(ratio * 1000) / 10}% PDP</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Micro-steppers inside modal */}
                <button
                  type="button"
                  onClick={() => setFineTuneOffsetMm((v) => Math.round((v - 0.1) * 10) / 10)}
                  className="px-2 py-0.5 bg-slate-800 text-slate-200 text-[10px] font-bold rounded border border-slate-700 cursor-pointer"
                >
                  -0.1mm
                </button>
                <button
                  type="button"
                  onClick={() => setFineTuneOffsetMm((v) => Math.round((v + 0.1) * 10) / 10)}
                  className="px-2 py-0.5 bg-slate-800 text-slate-200 text-[10px] font-bold rounded border border-slate-700 cursor-pointer"
                >
                  +0.1mm
                </button>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    isCompliant
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                      : 'bg-rose-950 text-rose-300 border border-rose-500'
                  }`}
                >
                  {isCompliant ? 'PASS' : 'FLAG'}
                </span>
              </div>
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
                {showOverlay &&
                  entries.map((entry, i) => (
                    <BoxRect key={i} entry={entry} isViolated={isFieldViolated(violations, entry.citationPrefixes)} />
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

                    {/* Top & Bottom T-Calipers with Vernier ticks */}
                    <line
                      x1={caliperStart.x - 50}
                      y1={caliperStart.y}
                      x2={caliperStart.x + 50}
                      y2={caliperStart.y}
                      stroke="#38bdf8"
                      strokeWidth="4"
                    />
                    <line
                      x1={caliperEnd.x - 50}
                      y1={caliperEnd.y}
                      x2={caliperEnd.x + 50}
                      y2={caliperEnd.y}
                      stroke="#38bdf8"
                      strokeWidth="4"
                    />

                    {/* Large touch targets */}
                    <circle cx={caliperStart.x} cy={caliperStart.y} r="14" fill="#f59e0b" stroke="#ffffff" strokeWidth="2.5" />
                    <circle cx={caliperEnd.x} cy={caliperEnd.y} r="14" fill="#f59e0b" stroke="#ffffff" strokeWidth="2.5" />

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
                            stroke={isCompliant ? '#10b981' : '#f59e0b'}
                            strokeWidth="2"
                          />
                          <text x="12" y="5" fontSize="16" fontWeight="bold" fill="#f59e0b" fontFamily="monospace">
                            {measuredMm.toFixed(1)} mm ({Math.round(ratio * 1000) / 10}%)
                          </text>
                          <text
                            x="12"
                            y="25"
                            fontSize="11"
                            fontWeight="bold"
                            fill={isCompliant ? '#4ade80' : '#f87171'}
                            fontFamily="sans-serif"
                          >
                            {isCompliant ? `Rule 7 Pass (≥ ${requiredMm}mm)` : `Under-sized (< ${requiredMm}mm)`}
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
                if (caliperStart && caliperEnd && caliperH > 4 && onApplyFontMeasurement) {
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
                setFineTuneOffsetMm(0);
                setActiveSnapField(null);
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
