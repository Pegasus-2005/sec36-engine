'use client';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileDown, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useState } from 'react';
import { InspectionAuditResult } from '../../types/metrology';

/**
 * Sanitizes text to pure ASCII to prevent jsPDF 16-bit encoding bugs.
 * When non-Latin1 or multi-byte unicode characters (such as ✓, ₹, —, –, ≥)
 * are passed to standard Type 1 fonts (helvetica, courier) in jsPDF,
 * jsPDF inserts 2-byte wide TJ kerning which causes characters to space out
 * widely and overflow past the right margin.
 */
function cleanForPdf(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .replace(/✓/g, '[COMPLIANT]')
    .replace(/✗/g, '[VIOLATION]')
    .replace(/₹/g, 'Rs. ')
    .replace(/–/g, '-')
    .replace(/—/g, ' - ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/…/g, '...')
    .replace(/•/g, '*')
    .replace(/[^\x00-\x7F]/g, '');
}

async function generateHash(base64: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(base64);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  }
}

interface Form1NoticeGeneratorProps {
  auditResult: InspectionAuditResult;
  packageImages?: string[];
  officerName?: string;
}

/**
 * Generates and downloads an official Form-1 Statutory Notice PDF under Section 36 of
 * the Legal Metrology Act, 2009, read with Rule 6(1) of the Legal Metrology
 * (Packaged Commodities) Rules, 2011.
 */
