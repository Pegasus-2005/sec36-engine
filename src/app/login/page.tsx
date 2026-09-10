'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, Eye, EyeOff } from 'lucide-react';

const NIC_BLUE   = '#0055A4';
const NIC_BG     = '#F8F9FA';
const NIC_BORDER = '#cccccc';
const GOI_GOLD   = '#D4AF37';

function TricolorBar({ height = 4 }: { height?: number }) {
  return (
    <div style={{ display: 'flex', width: '100%', height }}>
      <div style={{ flex: 1, backgroundColor: '#FF9933' }} />
      <div style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
      <div style={{ flex: 1, backgroundColor: '#138808' }} />
    </div>
  );
}

/** Ashoka Lion Capital — NIC-compliant compact SVG */
function AshokaEmblem({ size = 52, inverted = false }: { size?: number; inverted?: boolean }) {
  const gold  = inverted ? '#FFFFFF' : GOI_GOLD;
  const bg    = inverted ? NIC_BLUE  : NIC_BLUE;
  const rays  = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-label="National Emblem of India" role="img">
      <circle cx="28" cy="28" r="27" fill={bg} />
      <circle cx="28" cy="28" r="25" fill="none" stroke={gold} strokeWidth="1.5" />
      <circle cx="28" cy="37" r="5.5" fill="none" stroke={gold} strokeWidth="1.1" />
      {rays.map((deg) => (
        <line key={deg} x1="28" y1="37"
          x2={28 + 5.5 * Math.cos((deg - 90) * Math.PI / 180)}
          y2={37 + 5.5 * Math.sin((deg - 90) * Math.PI / 180)}
          stroke={gold} strokeWidth="0.7" />
      ))}
      <rect x="22" y="13" width="12" height="7" rx="1.5" fill={gold} />
      <rect x="20" y="19" width="16" height="5" rx="1" fill={gold} />
      <rect x="18" y="28" width="20" height="3" rx="1" fill={gold} />
      <text x="28" y="53" textAnchor="middle" fontSize="4" fill={gold} fontFamily="serif">सत्यमेव जयते</text>
    </svg>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const [officerName, setOfficerName] = useState('Debayan Thakur');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const cleanName = officerName.trim() || 'Debayan Thakur';
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, officerName: cleanName })
      });
      
      const data = await res.json();
      
      if (data.success) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('emaap_officer_name', cleanName);
        }
        // Redirect to dashboard
        window.location.href = '/';
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: NIC_BG }}>
      <TricolorBar height={5} />

      {/* Utility bar */}
      <div className="py-1 px-3 sm:px-6 flex justify-between items-center border-b text-[11px] flex-wrap gap-1" style={{ backgroundColor: NIC_BG, borderColor: NIC_BORDER, color: '#333333' }}>
        <span><strong>भारत सरकार</strong> | Government of India</span>
        <span className="text-[10px] text-slate-500 hidden sm:inline">WCAG 2.1 AA &nbsp;|&nbsp; Screen Reader Accessible</span>
      </div>

      <div className="flex-1 flex items-center justify-center px-3 sm:px-4 py-6 sm:py-12">
        {/* Login card */}
        <div
          className="w-full max-w-4xl flex rounded-sm shadow-md"
          style={{ borderTop: `4px solid ${NIC_BLUE}` }}
        >
          {/* Left panel — GoI identity */}
          <div
            className="hidden md:flex flex-col items-center justify-center p-10 gap-6 rounded-sm"
            style={{ backgroundColor: NIC_BLUE, minWidth: 300 }}
          >
            <AshokaEmblem size={80} inverted />
            <div className="text-center text-white">
              <p className="text-[11px] font-medium opacity-80 leading-snug mb-1">
                उपभोक्ता मामले, खाद्य और सार्वजनिक वितरण मंत्रालय
              </p>
              <p className="text-[11px] font-medium opacity-80 leading-snug">
                Ministry of Consumer Affairs, Food &amp; Public Distribution
              </p>
              <div className="mt-5 border-t border-white/20 pt-5">
                <p className="text-lg font-bold leading-tight">Department of Consumer Affairs</p>
                <p className="text-sm font-medium opacity-90 mt-1">eMaap 2.0 LMO Terminal</p>
                <p className="text-[10px] opacity-60 mt-2 leading-snug">
                  Legal Metrology (Packaged Commodities)<br />Statutory Surveillance System
                </p>
              </div>
            </div>

            {/* Bottom NIC tag */}
            <p className="text-[9px] text-white/40 mt-auto font-mono text-center">
              Secured by National Informatics Centre (NIC)<br />
              Government of India
            </p>
          </div>

          {/* Right panel — Login form */}
          <div className="flex-1 bg-white p-5 sm:p-10">
            {/* Mobile-only GoI Header */}
            <div className="md:hidden flex items-center gap-3 pb-4 mb-5 border-b" style={{ borderColor: NIC_BORDER }}>
              <AshokaEmblem size={44} />
              <div>
                <p className="text-[9px] text-slate-500 font-semibold uppercase">
                  Government of India
                </p>
                <h2 className="text-sm font-bold leading-tight" style={{ color: NIC_BLUE }}>
                  Department of Consumer Affairs
                </h2>
                <p className="text-[10px] text-slate-500">eMaap 2.0 LMO Enforcement Portal</p>
              </div>
            </div>

            {/* SSO header */}
            <div className="flex items-start gap-3 mb-7">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: '#EEF4FB' }}
              >
                <LogIn className="w-4 h-4" style={{ color: NIC_BLUE }} />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-gray-900">Jan Parichay / MeriPehchaan SSO</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Single Sign-On for Government Officials &amp; Authorised Field Officers
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-2 mb-4 text-xs text-red-700 bg-red-100 rounded-sm border border-red-200 text-center font-medium">
                  {error}
                </div>
              )}
              
              {/* Officer Full Name */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Enforcement Officer Full Name &amp; Designation
                </label>
                <input
                  type="text"
                  value={officerName}
                  onChange={(e) => setOfficerName(e.target.value)}
                  placeholder="e.g. Debayan Thakur, LMO"
                  className="w-full px-3 py-2 text-sm border rounded-sm focus:outline-none"
                  style={{ borderColor: NIC_BORDER, color: '#1a1a1a' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = NIC_BLUE)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = NIC_BORDER)}
                  required
                />
                <p className="text-[10px] text-gray-400 mt-1">This name will be stamped on all statutory Form-1 Notices &amp; National Audit Ledgers.</p>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Official Username / Email ID
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. inspector"
                  className="w-full px-3 py-2 text-sm border rounded-sm focus:outline-none"
                  style={{ borderColor: NIC_BORDER, color: '#1a1a1a' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = NIC_BLUE)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = NIC_BORDER)}
                  autoComplete="username"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your secure password"
                    className="w-full px-3 py-2 pr-10 text-sm border rounded-sm focus:outline-none"
                    style={{ borderColor: NIC_BORDER, color: '#1a1a1a' }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = NIC_BLUE)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = NIC_BORDER)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Hint: try username `inspector` and password `password123`</p>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 mt-2 text-sm font-bold text-white rounded-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: NIC_BLUE }}
              >
                {loading ? 'Authenticating...' : 'Login via Jan Parichay'}
              </button>

            </form>

            {/* Footer note */}
            <p className="text-[10px] text-gray-400 mt-6 text-center leading-relaxed">
              This is an official government application. Unauthorised access is a punishable offence under the IT Act, 2000.
              For helpdesk, call <strong>1800-11-4000</strong>.
            </p>
          </div>
        </div>
      </div>

      <TricolorBar height={4} />
    </div>
  );
}
