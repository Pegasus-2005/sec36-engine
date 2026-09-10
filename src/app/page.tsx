'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { DocketRepository } from '../components/audit/DocketRepository';
import { CameraScanner } from '../components/scanner/CameraScanner';
import { BoundingBoxOverlay } from '../components/scanner/BoundingBoxOverlay';
import { Form1NoticeGenerator } from '../components/pdf/Form1NoticeGenerator';
import { StatutorySearch } from '../components/StatutorySearch';
import { ImageCropModal } from '../components/scanner/ImageCropModal';
import { StatutoryGazetteModal } from '../components/gov/StatutoryGazetteModal';
import { InspectionAuditResult, ExtractedDeclarations, DocketEntry, ViolationRecord } from '../types/metrology';
import { StatutoryRuleEngine } from '../lib/metrology/ruleEngine';
import {
  AlertTriangle,
  CheckCircle,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
  Camera,
  Upload,
  Globe,
  Loader2,
  FileText,
  ChevronRight,
  Scale,
  LogIn,
  Eye,
  EyeOff,
  User,
  Pencil,
  X,
  BookOpen,
  Clock,
  Sun,
  Moon,
  ExternalLink,
  Volume2,
  VolumeX,
  Layers,
  Menu,
  Archive,
  LogOut,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// NIC UXDT design tokens (uxdt.nic.in)
// ---------------------------------------------------------------------------
const NIC_BLUE = '#0055A4';
const NIC_BG = '#F8F9FA';
const NIC_BORDER = '#cccccc';
const GOI_AMBER = '#FF9933';
const GOI_GREEN = '#138808';
const GOI_GOLD = '#C8952A';

// ---------------------------------------------------------------------------
// Offline demo mock data — realistic LM(PC) Rules 2011 scenario
// ---------------------------------------------------------------------------

const MOCK_EXTRACTED: ExtractedDeclarations = {
  commodity_name: { raw_text: 'Fortified Biscuits (Glucose Type)', is_detected: true, box_2d: { ymin: 80, xmin: 200, ymax: 130, xmax: 820 } },
  manufacturer: { raw_text: 'Britannia Industries Ltd., 5A, Lawrence Road Industrial Area, New Delhi – 110035', is_detected: true, has_pin_code: true, has_state_or_city: true, box_2d: { ymin: 720, xmin: 40, ymax: 820, xmax: 680 } },
  net_quantity: { raw_text: '100 g', numeric_value: 100, unit: 'g', is_standard_unit: true, has_space_separation: true, box_2d: { ymin: 150, xmin: 60, ymax: 200, xmax: 280 } },
  mrp: { raw_text: 'MRP ₹ 20', numeric_value: 20, currency: '₹', has_inclusive_of_taxes: false, box_2d: { ymin: 820, xmin: 600, ymax: 880, xmax: 960 } },
  unit_sale_price: { raw_text: '₹ 0.20 per g', is_declared: true, price_per_unit: 0.20, unit: 'g' },
  mfg_or_import_date: { raw_text: 'Mfg: SEP 2026', is_detected: true, month: 9, year: 2026, box_2d: { ymin: 870, xmin: 40, ymax: 910, xmax: 280 } },
  expiry_or_best_before: { raw_text: 'BB: SEP 2027', is_detected: true, is_declared: true, box_2d: { ymin: 870, xmin: 300, ymax: 910, xmax: 530 } },
  consumer_care: { raw_text: 'Consumer Care: 1800-103-1901', has_phone: true, has_email: false, phone: '1800-103-1901', box_2d: { ymin: 920, xmin: 40, ymax: 960, xmax: 580 } },
  country_of_origin: { raw_text: '', is_detected: false },
  dimensions: { raw_text: '', is_declared: false },
  is_industrial_institutional: false,
  language_compliance: { is_english_or_hindi: true, detected_languages: 'English' },
  tampering_detected: { is_tampered: false, description: '' },
  is_declarations_grouped: true,
  readability_issues: '',
  package_pdp_box: { ymin: 0, xmin: 0, ymax: 1, xmax: 1 },
  is_fast_food_exemption: false,
  is_scheduled_drug_exemption: false,
  is_e_commerce: false,
  registration: { raw_text: '', is_detected: false }
};

const MOCK_AUDIT: InspectionAuditResult = {
  inspection_id: 'INSP-WB-2026-904',
  timestamp: new Date().toISOString(),
  overall_status: 'NON_COMPLIANT',
  compliance_score: 71,
  total_rules_checked: 7,
  passed_rules: [
    "LM-R6(1)(b): Generic Commodity Name Declared — 'Fortified Biscuits (Glucose Type)'",
    "LM-R6(1)(c): Legal Metric Unit 'g' with Correct Space Separation",
    "LM-R6(1)(d): Month & Year of Manufacture Valid — SEP 2026",
    "LM-R6(1)(da): Expiry / Best Before Date Declared — SEP 2027",
  ],
  violations: [
    { rule: 'MRP Tax Clause Missing', statutory_citation: 'LM-R6(1)(e)', severity: 'MAJOR', message: "MRP of ₹20 is present but the mandatory statutory phrase 'inclusive of all taxes' is absent from the label.", remedial_action: "Print 'incl. of all taxes' or 'inclusive of all taxes' immediately adjacent to the MRP figure on the PDP." },
    { rule: 'Country of Origin Absent', statutory_citation: 'LM-R6(1)(aa)', severity: 'CRITICAL', message: 'Country of origin declaration is completely absent on the packaging label.', remedial_action: "Declare Country of Origin prominently on Principal Display Panel (e.g. 'Made in India')." },
    { rule: 'Consumer Care Email Missing', statutory_citation: 'LM-R6(2)', severity: 'CRITICAL', message: 'Consumer grievance redressal email address is not declared. Mandatory under Rule 6(2) read with the 2022 Amendment.', remedial_action: 'Provide a valid statutory consumer redressal email address on the package label.' },
  ],
  extracted_data: MOCK_EXTRACTED,
};

// Demo platform URLs
const PLATFORM_URLS: { label: string; url: string }[] = [
  { label: 'Blinkit', url: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/products/full_img/519866_1.jpg' },
  { label: 'Zepto', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Parle_G.jpg/480px-Parle_G.jpg' },
  { label: 'Amazon', url: 'https://m.media-amazon.com/images/I/81S0BInQNtL.jpg' },
  { label: 'Flipkart', url: 'https://rukminim2.flixcart.com/image/416/416/xif0q/noodle/e/y/u/420-2-minute-noodles-masala-tastemaker-4-pack-maggi-original-imah55zdbzegp7ck.jpeg' },
];

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------



/** State Emblem of India (Ashoka Lion Capital) — Authentic Government Standard SVG */
function AshokaEmblem({ size = 56 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center select-none" style={{ width: size }}>
      <svg width={size} height={size * 1.15} viewBox="0 0 100 115" fill="none" aria-label="State Emblem of India" role="img">
        {/* Central Lion Head */}
        <path d="M50 12 C44 12 40 16 40 22 C40 26 43 30 45 32 C43 35 42 39 42 43 C42 46 44 49 50 49 C56 49 58 46 58 43 C58 39 57 35 55 32 C57 30 60 26 60 22 C60 16 56 12 50 12 Z" fill="#B37D14" />
        {/* Left Lion Head */}
        <path d="M36 20 C31 20 28 23 27 28 C26 32 29 36 31 38 C29 41 29 44 30 48 C32 50 36 51 40 50 C39 46 38 42 39 38 C37 36 36 33 36 29 Z" fill="#B37D14" opacity="0.9" />
        {/* Right Lion Head */}
        <path d="M64 20 C69 20 72 23 73 28 C74 32 71 36 69 38 C71 41 71 44 70 48 C68 50 64 51 60 50 C61 46 62 42 61 38 C63 36 64 33 64 29 Z" fill="#B37D14" opacity="0.9" />

        {/* Eyes & Mane details */}
        <circle cx="47" cy="22" r="1.2" fill="#FFFFFF" />
        <circle cx="53" cy="22" r="1.2" fill="#FFFFFF" />
        <path d="M46 22 Q50 18 54 22 Q50 26 46 22" stroke="#8C5E09" strokeWidth="1.2" fill="none" />
        <path d="M48 27 Q50 29 52 27" stroke="#664404" strokeWidth="1" fill="none" />

        {/* Abacus Platform */}
        <rect x="22" y="52" width="56" height="5" rx="1" fill="#8C5E09" />
        <rect x="18" y="57" width="64" height="14" rx="1.5" fill="#B37D14" />

        {/* Ashoka Chakra in Center of Abacus */}
        <circle cx="50" cy="64" r="5.5" stroke="#FFFFFF" strokeWidth="1.2" fill="#0055A4" />
        <circle cx="50" cy="64" r="1.5" fill="#FFFFFF" />
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i * 15 * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={50}
              y1={64}
              x2={50 + 5.5 * Math.sin(angle)}
              y2={64 - 5.5 * Math.cos(angle)}
              stroke="#FFFFFF"
              strokeWidth="0.6"
            />
          );
        })}

        {/* Horse & Bull silhouetted accents */}
        <path d="M26 62 Q29 60 32 63 Q30 67 27 66 Z" fill="#FFFFFF" opacity="0.85" />
        <path d="M74 62 Q71 60 68 63 Q70 67 73 66 Z" fill="#FFFFFF" opacity="0.85" />

        {/* Inverted Lotus Base */}
        <path d="M24 71 L76 71 C73 78 65 83 50 83 C35 83 27 78 24 71 Z" fill="#8C5E09" />
        <rect x="16" y="83" width="68" height="3" rx="1" fill="#664404" />

        {/* Satyameva Jayate Motto */}
        <text x="50" y="98" textAnchor="middle" fontSize="8.5" fontWeight="bold" fill="#0055A4" fontFamily="'Noto Serif Devanagari', Georgia, serif">
          सत्यमेव जयते
        </text>
      </svg>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: 'CRITICAL' | 'MAJOR' | 'MODERATE' }) {
  const map = { CRITICAL: 'bg-red-100 border-red-500 text-red-800', MAJOR: 'bg-yellow-100 border-yellow-500 text-yellow-800', MODERATE: 'bg-blue-100 border-blue-400 text-blue-800' };
  return <span className={`inline-block px-1.5 py-0.5 rounded-sm border text-[9px] font-bold tracking-widest ${map[severity]}`}>{severity}</span>;
}



