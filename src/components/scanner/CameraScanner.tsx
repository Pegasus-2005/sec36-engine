'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, Upload, RefreshCcw, CameraOff, FlipHorizontal, Check, Trash2, Box, Send, Crop, X } from 'lucide-react';
import { ImageCropModal } from './ImageCropModal';

declare global {
  class BarcodeDetector {
    constructor(options?: { formats: string[] });
    detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string; format: string; boundingBox: DOMRectReadOnly }>>;
  }
}

interface CameraScannerProps {
    onScanComplete: (base64Images: string[]) => void;
    isLoading: boolean;
}

export function CameraScanner({ onScanComplete, isLoading }: CameraScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isActive, setIsActive] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    
    // Multi-surface dossier state
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    
    // Cropping workflow state
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const [cropTargetIndex, setCropTargetIndex] = useState<number | null>(null);
    
    // Barcode detection state
    const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (stream) {
            video.srcObject = stream;
            video.play().catch(() => {});
        } else {
            video.srcObject = null;
        }
    }, [stream]);

    // Barcode Detection Loop
    useEffect(() => {
        if (!isActive || !videoRef.current || !canvasRef.current) return;
        
        let intervalId: NodeJS.Timeout;
        if ('BarcodeDetector' in window) {
            const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'upc_a'] });
            intervalId = setInterval(async () => {
                try {
                    const video = videoRef.current;
                    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
                        const barcodes = await detector.detect(video);
                        if (barcodes.length > 0) {
                            setDetectedBarcode(barcodes[0].rawValue);
                        }
                    }
                } catch (e) {
                    // Ignore errors (e.g. if video frame isn't ready)
                }
            }, 1000);
        }
        
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isActive]);

    const startCamera = async (facing: 'user' | 'environment' = facingMode) => {
        setCameraError(null);
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            setStream(null);
        }
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: facing },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
            });
            setStream(mediaStream);
            setIsActive(true);
        } catch (err: unknown) {
            try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                });
                setStream(fallbackStream);
                setIsActive(true);
            } catch (fallbackErr: unknown) {
                console.error('Camera access failed:', fallbackErr);
                setCameraError(
                    'Unable to access camera. Please allow camera permissions in your browser, or upload an image below.'
                );
            }
        }
    };

    const stopCamera = useCallback(() => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
            setIsActive(false);
        }
    }, [stream]);

    const flipCamera = async () => {
        const next = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(next);
        await startCamera(next);
    };

    const captureFrame = useCallback(() => {
        if (!videoRef.current || !canvasRef.current || !isActive) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        
        // Immediately go to crop mode for the new image
        setCropTargetIndex(capturedImages.length);
        setCropImageSrc(dataUrl);

        try {
            const audio = new Audio('/camera-shutter.mp3');
            audio.play().catch(() => {});
        } catch (e) {
            console.error('Audio play failed', e);
        }
    }, [isActive, facingMode, capturedImages.length]);

    const handleCropConfirmed = (croppedBase64: string) => {
        if (cropTargetIndex !== null) {
            setCapturedImages(prev => prev.map((img, i) => i === cropTargetIndex ? croppedBase64 : img));
        } else {
            setCapturedImages(prev => [...prev, croppedBase64]);
        }
        setCropImageSrc(null);
        setCropTargetIndex(null);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    setCapturedImages(prev => [...prev, reader.result as string]);
                }
            };
            reader.readAsDataURL(file);
        });
        // Reset input so the same file can be uploaded again if needed
        e.target.value = '';
    };

    const removeImage = (index: number) => {
        setCapturedImages(prev => prev.filter((_, i) => i !== index));
    };

    const submitDossier = () => {
        if (capturedImages.length > 0) {
            onScanComplete(capturedImages);
        }
    };

    return (
        <div className="flex flex-col gap-4 bg-slate-900 rounded-xl border border-slate-800 text-slate-100 shadow-lg relative">
            {isActive ? (
                <div className="fixed inset-0 z-[100] bg-black flex flex-col">
                    {/* Top Action Bar */}
                    <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between z-20 bg-gradient-to-b from-black/80 to-transparent pt-safe">
                        <button
                            type="button"
                            onClick={stopCamera}
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                        
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-emerald-400 bg-black/60 px-3 py-1 rounded-full backdrop-blur-md border border-emerald-500/30">
                                SURFACE: {capturedImages.length === 0 ? 'FRONT PDP' : `SIDE ${capturedImages.length + 1}`}
                            </span>
                            <button
                                type="button"
                                onClick={flipCamera}
                                className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors"
                            >
                                <FlipHorizontal className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Camera Feed */}
                    <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                        <video
                            ref={videoRef}
                            className="absolute inset-0 w-full h-full object-cover"
                            autoPlay
                            playsInline
                            muted
                        />

                        {/* AR Reticle */}
                        <div className="absolute inset-0 pointer-events-none">
                            <svg className="w-full h-full text-emerald-500 opacity-70" xmlns="http://www.w3.org/2000/svg">
                                <rect x="5%" y="15%" width="90%" height="70%" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="10, 10" />
                                <path d="M 5% 25% L 5% 15% L 15% 15%" fill="none" stroke="currentColor" strokeWidth="4" />
                                <path d="M 85% 15% L 95% 15% L 95% 25%" fill="none" stroke="currentColor" strokeWidth="4" />
                                <path d="M 95% 75% L 95% 85% L 85% 85%" fill="none" stroke="currentColor" strokeWidth="4" />
                                <path d="M 15% 85% L 5% 85% L 5% 75%" fill="none" stroke="currentColor" strokeWidth="4" />
                            </svg>
                            
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-16 h-16 border-2 border-emerald-500/40 rounded-full flex items-center justify-center animate-pulse">
                                    <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                                </div>
                            </div>

                            {detectedBarcode && (
                                <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 text-sm font-mono text-black bg-emerald-400 px-4 py-2 rounded-full flex items-center gap-2 drop-shadow-lg shadow-emerald-500/50">
                                    <Box className="w-5 h-5" /> {detectedBarcode}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom Controls */}
                    <div className="absolute bottom-0 inset-x-0 pb-safe z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
                        <div className="p-6 flex items-center justify-between">
                            {/* Left: Gallery Thumbnail or Cancel */}
                            <div className="w-16 h-16">
                                {capturedImages.length > 0 ? (
                                    <div className="w-14 h-14 rounded-lg overflow-hidden border-2 border-white/50 relative shadow-lg">
                                        <img src={capturedImages[capturedImages.length - 1]} className="w-full h-full object-cover" alt="Last capture" />
                                        <div className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold">
                                            {capturedImages.length}
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={stopCamera} className="text-white/70 hover:text-white font-medium text-sm">Cancel</button>
                                )}
                            </div>

                            {/* Center: Capture Shutter */}
                            <button
                                type="button"
                                onClick={captureFrame}
                                disabled={isLoading}
                                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white/50 transition-all active:scale-95 cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.3)] disabled:opacity-50"
                            >
                                <div className="w-16 h-16 bg-white rounded-full"></div>
                            </button>

                            {/* Right: Done */}
                            <div className="w-16 flex justify-end">
                                {capturedImages.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={submitDossier}
                                        disabled={isLoading}
                                        className="text-emerald-400 font-bold text-lg hover:text-emerald-300 drop-shadow-md"
                                    >
                                        Done
                                    </button>
                                ) : (
                                    <div />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-4 sm:p-5">
                    {/* Placeholder when camera is inactive */}
                    <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center mb-4">
                        <div className="text-slate-500 flex flex-col items-center text-center p-4">
                            <CameraOff className="w-12 h-12 mb-2 opacity-40 text-slate-400" />
                            <p className="text-sm font-medium">Camera Offline</p>
                        </div>
                    </div>

                    {/* Captured Dossier Ribbon */}
                    {capturedImages.length > 0 && (
                        <div className="flex flex-col gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700 mb-4">
                            <div className="text-xs font-semibold text-slate-400 flex justify-between items-center">
                                <span>PACKAGE DOSSIER ({capturedImages.length})</span>
                                <span className="text-emerald-400">Multi-Surface Analysis Active</span>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                {capturedImages.map((img, idx) => (
                                    <div key={idx} className="relative w-20 h-20 shrink-0 rounded-md overflow-hidden border border-slate-600 group/item">
                                        <img src={img} alt={`Capture ${idx + 1}`} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/60 opacity-90 sm:opacity-0 sm:group-hover/item:opacity-100 transition flex items-center justify-center gap-1.5">
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setCropTargetIndex(idx);
                                                    setCropImageSrc(img);
                                                }}
                                                title="Crop packaging surface"
                                                className="p-1.5 bg-amber-500 rounded hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
                                            >
                                                <Crop className="w-3.5 h-3.5" />
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => removeImage(idx)}
                                                title="Delete surface"
                                                className="p-1.5 bg-red-500/80 rounded hover:bg-red-500 text-white transition-colors cursor-pointer"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[9px] text-center font-mono py-0.5 text-slate-300">
                                            {idx === 0 ? 'FRONT' : `SIDE ${idx}`}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {cameraError && (
                        <p className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded border border-rose-900/50 mb-4">
                            {cameraError}
                        </p>
                    )}

            <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 justify-center items-stretch sm:items-center">
                <button
                    type="button"
                    onClick={() => startCamera()}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition cursor-pointer shadow-md"
                >
                    <Camera className="w-5 h-5" /> Start Live Scan
                </button>

                <label className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition cursor-pointer border border-slate-700 shadow-md">
                    <Upload className="w-5 h-5" /> Import Media
                    <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
                </label>
                
                {capturedImages.length > 0 && (
                    <button
                        type="button"
                        onClick={submitDossier}
                        disabled={isLoading}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white rounded-lg text-sm font-bold transition shadow-xs sm:ml-auto cursor-pointer"
                    >
                        {isLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Submit Dossier ({capturedImages.length})</>}
                    </button>
                )}
            </div>
            
            <canvas ref={canvasRef} className="hidden" />

            </div>
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(30, 41, 59, 0.5);
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(71, 85, 105, 0.8);
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(100, 116, 139, 1);
                }
            `}</style>

            <ImageCropModal
                isOpen={cropImageSrc !== null}
                imageSrc={cropImageSrc || ''}
                title={cropTargetIndex !== null ? `Crop Surface ${cropTargetIndex + 1}` : `Crop Captured Surface ${capturedImages.length + 1}`}
                onConfirmCrop={handleCropConfirmed}
                onCancel={() => {
                    if (cropTargetIndex === null && cropImageSrc) {
                        setCapturedImages(prev => [...prev, cropImageSrc]);
                    }
                    setCropImageSrc(null);
                    setCropTargetIndex(null);
                }}
            />
        </div>
    );
}
