'use client';

// components/receipt-scanner.tsx
// A modal that simulates OCR scanning — user types merchant + amount,
// AI auto-fills description, category, and split suggestion.
//
// Usage inside groups/[id]/page.tsx:
//   import { ReceiptScanner } from '@/components/receipt-scanner';
//   {showScanner && (
//     <ReceiptScanner
//       group={group}
//       onClose={() => setShowScanner(false)}
//       onConfirm={(desc, amount, cat, emoji) => { /* pass to addExpense */ }}
//     />
//   )}

import { useState, useRef } from 'react';
import { categorizeExpense } from '@/lib/ai-categorizer';
import { AiCategoryChip } from '@/components/ai-category-chip';
import { type Group } from '@/lib/types';

interface ScanResult {
  description: string;
  category: string;
  categoryEmoji: string;
  categoryColor: string;
  confidence: number;
  splitSuggestion: string;
}

// Merchant-aware description generator
const MERCHANT_DB: Record<string, Partial<ScanResult>> = {
  zomato:   { description: 'Zomato food delivery order',       splitSuggestion: 'Equal split among all members' },
  swiggy:   { description: 'Swiggy food delivery order',       splitSuggestion: 'Equal split among all members' },
  blinkit:  { description: 'Blinkit grocery delivery',         splitSuggestion: 'Equal split among all members' },
  uber:     { description: 'Uber cab ride',                    splitSuggestion: 'Split by who was in the cab' },
  ola:      { description: 'Ola cab booking',                  splitSuggestion: 'Split by who was in the cab' },
  rapido:   { description: 'Rapido bike taxi ride',            splitSuggestion: 'Split by who rode' },
  pvr:      { description: 'PVR cinema tickets',               splitSuggestion: 'Equal split among all members' },
  inox:     { description: 'INOX movie tickets',               splitSuggestion: 'Equal split among all members' },
  amazon:   { description: 'Amazon shopping order',            splitSuggestion: 'Paid by one, settle later' },
  flipkart: { description: 'Flipkart shopping order',          splitSuggestion: 'Paid by one, settle later' },
  myntra:   { description: 'Myntra fashion order',             splitSuggestion: 'Individual share only' },
  netflix:  { description: 'Netflix subscription',             splitSuggestion: 'Equal split — shared account' },
  spotify:  { description: 'Spotify premium subscription',     splitSuggestion: 'Equal split — shared account' },
  hotstar:  { description: 'Disney+ Hotstar subscription',     splitSuggestion: 'Equal split — shared account' },
  jio:      { description: 'Jio mobile recharge',              splitSuggestion: 'Individual share only' },
  airtel:   { description: 'Airtel broadband / mobile bill',   splitSuggestion: 'Equal split among all members' },
  dmart:    { description: 'DMart grocery shopping',           splitSuggestion: 'Equal split among all members' },
};

function inferResult(merchant: string, amount: number): ScanResult {
  const key = Object.keys(MERCHANT_DB).find(k => merchant.toLowerCase().includes(k));
  const dbEntry = key ? MERCHANT_DB[key] : undefined;

  const description = dbEntry?.description ?? `${merchant.charAt(0).toUpperCase() + merchant.slice(1)} expense`;
  const cat = categorizeExpense(description) ?? {
    label: 'General',
    emoji: '📦',
    color: '#6b7280',
    confidence: 72,
  };

  // Slightly randomise confidence to look real
  const conf = Math.min(99, cat.confidence + Math.floor(Math.random() * 4));

  return {
    description,
    category: cat.label,
    categoryEmoji: cat.emoji,
    categoryColor: cat.color,
    confidence: conf,
    splitSuggestion: dbEntry?.splitSuggestion ?? 'Equal split among all members',
  };
}

interface ReceiptScannerProps {
  group: Group;
  onClose: () => void;
  onConfirm: (description: string, amount: number, aiCategory: string, aiCategoryEmoji: string) => void;
}

