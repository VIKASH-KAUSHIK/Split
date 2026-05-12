'use client';

// app/groups/[id]/page.tsx  ← REPLACE existing file
// All 4 AI features wired in:
//   1. AI category detection (live while typing description)
//   2. Receipt scanner modal (+ Add button)
//   3. AI budget panel (Budget tab)
//   4. AI reminder button (Balances tab)

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Navbar } from '@/components/navbar';
import { AiCategoryDetector, AiCategoryChip } from '@/components/ai-category-chip';
import { ReceiptScanner } from '@/components/receipt-scanner';
import { AiBudgetPanel } from '@/components/ai-budget-panel';
import { AiReminderButton } from '@/components/ai-reminder-button';
import {
  getGroup,
  subscribeToGroupExpenses,
  subscribeToGroupSettlements,
  addExpense,
  deleteExpense,
} from '@/lib/firestore';
import {
  formatAmount,
  calculateGroupBalances,
  type Group,
  type Expense,
  type Settlement,
} from '@/lib/types';
import { categorizeExpense, type CategoryResult } from '@/lib/ai-categorizer';

// ─── Add Expense Modal ──────────────────────────────────────────────────────

interface AddExpenseModalProps {
  group: Group;
  currentUserId: string;
  onClose: () => void;
  onSave: (
    description: string,
    amount: number,
    paidBy: string,
    splits: Record<string, number>,
    aiCategory?: string,
    aiCategoryEmoji?: string
  ) => Promise<void>;
}

