'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, Upload, RefreshCcw, CameraOff, FlipHorizontal, Trash2, Box, Send, Crop, Zap, X, Plus } from 'lucide-react';
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

const SURFACE_NAMES = ['Front PDP', 'Back Info Panel', 'Side / Ingredients', 'Panel 4'];

export function CameraScanner({ onScanComplete, isLoading }: CameraScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isActive, setIsActive] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [torchOn, setTorchOn] = useState(false);
    const [supportsTorch, setSupportsTorch] = useState(false);
    
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

    // Check torch / flashlight support
    useEffect(() => {
        if (!stream) {
            setSupportsTorch(false);
            setTorchOn(false);
            return;
        }
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
            try {
                const capabilities = track.getCapabilities() as any;
                setSupportsTorch(Boolean(capabilities?.torch));
            } catch {
                setSupportsTorch(false);
            }
        } else {
            setSupportsTorch(false);
        }
    }, [stream]);

    const toggleTorch = async () => {
        if (!stream) return;
        const track = stream.getVideoTracks()[0];
        if (!track) return;
        try {
            await (track as any).applyConstraints({
                advanced: [{ torch: !torchOn }],
            });
            setTorchOn(!torchOn);
        } catch (e) {
            console.warn('Torch constraint toggle failed:', e);
        }
    };

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
                } catch {
                    // Ignore transient errors
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
        } catch {
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
            setTorchOn(false);
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
                const base64 = canvas.toDataURL('image/jpeg', 0.88);
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

    // Adobe Scan Sequential Flow: Crop & Next Panel
    const handleCropAndNext = (croppedBase64: string) => {
        if (cropTargetIndex !== null) {
            setCapturedImages(prev => prev.map((img, i) => i === cropTargetIndex ? croppedBase64 : img));
        } else {
            setCapturedImages(prev => [...prev, croppedBase64]);
        }
        setCropImageSrc(null);
        setCropTargetIndex(null);
        // Remains in active viewfinder mode ready to snap next panel
    };

    // Adobe Scan Sequential Flow: Crop & Finish Audit
    const handleCropAndFinish = (croppedBase64: string) => {
        let finalDossier: string[];
        if (cropTargetIndex !== null) {
            finalDossier = capturedImages.map((img, i) => i === cropTargetIndex ? croppedBase64 : img);
        } else {
            finalDossier = [...capturedImages, croppedBase64];
        }
        setCapturedImages(finalDossier);
        setCropImageSrc(null);
        setCropTargetIndex(null);
        stopCamera();
        onScanComplete(finalDossier);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        if (files.length === 1) {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    setCropTargetIndex(null);
                    setCropImageSrc(reader.result as string);
                }
            };
            reader.readAsDataURL(files[0]);
        } else {
            files.forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (typeof reader.result === 'string') {
                        setCapturedImages(prev => [...prev, reader.result as string]);
                    }
                };
                reader.readAsDataURL(file);
            });
        }
        e.target.value = '';
    };

    const removeImage = (index: number) => {
        setCapturedImages(prev => prev.filter((_, i) => i !== index));
    };

    const submitDossier = () => {
        if (capturedImages.length > 0) {
            stopCamera();
            onScanComplete(capturedImages);
        }
    };

    const currentPanelLabel = SURFACE_NAMES[capturedImages.length] || `Surface ${capturedImages.length + 1}`;

    return (
        <div className="flex flex-col gap-4 p-3 sm:p-5 bg-slate-900 rounded-xl border border-slate-800 text-slate-100 shadow-lg">
            {/* Viewfinder Container:
                - Desktop: Relative 16:9 container inside card
                - Mobile (when active): Fixed full-screen CamScanner modal covering viewport
            */}
            <div
                className={
                    isActive
                        ? "relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center group max-md:fixed max-md:inset-0 max-md:z-50 max-md:aspect-auto max-md:rounded-none max-md:border-none"
                        : "relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center group"
                }
            >
                <video
                    ref={videoRef}
                    className={`w-full h-full object-cover ${isActive ? 'block' : 'hidden'}`}
                    autoPlay
                    playsInline
                    muted
                />

                {/* --- MOBILE FULLSCREEN TOP BAR (CamScanner style) --- */}
                {isActive && (
                    <div className="md:hidden absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/85 via-black/50 to-transparent pt-safe pointer-events-auto">
                        <button
                            type="button"
                            onClick={stopCamera}
                            className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center border border-white/20 active:scale-95 shadow-md cursor-pointer"
                            title="Close Viewfinder"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex flex-col items-center">
                            <span className="px-3 py-1 bg-black/70 border border-emerald-500/50 text-emerald-300 text-xs font-mono font-bold rounded-full backdrop-blur-md shadow-md">
                                Panel {capturedImages.length + 1} of 3 ({currentPanelLabel})
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            {supportsTorch && (
                                <button
                                    type="button"
                                    onClick={toggleTorch}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center border active:scale-95 transition-all shadow-md cursor-pointer ${
                                        torchOn ? 'bg-amber-400 text-slate-950 border-amber-300' : 'bg-black/60 text-white border-white/20'
                                    }`}
                                    title={torchOn ? 'Turn Off Flash' : 'Turn On Flash'}
                                >
                                    <Zap className="w-5 h-5" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={flipCamera}
                                className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center border border-white/20 active:scale-95 shadow-md cursor-pointer"
                                title="Flip camera (Front / Rear)"
                            >
                                <FlipHorizontal className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* --- OPTICAL RETICLE & FRAMING GUIDES --- */}
                {isActive && (
                    <div className="absolute inset-0 pointer-events-none">
                        {/* AR Reticle / Framing Guide */}
                        <svg className="w-full h-full absolute inset-0 text-emerald-400 opacity-65" xmlns="http://www.w3.org/2000/svg">
                            <rect x="12%" y="15%" width="76%" height="70%" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="12, 12" />
                            {/* Corners */}
                            <path d="M 12% 22% L 12% 15% L 19% 15%" fill="none" stroke="currentColor" strokeWidth="3.5" />
                            <path d="M 81% 15% L 88% 15% L 88% 22%" fill="none" stroke="currentColor" strokeWidth="3.5" />
                            <path d="M 88% 78% L 88% 85% L 81% 85%" fill="none" stroke="currentColor" strokeWidth="3.5" />
                            <path d="M 19% 85% L 12% 85% L 12% 78%" fill="none" stroke="currentColor" strokeWidth="3.5" />
                        </svg>
                        
                        {/* Center HUD */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-14 h-14 border border-emerald-400/40 rounded-full flex items-center justify-center animate-pulse">
                                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_#34d399]"></div>
                            </div>
                        </div>

                        {/* Top HUD text (Desktop only) */}
                        <div className="hidden md:flex absolute top-4 left-4 flex-col gap-1 drop-shadow-md">
                            <div className="text-xs font-mono text-emerald-400 bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm">
                                [FOV: STANDARD]
                            </div>
                            <div className="text-xs font-mono text-emerald-400 bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm">
                                [SURFACE: {capturedImages.length === 0 ? 'FRONT PDP' : `SIDE ${capturedImages.length + 1}`}]
                            </div>
                        </div>

                        {/* Barcode Detection Toast */}
                        {detectedBarcode && (
                            <div className="absolute bottom-24 md:bottom-4 left-1/2 -translate-x-1/2 text-xs font-mono text-black bg-emerald-400 px-3 py-1.5 rounded-full flex items-center gap-2 drop-shadow-md shadow-emerald-500/50 shadow-lg pointer-events-auto">
                                <Box className="w-4 h-4" /> EAN-13: {detectedBarcode}
                            </div>
                        )}
                    </div>
                )}

                {/* --- MOBILE FULLSCREEN SHUTTER BAR (Adobe Scan style) --- */}
                {isActive && (
                    <div className="md:hidden absolute bottom-0 inset-x-0 z-30 flex items-center justify-between px-6 py-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent pb-safe pointer-events-auto">
                        {/* Left: Thumbnail stack preview */}
                        <div className="w-16 h-16 flex items-center justify-start">
                            {capturedImages.length > 0 ? (
                                <div className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-white/80 shadow-lg">
                                    <img
                                        src={capturedImages[capturedImages.length - 1]}
                                        alt="Last captured panel"
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 text-[10px] font-mono font-black w-4 h-4 rounded-bl flex items-center justify-center">
                                        {capturedImages.length}
                                    </div>
                                </div>
                            ) : (
                                <div className="w-14 h-14 rounded-lg border border-white/20 flex items-center justify-center text-white/40 text-[10px] text-center font-mono leading-tight">
                                    No Panels
                                </div>
                            )}
                        </div>

                        {/* Center: Large Tactile Shutter Button */}
                        <button
                            type="button"
                            onClick={captureFrame}
                            className="relative w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform shadow-2xl cursor-pointer"
                            aria-label="Capture Package Panel"
                        >
                            <div className="w-16 h-16 rounded-full bg-white active:bg-emerald-400 transition-colors shadow-inner flex items-center justify-center">
                                <Camera className="w-6 h-6 text-slate-900" />
                            </div>
                        </button>

                        {/* Right: Finish & Inspect Button */}
                        <div className="w-16 h-16 flex items-center justify-end">
                            {capturedImages.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={submitDossier}
                                    disabled={isLoading}
                                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded-lg shadow-lg flex flex-col items-center leading-tight transition-transform cursor-pointer"
                                >
                                    <Send className="w-4 h-4 mb-0.5" />
                                    <span>Inspect ({capturedImages.length})</span>
                                </button>
                            ) : (
                                <div className="w-16" />
                            )}
                        </div>
                    </div>
                )}

                {/* Inactive Camera Offline State */}
                {!isActive && (
                    <div className="text-slate-500 flex flex-col items-center text-center p-4">
                        <CameraOff className="w-12 h-12 mb-2 opacity-40 text-slate-400" />
                        <p className="text-sm font-medium">Camera Feed Offline</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs">
                            Launch live camera viewfinder to capture packaging evidence panels under Section 36.
                        </p>
                    </div>
                )}

                {/* Desktop Camera Flip Button */}
                {isActive && (
                    <button
                        type="button"
                        onClick={flipCamera}
                        title="Flip camera (front / rear)"
                        className="hidden md:flex absolute top-4 right-4 items-center gap-1.5 px-3 py-1.5 bg-black/65 hover:bg-black/85 rounded-full text-white backdrop-blur-sm transition-all shadow-md cursor-pointer z-10 text-xs font-semibold"
                    >
                        <FlipHorizontal className="w-4 h-4" />
                        <span>{facingMode === 'user' ? 'Front Cam' : 'Rear Cam'}</span>
                    </button>
                )}

                <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Captured Dossier Ribbon (Desktop & Mobile Inactive) */}
            {capturedImages.length > 0 && (
                <div className="flex flex-col gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                    <div className="text-xs font-semibold text-slate-400 flex justify-between items-center">
                        <span>PACKAGE DOSSIER ({capturedImages.length})</span>
                        <span className="text-emerald-400 font-mono text-[11px]">Multi-Surface Analysis Ready</span>
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

            {/* Standard Action Strip (Desktop + Inactive Mobile) */}
            <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 justify-center items-stretch sm:items-center">
                {!isActive ? (
                    <button
                        type="button"
                        onClick={() => startCamera()}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition cursor-pointer shadow-xs active:scale-95"
                    >
                        <Camera className="w-4 h-4" /> Start Camera
                    </button>
                ) : (
                    <div className="hidden md:flex gap-2 flex-1">
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

                <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition cursor-pointer border border-slate-700 active:scale-95">
                    <Upload className="w-4 h-4" /> Upload
                    <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
                </label>
                
                {capturedImages.length > 0 && (
                    <button
                        type="button"
                        onClick={submitDossier}
                        disabled={isLoading}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white rounded-lg text-sm font-bold transition shadow-xs sm:ml-auto cursor-pointer active:scale-95"
                    >
                        {isLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Submit Dossier ({capturedImages.length})</>}
                    </button>
                )}
            </div>

            {/* Interactive Crop Modal (Sequential Flow) */}
            <ImageCropModal
                isOpen={cropImageSrc !== null}
                imageSrc={cropImageSrc || ''}
                title={cropTargetIndex !== null ? `Crop Surface ${cropTargetIndex + 1}` : `Crop Captured Surface ${capturedImages.length + 1}`}
                panelLabel={cropTargetIndex !== null ? `Surface ${cropTargetIndex + 1}` : currentPanelLabel}
                onConfirmCrop={handleCropConfirmed}
                onConfirmCropAndNext={handleCropAndNext}
                onConfirmCropAndFinish={handleCropAndFinish}
                onCancel={() => {
                    setCropImageSrc(null);
                    setCropTargetIndex(null);
                }}
            />
        </div>
    );
}
