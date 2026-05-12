'use client';

// components/ai-budget-panel.tsx
// Shows per-category budget usage with AI warnings.
// Embed inside groups/[id]/page.tsx as a new "Budget" tab.
//
// Usage:
//   import { AiBudgetPanel } from '@/components/ai-budget-panel';
//   <AiBudgetPanel expenses={expenses} currency={group.currency} currentUserId={user.uid} />

import { useMemo, useState } from 'react';
import { type Expense } from '@/lib/types';
import { categorizeExpense } from '@/lib/ai-categorizer';

// Default monthly budgets per category (INR)
const DEFAULT_BUDGETS: Record<string, number> = {
  'Food & Dining':    3500,
  'Travel':           2500,
  'Entertainment':    2000,
  'Shopping':         3000,
  'Utilities':        1500,
  'Health & Fitness': 1000,
  'Education':        1500,
};

interface BudgetEntry {
  label: string;
  emoji: string;
  color: string;
  spent: number;
  budget: number;
  pct: number;
}

interface AiBudgetPanelProps {
  expenses: Expense[];
  currency: string;
  currentUserId: string;
}

export function AiBudgetPanel({ expenses, currency, currentUserId }: AiBudgetPanelProps) {
  const [customBudgets, setCustomBudgets] = useState<Record<string, number>>(DEFAULT_BUDGETS);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const symbol = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency + ' ');

  const entries: BudgetEntry[] = useMemo(() => {
    const spendMap: Record<string, { spent: number; emoji: string; color: string }> = {};

    for (const exp of expenses) {
      const myShare = exp.splits[currentUserId] ?? 0;
      if (!myShare) continue;

      const cat = exp.aiCategory
        ? { label: exp.aiCategory, emoji: exp.aiCategoryEmoji ?? '📦', color: '#1B998B' }
        : categorizeExpense(exp.description);
      if (!cat) continue;

      if (!spendMap[cat.label]) {
        spendMap[cat.label] = { spent: 0, emoji: cat.emoji, color: cat.color };
      }
      spendMap[cat.label].spent += myShare;
    }

    return Object.entries(spendMap).map(([label, { spent, emoji, color }]) => {
      const budget = customBudgets[label] ?? 2000;
      return {
        label, emoji, color, spent,
        budget,
        pct: Math.min(Math.round((spent / budget) * 100), 110),
      };
    }).sort((a, b) => b.pct - a.pct);
  }, [expenses, currentUserId, customBudgets]);

  function getWarning(entry: BudgetEntry): { text: string; level: 'ok' | 'warn' | 'danger' } {
    if (entry.pct >= 95) return {
      text: `Over budget! Spent ${symbol}${(entry.spent - entry.budget).toFixed(0)} extra this month`,
      level: 'danger',
    };
    if (entry.pct >= 80) return {
      text: `Almost at limit — ${symbol}${(entry.budget - entry.spent).toFixed(0)} remaining`,
      level: 'warn',
    };
    if (entry.pct >= 60) return {
      text: `On track — ${symbol}${(entry.budget - entry.spent).toFixed(0)} left for the month`,
      level: 'ok',
    };
    return {
      text: `Well within budget — ${symbol}${(entry.budget - entry.spent).toFixed(0)} remaining`,
      level: 'ok',
    };
  }

  const warningConfig = {
    danger: { bar: '#E84545', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '⚠️' },
    warn:   { bar: '#F59E0B', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: '💡' },
    ok:     { bar: '#1B998B', bg: 'bg-[#E8F8F6]', border: 'border-[#5DCAA5]', text: 'text-[#0F6E56]', icon: '✅' },
  };

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">💡</div>
        <p className="text-sm font-semibold text-gray-900 mb-1">No budget data yet</p>
        <p className="text-xs text-gray-400">Add expenses with descriptions so AI can track budgets</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-[#E8F8F6] rounded-2xl border border-[#5DCAA5] px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] bg-white text-[#0F6E56] border border-[#5DCAA5] px-2 py-0.5 rounded-full font-semibold">✦ AI Budget Tracker</span>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          AI monitors your spending per category and warns you before you overshoot. Tap any budget amount to edit it.
        </p>
      </div>

      {/* Budget cards */}
      {entries.map(entry => {
        const warning = getWarning(entry);
        const cfg = warningConfig[warning.level];
        const isEditingThis = editing === entry.label;

        return (
          <div key={entry.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            {/* Top row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{entry.emoji}</span>
                <span className="text-sm font-semibold text-gray-900">{entry.label}</span>
              </div>
              <span
                className="text-sm font-bold"
                style={{ color: entry.pct >= 95 ? '#E84545' : entry.pct >= 80 ? '#B45309' : '#1B998B' }}
              >
                {entry.pct}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(entry.pct, 100)}%`, backgroundColor: cfg.bar }}
              />
            </div>

            {/* Amounts row */}
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-400">
                {symbol}{entry.spent.toFixed(0)} spent
              </span>
              {isEditingThis ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">Budget:</span>
                  <input
                    type="number"
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    className="w-20 text-xs border border-[#1B998B] rounded-lg px-2 py-0.5 outline-none text-right"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      const val = parseFloat(editVal);
                      if (val > 0) setCustomBudgets(prev => ({ ...prev, [entry.label]: val }));
                      setEditing(null);
                    }}
                    className="text-xs text-[#1B998B] font-bold px-1"
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditing(entry.label); setEditVal(String(entry.budget)); }}
                  className="text-xs text-gray-400 hover:text-[#1B998B] transition"
                >
                  Budget: {symbol}{entry.budget.toLocaleString()} ✏️
                </button>
              )}
            </div>

            {/* AI warning chip */}
            <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
              <span>{cfg.icon}</span>
              <span>AI: {warning.text}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}