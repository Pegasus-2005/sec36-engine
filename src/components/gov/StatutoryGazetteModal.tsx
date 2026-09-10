'use client';

import { BookOpen, X, ExternalLink, ShieldCheck, Scale, FileText } from 'lucide-react';

interface StatutoryGazetteModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: 'en' | 'hi';
}

export function StatutoryGazetteModal({ isOpen, onClose, lang = 'en' }: StatutoryGazetteModalProps) {
  if (!isOpen) return null;

  const NOTIFICATIONS = [
    {
      gazetteNo: 'G.S.R. 779(E)',
      date: '02 November 2021',
      effectiveDate: '01 December 2022',
      titleEn: 'Legal Metrology (Packaged Commodities) Second Amendment Rules, 2021',
      titleHi: 'विधिक मापविज्ञान (डिब्बाबंद वस्तुएं) दूसरा संशोधन नियम, 2021',
      coreChanges: [
        'Mandated Unit Sale Price (USP) under Rule 6(11) in Rupees & Paise per g/ml/piece.',
        'Simplified date declarations to only "Month and Year of Manufacture" under Rule 6(1)(d).',
        'Standardized font height requirement (Table I & Table II of Rule 7) to minimum 1.0mm - 6.0mm.',
        'Abolished Schedule II pack size standardization for most non-essential commodities.',
      ],
      actRef: 'Section 52(2)(j) read with Section 18 of Legal Metrology Act, 2009',
    },
    {
      gazetteNo: 'G.S.R. 493(E)',
      date: '14 July 2021',
      effectiveDate: '01 January 2022',
      titleEn: 'Mandatory Declarations on E-Commerce Digital Marketplaces',
      titleHi: 'ई-कॉमर्स डिजिटल मार्केटप्लेस पर अनिवार्य घोषणाएं',
      coreChanges: [
        'Insertion of Rule 6(10): Digital platforms must display all mandatory declarations on product listings prior to purchase.',
        'Platform exemption only applies if it qualifies as an intermediary under Section 79 of IT Act with verified manufacturer onboarding.',
      ],
      actRef: 'Section 18 & Section 36(1) of Legal Metrology Act, 2009',
    },
    {
      gazetteNo: 'G.S.R. 202(E)',
      date: '28 March 2023',
      effectiveDate: 'Immediate',
      titleEn: 'Clarification on Fast-Food, Scheduled Drugs & Bulk Package Exemption',
      titleHi: 'फास्ट फूड, अनुसूचित दवाओं और थोक पैकेज छूट पर स्पष्टीकरण',
      coreChanges: [
        'Fast food items packed by restaurant/hotel chains for immediate delivery exempt under Rule 26(b).',
        'Drug formulations governed by DPCO 2013 / Drugs Act exempt from standard Rule 6 declarations.',
        'Packages containing commodities with net quantity exceeding 25 kg or 25 L (or 50 kg for cement/fertilizers) treated as wholesale packages.',
      ],
      actRef: 'Rule 26 & Section 48 of Legal Metrology Act, 2009',
    },
    {
      gazetteNo: 'Legal Metrology Act, 2009',
      date: 'Act No. 1 of 2010',
      effectiveDate: '01 April 2011',
      titleEn: 'The Legal Metrology Act, 2009 (Parent Statute)',
      titleHi: 'विधिक मापविज्ञान अधिनियम, 2009 (मूल क़ानून)',
      coreChanges: [
        'Section 18: Prohibition on manufacture, repair, or sale of non-standard pre-packaged commodities.',
        'Section 36(1): Fine of up to ₹25,000 for first offence, ₹50,000 for second offence, and up to ₹1,00,000 or imprisonment up to 1 year for subsequent offences.',
        'Section 48: Compounding of offences before or after institution of prosecution.',
        'Section 49: Offences by companies — Nomination of Director / Person-in-charge.',
      ],
      actRef: 'Gazette of India, Extraordinary, Part II, Section 1',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className="bg-white w-full max-w-3xl max-h-[85vh] flex flex-col rounded-sm shadow-2xl border border-slate-300 overflow-hidden"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        {/* Header with NIC styling */}
        <div className="bg-[#0055A4] text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="text-sm font-bold tracking-wide">
                {lang === 'hi'
                  ? 'विधिक मापविज्ञान — आधिकारिक राजपत्र अधिसूचनाएं एवं क़ानूनी संदर्भ'
                  : 'Statutory Gazette Notifications & Legal Metrology Reference'}
              </h2>
              <p className="text-[10px] text-blue-100">
                Department of Consumer Affairs, Ministry of Consumer Affairs, Food & Public Distribution
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded transition-colors text-white"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 bg-slate-50 text-xs">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-sm flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#0055A4] shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              {lang === 'hi'
                ? 'यह डिजिटल निगरानी इंजन सीधे भारत के राजपत्र (Gazette of India) में प्रकाशित विधिक मापविज्ञान (डिब्बाबंद वस्तुएं) नियमावली, 2011 और अधिनियम 2009 की धाराओं से अनुपालन की पुष्टि करता है।'
                : 'All automated violation citations in this portal are ground-truth mapped directly to the statutory clauses published in the Gazette of India under the Legal Metrology (Packaged Commodities) Rules, 2011.'}
            </p>
          </div>

          <div className="space-y-3">
            {NOTIFICATIONS.map((notif, idx) => (
              <div key={idx} className="bg-white border border-slate-200 p-3.5 rounded-sm space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#0055A4]" />
                    <span className="font-bold text-slate-800 text-[12px] font-mono">
                      {notif.gazetteNo}
                    </span>
                    <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                      Dated: {notif.date}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-semibold font-mono">
                    Enforced: {notif.effectiveDate}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900 text-[11px]">
                    {lang === 'hi' ? notif.titleHi : notif.titleEn}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Authority: {notif.actRef}
                  </p>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-sm border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Key Statutory Provisions Audited:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-700">
                    {notif.coreChanges.map((change, cIdx) => (
                      <li key={cIdx} className="leading-snug">{change}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-slate-100 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-500">
          <span>Source: egazette.gov.in & consumeraffairs.nic.in</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0055A4] text-white font-semibold rounded-sm hover:bg-blue-800 transition-colors"
          >
            Close Reference
          </button>
        </div>
      </div>
    </div>
  );
}