function AddExpenseModal({ group, currentUserId, onClose, onSave }: AddExpenseModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [aiCategory, setAiCategory] = useState<CategoryResult | null>(null);

  const members = group.members;
  const total = parseFloat(amount) || 0;

  const equalSplitMap: Record<string, number> = {};
  if (total > 0 && members.length > 0) {
    const share = parseFloat((total / members.length).toFixed(2));
    members.forEach((uid, i) => {
      equalSplitMap[uid] = i === members.length - 1
        ? parseFloat((total - share * (members.length - 1)).toFixed(2))
        : share;
    });
  }

  async function handleSave() {
    if (!description.trim() || !amount || total <= 0) return;
    setSaving(true);
    const splits = splitMode === 'equal'
      ? equalSplitMap
      : Object.fromEntries(Object.entries(customSplits).map(([uid, v]) => [uid, parseFloat(v) || 0]));
    await onSave(description.trim(), total, paidBy, splits, aiCategory?.label, aiCategory?.emoji);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Add Expense</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition text-sm">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Description with live AI detection */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Description</label>
            <input
              type="text"
              placeholder="e.g. Dinner at restaurant, Uber to airport…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1B998B] focus:ring-2 focus:ring-[#1B998B]/20 transition"
            />
            {/* ✨ Live AI category detection */}
            <AiCategoryDetector description={description} onCategory={setAiCategory} />
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Amount ({group.currency})</label>
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

          {/* Paid by */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Paid by</label>
            <select
              value={paidBy}
              onChange={e => setPaidBy(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1B998B] bg-white transition"
            >
              {members.map(uid => (
                <option key={uid} value={uid}>
                  {uid === currentUserId ? 'You' : group.memberDetails[uid]?.displayName ?? uid}
                </option>
              ))}
            </select>
          </div>

          {/* Split mode */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Split</label>
            <div className="flex gap-2 mb-3">
              {(['equal', 'custom'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setSplitMode(mode)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                    splitMode === mode ? 'bg-[#1B998B] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {mode === 'equal' ? '⚖️ Equal' : '✏️ Custom'}
                </button>
              ))}
            </div>

            {splitMode === 'equal' && total > 0 && (
              <div className="space-y-1.5">
                {members.map(uid => (
                  <div key={uid} className="flex justify-between text-sm px-1">
                    <span className="text-gray-700">{uid === currentUserId ? 'You' : group.memberDetails[uid]?.displayName ?? uid}</span>
                    <span className="font-semibold text-gray-900">{formatAmount(equalSplitMap[uid] ?? 0, group.currency)}</span>
                  </div>
                ))}
              </div>
            )}

            {splitMode === 'custom' && (
              <div className="space-y-2">
                {members.map(uid => (
                  <div key={uid} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-gray-700">{uid === currentUserId ? 'You' : group.memberDetails[uid]?.displayName ?? uid}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={customSplits[uid] ?? ''}
                      onChange={e => setCustomSplits(prev => ({ ...prev, [uid]: e.target.value }))}
                      className="w-24 border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-right outline-none focus:border-[#1B998B] transition"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-6 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !description.trim() || total <= 0}
            className="w-full bg-[#1B998B] text-white font-bold py-3 rounded-2xl text-sm hover:bg-[#158a7d] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Adding…' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Group Page ────────────────────────────────────────────────────────

type Tab = 'expenses' | 'budget' | 'balances';

export default function GroupPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const groupId = params?.id as string;

  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('expenses');

  // Modal states
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    getGroup(groupId).then(g => { setGroup(g); setLoadingGroup(false); });
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    return subscribeToGroupExpenses(groupId, setExpenses);
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    return subscribeToGroupSettlements(groupId, setSettlements);
  }, [groupId]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  const handleAddExpense = useCallback(async (
    description: string, amount: number, paidBy: string,
    splits: Record<string, number>, aiCategory?: string, aiCategoryEmoji?: string
  ) => {
    if (!user || !groupId) return;
    await addExpense(groupId, description, amount, paidBy, splits, user.uid, aiCategory, aiCategoryEmoji);
  }, [groupId, user]);

  // Receipt scanner pre-fills description + category then opens add modal
  // (we auto-add directly with equal split for simplicity)
  async function handleScannerConfirm(description: string, amount: number, aiCategory: string, aiCategoryEmoji: string) {
    if (!user || !group) return;
    const members = group.members;
    const share = parseFloat((amount / members.length).toFixed(2));
    const splits: Record<string, number> = {};
    members.forEach((uid, i) => {
      splits[uid] = i === members.length - 1
        ? parseFloat((amount - share * (members.length - 1)).toFixed(2))
        : share;
    });
    await addExpense(groupId, description, amount, user.uid, splits, user.uid, aiCategory, aiCategoryEmoji);
  }

  if (authLoading || loadingGroup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#1B998B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">Group not found.</p>
        <Link href="/groups" className="text-[#1B998B] font-semibold text-sm">← Back to Groups</Link>
      </div>
    );
  }

  const balances = user ? calculateGroupBalances(expenses, user.uid, group.memberDetails, settlements) : [];
  const TABS: { id: Tab; label: string }[] = [
    { id: 'expenses', label: 'Expenses' },
    { id: 'budget',   label: '💡 Budget AI' },
    { id: 'balances', label: 'Balances' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Group header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Link href="/groups" className="text-xs text-gray-400 hover:text-gray-600 transition mb-2 block">← Groups</Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{group.name}</h1>
              <p className="text-sm text-gray-400">{group.members.length} member{group.members.length !== 1 ? 's' : ''} · {group.currency}</p>
            </div>
            {/* Two add buttons — manual and scanner */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowScanner(true)}
                title="AI Receipt Scanner"
                className="w-9 h-9 border border-[#1B998B] text-[#1B998B] rounded-xl flex items-center justify-center hover:bg-[#E8F8F6] transition text-base"
              >
                🔍
              </button>
              <button
                onClick={() => setShowAddExpense(true)}
                className="bg-[#1B998B] text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#158a7d] transition shadow-sm"
              >
                + Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 flex gap-4">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-semibold border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-[#1B998B] text-[#1B998B]'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-5">

        {/* ── Expenses tab ── */}
        {activeTab === 'expenses' && (
          <div className="space-y-3">
            {expenses.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">🧾</div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">No expenses yet</h2>
                <p className="text-sm text-gray-500 mb-5">Add your first expense — AI will auto-categorise it</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setShowScanner(true)}
                    className="border border-[#1B998B] text-[#1B998B] font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-[#E8F8F6] transition"
                  >
                    🔍 Scan Receipt
                  </button>
                  <button
                    onClick={() => setShowAddExpense(true)}
                    className="bg-[#1B998B] text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-[#158a7d] transition"
                  >
                    + Add Expense
                  </button>
                </div>
              </div>
            ) : (
              expenses.map(expense => {
                const isPaidByMe = expense.paidBy === user?.uid;
                const paidByName = isPaidByMe ? 'You' : (group.memberDetails[expense.paidBy]?.displayName ?? expense.paidBy);
                const myShare = expense.splits[user?.uid ?? ''] ?? 0;
                const totalPaid = Object.values(expense.splits).reduce((s, v) => s + v, 0);
                const category = expense.aiCategory
                  ? { label: expense.aiCategory, emoji: expense.aiCategoryEmoji ?? '📦', color: '#1B998B', confidence: 95 }
                  : categorizeExpense(expense.description);
                const dateStr = expense.date?.toDate?.().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) ?? '';

                return (
                  <div key={expense.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ backgroundColor: category ? `${category.color}18` : '#E8F8F6' }}
                    >
                      {category ? category.emoji : '🧾'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{expense.description}</p>
                      {category && (
                        <div className="mt-0.5">
                          <AiCategoryChip label={category.label} emoji={category.emoji} color={category.color} showPrefix size="sm" />
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1">{paidByName} paid · {dateStr}</p>
                      {myShare > 0 && !isPaidByMe && (
                        <p className="text-xs font-semibold text-[#E84545] mt-0.5">You owe {formatAmount(myShare, group.currency)}</p>
                      )}
                      {isPaidByMe && (
                        <p className="text-xs font-semibold text-[#1B998B] mt-0.5">You paid</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right flex flex-col items-end justify-between">
                      <p className="font-bold text-gray-900 text-sm">{formatAmount(totalPaid, group.currency)}</p>
                      {user?.uid === expense.createdBy && (
                        <button
                          onClick={() => deleteExpense(groupId, expense.id)}
                          className="text-[10px] text-gray-300 hover:text-[#E84545] transition mt-2"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Budget AI tab ── */}
        {activeTab === 'budget' && user && (
          <AiBudgetPanel
            expenses={expenses}
            currency={group.currency}
            currentUserId={user.uid}
          />
        )}

        {/* ── Balances tab with AI Reminder buttons ── */}
        {activeTab === 'balances' && (
          <div className="space-y-3">
            {balances.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-gray-500 text-sm font-medium">All settled up!</p>
              </div>
            ) : (
              <>
                <div className="bg-[#E8F8F6] rounded-2xl border border-[#5DCAA5] px-4 py-3 mb-2">
                  <p className="text-xs text-[#0F6E56] font-semibold mb-0.5">✦ AI Smart Reminders</p>
                  <p className="text-xs text-gray-600">Hit "Remind" — AI writes a friendly personalised nudge so you don't have to feel awkward.</p>
                </div>

                {balances.map(b => (
                  <div key={b.uid} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 text-xs shrink-0">
                          {b.displayName[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{b.displayName}</span>
                      </div>
                      <div className="text-right">
                        {b.amount > 0 ? (
                          <p className="text-sm font-bold text-[#1B998B]">owes you {formatAmount(b.amount, group.currency)}</p>
                        ) : (
                          <p className="text-sm font-bold text-[#E84545]">you owe {formatAmount(Math.abs(b.amount), group.currency)}</p>
                        )}
                      </div>
                    </div>

                    {/* Only show reminder button when they owe US money */}
                    {b.amount > 0 && (
                      <div className="mt-2 flex justify-end">
                        <AiReminderButton
                          friendName={b.displayName}
                          amount={b.amount}
                          currency={group.currency}
                          context={group.name}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </main>

      {/* Add Expense Modal */}
      {showAddExpense && user && (
        <AddExpenseModal
          group={group}
          currentUserId={user.uid}
          onClose={() => setShowAddExpense(false)}
          onSave={handleAddExpense}
        />
      )}

      {/* AI Receipt Scanner Modal */}
      {showScanner && user && (
        <ReceiptScanner
          group={group}
          onClose={() => setShowScanner(false)}
          onConfirm={handleScannerConfirm}
        />
      )}
    </div>
  );
}