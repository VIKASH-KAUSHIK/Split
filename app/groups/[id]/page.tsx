'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Navbar } from '@/components/navbar';
import {
  getGroup,
  subscribeToGroupExpenses,
  addExpense,
  createInvite,
  subscribeToGroupSettlements,
  addSettlement,
  updateGroupWhiteboard,
} from '@/lib/firestore';
import {
  formatAmount,
  calculateGroupBalances,
  calculateMemberNetBalances,
  CURRENCY_SYMBOLS,
  type Group,
  type Expense,
  type Balance,
  type Settlement,
  type MemberNetBalance,
} from '@/lib/types';

const CATEGORY_ICONS: Record<string, string> = {
  trip: '✈️', home: '🏠', couple: '❤️', other: '📦',
};

type SplitMode = 'equally' | 'exact' | 'percentage' | 'shares' | 'adjustment';
type ModalType = 'addExpense' | 'invite' | 'settle' | 'charts' | 'balances' | 'totals' | 'whiteboard' | null;

const MODE_TABS: { mode: SplitMode; icon: string; label: string }[] = [
  { mode: 'equally', icon: '=', label: 'Equally' },
  { mode: 'exact', icon: '1.23', label: 'Exact' },
  { mode: 'percentage', icon: '%', label: 'Percent' },
  { mode: 'shares', icon: '▊▊', label: 'Shares' },
  { mode: 'adjustment', icon: '+/−', label: 'Adjust' },
];
const MODE_TITLES: Record<SplitMode, string> = {
  equally: 'Split equally', exact: 'Split by exact amounts', percentage: 'Split by percentages',
  shares: 'Split by shares', adjustment: 'Split by adjustment',
};
const MODE_DESCRIPTIONS: Record<SplitMode, string> = {
  equally: 'Select which people owe an equal share.',
  exact: 'Specify exactly how much each person owes.',
  percentage: 'Enter the percentage split for each person.',
  shares: 'Great for time-based splitting (2 nights → 2 shares).',
  adjustment: 'Enter adjustments; the rest is split equally.',
};
const MODE_LABELS: Record<SplitMode, string> = {
  equally: 'equally', exact: 'by exact amounts', percentage: 'by percentages',
  shares: 'by shares', adjustment: 'by adjustment',
};

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [memberTotals, setMemberTotals] = useState<MemberNetBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);

  // Add Expense state
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('equally');
  const [equallySelected, setEquallySelected] = useState<string[]>([]);
  const [exactValues, setExactValues] = useState<Record<string, string>>({});
  const [percentValues, setPercentValues] = useState<Record<string, string>>({});
  const [shareValues, setShareValues] = useState<Record<string, string>>({});
  const [adjustValues, setAdjustValues] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [expError, setExpError] = useState('');

  // Settle Up state
  const [settleTarget, setSettleTarget] = useState<Balance | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState('');

  // Whiteboard state
  const [whiteboardText, setWhiteboardText] = useState('');
  const whiteboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Invite state
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }

    let expUnsub: (() => void) | null = null;
    let settUnsub: (() => void) | null = null;

    getGroup(id).then((g) => {
      if (!g || !g.members.includes(user.uid)) { router.replace('/groups'); return; }
      setGroup(g);
      setWhiteboardText(g.whiteboard ?? '');
      expUnsub = subscribeToGroupExpenses(id, (exps) => {
        setExpenses(exps);
        setLoading(false);
      });
      settUnsub = subscribeToGroupSettlements(id, (setts) => {
        setSettlements(setts);
      });
    });
    return () => { expUnsub?.(); settUnsub?.(); };
  }, [id, user, authLoading, router]);

  useEffect(() => {
    if (!group || !user) return;
    setBalances(calculateGroupBalances(expenses, user.uid, group.memberDetails, settlements));
    setMemberTotals(calculateMemberNetBalances(expenses, settlements, group.memberDetails));
  }, [expenses, settlements, group, user]);

  function initSplitState(g: Group) {
    setPaidBy(user?.uid ?? g.members[0]);
    setSplitMode('equally');
    setEquallySelected(g.members);
    const initExact: Record<string, string> = {};
    const initPct: Record<string, string> = {};
    const initShares: Record<string, string> = {};
    const initAdj: Record<string, string> = {};
    g.members.forEach((uid) => { initExact[uid] = ''; initPct[uid] = ''; initShares[uid] = '1'; initAdj[uid] = '0'; });
    setExactValues(initExact); setPercentValues(initPct); setShareValues(initShares); setAdjustValues(initAdj);
    setShowAdvanced(g.members.length > 2);
    setExpDesc(''); setExpAmount(''); setExpError('');
  }

  function openModal(m: ModalType) {
    if (m === 'addExpense' && group) initSplitState(group);
    if (m === 'invite') { setInviteUrl(''); setCopied(false); handleInviteLoad(); }
    setModal(m);
  }

  async function handleInviteLoad() {
    if (!user || !group) return;
    setInviteLoading(true);
    try {
      const token = await createInvite(group, user.uid, group.inviteToken);
      setInviteUrl(`${window.location.origin}/join/${token}`);
    } finally { setInviteLoading(false); }
  }

  const numAmount = parseFloat(expAmount) || 0;
  const symbol = group ? (CURRENCY_SYMBOLS[group.currency] ?? group.currency) : '';

  function computeSplits(): Record<string, number> | null {
    if (!group || numAmount <= 0) return null;
    const splits: Record<string, number> = {};
    if (splitMode === 'equally') {
      if (equallySelected.length === 0) return null;
      const share = numAmount / equallySelected.length;
      for (const uid of equallySelected) { if (uid !== paidBy) splits[uid] = parseFloat(share.toFixed(2)); }
      return splits;
    }
    if (splitMode === 'exact') {
      let total = 0;
      for (const uid of group.members) { const v = parseFloat(exactValues[uid] || '0'); if (isNaN(v) || v < 0) return null; total += v; if (uid !== paidBy && v > 0) splits[uid] = v; }
      if (Math.abs(total - numAmount) > 0.01) return null;
      return splits;
    }
    if (splitMode === 'percentage') {
      let totalPct = 0;
      for (const uid of group.members) { const p = parseFloat(percentValues[uid] || '0'); if (isNaN(p) || p < 0) return null; totalPct += p; if (uid !== paidBy && p > 0) splits[uid] = parseFloat(((numAmount * p) / 100).toFixed(2)); }
      if (Math.abs(totalPct - 100) > 0.01) return null;
      return splits;
    }
    if (splitMode === 'shares') {
      let totalSh = 0;
      for (const uid of group.members) { const s = parseFloat(shareValues[uid] || '0'); if (isNaN(s) || s < 0) return null; totalSh += s; }
      if (totalSh <= 0) return null;
      for (const uid of group.members) { const s = parseFloat(shareValues[uid] || '0'); if (uid !== paidBy && s > 0) splits[uid] = parseFloat(((numAmount * s) / totalSh).toFixed(2)); }
      return splits;
    }
    if (splitMode === 'adjustment') {
      const base = numAmount / group.members.length;
      let totalAdj = 0;
      for (const uid of group.members) { const a = parseFloat(adjustValues[uid] || '0'); if (isNaN(a)) return null; totalAdj += a; }
      if (Math.abs(totalAdj) > 0.01) return null;
      for (const uid of group.members) { if (uid !== paidBy) { const f = base + (parseFloat(adjustValues[uid] || '0') || 0); if (f > 0) splits[uid] = parseFloat(f.toFixed(2)); } }
      return splits;
    }
    return null;
  }

  function getSplitFooter(): { text: string; valid: boolean } | null {
    if (!group || numAmount <= 0) return null;
    if (splitMode === 'equally') { const n = equallySelected.length; if (n === 0) return { text: 'Select at least 1 person', valid: false }; return { text: `${symbol}${(numAmount / n).toFixed(2)}/person (${n} ${n === 1 ? 'person' : 'people'})`, valid: true }; }
    if (splitMode === 'exact') { const entered = group.members.reduce((s, uid) => s + (parseFloat(exactValues[uid] || '0') || 0), 0); const rem = numAmount - entered; const valid = Math.abs(rem) < 0.01; return { text: `${symbol}${entered.toFixed(2)} of ${symbol}${numAmount.toFixed(2)}${valid ? '' : ` · ${symbol}${Math.abs(rem).toFixed(2)} ${rem > 0 ? 'left' : 'over'}`}`, valid }; }
    if (splitMode === 'percentage') { const totalPct = group.members.reduce((s, uid) => s + (parseFloat(percentValues[uid] || '0') || 0), 0); const rem = 100 - totalPct; const valid = Math.abs(rem) < 0.01; return { text: `${totalPct.toFixed(0)}% of 100%${valid ? '' : ` · ${Math.abs(rem).toFixed(0)}% ${rem > 0 ? 'left' : 'over'}`}`, valid }; }
    if (splitMode === 'shares') { const total = group.members.reduce((s, uid) => s + (parseFloat(shareValues[uid] || '0') || 0), 0); return { text: `${total} total share${total !== 1 ? 's' : ''}`, valid: total > 0 }; }
    if (splitMode === 'adjustment') { const total = group.members.reduce((s, uid) => s + (parseFloat(adjustValues[uid] || '0') || 0), 0); const valid = Math.abs(total) < 0.01; return { text: `${total >= 0 ? '+' : ''}${symbol}${total.toFixed(2)} total adjustments${valid ? ' ✓' : ' (must net to 0)'}`, valid }; }
    return null;
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !group) return;
    if (!expDesc.trim()) { setExpError('Enter a description.'); return; }
    if (numAmount <= 0) { setExpError('Enter a valid amount.'); return; }
    const splits = computeSplits();
    if (splits === null) { setExpError('Complete the split options before saving.'); return; }
    setAddingExpense(true); setExpError('');
    try { await addExpense(group.id, expDesc.trim(), numAmount, paidBy, splits, user.uid); setModal(null); }
    catch (err) { setExpError(err instanceof Error ? err.message : 'Failed to add expense.'); }
    finally { setAddingExpense(false); }
  }

  async function handleSettle(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !group || !settleTarget) return;
    const amt = parseFloat(settleAmount);
    if (isNaN(amt) || amt <= 0) { setSettleError('Enter a valid amount.'); return; }
    setSettling(true); setSettleError('');
    try {
      const isDebtor = settleTarget.amount > 0;
      const from = isDebtor ? settleTarget.uid : user.uid;
      const to = isDebtor ? user.uid : settleTarget.uid;
      await addSettlement(group.id, from, to, amt, settleNote.trim() || undefined);
      setSettleTarget(null); setSettleAmount(''); setSettleNote('');
    } catch (err) { setSettleError(err instanceof Error ? err.message : 'Failed to record payment.'); }
    finally { setSettling(false); }
  }

  function handleWhiteboardChange(text: string) {
    setWhiteboardText(text);
    if (whiteboardTimer.current) clearTimeout(whiteboardTimer.current);
    whiteboardTimer.current = setTimeout(() => {
      if (group) updateGroupWhiteboard(group.id, text).catch(() => {});
    }, 800);
  }

  function handleExport() {
    if (!group || expenses.length === 0) return;
    const memberCols = group.members.map((uid) => group.memberDetails[uid]?.displayName ?? uid);
    const header = ['Date', 'Description', 'Total', 'Paid By', ...memberCols].join(',');
    const rows = expenses.map((exp) => {
      const date = exp.date?.toDate?.().toLocaleDateString('en-IN') ?? '';
      const paidByName = group.memberDetails[exp.paidBy]?.displayName ?? exp.paidBy;
      const shareCols = group.members.map((uid) => { const s = exp.splits[uid] ?? 0; return s > 0 ? s.toFixed(2) : '0.00'; });
      return [date, `"${exp.description}"`, exp.amount.toFixed(2), paidByName, ...shareCols].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${group.name}-expenses.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#1B998B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!group) return null;

  const isTwoPeople = group.members.length === 2;
  const otherMember = isTwoPeople ? group.members.find((uid) => uid !== user?.uid) : undefined;
  const otherName = otherMember ? (group.memberDetails[otherMember]?.displayName ?? otherMember) : '';
  const memberList = group.members.map((uid) => ({ uid, ...group.memberDetails[uid] }));
  const paidByName = paidBy === user?.uid ? 'you' : (group.memberDetails[paidBy]?.displayName ?? paidBy);

  type QuickOption = { label: string; detail: string; paidByUid: string; splitWith: string[] };
  const quickOptions: QuickOption[] = isTwoPeople && otherMember && user
    ? [
        { label: 'You paid, split equally', detail: `${otherName} owes you ${formatAmount(numAmount / 2, group.currency)}`, paidByUid: user.uid, splitWith: [user.uid, otherMember] },
        { label: 'You are owed the full amount', detail: `${otherName} owes you ${formatAmount(numAmount, group.currency)}`, paidByUid: user.uid, splitWith: [otherMember] },
        { label: `${otherName} paid, split equally`, detail: `You owe ${otherName} ${formatAmount(numAmount / 2, group.currency)}`, paidByUid: otherMember, splitWith: [user.uid, otherMember] },
        { label: `${otherName} is owed the full amount`, detail: `You owe ${otherName} ${formatAmount(numAmount, group.currency)}`, paidByUid: otherMember, splitWith: [user.uid] },
      ] : [];
  function isQuickSelected(opt: QuickOption) { return splitMode === 'equally' && paidBy === opt.paidByUid && equallySelected.length === opt.splitWith.length && opt.splitWith.every((uid) => equallySelected.includes(uid)); }

  const footer = getSplitFooter();
  const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);
  const myMemberTotal = memberTotals.find((m) => m.uid === user?.uid);
  const mySharePct = totalSpend > 0 && myMemberTotal ? (myMemberTotal.totalOwed / totalSpend) * 100 : 0;
  const maxPaid = Math.max(...memberTotals.map((m) => m.totalPaid), 1);
  const maxOwed = Math.max(...memberTotals.map((m) => m.totalOwed), 1);

  const ACTION_BTNS = [
    { key: 'settle', icon: '💸', label: 'Settle Up' },
    { key: 'charts', icon: '📊', label: 'Charts' },
    { key: 'balances', icon: '⚖️', label: 'Balances' },
    { key: 'totals', icon: '🧮', label: 'Totals' },
    { key: 'whiteboard', icon: '📝', label: 'Whiteboard' },
    { key: 'export', icon: '⬇️', label: 'Export' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Link href="/groups" className="mt-1 text-gray-400 hover:text-gray-600 transition text-sm">← Back</Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{CATEGORY_ICONS[group.category] ?? '📦'}</span>
              <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">{memberList.length} member{memberList.length !== 1 ? 's' : ''} · {group.currency}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => openModal('invite')} className="text-sm font-medium text-[#1B998B] border border-[#1B998B] rounded-lg px-3 py-1.5 hover:bg-[#E8F8F6] transition">Invite</button>
            <button onClick={() => openModal('addExpense')} className="text-sm font-semibold bg-[#1B998B] text-white rounded-lg px-3 py-1.5 hover:bg-[#158a7d] transition">+ Expense</button>
          </div>
        </div>

        {/* Balances summary */}
        {balances.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Balances</h2>
            <div className="space-y-2">
              {balances.map((b) => (
                <div key={b.uid} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">{b.displayName[0]?.toUpperCase()}</div>
                    <span className="text-sm text-gray-700">{b.displayName}</span>
                  </div>
                  {b.amount > 0
                    ? <p className="text-sm font-semibold text-[#1B998B]">owes you {formatAmount(b.amount, group.currency)}</p>
                    : <p className="text-sm font-semibold text-[#E84545]">you owe {formatAmount(b.amount, group.currency)}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6-button action row */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {ACTION_BTNS.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => key === 'export' ? handleExport() : openModal(key as ModalType)}
              disabled={key === 'export' && expenses.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:border-[#1B998B] hover:text-[#1B998B] hover:bg-[#E8F8F6] transition whitespace-nowrap shrink-0 shadow-sm disabled:opacity-40"
            >
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>

        {/* Members */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Members</h2>
          <div className="flex flex-wrap gap-2">
            {memberList.map((m) => (
              <div key={m.uid} className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5">
                <div className="w-6 h-6 rounded-full bg-[#1B998B]/20 flex items-center justify-center text-xs font-bold text-[#1B998B]">{m.displayName?.[0]?.toUpperCase() ?? '?'}</div>
                <span className="text-sm text-gray-700 font-medium">{m.displayName}{m.uid === user?.uid ? ' (you)' : ''}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Expenses */}
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Expenses</h2>
          {expenses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <div className="text-5xl mb-3">🧾</div>
              <p className="text-gray-500 text-sm">No expenses yet</p>
              <button onClick={() => openModal('addExpense')} className="mt-4 text-sm font-semibold text-[#1B998B] hover:underline">Add the first expense</button>
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.map((exp) => {
                const isPaidByMe = exp.paidBy === user?.uid;
                const payerName = isPaidByMe ? 'You' : (group.memberDetails[exp.paidBy]?.displayName ?? exp.paidBy);
                const myShare = exp.splits[user?.uid ?? ''] ?? 0;
                const total = Object.values(exp.splits).reduce((s, v) => s + v, 0);
                return (
                  <div key={exp.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#E8F8F6] flex items-center justify-center text-lg shrink-0">🧾</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{exp.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{payerName} paid · {exp.date?.toDate?.().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) ?? ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900">{symbol}{total.toFixed(2)}</p>
                      {isPaidByMe ? <p className="text-xs text-[#1B998B] font-medium mt-0.5">you lent</p>
                        : myShare > 0 ? <p className="text-xs text-[#E84545] font-medium mt-0.5">you owe {symbol}{myShare.toFixed(2)}</p>
                        : <p className="text-xs text-gray-400 mt-0.5">not involved</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════════════ */}
      {/* ADD EXPENSE MODAL */}
      {modal === 'addExpense' && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <form onSubmit={handleAddExpense} className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button type="button" onClick={() => setModal(null)} className="text-sm text-[#E84545] font-semibold">Cancel</button>
              <h2 className="text-base font-bold text-gray-900">Add Expense</h2>
              <button type="submit" disabled={addingExpense} className="text-sm font-bold text-[#1B998B] disabled:opacity-40">{addingExpense ? 'Saving…' : 'Save'}</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <div className="px-5 pt-4 pb-2 space-y-3">
                <input type="text" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="What was this expense for?" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B998B] focus:ring-2 focus:ring-[#1B998B]/20 transition" required autoFocus />
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">{symbol}</span>
                  <input type="number" min="0.01" step="0.01" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm outline-none focus:border-[#1B998B] focus:ring-2 focus:ring-[#1B998B]/20 transition" required />
                </div>
              </div>
              <div className="px-5 py-3">
                <div className="bg-[#E8F8F6] rounded-xl px-4 py-3 flex items-center justify-between border border-[#1B998B]/20">
                  <span className="text-sm text-gray-700">{'Paid by '}<span className="font-bold text-[#1B998B]">{paidByName}</span>{' and split '}<span className="font-bold text-[#1B998B]">{MODE_LABELS[splitMode]}</span></span>
                </div>
              </div>
              <div className="px-5 pb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Paid by</p>
                <div className="flex flex-wrap gap-2">
                  {memberList.map((m) => (
                    <button key={m.uid} type="button" onClick={() => setPaidBy(m.uid)} className={`px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition ${paidBy === m.uid ? 'border-[#1B998B] bg-[#E8F8F6] text-[#1B998B]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {m.uid === user?.uid ? 'You' : m.displayName}
                    </button>
                  ))}
                </div>
              </div>
              {isTwoPeople && !showAdvanced ? (
                <div className="px-5 pb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick split</p>
                  <div className="space-y-2">
                    {quickOptions.map((opt, i) => (
                      <button key={i} type="button" onClick={() => { setPaidBy(opt.paidByUid); setSplitMode('equally'); setEquallySelected(opt.splitWith); }} className={`w-full text-left px-4 py-3 rounded-xl border-2 transition ${isQuickSelected(opt) ? 'border-[#1B998B] bg-[#E8F8F6]' : 'border-gray-100 hover:border-gray-200'}`}>
                        <p className={`text-sm font-semibold ${isQuickSelected(opt) ? 'text-[#1B998B]' : 'text-gray-800'}`}>{opt.label}</p>
                        {numAmount > 0 && <p className={`text-xs font-semibold mt-0.5 ${opt.paidByUid === user?.uid ? 'text-[#1B998B]' : 'text-[#E84545]'}`}>{opt.detail}</p>}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setShowAdvanced(true)} className="w-full mt-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">More options ›</button>
                </div>
              ) : (
                <div className="px-5 pb-4">
                  {isTwoPeople && <button type="button" onClick={() => setShowAdvanced(false)} className="text-sm text-[#1B998B] font-semibold mb-3 flex items-center gap-1">‹ Simple options</button>}
                  <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-4">
                    {MODE_TABS.map(({ mode, icon, label }) => (
                      <button key={mode} type="button" title={label} onClick={() => setSplitMode(mode)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${splitMode === mode ? 'bg-[#1B998B] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{icon}</button>
                    ))}
                  </div>
                  <p className="text-sm font-bold text-gray-800 text-center mb-0.5">{MODE_TITLES[splitMode]}</p>
                  <p className="text-xs text-gray-400 text-center mb-4">{MODE_DESCRIPTIONS[splitMode]}</p>
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                    {memberList.map((m) => {
                      const name = m.uid === user?.uid ? 'You' : m.displayName;
                      if (splitMode === 'equally') {
                        const checked = equallySelected.includes(m.uid); const share = equallySelected.length > 0 ? numAmount / equallySelected.length : 0;
                        return (<label key={m.uid} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition"><input type="checkbox" checked={checked} onChange={() => setEquallySelected((prev) => prev.includes(m.uid) ? prev.filter((u) => u !== m.uid) : [...prev, m.uid])} className="w-4 h-4 accent-[#1B998B]" /><div className="w-7 h-7 rounded-full bg-[#1B998B]/20 flex items-center justify-center text-xs font-bold text-[#1B998B]">{name[0]?.toUpperCase()}</div><span className="flex-1 text-sm text-gray-700 font-medium">{name}</span>{checked && numAmount > 0 && <span className="text-xs text-gray-400 font-semibold">{symbol}{share.toFixed(2)}</span>}</label>);
                      }
                      if (splitMode === 'exact') {
                        return (<div key={m.uid} className="flex items-center gap-3 px-4 py-3"><div className="w-7 h-7 rounded-full bg-[#1B998B]/20 flex items-center justify-center text-xs font-bold text-[#1B998B]">{name[0]?.toUpperCase()}</div><span className="flex-1 text-sm text-gray-700 font-medium">{name}</span><div className="flex items-center gap-1"><span className="text-sm text-gray-400">{symbol}</span><input type="number" min="0" step="0.01" value={exactValues[m.uid]} onChange={(e) => setExactValues((prev) => ({ ...prev, [m.uid]: e.target.value }))} placeholder="0.00" className="w-20 text-right text-sm font-semibold border-b-2 border-[#1B998B] outline-none bg-transparent py-1" /></div></div>);
                      }
                      if (splitMode === 'percentage') {
                        return (<div key={m.uid} className="flex items-center gap-3 px-4 py-3"><div className="w-7 h-7 rounded-full bg-[#1B998B]/20 flex items-center justify-center text-xs font-bold text-[#1B998B]">{name[0]?.toUpperCase()}</div><span className="flex-1 text-sm text-gray-700 font-medium">{name}</span><div className="flex items-center gap-1"><input type="number" min="0" max="100" step="0.01" value={percentValues[m.uid]} onChange={(e) => setPercentValues((prev) => ({ ...prev, [m.uid]: e.target.value }))} placeholder="0" className="w-16 text-right text-sm font-semibold border-b-2 border-[#1B998B] outline-none bg-transparent py-1" /><span className="text-sm text-gray-400 font-semibold">%</span></div></div>);
                      }
                      if (splitMode === 'shares') {
                        const sh = parseFloat(shareValues[m.uid] || '0'); const totalSh = memberList.reduce((s, mb) => s + (parseFloat(shareValues[mb.uid] || '0') || 0), 0); const shareAmt = totalSh > 0 ? (numAmount * sh) / totalSh : 0;
                        return (<div key={m.uid} className="flex items-center gap-3 px-4 py-3"><div className="w-7 h-7 rounded-full bg-[#1B998B]/20 flex items-center justify-center text-xs font-bold text-[#1B998B]">{name[0]?.toUpperCase()}</div><div className="flex-1"><p className="text-sm text-gray-700 font-medium">{name}</p>{numAmount > 0 && totalSh > 0 && <p className="text-xs text-gray-400">{symbol}{shareAmt.toFixed(2)}</p>}</div><div className="flex items-center gap-1"><input type="number" min="0" step="1" value={shareValues[m.uid]} onChange={(e) => setShareValues((prev) => ({ ...prev, [m.uid]: e.target.value }))} placeholder="1" className="w-16 text-right text-sm font-semibold border-b-2 border-[#1B998B] outline-none bg-transparent py-1" /><span className="text-xs text-gray-400">share(s)</span></div></div>);
                      }
                      if (splitMode === 'adjustment') {
                        const base = memberList.length > 0 ? numAmount / memberList.length : 0; const adj = parseFloat(adjustValues[m.uid] || '0') || 0; const final = base + adj;
                        return (<div key={m.uid} className="flex items-center gap-3 px-4 py-3"><div className="w-7 h-7 rounded-full bg-[#1B998B]/20 flex items-center justify-center text-xs font-bold text-[#1B998B]">{name[0]?.toUpperCase()}</div><div className="flex-1"><p className="text-sm text-gray-700 font-medium">{name}</p>{numAmount > 0 && <p className="text-xs text-gray-400">{symbol}{final.toFixed(2)}</p>}</div><div className="flex items-center gap-1"><span className="text-sm text-gray-400 font-semibold">+</span><input type="number" step="0.01" value={adjustValues[m.uid] === '0' ? '' : adjustValues[m.uid]} onChange={(e) => setAdjustValues((prev) => ({ ...prev, [m.uid]: e.target.value || '0' }))} placeholder="0.00" className="w-20 text-right text-sm font-semibold border-b-2 border-[#1B998B] outline-none bg-transparent py-1" /></div></div>);
                      }
                      return null;
                    })}
                  </div>
                  {splitMode === 'equally' && <button type="button" onClick={() => setEquallySelected(group.members)} className="mt-2 text-xs text-[#1B998B] font-semibold hover:underline">Select all</button>}
                </div>
              )}
              {expError && <p className="px-5 pb-3 text-sm text-[#E84545] font-medium">{expError}</p>}
            </div>
            {footer && (
              <div className={`px-5 py-3 border-t text-center text-sm font-semibold ${footer.valid ? 'bg-[#E8F8F6] text-[#1B998B] border-[#1B998B]/20' : 'bg-red-50 text-[#E84545] border-red-100'}`}>{footer.text}</div>
            )}
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* INVITE MODAL */}
      {modal === 'invite' && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Invite to Group</h2>
            <p className="text-sm text-gray-500">Share this link with your friend so they can join the group.</p>
            {inviteLoading ? <div className="flex justify-center py-4"><div className="w-8 h-8 border-4 border-[#1B998B] border-t-transparent rounded-full animate-spin" /></div> : (
              <div className="flex gap-2">
                <input readOnly value={inviteUrl} className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-600 bg-gray-50 outline-none" />
                <button onClick={() => { navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-4 py-2 rounded-xl bg-[#1B998B] text-white text-sm font-semibold hover:bg-[#158a7d] transition whitespace-nowrap">{copied ? 'Copied!' : 'Copy'}</button>
              </div>
            )}
            <button onClick={() => setModal(null)} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">Close</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* SETTLE UP MODAL */}
      {modal === 'settle' && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button onClick={() => { setModal(null); setSettleTarget(null); }} className="text-sm text-gray-400 font-semibold">✕</button>
              <h2 className="text-base font-bold text-gray-900">Settle Up</h2>
              <div className="w-8" />
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {balances.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-3">✅</div>
                  <p className="font-bold text-gray-900 text-lg">All settled up!</p>
                  <p className="text-sm text-gray-500 mt-1">No outstanding balances.</p>
                </div>
              ) : (
                <>
                  <p className="text-lg font-bold text-gray-900 mb-4">Which balance do you want to settle?</p>
                  <div className="space-y-3">
                    {balances.map((b) => (
                      <button key={b.uid} onClick={() => { setSettleTarget(b); setSettleAmount(Math.abs(b.amount).toFixed(2)); setSettleNote(''); setSettleError(''); }} className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition ${settleTarget?.uid === b.uid ? 'border-[#1B998B] bg-[#E8F8F6]' : 'border-gray-100 hover:border-gray-200'}`}>
                        <div className="w-10 h-10 rounded-full bg-[#1B998B]/20 flex items-center justify-center text-base font-bold text-[#1B998B] shrink-0">{b.displayName[0]?.toUpperCase()}</div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{b.displayName}</p>
                          <p className={`text-sm font-semibold ${b.amount > 0 ? 'text-[#1B998B]' : 'text-[#E84545]'}`}>{b.amount > 0 ? 'owes you' : 'you owe'} {formatAmount(b.amount, group.currency)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {settleTarget && (
              <form onSubmit={handleSettle} className="border-t border-gray-100 p-5 space-y-3 bg-gray-50">
                <p className="text-sm font-bold text-gray-900">Record a payment</p>
                <p className="text-xs text-gray-500">{settleTarget.amount > 0 ? `${settleTarget.displayName} pays you` : `You pay ${settleTarget.displayName}`}</p>
                <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-4 py-2">
                  <span className="text-lg font-semibold text-gray-400">{symbol}</span>
                  <input type="number" min="0.01" step="0.01" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} className="flex-1 text-2xl font-bold text-gray-900 outline-none bg-transparent" onFocus={(e) => e.target.select()} />
                </div>
                <input value={settleNote} onChange={(e) => setSettleNote(e.target.value)} placeholder="Add a note (optional)" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#1B998B] bg-white" />
                {settleError && <p className="text-sm text-[#E84545] font-medium">{settleError}</p>}
                <button type="submit" disabled={settling} className="w-full py-3 bg-[#1B998B] text-white font-bold rounded-xl hover:bg-[#158a7d] transition disabled:opacity-60">{settling ? 'Saving…' : 'Record Payment'}</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* CHARTS MODAL */}
      {modal === 'charts' && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button onClick={() => setModal(null)} className="text-sm text-gray-400 font-semibold">✕</button>
              <h2 className="text-base font-bold text-gray-900">Charts</h2>
              <div className="w-8" />
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-6">
              <div className="bg-[#E8F8F6] rounded-2xl p-5 text-center">
                <p className="text-xs font-semibold text-[#1B998B] uppercase tracking-wide mb-1">Total Group Spending</p>
                <p className="text-4xl font-bold text-gray-900">{formatAmount(totalSpend, group.currency)}</p>
                <p className="text-xs text-gray-500 mt-1">{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</p>
              </div>

              <div>
                <p className="text-sm font-bold text-gray-800 mb-3">Amount Paid by Each Member</p>
                <div className="space-y-3">
                  {memberTotals.map((m) => {
                    const pct = maxPaid > 0 ? (m.totalPaid / maxPaid) * 100 : 0;
                    const isMe = m.uid === user?.uid;
                    return (
                      <div key={m.uid}>
                        <div className="flex justify-between mb-1.5">
                          <span className="text-sm font-medium text-gray-700">{isMe ? 'You' : m.displayName}</span>
                          <span className="text-sm font-semibold text-gray-500">{formatAmount(m.totalPaid, group.currency)}</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: isMe ? '#1B998B' : '#1B998B88' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold text-gray-800 mb-3">Amount Spent by Each Member</p>
                <div className="space-y-3">
                  {memberTotals.map((m) => {
                    const pct = maxOwed > 0 ? (m.totalOwed / maxOwed) * 100 : 0;
                    const isMe = m.uid === user?.uid;
                    return (
                      <div key={m.uid}>
                        <div className="flex justify-between mb-1.5">
                          <span className="text-sm font-medium text-gray-700">{isMe ? 'You' : m.displayName}</span>
                          <span className="text-sm font-semibold text-gray-500">{formatAmount(m.totalOwed, group.currency)}</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: isMe ? '#E84545' : '#E8454588' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* BALANCES MODAL */}
      {modal === 'balances' && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button onClick={() => setModal(null)} className="text-sm text-gray-400 font-semibold">✕</button>
              <h2 className="text-base font-bold text-gray-900">Group Balances</h2>
              <div className="w-8" />
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {memberTotals.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">No expenses yet.</div>
              ) : memberTotals.map((m) => {
                const isMe = m.uid === user?.uid;
                const mBalances = calculateGroupBalances(expenses, m.uid, group.memberDetails, settlements);
                return (
                  <div key={m.uid} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-3 p-4">
                      <div className="w-10 h-10 rounded-full bg-[#1B998B]/20 flex items-center justify-center text-base font-bold text-[#1B998B] shrink-0">{m.displayName[0]?.toUpperCase()}</div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{isMe ? 'You' : m.displayName}</p>
                        {m.net > 0.001 ? <p className="text-sm font-semibold text-[#1B998B]">gets back {formatAmount(m.net, group.currency)} in total</p>
                          : m.net < -0.001 ? <p className="text-sm font-semibold text-[#E84545]">owes {formatAmount(Math.abs(m.net), group.currency)} in total</p>
                          : <p className="text-sm text-gray-400">settled up</p>}
                      </div>
                    </div>
                    {mBalances.filter((b) => b.amount > 0).map((b) => (
                      <div key={b.uid} className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-white">
                        <p className="text-sm text-gray-600">
                          <span className="font-semibold">{b.displayName}</span>{' owes '}
                          <span className="text-[#1B998B] font-semibold">{formatAmount(b.amount, group.currency)}</span>
                          {' to '}<span className="font-semibold">{isMe ? 'you' : m.displayName}</span>
                        </p>
                        {isMe && (
                          <button onClick={() => { setSettleTarget(b); setSettleAmount(Math.abs(b.amount).toFixed(2)); setSettleNote(''); setSettleError(''); setModal('settle'); }} className="text-xs font-semibold text-[#1B998B] border border-[#1B998B] rounded-lg px-2 py-1 hover:bg-[#E8F8F6] transition whitespace-nowrap ml-2">Settle up</button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* TOTALS MODAL */}
      {modal === 'totals' && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button onClick={() => setModal(null)} className="text-sm text-gray-400 font-semibold">✕</button>
              <h2 className="text-base font-bold text-gray-900">Totals</h2>
              <div className="w-8" />
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div className="bg-[#E8F8F6] rounded-2xl p-6 text-center border border-[#1B998B]/20">
                <p className="text-sm font-semibold text-gray-500 mb-1">{group.name}</p>
                <p className="text-xs text-gray-400 mb-3">All-time group spending</p>
                <p className="text-5xl font-bold text-gray-900">{formatAmount(totalSpend, group.currency)}</p>
                {myMemberTotal && (
                  <div className="mt-4 pt-4 border-t border-[#1B998B]/20 space-y-2 text-left">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#1B998B]" /><span className="text-sm text-gray-600">Total spent</span></div>
                      <span className="text-sm font-bold text-gray-900">{formatAmount(totalSpend, group.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#E84545]" /><span className="text-sm text-gray-600">Your share</span></div>
                      <span className="text-sm font-bold text-gray-900">{formatAmount(myMemberTotal.totalOwed, group.currency)}</span>
                    </div>
                    <p className="text-xs text-gray-400 text-center mt-1">{mySharePct.toFixed(0)}% of total group spending</p>
                  </div>
                )}
              </div>

              <p className="text-sm font-bold text-gray-800">Per Member</p>
              <div className="space-y-3">
                {memberTotals.map((m) => {
                  const isMe = m.uid === user?.uid;
                  return (
                    <div key={m.uid} className="flex items-center gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <div className="w-10 h-10 rounded-full bg-[#1B998B]/20 flex items-center justify-center text-base font-bold text-[#1B998B] shrink-0">{m.displayName[0]?.toUpperCase()}</div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{isMe ? 'You' : m.displayName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Paid: {formatAmount(m.totalPaid, group.currency)} · Spent: {formatAmount(m.totalOwed, group.currency)}</p>
                      </div>
                      <div className="text-right">
                        {m.net > 0.001 ? (<><p className="text-xs text-[#1B998B]">gets back</p><p className="font-bold text-[#1B998B]">{formatAmount(m.net, group.currency)}</p></>) :
                          m.net < -0.001 ? (<><p className="text-xs text-[#E84545]">owes</p><p className="font-bold text-[#E84545]">{formatAmount(Math.abs(m.net), group.currency)}</p></>) :
                          <p className="text-sm text-gray-400">settled</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* WHITEBOARD MODAL */}
      {modal === 'whiteboard' && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button onClick={() => setModal(null)} className="text-sm text-gray-400 font-semibold">✕</button>
              <h2 className="text-base font-bold text-gray-900">Whiteboard</h2>
              <span className="text-xs font-semibold text-[#1B998B]">Auto-saves</span>
            </div>
            <div className="flex-1 p-5 flex flex-col">
              <textarea
                value={whiteboardText}
                onChange={(e) => handleWhiteboardChange(e.target.value)}
                placeholder="Write shared notes for this group… visible to all members in real-time."
                className="flex-1 w-full resize-none border border-gray-200 rounded-xl p-4 text-sm text-gray-900 outline-none focus:border-[#1B998B] focus:ring-2 focus:ring-[#1B998B]/20 transition leading-relaxed min-h-[200px]"
                autoFocus
              />
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
              <span className="text-xs text-gray-400">🔄</span>
              <p className="text-xs text-gray-400">Changes are visible to all group members instantly</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
