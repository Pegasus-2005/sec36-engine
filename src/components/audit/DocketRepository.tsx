'use client';

/**
 * DocketRepository.tsx
 * National Repository of Scanned Products & Compliance History
 * Legal Metrology (Packaged Commodities) Rules, 2011 — Section 36 Enforcement Monitor
 * Styled to NIC UXDT / emaap.gov.in / GIGW 3.0 standards.
 */

import { useState, useMemo } from 'react';
import { InspectionAuditResult, ViolationRecord, DocketEntry } from '../../types/metrology';
import {
  Search,
  Download,
  Filter,
  FileText,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  BarChart3,
  ShieldAlert,
  TrendingUp,
  Hash,
  Trash2,
} from 'lucide-react';

// Design tokens
const NIC_BLUE   = '#0055A4';
const NIC_BG     = '#F8F9FA';
const NIC_BORDER = '#cccccc';



type FilterMode = 'all' | 'compliant' | 'non_compliant';

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
}

function topInfractionClause(dockets: DocketEntry[]): string {
  const freq: Record<string, number> = {};
  for (const d of dockets) {
    if (d?.result?.violations && Array.isArray(d.result.violations)) {
      for (const v of d.result.violations) {
        if (v?.statutory_citation) {
          freq[v.statutory_citation] = (freq[v.statutory_citation] ?? 0) + 1;
        }
      }
    }
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  if (!top) return 'N/A';
  const clauseMap: Record<string, string> = {
    'LM-R6(1)(e)':  'Rule 6(1)(e) — MRP Tax Clause',
    'LM-R6(2)':     'Rule 6(2) — Consumer Care',
    'LM-R6(11)':    'Rule 6(11) — Unit Sale Price',
    'LM-R6(1)(aa)': 'Rule 6(1)(aa) — Country of Origin',
    'LM-R6(1)(c)':  'Rule 6(1)(c) — Net Quantity',
    'LM-R6(1)(a)':  'Rule 6(1)(a) — Manufacturer Address',
  };
  return clauseMap[top[0]] ?? top[0];
}

function generateCSV(dockets: DocketEntry[]): string {
  const headers = ['Docket ID', 'Timestamp', 'Commodity', 'Manufacturer', 'MRP (Rs)', 'Status', 'Score (%)', 'Violated Rules'];
  const rows = dockets.map((d) => [
    d.result?.inspection_id || '',
    d.result?.timestamp ? new Date(d.result.timestamp).toLocaleString('en-IN') : '',
    d.commodityLabel || '',
    d.manufacturerLabel || '',
    d.result?.extracted_data?.mrp?.numeric_value?.toString() ?? '',
    d.result?.overall_status || '',
    d.result?.compliance_score?.toString() || '0',
    Array.isArray(d.result?.violations) ? d.result.violations.map((v: ViolationRecord) => v?.statutory_citation).filter(Boolean).join('; ') : '',
  ]);
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ViolationBadge({ citation }: { citation: string }) {
  const short = citation.replace('LM-', '');
  return (
    <span style={{
      display: 'inline-block', fontSize: '10px', fontWeight: 700, fontFamily: 'monospace',
      padding: '1px 5px', borderRadius: '2px', backgroundColor: '#FEE2E2', color: '#991B1B',
      border: '1px solid #FECACA', marginRight: 3, marginBottom: 2, whiteSpace: 'nowrap',
    }}>
      [{short}]
    </span>
  );
}

function StatusPill({ status, score }: { status: string; score: number }) {
  const isOk = status === 'COMPLIANT';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', fontWeight: 700,
        padding: '2px 8px', borderRadius: '2px',
        backgroundColor: isOk ? '#DCFCE7' : '#FEE2E2',
        color: isOk ? '#166534' : '#991B1B',
        border: `1px solid ${isOk ? '#BBF7D0' : '#FECACA'}`,
      }}>
        {isOk ? <CheckCircle style={{ width: 10, height: 10 }} /> : <XCircle style={{ width: 10, height: 10 }} />}
        {status === 'COMPLIANT' ? 'COMPLIANT' : status === 'NON_COMPLIANT' ? 'NON-COMPLIANT' : 'ACTION REQ.'}
      </span>
      <div style={{ width: '100%', height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden', minWidth: 80 }}>
        <div style={{ height: '100%', width: `${score}%`, backgroundColor: isOk ? '#16a34a' : '#dc2626', borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: '10px', color: '#6B7280' }}>{score}% compliant</span>
    </div>
  );
}

function AnalyticsCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      backgroundColor: '#FFFFFF', border: `1px solid ${NIC_BORDER}`, padding: '12px 16px',
      display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: NIC_BLUE }}>
        {icon}
        <span style={{ fontSize: '10px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <span style={{ fontSize: '22px', fontWeight: 800, color: '#111827', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: '10px', color: '#6B7280' }}>{sub}</span>}
    </div>
  );
}

