import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

interface FullScreenImageViewerProps {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function FullScreenImageViewer({ images, initialIndex = 0, onClose }: FullScreenImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setScale(1);
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setScale(1);
  }, [images.length]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col touch-none">
      {/* Top Bar */}
      <div className="absolute top-0 inset-x-0 z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white text-sm font-semibold tracking-wider uppercase">
          Surface {currentIndex + 1} of {images.length}
          {currentIndex === 0 && ' (Front PDP)'}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setScale(s => Math.min(s + 0.5, 4))}
            className="text-white/80 hover:text-white p-2"
          >
            <ZoomIn className="w-6 h-6" />
          </button>
          <button
            onClick={() => setScale(s => Math.max(s - 0.5, 0.5))}
            className="text-white/80 hover:text-white p-2"
          >
            <ZoomOut className="w-6 h-6" />
          </button>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-2 ml-2 bg-white/10 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Image Container */}
      <div className="flex-1 w-full h-full flex items-center justify-center overflow-auto relative">
        <img
          src={images[currentIndex]}
          alt={`Surface ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain transition-transform duration-200"
          style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
        />
      </div>

      {/* Navigation Arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/80 backdrop-blur-sm z-10 transition-colors"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/80 backdrop-blur-sm z-10 transition-colors"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          {/* Bottom Thumbnails */}
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 to-transparent flex justify-center gap-2 overflow-x-auto">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentIndex(idx);
                  setScale(1);
                }}
                className={`relative w-16 h-16 rounded overflow-hidden border-2 transition-all shrink-0 ${
                  idx === currentIndex ? 'border-blue-500 scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'
                }`}
              >
                <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