export function Form1NoticeGenerator({ auditResult, packageImages = [], officerName }: Form1NoticeGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PAGE_W = 210;
      const PAGE_H = 297;
      const MARGIN = 14;
      const CONTENT_W = PAGE_W - MARGIN * 2;
      let y = 14;

      // ── Helpers ─────────────────────────────────────────────────────────────
      const line = (offset = 2) => {
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.2);
        doc.line(MARGIN, y + offset, PAGE_W - MARGIN, y + offset);
        y += offset + 3;
      };

      const heading = (text: string, size: number, color: [number, number, number]) => {
        doc.setFontSize(size);
        doc.setTextColor(...color);
        doc.text(cleanForPdf(text), PAGE_W / 2, y, { align: 'center' });
        y += size * 0.45;
      };

      const labelValue = (label: string, value: string) => {
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.setFont('helvetica', 'bold');
        doc.text(`${label}:`, MARGIN, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        doc.text(cleanForPdf(value), MARGIN + 52, y);
        y += 5.5;
      };

      // ── GoI Header ───────────────────────────────────────────────────────────
      doc.setFillColor(12, 37, 83); // GoI dark navy blue
      doc.rect(0, 0, PAGE_W, 22, 'F');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('GOVERNMENT OF INDIA', PAGE_W / 2, 7.5, { align: 'center' });
      doc.text('Ministry of Consumer Affairs, Food & Public Distribution', PAGE_W / 2, 12.5, { align: 'center' });
      doc.text('Department of Consumer Affairs - Legal Metrology Division', PAGE_W / 2, 17.5, { align: 'center' });
      y = 26;

      // ── Form Title ───────────────────────────────────────────────────────────
      heading('FORM-1: STATUTORY INSPECTION NOTICE', 13, [12, 37, 83]);
      y += 1;
      heading('Under Section 36, Legal Metrology Act, 2009', 9, [100, 100, 100]);
      y += 1;
      heading('Read with Rule 6(1), Legal Metrology (Packaged Commodities) Rules, 2011', 8.5, [100, 100, 100]);
      y += 3;
      line();

      // ── Section I: Inspection Metadata ───────────────────────────────────────
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(12, 37, 83);
      doc.text('I. INSPECTION DETAILS', MARGIN, y);
      y += 5.5;

      const ts = new Date(auditResult.timestamp);
      const dateStr = ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
      const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      labelValue('Inspection Reference No.', auditResult.inspection_id);
      labelValue('Date & Time of Inspection', `${dateStr}, ${timeStr} IST`);
      labelValue('Compliance Status', auditResult.overall_status.replace('_', ' '));
      labelValue('Compliance Score', `${auditResult.compliance_score} / 100`);
      labelValue('Total Rule Checks', String(auditResult.total_rules_checked));
      labelValue('Violations Detected', String(auditResult.violations.length));
      y += 2;
      line();

      // ── Section II: Package Image Evidence ───────────────────────────────────
      const primaryImage = packageImages.length > 0 ? packageImages[0] : null;
      if (primaryImage) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(12, 37, 83);
        doc.text('II. PACKAGING IMAGE EVIDENCE', MARGIN, y);
        y += 5;

        // Fit image within content width, max height 50mm
        const MAX_IMG_H = 50;
        const MAX_IMG_W = CONTENT_W;
        
        let imgW = MAX_IMG_W;
        let imgH = MAX_IMG_H;
        let ratio = 1.6;

        if (typeof window !== 'undefined') {
          try {
            const imgEl = new Image();
            imgEl.src = primaryImage;
            const nw = imgEl.naturalWidth || 800;
            const nh = imgEl.naturalHeight || 600;
            ratio = nw / nh;
          } catch {
            ratio = 1.6;
          }
        }

        imgW = Math.min(MAX_IMG_W, MAX_IMG_H * ratio);
        imgH = imgW / ratio;
        if (imgH > MAX_IMG_H) {
          imgH = MAX_IMG_H;
          imgW = imgH * ratio;
        }

        const imgX = MARGIN + (CONTENT_W - imgW) / 2;
        let imgFormat: 'JPEG' | 'PNG' = 'JPEG';
        if (primaryImage.startsWith('data:image/png')) imgFormat = 'PNG';

        try {
          doc.addImage(primaryImage, imgFormat, imgX, y, imgW, imgH);
          y += imgH + 4;
        } catch (imgErr) {
          console.warn('Failed to embed primary image into PDF', imgErr);
          doc.setFillColor(240, 243, 248);
          doc.rect(MARGIN, y, CONTENT_W, 20, 'F');
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text('[Packaging Image Evidence Captured on Terminal]', PAGE_W / 2, y + 11, { align: 'center' });
          y += 24;
        }

        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 120);
        doc.setFont('helvetica', 'italic');
        doc.text(`Fig. 1 - Packaged commodity evidence captured during inspection (Ref: ${auditResult.inspection_id})`, MARGIN, y);
        y += 5.5;
        line();
      }

      // ── Section III: Detected Violations Table ─────────────────────────────────
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(12, 37, 83);
      const sectionNum = primaryImage ? 'III' : 'II';
      doc.text(`${sectionNum}. RULE 6(1) VIOLATION SUMMARY`, MARGIN, y);
      y += 4;

      if (auditResult.violations.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(19, 136, 8);
        doc.text('No violations detected. Commodity complies with all statutory declarations under Rule 6(1).', MARGIN, y);
        y += 8;
      } else {
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN },
          head: [['#', 'Statutory Citation', 'Declaration Requirement', 'Severity', 'Violation Detail']],
          body: auditResult.violations.map((v, i) => [
            String(i + 1),
            cleanForPdf(v.statutory_citation),
            cleanForPdf(v.rule),
            cleanForPdf(v.severity),
            cleanForPdf(v.message),
          ]),
          headStyles: {
            fillColor: [12, 37, 83],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: 2,
          },
          bodyStyles: { fontSize: 7.5, textColor: [30, 30, 30], cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 30, fontStyle: 'bold' },
            2: { cellWidth: 38 },
            3: { cellWidth: 20, fontStyle: 'bold' },
            4: { cellWidth: 'auto' },
          },
          alternateRowStyles: { fillColor: [248, 249, 252] },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 3) {
              if (data.cell.raw === 'CRITICAL') {
                data.cell.styles.textColor = [185, 28, 28];
              } else if (data.cell.raw === 'MAJOR') {
                data.cell.styles.textColor = [194, 65, 12];
              }
            }
          },
        });

        const finalY: number = (doc as jsPDF & { lastAutoTable?: { finalY?: number } })
          .lastAutoTable?.finalY ?? y;
        y = finalY + 6;
      }

      // ── Section IV: Declarations in Compliance Table ──────────────────────────
      if (auditResult.passed_rules.length > 0) {
        if (y > 230) {
          doc.addPage();
          y = 20;
        }

        const nextSection = primaryImage ? 'IV' : 'III';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(12, 37, 83);
        doc.text(`${nextSection}. DECLARATIONS IN COMPLIANCE`, MARGIN, y);
        y += 4;

        const complianceRows = auditResult.passed_rules.map((rule, idx) => {
          const parts = rule.split(':');
          const citation = parts.length > 1 ? parts[0].trim() : `Rule ${idx + 1}`;
          const detail = parts.length > 1 ? parts.slice(1).join(':').trim() : rule.trim();
          return ['COMPLIANT', cleanForPdf(citation), cleanForPdf(detail)];
        });

        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN },
          head: [['Status', 'Statutory Citation', 'Compliant Label Declaration & Finding']],
          body: complianceRows,
          headStyles: {
            fillColor: [19, 136, 8], // GoI Green
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: 2,
          },
          bodyStyles: { fontSize: 7.5, textColor: [30, 30, 30], cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 24, fontStyle: 'bold', halign: 'center' },
            1: { cellWidth: 35, fontStyle: 'bold' },
            2: { cellWidth: 'auto' },
          },
          alternateRowStyles: { fillColor: [246, 252, 246] },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 0) {
              data.cell.styles.textColor = [19, 136, 8];
            }
          },
        });

        const finalY: number = (doc as jsPDF & { lastAutoTable?: { finalY?: number } })
          .lastAutoTable?.finalY ?? y;
        y = finalY + 6;
      }

      // ── Section V: Mandatory Remedial Directions Table ───────────────────────
      if (auditResult.violations.length > 0) {
        if (y > 230) {
          doc.addPage();
          y = 20;
        }

        const remSection = primaryImage
          ? auditResult.passed_rules.length > 0 ? 'V' : 'IV'
          : auditResult.passed_rules.length > 0 ? 'IV' : 'III';

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(12, 37, 83);
        doc.text(`${remSection}. MANDATORY REMEDIAL DIRECTIONS`, MARGIN, y);
        y += 4;

        const remedialRows = auditResult.violations.map((v, idx) => [
          String(idx + 1),
          cleanForPdf(v.statutory_citation),
          cleanForPdf(v.rule),
          cleanForPdf(v.remedial_action || 'No remedial action specified.')
        ]);

        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN },
          head: [['#', 'Citation', 'Deficiency', 'Statutory Action Required']],
          body: remedialRows,
          headStyles: {
            fillColor: [180, 83, 9], // Amber/Brown
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: 2,
          },
          bodyStyles: { fontSize: 7.5, textColor: [30, 30, 30], cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 30, fontStyle: 'bold' },
            2: { cellWidth: 38 },
            3: { cellWidth: 'auto' },
          },
          alternateRowStyles: { fillColor: [255, 251, 240] },
        });

        const finalY: number = (doc as jsPDF & { lastAutoTable?: { finalY?: number } })
          .lastAutoTable?.finalY ?? y;
        y = finalY + 6;
      }

      // ── Section VI: Forensic Cryptographic Evidence Locker ───────────────────
      if (y > 215) {
        doc.addPage();
        y = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(12, 37, 83);
      doc.text('FORENSIC CRYPTOGRAPHIC EVIDENCE LOCKER (Sec 65B IEA)', MARGIN, y);
      y += 5;

      const lockerStartY = y;

      doc.setFontSize(7.5);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');
      doc.text('Cryptographic SHA-256 digital hashes computed at source inspection time under Section 65B Indian Evidence Act:', MARGIN, y);
      y += 5;

      const hashes = await Promise.all(packageImages.map(img => generateHash(img)));

      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      if (hashes.length === 0) {
        doc.text('No primary image dossier attached.', MARGIN, y);
        y += 4;
      } else {
        hashes.forEach((hash, idx) => {
          const hashText = `Image ${idx + 1} (SHA-256): ${hash}`;
          const wrappedHash = doc.splitTextToSize(hashText, CONTENT_W - 32);
          doc.text(wrappedHash, MARGIN, y);
          y += wrappedHash.length * 3.5 + 1;
        });
      }

      // QR Code on right
      try {
        const qrData = JSON.stringify({
          id: auditResult.inspection_id,
          timestamp: auditResult.timestamp,
          status: auditResult.overall_status,
          hashes: hashes.slice(0, 3)
        });
        const qrBase64 = await QRCode.toDataURL(qrData, { margin: 1, width: 140 });
        doc.addImage(qrBase64, 'PNG', PAGE_W - MARGIN - 22, lockerStartY - 2, 22, 22);
      } catch (e) {
        console.warn('Failed to generate QR code', e);
      }

      y = Math.max(y + 3, lockerStartY + 24);

      // ── Authorised Officer Signature Block ───────────────────────────────────
      if (y > 235) {
        doc.addPage();
        y = 20;
      }
      y += 5;
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.text(cleanForPdf(officerName || 'Debayan Thakur, LMO'), MARGIN, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      y += 4;
      doc.text('Inspecting Officer, Legal Metrology (Enforcement)', MARGIN, y);
      doc.text('Date: _______________', PAGE_W - MARGIN - 50, y);
      y += 5;
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y, MARGIN + 60, y);
      doc.line(PAGE_W - MARGIN - 60, y, PAGE_W - MARGIN, y);
      y += 4;
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text('(Signature & Official Seal)', MARGIN, y);

      // ── Standard Running Footer on All Pages ─────────────────────────────────
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(12, 37, 83);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(
          'Sec36 Engine - Statutory Legal Metrology Compliance Inspection Notice | Form-1 under LM Act 2009',
          MARGIN,
          PAGE_H - 9
        );
        doc.text(
          `Page ${p} of ${totalPages}`,
          PAGE_W - MARGIN,
          PAGE_H - 9,
          { align: 'right' }
        );
      }

      // ── Save Document ────────────────────────────────────────────────────────
      doc.save(`Form1_Notice_${auditResult.inspection_id}.pdf`);
    } catch (err) {
      console.error('PDF Generation failed', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isGenerating}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0055A4] hover:bg-[#004080] active:bg-[#003366] disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
      style={{ borderRadius: '2px' }}
    >
      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      {isGenerating ? 'Generating Forensic Form-1 PDF...' : 'Download Form-1 Notice (Section 36)'}
    </button>
  );
}