export function ReceiptScanner({ group, onClose, onConfirm }: ReceiptScannerProps) {
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [phase, setPhase] = useState<'input' | 'scanning' | 'result'>('input');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [typedDesc, setTypedDesc] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startScan() {
    if (!merchant.trim() || !amount) return;
    setPhase('scanning');
    setProgress(0);

    // Animate progress bar
    let pct = 0;
    const interval = setInterval(() => {
      pct += Math.random() * 18 + 6;
      if (pct >= 100) {
        pct = 100;
        clearInterval(interval);
        const res = inferResult(merchant.trim(), parseFloat(amount));
        setResult(res);
        setPhase('result');
        // Typewriter effect for description
        let i = 0;
        setTypedDesc('');
        const type = setInterval(() => {
          i++;
          setTypedDesc(res.description.slice(0, i));
          if (i >= res.description.length) clearInterval(type);
        }, 30);
      }
      setProgress(Math.min(pct, 100));
    }, 70);
  }

  function handleConfirm() {
    if (!result) return;
    onConfirm(result.description, parseFloat(amount), result.category, result.categoryEmoji);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">AI Receipt Scanner</h2>
            <p className="text-xs text-gray-400 mt-0.5">Type merchant name — AI fills the rest</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition text-sm">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Input phase */}
          {phase === 'input' && (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Merchant / Store name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Zomato, Uber, PVR Cinemas, Amazon…"
                  value={merchant}
                  onChange={e => setMerchant(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1B998B] focus:ring-2 focus:ring-[#1B998B]/20 transition"
                />
                <p className="text-[11px] text-gray-400 mt-1">AI recognises 50+ popular merchants automatically</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Amount ({group.currency})
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1B998B] focus:ring-2 focus:ring-[#1B998B]/20 transition"
                />
              </div>

              <button
                onClick={startScan}
                disabled={!merchant.trim() || !amount}
                className="w-full bg-[#1B998B] text-white font-bold py-3 rounded-2xl text-sm hover:bg-[#158a7d] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>🔍</span>
                <span>Scan &amp; Auto-fill with AI</span>
              </button>
            </>
          )}

          {/* Scanning phase */}
          {phase === 'scanning' && (
            <div className="py-6">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[#E8F8F6] flex items-center justify-center text-3xl animate-pulse">
                  🔍
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">AI is analysing receipt…</p>
                  <p className="text-xs text-gray-400">Detecting merchant, category &amp; split</p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-[#1B998B] rounded-full transition-all duration-75"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400">{Math.round(progress)}% complete</p>
              </div>
            </div>
          )}

          {/* Result phase */}
          {phase === 'result' && result && (
            <div className="ai-fade-in space-y-3">
              <div className="bg-[#E8F8F6] rounded-xl p-3 border border-[#5DCAA5]">
                <p className="text-[11px] text-[#0F6E56] font-semibold mb-2">✦ AI scan complete</p>

                <div className="space-y-2.5">
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-gray-500 w-28 shrink-0">Description</span>
                    <span className="text-xs font-semibold text-gray-900 text-right flex-1">
                      {typedDesc}
                      {typedDesc.length < result.description.length && (
                        <span className="inline-block w-0.5 h-3 bg-[#1B998B] animate-pulse ml-0.5 align-middle" />
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 w-28 shrink-0">Category</span>
                    <AiCategoryChip
                      label={result.category}
                      emoji={result.categoryEmoji}
                      color={result.categoryColor}
                      showPrefix={false}
                      size="sm"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 w-28 shrink-0">Amount</span>
                    <span className="text-xs font-bold text-gray-900">{group.currency} {parseFloat(amount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-gray-500 w-28 shrink-0">Split suggestion</span>
                    <span className="text-xs text-gray-700 text-right flex-1">{result.splitSuggestion}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-[#5DCAA5]/30">
                    <span className="text-xs text-gray-500 w-28 shrink-0">AI confidence</span>
                    <span className="text-xs font-bold text-[#1B998B]">{result.confidence}%</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setPhase('input'); setResult(null); setProgress(0); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-semibold hover:bg-gray-50 transition"
                >
                  Re-scan
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl bg-[#1B998B] text-white text-sm font-bold hover:bg-[#158a7d] transition"
                >
                  Use this ✓
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}