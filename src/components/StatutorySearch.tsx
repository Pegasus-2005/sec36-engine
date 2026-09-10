'use client';

import { useState, useMemo } from 'react';
import { Search, BookOpen, AlertCircle } from 'lucide-react';
import statutoryData from '../data/statutory-index.json';

export function StatutorySearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return statutoryData;
    const q = query.toLowerCase();
    return statutoryData.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.text.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="hidden lg:flex fixed bottom-6 right-6 z-40 flex flex-col items-end">
      {isOpen && (
        <div 
          className="mb-4 w-96 max-h-[500px] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5"
          role="dialog"
          aria-label="Statutory Search Index"
          aria-modal="false"
        >
          <div className="p-4 border-b border-slate-700 bg-slate-950 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2" id="statutory-search-title">
              <BookOpen className="w-4 h-4 text-amber-500" aria-hidden="true" />
              Statutory RAG Index (Offline)
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 rounded p-1"
              aria-label="Close Statutory Search"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          
          <div className="p-3 border-b border-slate-700 bg-slate-800/50">
            <div className="relative">
              <label htmlFor="statutory-search-input" className="sr-only">Search statutory index</label>
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" aria-hidden="true" />
              <input
                id="statutory-search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Act, Rules, Sections..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500 transition-all"
                aria-controls="statutory-search-results"
              />
            </div>
          </div>

          <div 
            id="statutory-search-results"
            className="overflow-y-auto p-2 flex-1 scrollbar-thin scrollbar-thumb-slate-700"
            role="region"
            aria-live="polite"
          >
            {results.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                <AlertCircle className="w-6 h-6 text-slate-600" />
                No statutory provisions found for "{query}".
              </div>
            ) : (
              <ul className="space-y-2">
                {results.map((item) => (
                  <li key={item.id} className="p-3 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700/50">
                    <h4 className="text-xs font-bold text-amber-400 mb-1">{item.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{item.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={isOpen ? "statutory-search-results" : undefined}
        className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-lg font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-amber-500 ${
          isOpen
            ? 'bg-amber-600 hover:bg-amber-500 text-white'
            : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700'
        }`}
      >
        <BookOpen className="w-4 h-4" aria-hidden="true" />
        {isOpen ? 'Close Index' : 'Statutory Reference'}
      </button>
    </div>
  );
}
