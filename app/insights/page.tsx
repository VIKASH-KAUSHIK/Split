'use client';

// app/insights/page.tsx  ← NEW FILE
// Also add this to navbar NAV_LINKS:
//   { href: '/insights', label: 'Insights', icon: '📊' }

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Navbar } from '@/components/navbar';
import { subscribeToUserGroups, subscribeToGroupExpenses } from '@/lib/firestore';
import { type Group, type Expense } from '@/lib/types';
import { categorizeExpense } from '@/lib/ai-categorizer';

interface CategoryTotal {
  label: string;
  emoji: string;
  color: string;
  total: number;
}

export default function InsightsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [allExpenses, setAllExpenses] = useState<(Expense & { currency: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryShown, setSummaryShown] = useState(false);

  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<unknown>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }

    const unsubs: (() => void)[] = [];
    const expMap: Record<string, (Expense & { currency: string })[]> = {};

    const unsubGroups = subscribeToUserGroups(user.uid, (groups) => {
      unsubs.forEach(u => u());
      unsubs.length = 0;
      if (groups.length === 0) { setAllExpenses([]); setLoading(false); return; }

      for (const g of groups) {
        expMap[g.id] = [];
        const unsub = subscribeToGroupExpenses(g.id, (exps) => {
          expMap[g.id] = exps.map(e => ({ ...e, currency: g.currency }));
          const all = Object.values(expMap).flat();
          all.sort((a, b) => (b.date?.toMillis?.() ?? 0) - (a.date?.toMillis?.() ?? 0));
          setAllExpenses(all);
          setLoading(false);
        });
        unsubs.push(unsub);
      }
    });

    return () => { unsubGroups(); unsubs.forEach(u => u()); };
  }, [user, authLoading, router]);

  const categoryMap: Record<string, CategoryTotal> = {};
  for (const exp of allExpenses) {
    if (exp.currency !== 'INR') continue;
    const myShare = exp.splits[user?.uid ?? ''] ?? 0;
    if (!myShare) continue;
    const cat = (exp.aiCategory && exp.aiCategoryEmoji)
      ? { label: exp.aiCategory, emoji: exp.aiCategoryEmoji, color: '#1B998B' }
      : categorizeExpense(exp.description);
    if (!cat) continue;
    if (!categoryMap[cat.label]) categoryMap[cat.label] = { label: cat.label, emoji: cat.emoji, color: cat.color, total: 0 };
    categoryMap[cat.label].total += myShare;
  }

  const categories = Object.values(categoryMap).sort((a, b) => b.total - a.total).slice(0, 6);
  const totalSpent = categories.reduce((s, c) => s + c.total, 0);
  const maxCatTotal = categories[0]?.total ?? 1;

  // Weekly data — last 6 weeks
  const weeklyData = (() => {
    const map: Record<number, number> = {};
    const now = Date.now();
    for (const exp of allExpenses) {
      if (exp.currency !== 'INR') continue;
      const myShare = exp.splits[user?.uid ?? ''] ?? 0;
      if (!myShare) continue;
      const d = exp.date?.toDate?.();
      if (!d) continue;
      const weeksAgo = Math.floor((now - d.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksAgo > 5) continue;
      const key = 5 - weeksAgo;
      map[key] = (map[key] ?? 0) + myShare;
    }
    return Array.from({ length: 6 }, (_, i) => map[i] ?? 0);
  })();

  useEffect(() => {
    if (!chartRef.current || categories.length === 0) return;
    import('chart.js/auto').then(({ Chart }) => {
      if (chartInstance.current) (chartInstance.current as { destroy: () => void }).destroy();
      if (!chartRef.current) return;
      chartInstance.current = new Chart(chartRef.current, {
        type: 'line',
        data: {
          labels: ['5w ago', '4w ago', '3w ago', '2w ago', 'Last wk', 'This wk'],
          datasets: [{
            label: 'Your spend (₹)',
            data: weeklyData,
            borderColor: '#1B998B',
            backgroundColor: 'rgba(27,153,139,0.10)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#1B998B',
            pointRadius: 5,
            borderWidth: 2.5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: {
              grid: { color: 'rgba(0,0,0,0.05)' },
              ticks: { font: { size: 11 }, callback: (v) => '₹' + v },
            },
          },
        },
      });
    });
    return () => {
      if (chartInstance.current) { (chartInstance.current as { destroy: () => void }).destroy(); chartInstance.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allExpenses]);

  function generateSummary() {
    setSummaryLoading(true);
    setSummaryShown(true);
    setTimeout(() => {
      if (categories.length === 0) { setAiSummary('No data yet. Add expenses to get insights!'); setSummaryLoading(false); return; }
      const top = categories[0];
      const second = categories[1];
      const pct = Math.round((top.total / totalSpent) * 100);
      const templates = [
        `Your biggest spend is ${top.emoji} ${top.label} at ₹${top.total.toFixed(0)} (${pct}% of total). ${second ? `${second.emoji} ${second.label} at ₹${second.total.toFixed(0)} is next.` : ''} Consider setting a monthly cap.`,
        `AI analysis: ₹${totalSpent.toFixed(0)} spent across ${categories.length} categories. ${top.emoji} ${top.label} dominates at ${pct}%. Cutting back 20% here saves ₹${Math.round(top.total * 0.2)} monthly.`,
        `Spending looks ${totalSpent > 8000 ? 'higher than average' : 'reasonable'} this month. ${top.emoji} ${top.label} is your top category at ₹${top.total.toFixed(0)}. ${second ? `Keep an eye on ${second.emoji} ${second.label} too.` : ''}`,
      ];
      setAiSummary(templates[Math.floor(Math.random() * templates.length)]);
      setSummaryLoading(false);
    }, 1400);
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#1B998B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
          <span className="text-[11px] bg-[#E8F8F6] text-[#0F6E56] border border-[#5DCAA5] px-2 py-0.5 rounded-full font-semibold">✦ AI powered</span>
        </div>
        <p className="text-sm text-gray-400 mb-5">Smart breakdown of your personal spending share</p>

        {categories.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No data yet</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto">Add expenses to your groups — AI will categorise them and show spending insights here.</p>
          </div>
        ) : (
          <>
            {/* Metric cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Your total', value: `₹${totalSpent.toFixed(0)}`, sub: 'your share' },
                { label: 'Categories', value: `${categories.length}`, sub: 'AI detected' },
                { label: 'Top spend', value: categories[0]?.emoji ?? '—', sub: categories[0]?.label.split(' ')[0] ?? '' },
              ].map(m => (
                <div key={m.label} className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                  <p className="text-xl font-bold text-gray-900">{m.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* Category bars */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-900">Spending by category</p>
                <span className="text-[11px] bg-[#E8F8F6] text-[#0F6E56] border border-[#5DCAA5] px-2 py-0.5 rounded-full font-semibold">✦ AI grouped</span>
              </div>
              <div className="space-y-3">
                {categories.map(cat => (
                  <div key={cat.label}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{cat.emoji}</span>
                      <span className="text-xs text-gray-600 flex-1">{cat.label}</span>
                      <span className="text-xs font-bold text-gray-900">₹{cat.total.toFixed(0)}</span>
                      <span className="text-xs text-gray-400 w-8 text-right">{Math.round((cat.total / totalSpent) * 100)}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.max((cat.total / maxCatTotal) * 100, 4)}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Weekly trend */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
              <p className="text-sm font-bold text-gray-900 mb-3">Weekly spending trend</p>
              <div className="relative h-44">
                <canvas ref={chartRef} role="img" aria-label="Line chart showing your weekly spending share over 6 weeks" />
              </div>
            </div>

            {/* AI Summary */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-900">AI spending insight</p>
                {!summaryShown && (
                  <button onClick={generateSummary} className="text-xs bg-[#1B998B] text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-[#158a7d] transition">
                    Generate ✦
                  </button>
                )}
              </div>
              {summaryLoading && (
                <div className="flex items-center gap-2 py-3">
                  <div className="flex gap-1">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-[#1B998B] animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400 font-medium">AI is analysing your data…</span>
                </div>
              )}
              {aiSummary && !summaryLoading && (
                <div className="ai-fade-in bg-[#E8F8F6] rounded-xl p-3 border-l-2 border-[#1B998B]">
                  <p className="text-[11px] text-[#0F6E56] font-semibold mb-1">✦ AI analysis</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{aiSummary}</p>
                </div>
              )}
              {!summaryShown && (
                <p className="text-xs text-gray-400">Click Generate to get a personalised AI summary of your spending patterns.</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}