// ---------------------------------------------------------------------------
// Authenticated UXDT Dashboard
// ---------------------------------------------------------------------------

type InputTab = 'camera' | 'upload' | 'url';

type MainView = 'terminal' | 'repository';

export default function Dashboard() {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<InspectionAuditResult | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [voiceHudEnabled, setVoiceHudEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<InputTab>('camera');
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [activeNav, setActiveNav] = useState('Field Inspection');
  const [mainView, setMainView] = useState<MainView>('terminal');
  const [docketHistory, setDocketHistory] = useState<DocketEntry[]>([]);
  const [amendModalOpen, setAmendModalOpen] = useState(false);
  const [draft, setDraft] = useState<ExtractedDeclarations | null>(null);
  const [invalidImageError, setInvalidImageError] = useState<string | null>(null);
  const [activeDossierIndex, setActiveDossierIndex] = useState(0);
  const [uploadCropSrc, setUploadCropSrc] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'surveillance' | 'audit'>('surveillance');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Dynamic Officer Identity State ──────────────────────────────
  const [officerName, setOfficerName] = useState<string>('Debayan Thakur, LMO');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('emaap_officer_name');
      if (stored && stored.trim()) {
        setOfficerName(stored.trim());
      }
    }
  }, []);

  const officerInitials = useMemo(() => {
    const clean = officerName.replace(/,.*$/, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return (clean.slice(0, 2) || 'LMO').toUpperCase();
  }, [officerName]);

  const officerEmail = useMemo(() => {
    const clean = officerName.replace(/,.*$/, '').trim().toLowerCase();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}.${parts[parts.length - 1]}@nic.in`;
    }
    return `${clean.replace(/[^a-z0-9]/g, '') || 'officer'}@nic.in`;
  }, [officerName]);

  // ── GIGW 3.0 Accessibility & Localization States ───────────────
  const [fontScale, setFontScale] = useState<'sm' | 'md' | 'lg'>('md');
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [currentTime, setCurrentTime] = useState('');
  const [gazetteModalOpen, setGazetteModalOpen] = useState(false);

  // ── Live Indian Standard Time (IST) Clock ──────────────────────
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };
      try {
        const formatted = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', options).format(now);
        setCurrentTime(`${formatted} IST`);
      } catch {
        setCurrentTime(`${now.toLocaleTimeString()} IST`);
      }
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [lang]);

  // ── Dynamic Font Scaling Effect (GIGW 3.0 Requirement) ─────────
  useEffect(() => {
    document.documentElement.classList.remove('font-scale-sm', 'font-scale-md', 'font-scale-lg');
    document.documentElement.classList.add(`font-scale-${fontScale}`);
  }, [fontScale]);

  // ── High-Contrast Sunlight Field Mode Effect ───────────────────
  useEffect(() => {
    if (isHighContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [isHighContrast]);

  // ── Load persisted docket history from API ─────────────────────
  const fetchDockets = () => {
    fetch('/api/dockets')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.dockets)) {
          setDocketHistory(data.dockets);
        }
      })
      .catch(() => { /* ignore */ });
  };

  useEffect(() => {
    fetchDockets();
  }, []);

  const handleDeleteDocket = async (id: string) => {
    try {
      const res = await fetch(`/api/dockets?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchDockets();
      }
    } catch (e) {
      console.error('Failed to delete docket:', e);
    }
  };

  const handleClearAllDockets = async () => {
    try {
      const res = await fetch('/api/dockets?all=true', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setDocketHistory([]);
      }
    } catch (e) {
      console.error('Failed to clear all dockets:', e);
    }
  };

  const createOptimizedThumb = async (raw?: string): Promise<string | undefined> => {
    if (!raw) return undefined;
    if (!raw.startsWith('data:image')) return raw;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const maxDim = 800;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(raw); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(raw);
      img.src = raw;
    });
  };

  // ── Append new audit to docket ledger ───────────────────────────────────
  const appendToDocket = async (result: InspectionAuditResult, imageThumb?: string) => {
    const thumb = await createOptimizedThumb(imageThumb);
    const commodity = result.extracted_data.commodity_name?.raw_text || 'Unknown Commodity';
    const manufacturer = result.extracted_data.manufacturer?.raw_text || 'Unknown Manufacturer';
    const entry: DocketEntry = {
      result,
      commodityLabel: commodity || 'Unidentified Packaged Commodity',
      manufacturerLabel: manufacturer || 'Manufacturer Not Declared',
      imageThumb: thumb,
    };
    setDocketHistory((prev) => [entry, ...prev].slice(0, 100)); // optimistic UI update
    try {
      await fetch('/api/dockets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (err) {
      console.error('Failed to persist docket entry to /api/dockets:', err);
    }
  };


  // ── Core audit dispatcher ─────────────────────────────────────────────────
  const speakAuditResult = (audit: InspectionAuditResult) => {
    if (!voiceHudEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const critical = audit.violations.filter(v => v.severity === 'CRITICAL');

    let text = `Inspection complete. Status: ${audit.overall_status.replace('_', ' ')}. `;
    if (audit.violations.length === 0) {
      text += "The package is fully compliant.";
    } else {
      text += `${audit.violations.length} violations detected. `;
      if (critical.length > 0) {
        text += `Warning: ${critical.length} critical violations found. `;
        critical.forEach((v, i) => {
          text += `Critical issue ${i + 1}: ${v.rule}. `;
        });
      }
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const handleApplyFontMeasurement = (result: {
    measuredMm: number;
    requiredMm: number;
    isCompliant: boolean;
    ratio: number;
  }) => {
    if (!auditResult) return;
    const updatedAudit: InspectionAuditResult = {
      ...auditResult,
      violations: [...auditResult.violations],
      passed_rules: [...auditResult.passed_rules],
    };
    const citation = 'LM-R7(1)';

    if (!result.isCompliant) {
      const rule7Violation: ViolationRecord = {
        rule: 'Declaration Font Height Non-Compliant',
        statutory_citation: citation,
        severity: 'MAJOR',
        message: `Measured declaration font height (${result.measuredMm} mm) is below the statutory minimum of ${result.requiredMm} mm prescribed under Table I/II of Rule 7 of Legal Metrology (Packaged Commodities) Rules, 2011.`,
        remedial_action: `Increase declaration numeral and letter font height to at least ${result.requiredMm} mm to meet Rule 7 standards.`,
      };
      const filtered = updatedAudit.violations.filter(v => v.statutory_citation !== citation);
      updatedAudit.violations = [rule7Violation, ...filtered];
      updatedAudit.passed_rules = updatedAudit.passed_rules.filter(r => !r.startsWith(citation));
      updatedAudit.overall_status = 'NON_COMPLIANT';
      updatedAudit.compliance_score = Math.max(10, Math.min(85, updatedAudit.compliance_score - 15));
    } else {
      updatedAudit.violations = updatedAudit.violations.filter(v => v.statutory_citation !== citation);
      const passNotice = `${citation}: Declaration font height verified compliant (${result.measuredMm} mm satisfies statutory minimum ${result.requiredMm} mm)`;
      if (!updatedAudit.passed_rules.some(r => r.startsWith(citation))) {
        updatedAudit.passed_rules = [passNotice, ...updatedAudit.passed_rules];
      }
      if (updatedAudit.violations.length === 0) {
        updatedAudit.overall_status = 'COMPLIANT';
        updatedAudit.compliance_score = 100;
      }
    }
    setAuditResult(updatedAudit);
    appendToDocket(updatedAudit, capturedImages[activeDossierIndex] || capturedImages[0]);

    if (voiceHudEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const msg = result.isCompliant
        ? `Rule 7 Font height verified compliant at ${result.measuredMm} millimeters.`
        : `Rule 7 Font height infraction flagged. Measured ${result.measuredMm} millimeters is below statutory required ${result.requiredMm} millimeters.`;
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(msg));
    }
  };

  const runAudit = async (base64Images: string[]) => {
    setIsAuditing(true);
    setCapturedImages(base64Images);
    setActiveDossierIndex(0);
    setAuditResult(null);
    setInvalidImageError(null);
    setMainView('terminal');

    if (isDemoMode) {
      await new Promise<void>((res) => setTimeout(res, 1200));
      const demoResult = { ...MOCK_AUDIT, timestamp: new Date().toISOString() };
      setAuditResult(demoResult);
      setMobileTab('audit');
      appendToDocket(demoResult, base64Images[0]);
      speakAuditResult(demoResult);
      setIsAuditing(false);
      return;
    }

    try {
      const res  = await fetch('/api/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: base64Images }) });
      const data = await res.json();
      if (data.invalid_image) {
        // Phase-1 validation rejected the image
        setInvalidImageError(data.reason ?? 'The image does not appear to be a packaged commodity.');
        setMobileTab('audit');
      } else if (data.success) {
        setAuditResult(data.audit);
        setMobileTab('audit');
        appendToDocket(data.audit, base64Images[0]);
        speakAuditResult(data.audit);
      } else {
        console.error('Audit API error:', data.error);
        setInvalidImageError('Inspection failed. Please try again or enable Offline Demo Mode.');
        setMobileTab('audit');
      }
    } catch (err) {
      console.error('Network error:', err);
      setInvalidImageError('Network error — cannot reach the inspection service.');
      setMobileTab('audit');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleScan = (imgs: string[]) => runAudit(imgs);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadCropSrc(reader.result);
      }
    };
    reader.readAsDataURL(files[0]);
    e.target.value = '';
  };

  const handleUrlAudit = async () => {
    setUrlError('');
    if (!urlInput.trim()) { setUrlError('Please enter a valid product image URL.'); return; }
    setIsFetchingUrl(true);
    try {
      const res = await fetch(`/api/fetch-image?url=${encodeURIComponent(urlInput.trim())}`);
      const data = await res.json();
      if (!data.success) { setUrlError(data.error ?? 'Failed to fetch image.'); return; }
      await runAudit([data.dataUri]);
    } catch {
      setUrlError('Network error while fetching image. Please try again.');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleLoadSample = async () => {
    try {
      setIsAuditing(true);
      const res = await fetch('/fallback-chips.jpg');
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        runAudit([base64]);
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error('Failed to load sample image:', e);
      setIsAuditing(false);
    }
  };

  const tabs: { id: InputTab; label: string; icon: React.ReactNode }[] = [
    { id: 'camera', label: 'Live Camera Surveillance', icon: <Camera className="w-3.5 h-3.5" /> },
    { id: 'upload', label: 'Upload Package / Digital Evidence', icon: <Upload className="w-3.5 h-3.5" /> },
  ];



  const statusCfg = auditResult
    ? auditResult.overall_status === 'COMPLIANT'
      ? { icon: <CheckCircle className="w-5 h-5 shrink-0 text-green-700" />, label: 'COMPLIANT — Package Legally Marketable', scoreBarColor: '#16a34a', bannerClass: 'bg-green-50 border-green-300' }
      : auditResult.overall_status === 'NON_COMPLIANT'
        ? { icon: <AlertTriangle className="w-5 h-5 shrink-0 text-red-700" />, label: 'NON-COMPLIANT — Compoundable Offence Detected', scoreBarColor: '#dc2626', bannerClass: 'bg-red-50 border-red-300' }
        : { icon: <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-700" />, label: 'ACTION REQUIRED — Non-Critical Violations', scoreBarColor: '#d97706', bannerClass: 'bg-yellow-50 border-yellow-300' }
    : null;

  // ── NIC UXDT flat card style ──────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: `1px solid ${NIC_BORDER}`,
    borderRadius: '2px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };

  const ribbonStyle: React.CSSProperties = {
    backgroundColor: NIC_BLUE,
    color: '#FFFFFF',
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '13px',
    fontWeight: 600,
  };

  // Find habitual offender status
  const habitualOffenderDockets = auditResult && auditResult.extracted_data.manufacturer?.raw_text
    ? docketHistory.filter(d =>
      d.result.inspection_id !== auditResult.inspection_id && // don't count itself
      d.result.overall_status !== 'COMPLIANT' &&
      d.manufacturerLabel === auditResult.extracted_data.manufacturer?.raw_text
    )
    : [];
  const isHabitualOffender = habitualOffenderDockets.length > 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: NIC_BG, color: '#1a1a1a' }}>

      {/* ── Tricolor strip ──────────────────────────────────────────────── */}
      <div className="nic-header-accent" />

      {/* ── Mobile Native App Bar (Visible on < lg screens) ────────────────── */}
      <div className="lg:hidden sticky top-0 z-40 bg-[#0055A4] text-white shadow-md">
        <div className="flex items-center justify-between px-3.5 py-2.5">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <AshokaEmblem size={30} />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-white leading-none">eMaap 2.0</span>
                <span className="text-[9px] bg-emerald-500/30 text-emerald-300 font-mono font-bold px-1.5 py-0.5 rounded-xs border border-emerald-400/40 leading-none">SEC 36</span>
              </div>
              <p className="text-[9px] text-blue-100/80 leading-tight mt-0.5">Dept. of Consumer Affairs · GoI</p>
            </div>
          </div>

          {/* Quick Controls: Mode Badge + Drawer Menu */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDemoMode(!isDemoMode)}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-white/15 text-white border border-white/20 active:scale-95 transition-all cursor-pointer"
              title="Toggle Live Cloud AI vs Offline Demo"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isDemoMode ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
              <span>{isDemoMode ? 'Demo' : 'Live AI'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 active:scale-95 text-white text-xs font-bold px-2 py-1 rounded-xs border border-white/20 transition-all cursor-pointer"
              aria-label="Open Officer Menu"
            >
              <div className="w-5 h-5 rounded-full bg-white text-[#0055A4] flex items-center justify-center text-[10px] font-black">
                {officerInitials}
              </div>
              <Menu className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3-Tab Segment Selector (Fixed Header) */}
        <div className="flex bg-[#004080] border-t border-white/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMainView('terminal');
              setMobileTab('surveillance');
            }}
            className={`flex-1 py-2 text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mainView === 'terminal' && mobileTab === 'surveillance'
                ? 'bg-white text-[#0055A4] font-bold shadow-xs'
                : 'text-blue-100 hover:bg-white/5'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Surveillance</span>
            {capturedImages.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#0055A4] text-white font-mono font-bold">
                {capturedImages.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setMainView('terminal');
              setMobileTab('audit');
            }}
            className={`flex-1 py-2 text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mainView === 'terminal' && mobileTab === 'audit'
                ? 'bg-white text-[#0055A4] font-bold shadow-xs'
                : 'text-blue-100 hover:bg-white/5'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Statutory Audit</span>
            {auditResult && (
              <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-black text-white ${
                auditResult.overall_status === 'COMPLIANT' ? 'bg-emerald-600' : 'bg-red-600'
              }`}>
                {auditResult.overall_status === 'COMPLIANT' ? 'PASS' : 'FLAG'}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMainView('repository')}
            className={`flex-1 py-2 text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mainView === 'repository'
                ? 'bg-white text-[#0055A4] font-bold shadow-xs'
                : 'text-blue-100 hover:bg-white/5'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Ledger</span>
            {docketHistory.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-900 font-mono font-bold">
                {docketHistory.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Utility bar (GIGW 3.0 Accessibility & Rajbhasha Compliance) (DESKTOP ONLY) ───── */}
      <div
        className="hidden lg:flex flex-wrap justify-between items-center px-6 py-1.5 text-[11px] gap-2"
        style={{ backgroundColor: NIC_BG, borderBottom: `1px solid ${NIC_BORDER}`, color: '#333333' }}
      >
        <div className="flex items-center gap-3">
          <span>
            <strong>{lang === 'hi' ? 'भारत सरकार' : 'Government of India'}</strong> &nbsp;·&nbsp;
            <span>{lang === 'hi' ? 'उपभोक्ता मामले विभाग' : 'Department of Consumer Affairs'}</span>
          </span>
          <span style={{ color: NIC_BORDER }}>|</span>
          {/* Live IST Clock */}
          <span className="font-mono text-[10px] text-slate-700 flex items-center gap-1.5 bg-slate-200/60 px-2 py-0.5 rounded-xs">
            <Clock className="w-3 h-3 text-[#0055A4]" />
            {currentTime || 'IST Live Time'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a href="#main" className="underline hover:no-underline text-[10px]">
            {lang === 'hi' ? 'मुख्य सामग्री पर जाएं' : 'Skip to Main Content'}
          </a>
          <span style={{ color: NIC_BORDER }}>|</span>

          {/* GIGW 3.0 Font Sizing Controls */}
          <div className="flex items-center gap-0.5 border rounded-xs overflow-hidden" style={{ borderColor: NIC_BORDER }}>
            {(['sm', 'md', 'lg'] as const).map((sizeKey) => {
              const label = sizeKey === 'sm' ? 'A-' : sizeKey === 'md' ? 'A' : 'A+';
              const active = fontScale === sizeKey;
              return (
                <button
                  key={sizeKey}
                  onClick={() => setFontScale(sizeKey)}
                  title={`Font Size ${label}`}
                  className="px-2 py-0.5 text-[10px] font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? NIC_BLUE : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#333333',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* High-Contrast / Sunlight Field Mode Toggle */}
          <button
            onClick={() => setIsHighContrast(!isHighContrast)}
            title="Toggle High Contrast Sunlight Mode for Field Inspection"
            className="flex items-center gap-1 px-2 py-0.5 border rounded-xs text-[10px] font-semibold transition-colors"
            style={{
              borderColor: NIC_BORDER,
              backgroundColor: isHighContrast ? '#0B192C' : '#FFFFFF',
              color: isHighContrast ? '#F8FAFC' : '#333333',
            }}
          >
            {isHighContrast ? <Sun className="w-3 h-3 text-amber-400" /> : <Moon className="w-3 h-3 text-slate-600" />}
            <span>{isHighContrast ? (lang === 'hi' ? 'सामान्य मोड' : 'Standard') : (lang === 'hi' ? 'उच्च कंट्रास्ट' : 'High Contrast')}</span>
          </button>

          {/* Bilingual Switcher */}
          <div className="flex border rounded-xs overflow-hidden text-[10px]" style={{ borderColor: NIC_BORDER }}>
            {(['hi', 'en'] as const).map((lCode) => {
              const label = lCode === 'hi' ? 'हिन्दी' : 'English';
              const active = lang === lCode;
              return (
                <button
                  key={lCode}
                  onClick={() => setLang(lCode)}
                  className="px-2.5 py-0.5 font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? NIC_BLUE : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#333333',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Branding header (DESKTOP ONLY) ─────────────────────────────── */}
      <header
        className="hidden lg:flex px-6 py-2.5 items-center justify-between"
        style={{ backgroundColor: '#FFFFFF', borderBottom: `1px solid ${NIC_BORDER}` }}
      >
        {/* Left: Emblem + brand text */}
        <div className="flex items-center gap-3.5">
          <AshokaEmblem size={46} />
          <div>
            <p className="text-[10px] text-slate-500 leading-snug font-semibold uppercase tracking-wider">
              {lang === 'hi' ? 'उपभोक्ता मामले, खाद्य और सार्वजनिक वितरण मंत्रालय' : 'Ministry of Consumer Affairs, Food & Public Distribution'}
            </p>
            <h1 className="text-lg font-bold leading-tight mt-0.5" style={{ color: NIC_BLUE }}>
              {lang === 'hi' ? 'उपभोक्ता मामले विभाग / ई-माप 2.0' : 'Department of Consumer Affairs / eMaap 2.0'}
            </h1>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {lang === 'hi'
                ? 'राष्ट्रीय विधिक मापविज्ञान निगरानी एवं प्रवर्तन प्रणाली — नियमावली, 2011'
                : 'National Inspection & Section 36 Enforcement Portal — Legal Metrology (Packaged Commodities) Rules, 2011'}
            </p>
          </div>
        </div>

        {/* Right: Officer profile + controls in a sleek, compact layout */}
        <div className="flex items-center gap-3">
          {/* Officer profile card */}
          <div
            className="text-xs px-3 py-1.5 flex items-center gap-2.5 border rounded-xs"
            style={{ borderColor: NIC_BORDER, backgroundColor: NIC_BG }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs"
              style={{ backgroundColor: NIC_BLUE }}
            >
              {officerInitials}
            </div>
            <div>
              <p className="font-bold text-gray-800 text-[11px] leading-tight flex items-center gap-1">
                <User className="w-2.5 h-2.5" style={{ color: NIC_BLUE }} />
                <span>{officerName}</span>
              </p>
              <p className="text-[9px] text-gray-500 leading-tight mt-0.5">
                Inspector, Legal Metrology (Zone-4) · <span className="font-mono text-slate-700">Circle 04</span>
              </p>
              <p className="text-[9px] flex items-center gap-1 font-semibold leading-tight mt-0.5" style={{ color: '#16a34a' }}>
                <ShieldCheck className="w-2.5 h-2.5" />
                <span>Jan Parichay SSO · {officerEmail}</span>
              </p>
            </div>
          </div>

          {/* Action Strip: Mode Switcher, Voice HUD, Logout */}
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              {/* Segmented Mode Selector */}
              <div
                className="flex items-center border rounded-xs overflow-hidden text-[11px] font-semibold"
                style={{ borderColor: NIC_BORDER, backgroundColor: '#FFFFFF' }}
              >
                <button
                  type="button"
                  onClick={() => setIsDemoMode(false)}
                  className="flex items-center gap-1.5 px-2 py-1 transition-colors"
                  style={{
                    backgroundColor: !isDemoMode ? '#DCFCE7' : '#FFFFFF',
                    color: !isDemoMode ? '#15803D' : '#6B7280',
                    borderRight: `1px solid ${NIC_BORDER}`,
                  }}
                  title="Real-time multimodal inspection with live Gemini AI"
                >
                  <Wifi className="w-3 h-3 text-emerald-600" />
                  <span>Live Cloud AI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDemoMode(true)}
                  className="flex items-center gap-1.5 px-2 py-1 transition-colors"
                  style={{
                    backgroundColor: isDemoMode ? '#FEF3C7' : '#FFFFFF',
                    color: isDemoMode ? '#B45309' : '#6B7280',
                  }}
                  title="Offline simulation with mock data"
                >
                  <WifiOff className="w-3 h-3 text-amber-600" />
                  <span>Offline Demo</span>
                </button>
              </div>

              {/* Voice HUD toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !voiceHudEnabled;
                  setVoiceHudEnabled(next);
                  if (next && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    const u = new SpeechSynthesisUtterance("Voice HUD activated.");
                    window.speechSynthesis.speak(u);
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold border rounded-xs transition-colors"
                style={voiceHudEnabled
                  ? { backgroundColor: '#E0F2FE', borderColor: '#0284C7', color: '#0369A1' }
                  : { backgroundColor: '#F3F4F6', borderColor: NIC_BORDER, color: '#6B7280' }}
                title="Audible statutory infraction readout"
              >
                {voiceHudEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                <span>Voice HUD</span>
              </button>
            </div>

            {/* Log out */}
            <button
              onClick={() => {
                document.cookie = 'auth_token=; Max-Age=0; path=/;';
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('emaap_officer_name');
                }
                window.location.href = '/login';
              }}
              className="text-[10px] text-slate-500 hover:text-red-700 underline flex items-center gap-1"
            >
              {lang === 'hi' ? 'सुरक्षित लॉगआउट' : 'Secure Logout'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Primary nav bar (DESKTOP ONLY) ─────────────────────────────── */}
      <nav
        className="hidden lg:flex px-6 py-0 items-center justify-between text-sm font-medium"
        style={{ backgroundColor: NIC_BLUE }}
        aria-label="Primary navigation"
      >
        <div className="flex items-center">
          {/* Tab 1 — Active Surveillance Terminal */}
          <button
            onClick={() => setMainView('terminal')}
            className="px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: '#FFFFFF',
              borderBottom: mainView === 'terminal' ? '3px solid #FFFFFF' : '3px solid transparent',
              backgroundColor: mainView === 'terminal' ? 'rgba(255,255,255,0.12)' : 'transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {lang === 'hi' ? 'सक्रिय निगरानी टर्मिनल' : 'Active Surveillance Terminal'}
          </button>

          {/* Tab 2 — National Docket Repository */}
          <button
            onClick={() => setMainView('repository')}
            className="px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
            style={{
              color: '#FFFFFF',
              borderBottom: mainView === 'repository' ? '3px solid #FFFFFF' : '3px solid transparent',
              backgroundColor: mainView === 'repository' ? 'rgba(255,255,255,0.12)' : 'transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {lang === 'hi' ? 'राष्ट्रीय डॉकेट पंजी एवं इतिहास' : 'National Docket Repository & History'}
            {/* Docket count badge */}
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 700,
                backgroundColor: docketHistory.length > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
                color: NIC_BLUE,
                minWidth: 18, height: 18, borderRadius: 9,
              }}
            >
              {docketHistory.length}
            </span>
          </button>
        </div>

        {/* Right Side Nav Utility: Statutory Gazette Quick Reference */}
        <button
          onClick={() => setGazetteModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-xs rounded-xs shadow-xs transition-colors"
          title="Open Statutory Gazette Notifications and Acts reference"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{lang === 'hi' ? 'राजपत्र अधिसूचनाएं (क़ानूनी संदर्भ)' : 'Statutory Gazette & Rulebook'}</span>
        </button>
      </nav>

      {/* ── Main workspace ──────────────────────────────────────────────── */}
      <main id="main" className="flex-1 p-2 sm:p-5 md:p-6">

        {/* Demo banner */}
        {isDemoMode && (
          <div
            className="flex items-center gap-3 px-4 py-2.5 mb-4 text-xs font-medium"
            style={{ backgroundColor: '#fffbeb', border: `1px solid #d97706`, color: '#92400e', borderRadius: '2px' }}
          >
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              <strong>Offline Simulation Active.</strong> Gemini API is bypassed — mock statutory audit data will inject after 1.2 s.
              Toggle off to restore live cloud inspection.
            </span>
          </div>
        )}

        {/* ── REPOSITORY VIEW ────────────────────────────────────────────── */}
        {mainView === 'repository' && (
          <DocketRepository
            liveDockets={docketHistory}
            onViewAudit={(entry) => {
              setAuditResult(entry.result);
              setCapturedImages(entry.imageThumb ? [entry.imageThumb] : []);
              setMainView('terminal');
              setMobileTab('audit');
            }}
            onDownloadForm1={(_entry) => {
              setAuditResult(_entry.result);
              setCapturedImages(_entry.imageThumb ? [_entry.imageThumb] : []);
              setMainView('terminal');
              setMobileTab('audit');
            }}
            onDeleteAudit={handleDeleteDocket}
            onClearAll={handleClearAllDockets}
            officerName={officerName}
          />
        )}

        {/* ── TERMINAL VIEW ──────────────────────────────────────────────── */}
        {mainView === 'terminal' && (
          <div>
            <div className="grid lg:grid-cols-2 gap-5 items-start">

              {/* ══════════════════════════════════════════════════════════════
                LEFT — Package Surveillance Unit
            ══════════════════════════════════════════════════════════════ */}
              <div style={cardStyle} className={mobileTab === 'audit' ? 'hidden lg:block' : 'block'}>
              {/* Ribbon */}
              <div style={ribbonStyle}>
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 opacity-70" />
                  <span>Physical &amp; Digital Package Surveillance Unit</span>
                </div>
                <span className="text-[10px] font-mono opacity-60 border border-white/20 px-2 py-0.5" style={{ borderRadius: '2px' }}>
                  eMaap 2.0
                </span>
              </div>

              {/* Input tabs */}
              <div className="flex" style={{ borderBottom: `1px solid ${NIC_BORDER}`, backgroundColor: NIC_BG }}>
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap"
                    style={{
                      color: activeTab === tab.id ? NIC_BLUE : '#555555',
                      backgroundColor: activeTab === tab.id ? '#FFFFFF' : 'transparent',
                      borderBottom: activeTab === tab.id ? `2px solid ${NIC_BLUE}` : '2px solid transparent',
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-4 space-y-4">

                {/* Camera */}
                {activeTab === 'camera' && (
                  <CameraScanner onScanComplete={handleScan} isLoading={isAuditing} />
                )}

                {/* Upload */}
                {/* Upload */}
                {activeTab === 'upload' && (
                  <div className="space-y-3">
                    <div
                      className="p-8 text-center cursor-pointer transition-colors"
                      style={{ border: `2px dashed ${NIC_BORDER}`, borderRadius: '2px' }}
                      onClick={() => fileInputRef.current?.click()}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = NIC_BLUE)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = NIC_BORDER)}
                    >
                      <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                      <p className="text-sm font-semibold text-slate-700">Click or Drag to Upload Package Label Image</p>
                      <p className="text-xs text-slate-500 mt-1">Supports physical package photos &amp; e-commerce screenshots (JPEG, PNG, WebP · Max 10 MB)</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileUpload} />

                    {/* Benchmark & E-Commerce SOP Notice */}
                    <div className="flex items-center justify-between p-3 border rounded-xs" style={{ borderColor: NIC_BORDER, backgroundColor: NIC_BG }}>
                      <div className="pr-3">
                        <p className="text-xs font-bold text-gray-800">Rule 6(10) E-Commerce &amp; Benchmark Inspection</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          E-commerce listings (Amazon, Blinkit, Zepto, Flipkart) are audited via listing screenshots under Rule 6(10). Or click to test our standard LMO potato chips benchmark sample.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLoadSample}
                        disabled={isAuditing}
                        className="px-3 py-1.5 text-xs font-bold bg-white border rounded-xs hover:bg-slate-50 transition-colors shrink-0 shadow-xs flex items-center gap-1.5"
                        style={{ borderColor: NIC_BLUE, color: NIC_BLUE }}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Load Test SKU</span>
                      </button>
                    </div>

                    {isAuditing && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: NIC_BLUE }}>
                        <Loader2 className="w-4 h-4 animate-spin" /> Analysing packaging declarations…
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Captured image + bounding box overlay */}
              {capturedImages.length > 0 && (
                <div style={{ borderTop: `1px solid ${NIC_BORDER}` }}>
                  <div
                    className="px-4 py-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest"
                    style={{ backgroundColor: NIC_BG, color: '#555555' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Captured Package Evidence (Dossier: {capturedImages.length})
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCapturedImages([]);
                        setAuditResult(null);
                        setInvalidImageError(null);
                      }}
                      className="flex items-center gap-1 text-[10px] font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 border border-red-200 rounded-xs cursor-pointer transition-colors"
                    >
                      <X className="w-3 h-3" /> Clear Evidence
                    </button>
                  </div>
                  {/* Multi-Surface Dossier Tabs */}
                  {capturedImages.length > 1 && (
                    <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto">
                      <span className="text-[10px] font-bold uppercase text-slate-500 mr-1 flex items-center gap-1 shrink-0">
                        <Layers className="w-3 h-3 text-[#0055A4]" /> Surface:
                      </span>
                      {capturedImages.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveDossierIndex(idx)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-xs border transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${activeDossierIndex === idx
                            ? 'bg-[#0055A4] text-white border-[#0055A4] shadow-xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                          <span>{idx === 0 ? 'Surface 1 (Front PDP)' : `Surface ${idx + 1}`}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Active Surface Viewport with BoundingBoxOverlay & Optical Micrometer */}
                  <div className="p-3">
                    <div className="relative w-full">
                      <BoundingBoxOverlay
                        imageSrc={capturedImages[activeDossierIndex] || capturedImages[0]}
                        declarations={auditResult?.extracted_data}
                        violations={auditResult?.violations || []}
                        surfaceLabel={`Surface ${activeDossierIndex + 1} of ${capturedImages.length}${activeDossierIndex === 0 ? ' · Front PDP' : ''}`}
                        onApplyFontMeasurement={handleApplyFontMeasurement}
                      />
                    </div>

                    {/* Multi-Surface Thumbnail Strip */}
                    {capturedImages.length > 1 && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Inspect Surface Evidence ({capturedImages.length} Packaged Sides):
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {capturedImages.map((thumb, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setActiveDossierIndex(idx)}
                              className={`relative shrink-0 rounded-xs overflow-hidden border-2 transition-all cursor-pointer ${activeDossierIndex === idx
                                ? 'border-[#0055A4] ring-2 ring-blue-200'
                                : 'border-slate-200 hover:border-slate-400 opacity-75 hover:opacity-100'
                                }`}
                              style={{ width: '64px', height: '64px' }}
                            >
                              <img src={thumb} alt={`Surface ${idx + 1}`} className="w-full h-full object-cover" />
                              <span className="absolute bottom-0 inset-x-0 bg-black/75 text-white text-[8px] font-bold text-center py-0.5">
                                {idx === 0 ? 'PDP' : `S${idx + 1}`}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════════
              RIGHT — Statutory Audit under Section 36
          ══════════════════════════════════════════════════════════════ */}
            <div style={cardStyle} className={mobileTab === 'surveillance' ? 'hidden lg:block' : 'block'}>
              {/* Ribbon */}
              <div style={ribbonStyle}>
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 opacity-70" />
                  <span>Statutory Inspection Audit — Section 36</span>
                </div>
                <span className="text-[10px] font-mono opacity-60 border border-white/20 px-2 py-0.5" style={{ borderRadius: '2px' }}>
                  LM Act, 2009
                </span>
              </div>

              <div className="p-5 space-y-4">

                {/* Invalid image rejection */}
                {!auditResult && !isAuditing && invalidImageError && (
                  <div
                    className="p-5 flex flex-col items-center gap-3 text-center"
                    style={{ border: '1px solid #fca5a5', backgroundColor: '#fff5f5', borderRadius: '2px' }}
                  >
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#fee2e2' }}>
                      <AlertTriangle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-800">Invalid Image — Not a Packaged Commodity</p>
                      <p className="text-xs text-red-600 mt-1 max-w-xs">{invalidImageError}</p>
                    </div>
                    <p className="text-[10px] text-gray-400 italic">
                      Please photograph the label or packaging of a manufactured product (e.g. chips packet, shampoo bottle, cereal box) and try again.
                    </p>
                  </div>
                )}

                {/* Empty state */}
                {!auditResult && !isAuditing && !invalidImageError && (
                  <div
                    className="h-72 flex flex-col items-center justify-center gap-3"
                    style={{ border: `2px dashed ${NIC_BORDER}`, borderRadius: '2px' }}
                  >
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EEF4FB' }}>
                      <ShieldAlert className="w-6 h-6" style={{ color: NIC_BLUE }} />
                    </div>
                    <div className="text-center px-6">
                      <p className="text-sm font-semibold text-gray-700">Awaiting Package Scan</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Capture, upload, or fetch a product image to begin compounding offence evaluation under LM(PC) Rules, 2011
                      </p>
                    </div>
                  </div>
                )}

                {/* Loading */}
                {isAuditing && (
                  <div className="h-72 flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: NIC_BLUE }} />
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-800">
                        {isDemoMode ? 'Running Offline Simulation…' : 'Analysing Image…'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {isDemoMode
                          ? 'Injecting mock statutory audit data for offline demonstration'
                          : 'Phase 1: Verifying image is a packaged commodity → Phase 2: OCR extraction → Rule Engine'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Results */}
                {auditResult && statusCfg && (
                  <div className="space-y-4">

                    {/* Case docket */}
                    <div
                      className="p-3 text-[10px] font-mono space-y-1"
                      style={{ backgroundColor: NIC_BG, border: `1px solid ${NIC_BORDER}`, borderRadius: '2px' }}
                    >
                      {[
                        ['INSPECTION DOCKET', auditResult.inspection_id],
                        ['TIMESTAMP (IST)', new Date(auditResult.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
                        ['JURISDICTION', 'Circle 04, Kolkata Central, West Bengal'],
                        ['OFFICER ON RECORD', `${officerName} — ${officerEmail}`],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-4">
                          <span className="text-gray-400">{k}</span>
                          <span className="text-gray-800 font-semibold text-right">{v}</span>
                        </div>
                      ))}
                      {isDemoMode && (
                        <p className="text-center text-amber-600 font-bold pt-0.5">⚠ SIMULATION DATA — NOT FOR OFFICIAL USE</p>
                      )}
                    </div>

                    {isHabitualOffender && (
                      <div className="p-3 flex flex-col gap-1" style={{ backgroundColor: '#fff1f2', border: '1px solid #fda4af', borderRadius: '2px' }}>
                        <div className="flex items-center gap-2 font-bold text-xs text-red-800 tracking-wide">
                          <AlertTriangle className="w-4 h-4 text-red-600" /> HABITUAL OFFENDER DETECTED
                        </div>
                        <p className="text-[10px] text-red-900 leading-snug">
                          This manufacturer has <strong>{habitualOffenderDockets.length}</strong> prior non-compliant records in the National Docket Repository. Flagged for enhanced compounding penalty / prosecution under Section 36(2) of the LM Act, 2009.
                        </p>
                      </div>
                    )}

                    {/* Summons / compliance banner */}
                    <div className={`p-4 ${statusCfg.bannerClass}`} style={{ border: `1px solid`, borderRadius: '2px' }}>
                      {auditResult.overall_status !== 'COMPLIANT' && (
                        <p className="text-[9px] font-bold tracking-widest uppercase text-center mb-2 text-gray-500">
                          Non-Compliance Notice under Section 36, Legal Metrology Act, 2009
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        {statusCfg.icon}
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-900">{statusCfg.label}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ backgroundColor: '#e5e7eb' }}>
                              <div className="h-full rounded-sm transition-all duration-700" style={{ width: `${auditResult.compliance_score}%`, backgroundColor: statusCfg.scoreBarColor }} />
                            </div>
                            <span className="text-sm font-bold font-mono text-gray-800">
                              Compliance Rating: {auditResult.compliance_score}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Form-1 action */}
                    <div className="p-3" style={{ border: `1px solid ${NIC_BORDER}`, backgroundColor: NIC_BG, borderRadius: '2px' }}>
                      <Form1NoticeGenerator auditResult={auditResult} packageImages={capturedImages} officerName={officerName} />
                      {/* ── Review & Amend button ── */}
                      <button
                        onClick={() => {
                          setDraft(JSON.parse(JSON.stringify(auditResult.extracted_data)));
                          setAmendModalOpen(true);
                        }}
                        className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold transition-colors hover:bg-slate-50"
                        style={{ border: `1px solid ${NIC_BLUE}`, color: NIC_BLUE, backgroundColor: '#FFFFFF', borderRadius: '2px' }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Review &amp; Amend Extracted Declarations
                      </button>
                    </div>

                    {/* Violation records */}
                    {auditResult.violations.length > 0 && (
                      <div style={{ border: `1px solid ${NIC_BORDER}`, borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          className="px-4 py-2 flex items-center justify-between"
                          style={{ backgroundColor: '#fff5f5', borderBottom: `1px solid ${NIC_BORDER}` }}
                        >
                          <h3 className="text-[11px] font-bold text-red-800 uppercase tracking-wider">Violation Records</h3>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => speakAuditResult(auditResult)}
                              title="Audibly announce violation findings via Voice HUD"
                              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-white text-red-700 border border-red-300 rounded-xs hover:bg-red-50 transition-colors shadow-xs"
                            >
                              <Volume2 className="w-3 h-3 text-red-600" />
                              <span>Replay Voice HUD</span>
                            </button>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-800" style={{ border: '1px solid #fca5a5', borderRadius: '2px' }}>
                              {auditResult.violations.length} offence{auditResult.violations.length !== 1 ? 's' : ''} found
                            </span>
                          </div>
                        </div>
                        <div>
                          {auditResult.violations.map((v, i) => (
                            <div key={i} className="flex" style={{ borderBottom: i < auditResult.violations.length - 1 ? `1px solid ${NIC_BORDER}` : 'none' }}>
                              {/* Red left accent */}
                              <div style={{ width: 4, backgroundColor: '#dc2626', flexShrink: 0 }} />
                              <div className="flex-1 px-4 py-3">
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <ChevronRight className="w-3 h-3 text-red-600 shrink-0 mt-0.5" />
                                    <span
                                      className="text-[10px] font-bold font-mono px-1.5 py-0.5"
                                      style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '2px' }}
                                    >
                                      [{v.statutory_citation}]
                                    </span>
                                    <span className="text-[11px] font-semibold text-gray-800">{v.rule}</span>
                                  </div>
                                  <SeverityBadge severity={v.severity} />
                                </div>
                                <p className="text-xs text-gray-800 leading-snug ml-5">{v.message}</p>
                                {v.remedial_action && (
                                  <p className="text-[10px] text-gray-500 mt-1.5 ml-5 leading-snug border-l-2 border-yellow-400 pl-2">
                                    <span className="font-semibold text-gray-600">Remedial Directive: </span>
                                    {v.remedial_action}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Passed declarations */}
                    {auditResult.passed_rules.length > 0 && (
                      <div style={{ border: `1px solid ${NIC_BORDER}`, borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          className="px-4 py-2 flex items-center justify-between"
                          style={{ backgroundColor: '#f0fdf4', borderBottom: `1px solid ${NIC_BORDER}` }}
                        >
                          <h3 className="text-[11px] font-bold text-green-800 uppercase tracking-wider">Statutory Declarations Verified</h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-800" style={{ border: '1px solid #86efac', borderRadius: '2px' }}>
                            {auditResult.passed_rules.length} satisfied
                          </span>
                        </div>
                        <div className="px-4 py-3 space-y-1.5">
                          {auditResult.passed_rules.map((r, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-600" />
                              <p className="text-[11px] text-gray-700 leading-snug">{r}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata footer */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 px-1">
                      <span>ID: {auditResult.inspection_id}</span>
                      <span>{new Date(auditResult.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span>
                      {isDemoMode && <span className="text-amber-600 font-bold">⚠ SIMULATION</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
          </div>
        )} {/* end mainView === 'terminal' */}
      </main>

      {/* ── Inspector Amendment Modal ────────────────────────────────────── */}
      {amendModalOpen && draft && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            overflowY: 'auto', padding: '40px 16px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setAmendModalOpen(false); }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              width: '100%',
              maxWidth: 680,
              border: `1px solid ${NIC_BORDER}`,
              borderRadius: 2,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal header ribbon */}
            <div style={{ backgroundColor: NIC_BLUE, color: '#FFFFFF', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Statutory Declaration Verification Ledger (Pre-Summons Review)</p>
                <p style={{ fontSize: 10, opacity: 0.7, margin: '2px 0 0 0' }}>Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6 Field Amendment</p>
              </div>
              <button
                onClick={() => setAmendModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', opacity: 0.75, padding: 4 }}
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Warning bar */}
            <div style={{ backgroundColor: '#FFFBEB', borderBottom: `1px solid #D97706`, padding: '8px 20px', fontSize: 11, color: '#92400E', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
              <span><strong>Officer Amendment Mode.</strong> Changes will trigger a fresh Rule Engine evaluation and update the docket. This action is logged.</span>
            </div>

            {/* Form body */}
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: '70vh' }}>

              {/* Helper styles */}
              {(() => {
                const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 };
                const input: React.CSSProperties = { width: '100%', fontSize: 12, padding: '7px 10px', border: `1px solid ${NIC_BORDER}`, borderRadius: 2, color: '#111827', outline: 'none', boxSizing: 'border-box', backgroundColor: '#FFFFFF' };
                const row: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };

                return (
                  <>
                    {/* Rule 6(1)(b) — Commodity Name */}
                    <div style={row}>
                      <span style={label}>Rule 6(1)(b) — Generic / Common Commodity Name</span>
                      <input
                        type="text"
                        style={input}
                        value={draft.commodity_name.raw_text}
                        onChange={(e) => setDraft((d) => d ? { ...d, commodity_name: { ...d.commodity_name, raw_text: e.target.value, is_detected: true } } : d)}
                      />
                    </div>

                    {/* Rule 6(1)(a) — Manufacturer Address */}
                    <div style={row}>
                      <span style={label}>Rule 6(1)(a) — Manufacturer / Packer / Importer Name & Address</span>
                      <textarea
                        rows={2}
                        style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
                        value={draft.manufacturer.raw_text}
                        onChange={(e) => setDraft((d) => d ? {
                          ...d,
                          manufacturer: {
                            ...d.manufacturer,
                            raw_text: e.target.value,
                            is_detected: true,
                            has_pin_code: /\b\d{6}\b/.test(e.target.value),
                            has_state_or_city: e.target.value.length > 10,
                          }
                        } : d)}
                      />
                    </div>

                    {/* Rule 6(1)(c) — Net Quantity */}
                    <div style={row}>
                      <span style={label}>Rule 6(1)(c) — Net Quantity</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="number"
                          style={{ ...input, flex: 2 }}
                          placeholder="Numeric value"
                          value={draft.net_quantity.numeric_value}
                          onChange={(e) => setDraft((d) => d ? { ...d, net_quantity: { ...d.net_quantity, numeric_value: parseFloat(e.target.value) || 0 } } : d)}
                        />
                        <select
                          style={{ ...input, flex: 1, cursor: 'pointer' }}
                          value={draft.net_quantity.unit}
                          onChange={(e) => setDraft((d) => d ? { ...d, net_quantity: { ...d.net_quantity, unit: e.target.value, is_standard_unit: ['g', 'kg', 'ml', 'l'].includes(e.target.value) } } : d)}
                        >
                          {['g', 'kg', 'ml', 'l'].map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Rule 6(1)(e) — MRP */}
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ ...row, flex: 1 }}>
                        <span style={label}>Rule 6(1)(e) — MRP (₹)</span>
                        <input
                          type="number"
                          style={input}
                          value={draft.mrp.numeric_value}
                          onChange={(e) => setDraft((d) => d ? { ...d, mrp: { ...d.mrp, numeric_value: parseFloat(e.target.value) || 0 } } : d)}
                        />
                      </div>
                      <div style={{ ...row, flex: 1, justifyContent: 'flex-end', paddingBottom: 4 }}>
                        <span style={label}>MRP "Inclusive of all taxes"?</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, marginTop: 6 }}>
                          <input
                            type="checkbox"
                            checked={draft.mrp.has_inclusive_of_taxes}
                            onChange={(e) => setDraft((d) => d ? { ...d, mrp: { ...d.mrp, has_inclusive_of_taxes: e.target.checked } } : d)}
                            style={{ width: 14, height: 14, accentColor: NIC_BLUE, cursor: 'pointer' }}
                          />
                          <span style={{ color: '#374151' }}>
                            {draft.mrp.has_inclusive_of_taxes ? <strong style={{ color: '#16a34a' }}>✓ Declared</strong> : <span style={{ color: '#dc2626' }}>✗ Not declared</span>}
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Rule 6(1)(aa) — Country of Origin */}
                    <div style={row}>
                      <span style={label}>Rule 6(1)(aa) — Country of Origin</span>
                      <input
                        type="text"
                        style={input}
                        placeholder="e.g. Made in India"
                        value={draft.country_of_origin.raw_text}
                        onChange={(e) => setDraft((d) => d ? { ...d, country_of_origin: { ...d.country_of_origin, raw_text: e.target.value, is_detected: e.target.value.trim().length > 0 } } : d)}
                      />
                    </div>

                    {/* Rule 6(2) — Consumer Care */}
                    <div style={row}>
                      <span style={label}>Rule 6(2) — Consumer Care Phone</span>
                      <input
                        type="text"
                        style={input}
                        placeholder="e.g. 1800-103-1234"
                        value={draft.consumer_care.phone ?? ''}
                        onChange={(e) => setDraft((d) => d ? { ...d, consumer_care: { ...d.consumer_care, phone: e.target.value, has_phone: e.target.value.trim().length > 0 } } : d)}
                      />
                    </div>
                    <div style={row}>
                      <span style={label}>Rule 6(2) — Consumer Care Email</span>
                      <input
                        type="email"
                        style={input}
                        placeholder="e.g. consumer@brand.com"
                        value={draft.consumer_care.email ?? ''}
                        onChange={(e) => setDraft((d) => d ? { ...d, consumer_care: { ...d.consumer_care, email: e.target.value, has_email: e.target.value.trim().length > 0 } } : d)}
                      />
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal footer actions */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: `1px solid ${NIC_BORDER}`,
                backgroundColor: '#F8F9FA',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <button
                onClick={() => { setAmendModalOpen(false); setDraft(null); }}
                style={{ fontSize: 12, fontWeight: 600, padding: '8px 18px', backgroundColor: '#FFFFFF', color: '#374151', border: `1px solid ${NIC_BORDER}`, borderRadius: 2, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!draft || !auditResult) return;
                  // Run deterministic rule engine on the amended data
                  const amended = StatutoryRuleEngine.evaluatePackage(draft);
                  // Preserve docket ID and timestamp from the original result
                  const updated: InspectionAuditResult = {
                    ...amended,
                    inspection_id: auditResult.inspection_id,
                    timestamp: auditResult.timestamp,
                  };
                  setAuditResult(updated);
                  // Update the most-recent matching entry in the docket history
                  setDocketHistory((prev) => {
                    const idx = prev.findIndex((e) => e.result.inspection_id === auditResult.inspection_id);
                    if (idx === -1) return prev;
                    const next = [...prev];
                    next[idx] = {
                      ...next[idx],
                      result: updated,
                      commodityLabel: draft.commodity_name.raw_text || next[idx].commodityLabel,
                      manufacturerLabel: draft.manufacturer.raw_text || next[idx].manufacturerLabel,
                    };
                    return next;
                  });
                  setAmendModalOpen(false);
                  setDraft(null);
                }}
                style={{ fontSize: 12, fontWeight: 600, padding: '8px 18px', backgroundColor: NIC_BLUE, color: '#FFFFFF', border: 'none', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <CheckCircle style={{ width: 13, height: 13 }} />
                Re-Evaluate &amp; Update Docket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Statutory Gazette Modal ─────────────────────────────────────── */}
      <StatutoryGazetteModal
        isOpen={gazetteModalOpen}
        onClose={() => setGazetteModalOpen(false)}
        lang={lang}
      />

      {/* ── Mobile Officer & Compliance Drawer (Mobile Only) ─────────────── */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative ml-auto w-[85%] max-w-sm h-full bg-white shadow-2xl flex flex-col z-10 overflow-y-auto">
            {/* Drawer Header */}
            <div className="p-4 bg-[#0055A4] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AshokaEmblem size={28} />
                <div>
                  <h2 className="text-sm font-bold leading-tight">eMaap 2.0 Terminal</h2>
                  <p className="text-[10px] text-blue-100">Officer Control Panel</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Officer Profile Card */}
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[#0055A4] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  {officerInitials}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{officerName}</p>
                  <p className="text-[11px] text-gray-600 truncate">Inspector (Zone-4) · Circle 04</p>
                  <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5 truncate">
                    <ShieldCheck className="w-3 h-3 shrink-0" /> Jan Parichay SSO · {officerEmail}
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-mono">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#0055A4]" /> IST Live
                </span>
                <span>{currentTime || 'IST Time'}</span>
              </div>
            </div>

            {/* Controls Section */}
            <div className="p-4 space-y-4 flex-1">
              {/* Inspection Mode */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Inspection AI Engine
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-md">
                  <button
                    type="button"
                    onClick={() => setIsDemoMode(false)}
                    className={`py-2 px-2.5 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !isDemoMode
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Wifi className="w-3.5 h-3.5" /> Live Cloud AI
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDemoMode(true)}
                    className={`py-2 px-2.5 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isDemoMode
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <WifiOff className="w-3.5 h-3.5" /> Offline Demo
                  </button>
                </div>
              </div>

              {/* Voice HUD Toggle */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Auditory Assistance
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const next = !voiceHudEnabled;
                    setVoiceHudEnabled(next);
                    if (next && 'speechSynthesis' in window) {
                      window.speechSynthesis.cancel();
                      const u = new SpeechSynthesisUtterance("Voice HUD activated.");
                      window.speechSynthesis.speak(u);
                    }
                  }}
                  className={`w-full py-2.5 px-3 rounded-md border text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                    voiceHudEnabled
                      ? 'bg-sky-50 border-sky-300 text-sky-800'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {voiceHudEnabled ? <Volume2 className="w-4 h-4 text-sky-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                    Audible Infraction HUD
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    voiceHudEnabled ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {voiceHudEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              {/* Statutory Gazette Rulebook */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Legal Metrology Law &amp; Gazette
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    setGazetteModalOpen(true);
                  }}
                  className="w-full py-2.5 px-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-md text-xs font-bold flex items-center justify-between hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-700" />
                    Statutory Gazette &amp; Rulebook
                  </span>
                  <ChevronRight className="w-4 h-4 text-amber-700" />
                </button>
              </div>

              {/* Accessibility (GIGW 3.0) */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Accessibility &amp; Display (GIGW 3.0)
                </label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="text-xs text-slate-700 font-medium">Text Size</span>
                    <div className="flex gap-1">
                      {(['sm', 'md', 'lg'] as const).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setFontScale(sz)}
                          className={`w-7 h-7 rounded text-xs font-bold transition-colors cursor-pointer ${
                            fontScale === sz
                              ? 'bg-[#0055A4] text-white'
                              : 'bg-white border border-slate-300 text-slate-700'
                          }`}
                        >
                          {sz === 'sm' ? 'A-' : sz === 'md' ? 'A' : 'A+'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="text-xs text-slate-700 font-medium">Sunlight Field Mode</span>
                    <button
                      type="button"
                      onClick={() => setIsHighContrast(!isHighContrast)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                        isHighContrast
                          ? 'bg-slate-900 text-amber-400'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      {isHighContrast ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                      {isHighContrast ? 'High Contrast' : 'Standard'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="text-xs text-slate-700 font-medium">Portal Language</span>
                    <div className="flex gap-1">
                      {(['hi', 'en'] as const).map((lCode) => (
                        <button
                          key={lCode}
                          type="button"
                          onClick={() => setLang(lCode)}
                          className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                            lang === lCode
                              ? 'bg-[#0055A4] text-white'
                              : 'bg-white border border-slate-300 text-slate-700'
                          }`}
                        >
                          {lCode === 'hi' ? 'हिन्दी' : 'English'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Footer: Logout & Certifications */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
              <button
                type="button"
                onClick={() => {
                  document.cookie = 'auth_token=; Max-Age=0; path=/;';
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('emaap_officer_name');
                  }
                  window.location.href = '/login';
                }}
                className="w-full py-2.5 px-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Secure Officer Logout</span>
              </button>

              <div className="text-[9px] text-slate-400 text-center space-y-0.5">
                <p>National Informatics Centre (NIC) · GoI</p>
                <p>STQC Certified GIGW 3.0 · WCAG 2.1 AA</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GIGW 3.0 Certified Government Footer ────────────────────────── */}
      <footer style={{ backgroundColor: '#FFFFFF', borderTop: `1px solid ${NIC_BORDER}` }}>
        <div className="px-4 py-4 sm:px-6 sm:py-6 space-y-3 max-w-7xl mx-auto">
          {/* Top row with Logos & Certifications */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <AshokaEmblem size={32} />
              <div>
                <p className="text-[10px] font-bold text-slate-800 leading-tight">
                  {lang === 'hi' ? 'विधिक मापविज्ञान प्रभाग, उपभोक्ता मामले विभाग' : 'Legal Metrology Division, Department of Consumer Affairs'}
                </p>
                <p className="text-[9px] text-slate-500 leading-tight mt-0.5">
                  {lang === 'hi' ? 'उपभोक्ता मामले, खाद्य और सार्वजनिक वितरण मंत्रालय, भारत सरकार' : 'Ministry of Consumer Affairs, Food & Public Distribution, Government of India'}
                </p>
              </div>
            </div>

            {/* Certifications and Compliance Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-300 rounded-xs text-[9px] font-semibold text-slate-700">
                <ShieldCheck className="w-3 h-3 text-[#0055A4]" /> STQC Certified (GIGW 3.0)
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-300 rounded-xs text-[9px] font-semibold text-slate-700">
                <CheckCircle className="w-3 h-3 text-emerald-600" /> WCAG 2.1 AA
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-xs text-[9px] font-bold text-[#0055A4]">
                Digital India
              </span>
            </div>
          </div>

          {/* Links & Helplines */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-slate-600">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {['Website Policies', 'Privacy Policy', 'Hyperlinking Policy', 'Copyright Policy', 'Terms & Conditions', 'Help'].map((item) => (
                <a key={item} href="#" className="hover:underline hover:text-[#0055A4]">
                  {item}
                </a>
              ))}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 font-semibold text-[10px] flex-wrap">
              <span className="text-amber-800 bg-amber-50 px-2 py-0.5 border border-amber-200 rounded-xs">
                {lang === 'hi' ? 'उपभोक्ता हेल्पलाइन: 1915' : 'National Consumer Helpline: 1915'}
              </span>
              <span className="text-slate-700">Toll Free: 1800-11-4000</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-[9px] text-slate-400">
            <p>
              © 2026 Department of Consumer Affairs, Government of India. Designed &amp; Hosted by <strong>NIC</strong>.
            </p>
            <p className="font-mono">
              Build Version 2.4.1 (LM-PC-2011) &nbsp;|&nbsp; 10 Sept 2026
            </p>
          </div>
        </div>
        <div className="nic-header-accent" />
      </footer>

      {/* Interactive Crop Modal for File Uploads */}
      {uploadCropSrc && (
        <ImageCropModal
          imageSrc={uploadCropSrc}
          title="Crop Package Label Evidence"
          onConfirmCrop={(croppedBase64) => {
            setUploadCropSrc(null);
            setCapturedImages([croppedBase64]);
            runAudit([croppedBase64]);
          }}
          onCancel={() => setUploadCropSrc(null)}
        />
      )}

      {/* RAG Statutory Index (Phase 4) */}
      <StatutorySearch />
    </div>
  );
}