interface Props {
  liveDockets: DocketEntry[];
  onViewAudit: (entry: DocketEntry) => void;
  onDownloadForm1: (entry: DocketEntry) => void;
  onDeleteAudit?: (id: string) => void;
  onClearAll?: () => Promise<void>;
  officerName?: string;
}

export function DocketRepository({ liveDockets, onViewAudit, onDownloadForm1, onDeleteAudit, onClearAll, officerName }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const allDockets = useMemo(() => {
    const list = (liveDockets || []).filter((d) => d && d.result);
    list.sort((a, b) => {
      const tB = b?.result?.timestamp ? new Date(b.result.timestamp).getTime() : 0;
      const tA = a?.result?.timestamp ? new Date(a.result.timestamp).getTime() : 0;
      return tB - tA;
    });
    return list;
  }, [liveDockets]);

  const totalInspected   = allDockets.length;
  const totalViolations  = allDockets.filter((d) => d.result?.overall_status !== 'COMPLIANT').length;
  const violationPct     = totalInspected > 0 ? Math.round((totalViolations / totalInspected) * 100) : 0;
  const topClause        = topInfractionClause(allDockets);
  const compoundingCount = allDockets.filter((d) => Array.isArray(d.result?.violations) && d.result.violations.some((v) => v?.severity === 'CRITICAL')).length;

  const displayed = useMemo(() => {
    let list = allDockets;
    if (filter === 'compliant')     list = list.filter((d) => d.result?.overall_status === 'COMPLIANT');
    if (filter === 'non_compliant') list = list.filter((d) => d.result?.overall_status !== 'COMPLIANT');
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) => {
        const id = (d.result?.inspection_id || '').toLowerCase();
        const com = (d.commodityLabel || '').toLowerCase();
        const mfg = (d.manufacturerLabel || '').toLowerCase();
        return id.includes(q) || com.includes(q) || mfg.includes(q);
      });
    }
    return list;
  }, [allDockets, filter, search]);

  const handleExportCSV = () => {
    const csv  = generateCSV(displayed);
    const name = `eMaap_Docket_Ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(csv, name);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ borderLeft: `4px solid ${NIC_BLUE}`, paddingLeft: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: NIC_BLUE, margin: 0 }}>
          National Docket Repository &amp; Compliance History
        </h2>
        <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0 0' }}>
          Legal Metrology (Packaged Commodities) Rules, 2011 — Circle 04, Kolkata Central · Inspector: {officerName || 'Sunil Kumar, LMO'}
        </p>
      </div>

      {/* Analytics Summary Strip */}
      <div style={{ backgroundColor: NIC_BG, border: `1px solid ${NIC_BORDER}`, padding: '12px 16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          ENFORCEMENT OVERVIEW — CURRENT CIRCLE
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <AnalyticsCard icon={<Hash style={{ width: 14, height: 14 }} />} label="Total Inspected SKUs" value={totalInspected} sub="Since Circle deployment" />
          <AnalyticsCard icon={<AlertTriangle style={{ width: 14, height: 14 }} />} label="Violations Detected" value={`${totalViolations} (${violationPct}%)`} sub="of total inspections" />
          <AnalyticsCard icon={<TrendingUp style={{ width: 14, height: 14 }} />} label="Top Infraction Clause" value={totalViolations > 0 ? topClause.split('—')[0].trim() : 'N/A'} sub={totalViolations > 0 ? topClause.split('—')[1]?.trim() : 'No violations'} />
          <AnalyticsCard icon={<ShieldAlert style={{ width: 14, height: 14 }} />} label="Section 36 Notices Issued" value={compoundingCount} sub="Compoundable offences flagged" />
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#9CA3AF' }} />
          <input
            type="text"
            placeholder="Search by Docket No., Commodity, Manufacturer or Brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', fontSize: '12px', padding: '7px 10px 7px 32px',
              border: `1px solid ${NIC_BORDER}`, backgroundColor: '#FFFFFF', outline: 'none',
              boxSizing: 'border-box', borderRadius: 2, color: '#111827',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter style={{ width: 13, height: 13, color: '#6B7280' }} />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterMode)}
            style={{
              fontSize: '12px', padding: '7px 10px', border: `1px solid ${NIC_BORDER}`,
              backgroundColor: '#FFFFFF', borderRadius: 2, color: '#111827', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="all">All Inspections</option>
            <option value="non_compliant">Non-Compliant Only</option>
            <option value="compliant">Compliant Only</option>
          </select>
        </div>
        <button
          onClick={handleExportCSV}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 600,
            padding: '7px 14px', backgroundColor: NIC_BLUE, color: '#FFFFFF',
            border: 'none', borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <Download style={{ width: 13, height: 13 }} />
          Export Ledger to CSV
        </button>
        {(onClearAll || onDeleteAudit) && allDockets.length > 0 && (
          <button
            onClick={async () => {
              if (window.confirm('Are you sure you want to delete ALL records from the National Docket Repository? This action cannot be undone.')) {
                if (onClearAll) {
                  await onClearAll();
                } else if (onDeleteAudit) {
                  for (const entry of displayed) {
                    await onDeleteAudit(entry.result.inspection_id);
                  }
                }
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 600,
              padding: '7px 14px', backgroundColor: '#FEF2F2', color: '#DC2626',
              border: '1px solid #FECACA', borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Trash2 style={{ width: 13, height: 13 }} />
            Clear All
          </button>
        )}
      </div>

      {/* Audit Ledger Table */}
      <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${NIC_BORDER}`, borderRadius: 2, overflow: 'hidden' }}>
        {/* Ribbon */}
        <div style={{
          backgroundColor: NIC_BLUE, color: '#FFFFFF', padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '12px', fontWeight: 600,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 style={{ width: 15, height: 15, opacity: 0.75 }} />
            Official Audit Ledger — LM(PC) Rules 2011
          </div>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', opacity: 0.65, border: '1px solid rgba(255,255,255,0.25)', padding: '1px 8px', borderRadius: 2 }}>
            {displayed.length} records
          </span>
        </div>

        {/* Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: NIC_BG, borderBottom: `1px solid ${NIC_BORDER}` }}>
                {['Docket ID & Date', 'Commodity & Manufacturer', 'Principal Violations', 'Compliance Score', 'Actions'].map((col) => (
                  <th key={col} style={{
                    padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700,
                    color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em',
                    whiteSpace: 'nowrap', borderRight: `1px solid ${NIC_BORDER}`,
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#6B7280' }}>
                      <FileText style={{ width: 32, height: 32, color: '#9CA3AF' }} />
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: '#374151' }}>
                        No Inspection Dockets in Repository
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#9CA3AF', maxWidth: 420 }}>
                        {search || filter !== 'all'
                          ? 'No records match your search or filter criteria. Try resetting your search.'
                          : 'Records generated from live package surveillance or uploaded labels will be stored here automatically under Section 36 of the Legal Metrology Act.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {displayed.map((entry, idx) => (
                <tr
                  key={`${entry.result?.inspection_id || idx}-${idx}`}
                  style={{ borderBottom: `1px solid ${NIC_BORDER}`, backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB' }}
                >
                  <td style={{ padding: '10px 12px', borderRight: `1px solid ${NIC_BORDER}`, verticalAlign: 'top', minWidth: 180 }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', color: NIC_BLUE }}>{entry.result?.inspection_id || 'INSP-UNKNOWN'}</div>
                    <div style={{ fontSize: '10px', color: '#6B7280', marginTop: 2 }}>{formatTimestamp(entry.result?.timestamp || '')}</div>
                  </td>
                  <td style={{ padding: '10px 12px', borderRight: `1px solid ${NIC_BORDER}`, verticalAlign: 'top', minWidth: 200 }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{entry.commodityLabel}</div>
                    <div style={{ fontSize: '10px', color: '#6B7280', marginTop: 2 }}>{entry.manufacturerLabel}</div>
                  </td>
                  <td style={{ padding: '10px 12px', borderRight: `1px solid ${NIC_BORDER}`, verticalAlign: 'top', minWidth: 180 }}>
                    {(!entry.result?.violations || entry.result.violations.length === 0) ? (
                      <span style={{ fontSize: '11px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle style={{ width: 12, height: 12 }} /> No violations
                      </span>
                    ) : (
                      <div>
                        {entry.result.violations.map((v: ViolationRecord, i: number) => (
                          <ViolationBadge key={i} citation={v?.statutory_citation || ''} />
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', borderRight: `1px solid ${NIC_BORDER}`, verticalAlign: 'top', minWidth: 140 }}>
                    <StatusPill status={entry.result?.overall_status || 'ACTION_REQUIRED'} score={entry.result?.compliance_score ?? 0} />
                  </td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button
                        onClick={() => onViewAudit(entry)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', fontWeight: 600,
                          padding: '5px 10px', backgroundColor: NIC_BLUE, color: '#FFFFFF',
                          border: 'none', borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        <Eye style={{ width: 11, height: 11 }} /> View Audit
                      </button>
                      <button
                        onClick={() => onDownloadForm1(entry)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', fontWeight: 600,
                          padding: '5px 10px', backgroundColor: '#FFFFFF', color: '#374151',
                          border: `1px solid ${NIC_BORDER}`, borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        <FileText style={{ width: 11, height: 11 }} /> Form-1 PDF
                      </button>
                      {onDeleteAudit && (
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this inspection record? This action cannot be undone.')) {
                              onDeleteAudit(entry.result?.inspection_id || '');
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', fontWeight: 600,
                            padding: '5px 10px', backgroundColor: '#FEF2F2', color: '#DC2626',
                            border: '1px solid #FECACA', borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          <Trash2 style={{ width: 11, height: 11 }} /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List View (< md) */}
        <div className="block md:hidden divide-y divide-slate-200">
          {displayed.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <FileText style={{ width: 32, height: 32, color: '#9CA3AF', margin: '0 auto 8px auto' }} />
              <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: '#374151' }}>
                No Inspection Dockets in Repository
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#9CA3AF' }}>
                {search || filter !== 'all'
                  ? 'No records match your search or filter criteria.'
                  : 'Audits completed on your mobile device will appear here automatically.'}
              </p>
            </div>
          )}

          {displayed.map((entry, idx) => (
            <div key={`${entry.result?.inspection_id || idx}-${idx}`} className="p-3 bg-white flex flex-col gap-2.5">
              {/* Card Header: Docket ID + Status */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono font-bold text-xs text-[#0055A4]">
                    {entry.result?.inspection_id || 'INSP-UNKNOWN'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {formatTimestamp(entry.result?.timestamp || '')}
                  </div>
                </div>
                <StatusPill status={entry.result?.overall_status || 'ACTION_REQUIRED'} score={entry.result?.compliance_score ?? 0} />
              </div>

              {/* Commodity & Manufacturer */}
              <div className="bg-slate-50 p-2 rounded border border-slate-200 text-xs">
                <div className="font-bold text-slate-900">{entry.commodityLabel}</div>
                <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">{entry.manufacturerLabel}</div>
              </div>

              {/* Violations Strip */}
              <div>
                {(!entry.result?.violations || entry.result.violations.length === 0) ? (
                  <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Fully Compliant
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {entry.result.violations.map((v: ViolationRecord, i: number) => (
                      <ViolationBadge key={i} citation={v?.statutory_citation || ''} />
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onViewAudit(entry)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-[#0055A4] text-white text-xs font-semibold rounded cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Audit</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDownloadForm1(entry)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-white text-slate-700 border border-slate-300 text-xs font-semibold rounded cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span>Form-1 PDF</span>
                </button>
                {onDeleteAudit && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Delete this inspection docket?')) {
                        onDeleteAudit(entry.result?.inspection_id || '');
                      }
                    }}
                    className="p-1.5 text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 cursor-pointer"
                    title="Delete Docket"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: 0 }}>
        Records stored in browser session (localStorage key: <code>emaap_inspection_history</code>). Export to CSV for formal record-keeping.
      </p>
    </div>
  );
}
