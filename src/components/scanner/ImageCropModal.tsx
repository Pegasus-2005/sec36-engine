'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Crop, Check, X, Maximize2 } from 'lucide-react';

interface CropBox {
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
  onCancel: () => void;
}

export function ImageCropModal({
  isOpen = true,
  imageSrc,
  title = 'Crop Packaging Evidence',
  onConfirmCrop,
  onCancel,
}: ImageCropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Crop box in percentage (0 to 100)
  const [crop, setCrop] = useState<CropBox>({ x: 10, y: 10, w: 80, h: 80 });
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ mouseX: number; mouseY: number; initialCrop: CropBox } | null>(null);

  // Reset crop box when image changes
  useEffect(() => {
    if (isOpen) {
      setCrop({ x: 10, y: 10, w: 80, h: 80 });
    }
  }, [isOpen, imageSrc]);

  const handlePointerDown = (handle: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHandle(handle);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialCrop: { ...crop },
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!activeHandle || !dragStart || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaXPercent = ((e.clientX - dragStart.mouseX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - dragStart.mouseY) / rect.height) * 100;

    const { x, y, w, h } = dragStart.initialCrop;
    let nextX = x;
    let nextY = y;
    let nextW = w;
    let nextH = h;

    const MIN_SIZE = 10;

    if (activeHandle === 'move') {
      nextX = Math.max(0, Math.min(100 - w, x + deltaXPercent));
      nextY = Math.max(0, Math.min(100 - h, y + deltaYPercent));
    } else {
      // Corner / edge handles
      if (activeHandle.includes('w')) {
        const proposedW = w - deltaXPercent;
        if (proposedW >= MIN_SIZE && x + deltaXPercent >= 0) {
          nextX = x + deltaXPercent;
          nextW = proposedW;
        }
      }
      if (activeHandle.includes('e')) {
        const proposedW = w + deltaXPercent;
        if (proposedW >= MIN_SIZE && x + proposedW <= 100) {
          nextW = proposedW;
        }
      }
      if (activeHandle.includes('n')) {
        const proposedH = h - deltaYPercent;
        if (proposedH >= MIN_SIZE && y + deltaYPercent >= 0) {
          nextY = y + deltaYPercent;
          nextH = proposedH;
        }
      }
      if (activeHandle.includes('s')) {
        const proposedH = h + deltaYPercent;
        if (proposedH >= MIN_SIZE && y + proposedH <= 100) {
          nextH = proposedH;
        }
      }
    }

    setCrop({
      x: Math.round(nextX * 10) / 10,
      y: Math.round(nextY * 10) / 10,
      w: Math.round(nextW * 10) / 10,
      h: Math.round(nextH * 10) / 10,
    });
  }, [activeHandle, dragStart]);

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeHandle) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    setActiveHandle(null);
    setDragStart(null);
  };

  const applyCrop = () => {
    if (!imgRef.current) return;
    const img = imgRef.current;

    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;

    const cropX = Math.max(0, Math.round((crop.x / 100) * naturalW));
    const cropY = Math.max(0, Math.round((crop.y / 100) * naturalH));
    const cropW = Math.min(naturalW - cropX, Math.round((crop.w / 100) * naturalW));
    const cropH = Math.min(naturalH - cropY, Math.round((crop.h / 100) * naturalH));

    if (cropW <= 0 || cropH <= 0) {
      onConfirmCrop(imageSrc);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onConfirmCrop(imageSrc);
      return;
    }

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const croppedData = canvas.toDataURL('image/jpeg', 0.9);
    onConfirmCrop(croppedData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center gap-2 text-white">
            <Crop className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm">{title}</h3>
            <span className="text-[11px] text-slate-400 font-mono">
              [Crop out background / isolate package]
            </span>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick presets toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 bg-slate-950/70 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">Quick Framing:</span>
            <button
              type="button"
              onClick={() => setCrop({ x: 5, y: 5, w: 90, h: 90 })}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-mono"
            >
              Full Frame
            </button>
            <button
              type="button"
              onClick={() => setCrop({ x: 15, y: 15, w: 70, h: 70 })}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-mono"
            >
              Tight Center (70%)
            </button>
            <button
              type="button"
              onClick={() => setCrop({ x: 10, y: 20, w: 80, h: 60 })}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-mono"
            >
              Landscape 4:3
            </button>
          </div>
          <div className="text-[11px] font-mono text-amber-400">
            {Math.round(crop.w)}% × {Math.round(crop.h)}%
          </div>
        </div>

        {/* Crop canvas area */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden p-4 select-none">
          <div
            ref={containerRef}
            className="relative max-h-[60vh] max-w-full inline-block"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Source to crop"
              className="max-h-[60vh] max-w-full block object-contain pointer-events-none"
            />

            {/* Dark mask outside crop box */}
            <div
              className="absolute inset-0 bg-black/60 pointer-events-none"
              style={{
                clipPath: `polygon(
                  0% 0%, 100% 0%, 100% 100%, 0% 100%,
                  0% ${crop.y}%, 
                  ${crop.x}% ${crop.y}%, 
                  ${crop.x}% ${crop.y + crop.h}%, 
                  ${crop.x + crop.w}% ${crop.y + crop.h}%, 
                  ${crop.x + crop.w}% ${crop.y}%, 
                  0% ${crop.y}%
                )`,
              }}
            />

            {/* Interactive Crop Box */}
            <div
              className="absolute border-2 border-amber-400 cursor-move"
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.w}%`,
                height: `${crop.h}%`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
              }}
              onPointerDown={(e) => handlePointerDown('move', e)}
            >
              {/* Rule-of-thirds grid lines */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-40">
                <div className="border-r border-b border-amber-300/40" />
                <div className="border-r border-b border-amber-300/40" />
                <div className="border-b border-amber-300/40" />
                <div className="border-r border-b border-amber-300/40" />
                <div className="border-r border-b border-amber-300/40" />
                <div className="border-b border-amber-300/40" />
                <div className="border-r border-amber-300/40" />
                <div className="border-r border-amber-300/40" />
                <div />
              </div>

              {/* Corner Handles - touch-friendly */}
              <div
                className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-amber-400 border-2 border-slate-900 rounded-xs cursor-nwse-resize touch-none shadow-sm"
                onPointerDown={(e) => handlePointerDown('nw', e)}
              />
              <div
                className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-amber-400 border-2 border-slate-900 rounded-xs cursor-nesw-resize touch-none shadow-sm"
                onPointerDown={(e) => handlePointerDown('ne', e)}
              />
              <div
                className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-amber-400 border-2 border-slate-900 rounded-xs cursor-nesw-resize touch-none shadow-sm"
                onPointerDown={(e) => handlePointerDown('sw', e)}
              />
              <div
                className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-amber-400 border-2 border-slate-900 rounded-xs cursor-nwse-resize touch-none shadow-sm"
                onPointerDown={(e) => handlePointerDown('se', e)}
              />

              {/* Edge Handles - touch-friendly */}
              <div
                className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-4 bg-amber-400 border border-slate-900 rounded-xs cursor-ns-resize touch-none"
                onPointerDown={(e) => handlePointerDown('n', e)}
              />
              <div
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-4 bg-amber-400 border border-slate-900 rounded-xs cursor-ns-resize touch-none"
                onPointerDown={(e) => handlePointerDown('s', e)}
              />
              <div
                className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-8 bg-amber-400 border border-slate-900 rounded-xs cursor-ew-resize touch-none"
                onPointerDown={(e) => handlePointerDown('w', e)}
              />
              <div
                className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-8 bg-amber-400 border border-slate-900 rounded-xs cursor-ew-resize touch-none"
                onPointerDown={(e) => handlePointerDown('e', e)}
              />
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 sm:px-5 py-3 bg-slate-800/90 border-t border-slate-700">
          <button
            type="button"
            onClick={() => onConfirmCrop(imageSrc)}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Keep Full Uncropped Image
          </button>

          <div className="w-full sm:w-auto flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyCrop}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded shadow-md transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Apply Crop &amp; Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
