'use client';

import { useState } from 'react';
import { Type, Ruler, Info } from 'lucide-react';

export function FontCalibrator() {
  const [mode, setMode] = useState<'area' | 'net_qty'>('net_qty');
  const [inputValue, setInputValue] = useState<string>('');

  let minHeight = 0;

  const value = parseFloat(inputValue);

  if (!isNaN(value) && value > 0) {
    if (mode === 'area') {
      // Table I - Area of Principal Display Panel (cm²)
      if (value <= 50) minHeight = 1.0;
      else if (value <= 100) minHeight = 1.5;
      else if (value <= 500) minHeight = 2.5;
      else if (value <= 2500) minHeight = 4.0;
      else minHeight = 6.0;
    } else {
      // Table II - Net Quantity (weight/volume) in g or ml
      if (value <= 50) minHeight = 1.0;
      else if (value <= 200) minHeight = 1.5;
      else if (value <= 500) minHeight = 2.5;
      else if (value <= 1000) minHeight = 4.0;
      else minHeight = 6.0;
    }
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-sm">
      <div className="bg-slate-800 text-white px-3 py-2 flex items-center justify-between text-xs font-semibold rounded-t-sm">
        <div className="flex items-center gap-2">
          <Type className="w-3.5 h-3.5" />
          Rule 7: Statutory Font Height Calibrator
        </div>
      </div>
      <div className="p-4 space-y-4">
        <p className="text-[10px] text-slate-500 leading-snug">
          Calculate the legal minimum height of numerals/letters as per Table I & Table II of the Legal Metrology (Packaged Commodities) Rules, 2011.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => { setMode('net_qty'); setInputValue(''); }}
            className="flex-1 py-1.5 text-[11px] font-semibold border rounded-sm transition-colors"
            style={{
              borderColor: mode === 'net_qty' ? '#0055A4' : '#cccccc',
              backgroundColor: mode === 'net_qty' ? '#EFF6FF' : '#ffffff',
              color: mode === 'net_qty' ? '#0055A4' : '#555555'
            }}
          >
            Table II: Net Quantity
          </button>
          <button
            onClick={() => { setMode('area'); setInputValue(''); }}
            className="flex-1 py-1.5 text-[11px] font-semibold border rounded-sm transition-colors"
            style={{
              borderColor: mode === 'area' ? '#0055A4' : '#cccccc',
              backgroundColor: mode === 'area' ? '#EFF6FF' : '#ffffff',
              color: mode === 'area' ? '#0055A4' : '#555555'
            }}
          >
            Table I: Area of PDP
          </button>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-700 mb-1 uppercase tracking-wider">
            {mode === 'net_qty' ? 'Net Quantity (in g or ml)' : 'Area of PDP (in cm²)'}
          </label>
          <div className="relative">
            <input
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`Enter ${mode === 'net_qty' ? 'weight/volume' : 'area'}...`}
              className="w-full pl-3 pr-8 py-2 text-xs border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500"
            />
            <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">
              {mode === 'net_qty' ? 'g/ml' : 'cm²'}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-sm p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] font-semibold text-slate-700">Minimum Required Font Height</span>
          </div>
          <div className="text-lg font-bold text-[#0055A4] font-mono">
            {minHeight > 0 ? `${minHeight.toFixed(1)} mm` : '-- mm'}
          </div>
        </div>

        {minHeight > 0 && (
          <div className="flex items-start gap-1.5 text-[10px] text-slate-500 bg-slate-100 p-2 rounded-sm border border-slate-200">
            <Info className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-0.5" />
            <p>
              If the packaging uses blown, formed, molded, or perforated characters, the legal minimum height is <strong>{(minHeight * 2).toFixed(1)} mm</strong> (double the normal printed height).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
