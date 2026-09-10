'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Crop, Check, X, Maximize2, RotateCcw, BoxSelect, Plus, ArrowRight } from 'lucide-react';

export interface CropBox {
  x: number; // percentage [0, 100]
  y: number; // percentage [0, 100]
  w: number; // percentage [0, 100]
  h: number; // percentage [0, 100]
}

interface ImageCropModalProps {
  isOpen?: boolean;
  imageSrc: string;
  title?: string;
  onConfirmCrop: (croppedBase64: string) => void;
  onConfirmCropAndNext?: (croppedBase64: string) => void;
  onConfirmCropAndFinish?: (croppedBase64: string) => void;
  onCancel: () => void;
  panelLabel?: string;
}

const DEFAULT_CROP: CropBox = { x: 2, y: 2, w: 96, h: 96 };

export function ImageCropModal({
  isOpen = true,
  imageSrc,
  title = 'Crop Packaging Evidence',
  onConfirmCrop,
  onConfirmCropAndNext,
  onConfirmCropAndFinish,
  onCancel,
  panelLabel,
}: ImageCropModalProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Exact rendered dimensions of the image in pixels
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  // Crop box in percentage [0, 100]
  const [crop, setCrop] = useState<CropBox>(DEFAULT_CROP);
  const [prevImageSrc, setPrevImageSrc] = useState(imageSrc);

  if (prevImageSrc !== imageSrc) {
    setPrevImageSrc(imageSrc);
    setCrop(DEFAULT_CROP);
    setDisplaySize(null);
    setNaturalSize(null);
  }

  // Active drag state
  const [dragState, setDragState] = useState<{
    handle: string;
    startX: number;
    startY: number;
    initialCrop: CropBox;
  } | null>(null);

  // Compute exact pixel fit inside viewport matching image natural aspect ratio
  const computeDisplayDimensions = useCallback((nw: number, nh: number) => {
    if (!viewportRef.current || nw <= 0 || nh <= 0) return;
    const viewport = viewportRef.current;
    const pad = window.innerWidth < 640 ? 12 : 24;
    const availW = Math.max(100, viewport.clientWidth - pad * 2);
    const availH = Math.max(100, viewport.clientHeight - pad * 2);

    const aspect = nw / nh;
    let w = availW;
    let h = availW / aspect;

    if (h > availH) {
      h = availH;
      w = availH * aspect;
    }

    setDisplaySize({
      width: Math.round(w),
      height: Math.round(h),
    });
  }, []);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const nw = img.naturalWidth || 800;
    const nh = img.naturalHeight || 600;
    setNaturalSize({ width: nw, height: nh });
    computeDisplayDimensions(nw, nh);
  };

  // Re-compute display dimensions on window resize or container resize
  useEffect(() => {
    if (!viewportRef.current || !naturalSize) return;

    const handleResize = () => {
      computeDisplayDimensions(naturalSize.width, naturalSize.height);
    };

    window.addEventListener('resize', handleResize);
    const ro = new ResizeObserver(() => handleResize());
    ro.observe(viewportRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
    };
  }, [naturalSize, computeDisplayDimensions]);

  // Pointer event handlers attached to window for smooth drag on mobile & desktop
  const handlePointerDown = (handle: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!displaySize) return;

    setDragState({
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
    });
  };

  useEffect(() => {
    if (!dragState || !displaySize) return;

    const onPointerMove = (e: PointerEvent) => {
      e.preventDefault();
      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;

      const deltaXPct = (deltaX / displaySize.width) * 100;
      const deltaYPct = (deltaY / displaySize.height) * 100;

      const { x, y, w, h } = dragState.initialCrop;
      let nextX = x;
      let nextY = y;
      let nextW = w;
      let nextH = h;
      const MIN_SIZE = 6; // minimum 6%

      if (dragState.handle === 'move') {
        nextX = Math.max(0, Math.min(100 - w, x + deltaXPct));
        nextY = Math.max(0, Math.min(100 - h, y + deltaYPct));
      } else {
        if (dragState.handle.includes('w')) {
          const maxDelta = x;
          const clampedDelta = Math.max(-maxDelta, Math.min(w - MIN_SIZE, deltaXPct));
          nextX = x + clampedDelta;
          nextW = w - clampedDelta;
        }
        if (dragState.handle.includes('e')) {
          const maxDelta = 100 - (x + w);
          const clampedDelta = Math.min(maxDelta, Math.max(MIN_SIZE - w, deltaXPct));
          nextW = w + clampedDelta;
        }
        if (dragState.handle.includes('n')) {
          const maxDelta = y;
          const clampedDelta = Math.max(-maxDelta, Math.min(h - MIN_SIZE, deltaYPct));
          nextY = y + clampedDelta;
          nextH = h - clampedDelta;
        }
        if (dragState.handle.includes('s')) {
          const maxDelta = 100 - (y + h);
          const clampedDelta = Math.min(maxDelta, Math.max(MIN_SIZE - h, deltaYPct));
          nextH = h + clampedDelta;
        }
      }

      setCrop({
        x: Math.round(nextX * 10) / 10,
        y: Math.round(nextY * 10) / 10,
        w: Math.round(nextW * 10) / 10,
        h: Math.round(nextH * 10) / 10,
      });
    };

    const onPointerUp = () => {
      setDragState(null);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragState, displaySize]);

  // Execute precise pixel slice from the natural image
  const getCroppedData = (): string => {
    if (!imgRef.current) return imageSrc;
    const img = imgRef.current;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;

    if (!naturalW || !naturalH) {
      return imageSrc;
    }

    const clampedX = Math.max(0, Math.min(100, crop.x));
    const clampedY = Math.max(0, Math.min(100, crop.y));
    const clampedW = Math.max(1, Math.min(100 - clampedX, crop.w));
    const clampedH = Math.max(1, Math.min(100 - clampedY, crop.h));

    const sourceX = Math.round((clampedX / 100) * naturalW);
    const sourceY = Math.round((clampedY / 100) * naturalH);
    const sourceW = Math.round((clampedW / 100) * naturalW);
    const sourceH = Math.round((clampedH / 100) * naturalH);

    if (sourceW <= 0 || sourceH <= 0) {
      return imageSrc;
    }

    const canvas = document.createElement('canvas');
    canvas.width = sourceW;
    canvas.height = sourceH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return imageSrc;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);

    return canvas.toDataURL('image/jpeg', 0.92);
  };

  const handleApplyCrop = () => {
    onConfirmCrop(getCroppedData());
  };

  const handleCropAndNext = () => {
    if (onConfirmCropAndNext) {
      onConfirmCropAndNext(getCroppedData());
    } else {
      handleApplyCrop();
    }
  };

  const handleCropAndFinish = () => {
    if (onConfirmCropAndFinish) {
      onConfirmCropAndFinish(getCroppedData());
    } else {
      handleApplyCrop();
    }
  };

  if (!isOpen) return null;

  const naturalW = naturalSize?.width || 1280;
  const naturalH = naturalSize?.height || 720;
  const outputW = Math.round((crop.w / 100) * naturalW);
  const outputH = Math.round((crop.h / 100) * naturalH);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black p-0 select-none">
      <div className="bg-slate-950 w-full h-full overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-900 border-b border-slate-800 pt-safe shrink-0">
          <div className="flex items-center gap-2 text-white">
            <Crop className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm tracking-wide">{title}</h3>
            {panelLabel && (
              <span className="text-[11px] bg-amber-500/20 text-amber-300 font-mono font-bold px-2 py-0.5 rounded-full border border-amber-400/30">
                {panelLabel}
              </span>
            )}
            <span className="hidden sm:inline-block text-[11px] text-slate-400 font-mono">
              [Crop out background table / isolate package panel]
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Framing Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2 bg-slate-900/80 border-b border-slate-800 text-xs shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 custom-scrollbar">
            <span className="text-slate-400 text-[11px] font-semibold mr-1">Presets:</span>
            <button
              type="button"
              onClick={() => setCrop({ x: 5, y: 2, w: 90, h: 58 })}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[11px] font-mono font-semibold cursor-pointer transition-colors whitespace-nowrap"
              title="Isolates package held or placed on top of a table/desk"
            >
              Auto-Detect Edges
            </button>
            <button
              type="button"
              onClick={() => setCrop({ x: 15, y: 15, w: 70, h: 70 })}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-mono cursor-pointer transition-colors whitespace-nowrap"
            >
              Tight Center
            </button>
            <button
              type="button"
              onClick={() => setCrop({ x: 0, y: 0, w: 100, h: 100 })}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-mono cursor-pointer transition-colors whitespace-nowrap"
            >
              Full Frame
            </button>
            <button
              type="button"
              onClick={() => setCrop(DEFAULT_CROP)}
              className="px-2 py-1 text-slate-400 hover:text-white rounded text-[11px] font-mono cursor-pointer transition-colors flex items-center gap-1"
              title="Reset to default"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
          <div className="text-[11px] font-mono text-amber-400 font-semibold shrink-0">
            {outputW} × {outputH} px ({Math.round(crop.w)}% × {Math.round(crop.h)}%)
          </div>
        </div>

        {/* Crop Stage Viewport */}
        <div
          ref={viewportRef}
          className="relative flex-1 bg-black flex items-center justify-center overflow-hidden p-2 sm:p-4 select-none touch-none"
        >
          {displaySize ? (
            <div
              style={{
                width: `${displaySize.width}px`,
                height: `${displaySize.height}px`,
                position: 'relative',
                touchAction: 'none',
              }}
              className="select-none shadow-2xl"
            >
              {/* Natural Base Image */}
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Source to crop"
                onLoad={handleImageLoad}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />

              {/* Darkened Mask Surrounding Active Crop Area */}
              {/* Top Mask */}
              <div
                className="absolute left-0 right-0 top-0 bg-black/65 pointer-events-none"
                style={{ height: `${crop.y}%` }}
              />
              {/* Bottom Mask */}
              <div
                className="absolute left-0 right-0 bottom-0 bg-black/65 pointer-events-none"
                style={{ height: `${100 - (crop.y + crop.h)}%` }}
              />
              {/* Left Mask */}
              <div
                className="absolute left-0 bg-black/65 pointer-events-none"
                style={{
                  top: `${crop.y}%`,
                  height: `${crop.h}%`,
                  width: `${crop.x}%`,
                }}
              />
              {/* Right Mask */}
              <div
                className="absolute right-0 bg-black/65 pointer-events-none"
                style={{
                  top: `${crop.y}%`,
                  height: `${crop.h}%`,
                  width: `${100 - (crop.x + crop.w)}%`,
                }}
              />

              {/* Interactive Crop Box Container */}
              <div
                className="absolute border-2 border-amber-400 cursor-move shadow-md"
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.w}%`,
                  height: `${crop.h}%`,
                  touchAction: 'none',
                }}
                onPointerDown={(e) => handlePointerDown('move', e)}
              >
                {/* Rule of Thirds Grid Lines */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30">
                  <div className="border-r border-b border-amber-300" />
                  <div className="border-r border-b border-amber-300" />
                  <div className="border-b border-amber-300" />
                  <div className="border-r border-b border-amber-300" />
                  <div className="border-r border-b border-amber-300" />
                  <div className="border-b border-amber-300" />
                  <div className="border-r border-b border-amber-300" />
                  <div className="border-r border-b border-amber-300" />
                  <div />
                </div>

                {/* Badge Center Cue */}
                <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-xs text-amber-300 text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none flex items-center gap-1 border border-amber-400/40">
                  <BoxSelect className="w-3 h-3 text-amber-400" />
                  <span>TARGET EVIDENCE</span>
                </div>

                {/* --- Touch & Pointer Handles --- */}

                {/* Corner: North-West */}
                <div
                  className="absolute -top-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nwse-resize touch-none z-20"
                  onPointerDown={(e) => handlePointerDown('nw', e)}
                >
                  <div className="w-3.5 h-3.5 bg-amber-400 border-2 border-slate-950 rounded-xs shadow-md" />
                </div>

                {/* Corner: North-East */}
                <div
                  className="absolute -top-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize touch-none z-20"
                  onPointerDown={(e) => handlePointerDown('ne', e)}
                >
                  <div className="w-3.5 h-3.5 bg-amber-400 border-2 border-slate-950 rounded-xs shadow-md" />
                </div>

                {/* Corner: South-West */}
                <div
                  className="absolute -bottom-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize touch-none z-20"
                  onPointerDown={(e) => handlePointerDown('sw', e)}
                >
                  <div className="w-3.5 h-3.5 bg-amber-400 border-2 border-slate-950 rounded-xs shadow-md" />
                </div>

                {/* Corner: South-East */}
                <div
                  className="absolute -bottom-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nwse-resize touch-none z-20"
                  onPointerDown={(e) => handlePointerDown('se', e)}
                >
                  <div className="w-3.5 h-3.5 bg-amber-400 border-2 border-slate-950 rounded-xs shadow-md" />
                </div>

                {/* Edge: North */}
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-6 flex items-center justify-center cursor-ns-resize touch-none z-20"
                  onPointerDown={(e) => handlePointerDown('n', e)}
                >
                  <div className="w-6 h-2 bg-amber-400 border border-slate-950 rounded-full shadow-md" />
                </div>

                {/* Edge: South */}
                <div
                  className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-12 h-6 flex items-center justify-center cursor-ns-resize touch-none z-20"
                  onPointerDown={(e) => handlePointerDown('s', e)}
                >
                  <div className="w-6 h-2 bg-amber-400 border border-slate-950 rounded-full shadow-md" />
                </div>

                {/* Edge: West */}
                <div
                  className="absolute top-1/2 -left-3 -translate-y-1/2 w-6 h-12 flex items-center justify-center cursor-ew-resize touch-none z-20"
                  onPointerDown={(e) => handlePointerDown('w', e)}
                >
                  <div className="w-2 h-6 bg-amber-400 border border-slate-950 rounded-full shadow-md" />
                </div>

                {/* Edge: East */}
                <div
                  className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-12 flex items-center justify-center cursor-ew-resize touch-none z-20"
                  onPointerDown={(e) => handlePointerDown('e', e)}
                >
                  <div className="w-2 h-6 bg-amber-400 border border-slate-950 rounded-full shadow-md" />
                </div>
              </div>
            </div>
          ) : (
            // Hidden preloader image to measure natural dimensions
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Loading preview"
              onLoad={handleImageLoad}
              className="max-h-full max-w-full opacity-0 pointer-events-none"
            />
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-4 sm:px-6 py-3 bg-slate-900 border-t border-slate-800 pb-safe shrink-0">
          {/* Mobile Action Bar (Adobe Scan / CamScanner sequential flow) */}
          {onConfirmCropAndNext ? (
            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-lg transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retake</span>
              </button>

              <button
                type="button"
                onClick={handleCropAndNext}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 text-xs font-bold text-amber-950 bg-amber-400 hover:bg-amber-300 active:scale-95 rounded-lg shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Crop &amp; Next</span>
              </button>

              <button
                type="button"
                onClick={handleCropAndFinish}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 rounded-lg shadow-md transition-all cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Finish Audit</span>
              </button>
            </div>
          ) : (
            /* Desktop / Standard Action Bar */
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => onConfirmCrop(imageSrc)}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Keep Full Uncropped Image
              </button>

              <div className="w-full sm:w-auto flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyCrop}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-6 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 rounded shadow-md transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  Apply Crop &amp; Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
