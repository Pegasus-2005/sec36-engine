'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, Upload, RefreshCcw, CameraOff, FlipHorizontal, Check, Trash2, Box, Send, Crop } from 'lucide-react';
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

    const captureFrame = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const base64 = canvas.toDataURL('image/jpeg', 0.85);
                setCropTargetIndex(null);
                setCropImageSrc(base64);
            }
        }
    };

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
        <div className="flex flex-col gap-4 p-3 sm:p-5 bg-slate-900 rounded-xl border border-slate-800 text-slate-100 shadow-lg">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center group">
                <video
                    ref={videoRef}
                    className={`w-full h-full object-cover ${isActive ? 'block' : 'hidden'}`}
                    autoPlay
                    playsInline
                    muted
                />

                {isActive && (
                    <div className="absolute inset-0 pointer-events-none">
                        {/* AR Reticle / Framing Guide */}
                        <svg className="w-full h-full absolute inset-0 text-emerald-500 opacity-60" xmlns="http://www.w3.org/2000/svg">
                            <rect x="10%" y="10%" width="80%" height="80%" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="15, 15" />
                            {/* Corners */}
                            <path d="M 10% 20% L 10% 10% L 20% 10%" fill="none" stroke="currentColor" strokeWidth="4" />
                            <path d="M 80% 10% L 90% 10% L 90% 20%" fill="none" stroke="currentColor" strokeWidth="4" />
                            <path d="M 90% 80% L 90% 90% L 80% 90%" fill="none" stroke="currentColor" strokeWidth="4" />
                            <path d="M 20% 90% L 10% 90% L 10% 80%" fill="none" stroke="currentColor" strokeWidth="4" />
                        </svg>
                        
                        {/* Center HUD */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-12 h-12 border border-emerald-500/50 rounded-full flex items-center justify-center animate-pulse">
                                <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
                            </div>
                        </div>

                        {/* Top HUD text */}
                        <div className="absolute top-4 left-4 flex flex-col gap-1 drop-shadow-md">
                            <div className="text-xs font-mono text-emerald-400 bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
                                [FOV: STANDARD]
                            </div>
                            <div className="text-xs font-mono text-emerald-400 bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
                                [SURFACE: {capturedImages.length === 0 ? 'FRONT PDP' : `SIDE ${capturedImages.length + 1}`}]
                            </div>
                        </div>

                        {/* Barcode Detection Toast */}
                        {detectedBarcode && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-mono text-black bg-emerald-400 px-3 py-1.5 rounded flex items-center gap-2 drop-shadow-md shadow-emerald-500/50 shadow-lg">
                                <Box className="w-4 h-4" /> EAN-13 DETECTED: {detectedBarcode}
                            </div>
                        )}
                    </div>
                )}

                {!isActive && (
                    <div className="text-slate-500 flex flex-col items-center text-center p-4">
                        <CameraOff className="w-12 h-12 mb-2 opacity-40 text-slate-400" />
                        <p className="text-sm font-medium">Camera Feed Offline</p>
                    </div>
                )}

                {isActive && (
                    <button
                        type="button"
                        onClick={flipCamera}
                        title="Flip camera (front / rear)"
                        className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-black/65 hover:bg-black/85 rounded-full text-white backdrop-blur-sm transition-all shadow-md cursor-pointer z-10 text-xs font-semibold"
                    >
                        <FlipHorizontal className="w-4 h-4" />
                        <span>{facingMode === 'user' ? 'Front Cam' : 'Rear Cam'}</span>
                    </button>
                )}

                <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Captured Dossier Ribbon */}
            {capturedImages.length > 0 && (
                <div className="flex flex-col gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
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
                <p className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded border border-rose-900/50">
                    {cameraError}
                </p>
            )}

            <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 justify-center items-stretch sm:items-center">
                {!isActive ? (
                    <button
                        type="button"
                        onClick={() => startCamera()}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition cursor-pointer shadow-xs"
                    >
                        <Camera className="w-4 h-4" /> Start Camera
                    </button>
                ) : (
                    <div className="flex gap-2 flex-1">
                        <button
                            type="button"
                            onClick={captureFrame}
                            disabled={isLoading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 text-white rounded-lg text-sm font-bold transition shadow-xs cursor-pointer"
                        >
                            <Camera className="w-4 h-4" /> Capture Panel
                        </button>
                        <button
                            type="button"
                            onClick={stopCamera}
                            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition border border-slate-700 cursor-pointer"
                        >
                            Stop
                        </button>
                    </div>
                )}

                <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition cursor-pointer border border-slate-700">
                    <Upload className="w-4 h-4" /> Upload
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
