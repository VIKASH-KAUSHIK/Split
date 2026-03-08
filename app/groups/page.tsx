'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Navbar } from '@/components/navbar';
import { subscribeToUserGroups, createInvite, createGroup } from '@/lib/firestore';
import { subscribeToGroupExpenses } from '@/lib/firestore';
import { calculateGroupNetBalance, formatAmount, CURRENCY_SYMBOLS, GROUP_CATEGORY_LABELS } from '@/lib/types';
import type { Expense, Group } from '@/lib/types';

type GroupWithBalance = Group & { netBalance: number };

const CATEGORY_ICONS: Record<string, string> = {
  trip: '✈️',
  home: '🏠',
  couple: '❤️',
  other: '📦',
};

const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
];

const GROUP_CATEGORIES = ['trip', 'home', 'couple', 'other'] as const;

export default function GroupsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<(typeof GROUP_CATEGORIES)[number]>('other');
  const [newCurrency, setNewCurrency] = useState('INR');
  const [creating, setCreating] = useState(false);

  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    const expenseUnsubs: (() => void)[] = [];
    const expensesMap: Record<string, Expense[]> = {};
    let currentGroups: Group[] = [];

    const unsubGroups = subscribeToUserGroups(user.uid, (fetchedGroups) => {
      currentGroups = fetchedGroups;
      expenseUnsubs.forEach((u) => u());
      expenseUnsubs.length = 0;

      if (fetchedGroups.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      let resolved = 0;
      for (const group of fetchedGroups) {
        expensesMap[group.id] = [];
        const unsub = subscribeToGroupExpenses(group.id, (expenses) => {
          expensesMap[group.id] = expenses;
          resolved = Math.min(resolved + 1, currentGroups.length);
          const withBalance = currentGroups.map((g) => ({
            ...g,
            netBalance: calculateGroupNetBalance(expensesMap[g.id] ?? [], user.uid),
          }));
          setGroups(withBalance);
          setLoading(false);
        });
        expenseUnsubs.push(unsub);
      }
    });

    return () => {
      unsubGroups();
      expenseUnsubs.forEach((u) => u());
    };
  }, [user, authLoading, router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile || !newName.trim()) return;
    setCreating(true);
    try {
      await createGroup(newName.trim(), newCategory, newCurrency, user.uid, {
        displayName: profile.displayName,
        email: profile.email,
      });
      setShowCreate(false);
      setNewName('');
      setNewCategory('other');
      setNewCurrency('INR');
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite(group: GroupWithBalance) {
    if (!user) return;
    setInviteGroupId(group.id);
    setInviteLoading(true);
    setInviteUrl('');
    setCopied(false);
    try {
      const token = await createInvite(group, user.uid, group.inviteToken);
      const url = `${window.location.origin}/join/${token}`;
      setInviteUrl(url);
    } finally {
      setInviteLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const overallBalance = groups.reduce((s, g) => s + g.netBalance, 0);

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
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
            {groups.length > 0 && (
              <p className={`text-sm mt-0.5 font-medium ${overallBalance >= 0 ? 'text-[#1B998B]' : 'text-[#E84545]'}`}>
                {overallBalance === 0
                  ? 'All settled up'
                  : overallBalance > 0
                    ? `Overall you are owed`
                    : `Overall you owe`}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-[#1B998B] hover:bg-[#158a7d] text-white font-semibold px-4 py-2 rounded-xl text-sm transition shadow-sm shadow-[#1B998B]/20"
          >
            + New Group
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No groups yet</h2>
            <p className="text-gray-500 text-sm mb-6">Create a group to start splitting expenses</p>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-[#1B998B] text-white font-semibold px-6 py-3 rounded-xl text-sm transition hover:bg-[#158a7d]"
            >
              Create your first group
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-3">
                  <div className="text-3xl w-12 h-12 flex items-center justify-center bg-gray-50 rounded-xl">
                    {CATEGORY_ICONS[group.category] ?? '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{group.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {GROUP_CATEGORY_LABELS[group.category]} · {group.members.length} member{group.members.length !== 1 ? 's' : ''} · {group.currency}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {group.netBalance === 0 ? (
                      <span className="text-xs text-gray-400">settled up</span>
                    ) : (
                      <>
                        <p className="text-xs text-gray-400">{group.netBalance > 0 ? 'you are owed' : 'you owe'}</p>
                        <p className={`font-bold text-sm ${group.netBalance > 0 ? 'text-[#1B998B]' : 'text-[#E84545]'}`}>
                          {formatAmount(group.netBalance, group.currency)}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                  <Link
                    href={`/groups/${group.id}`}
                    className="flex-1 text-center text-sm font-semibold bg-[#1B998B] text-white rounded-lg py-1.5 hover:bg-[#158a7d] transition"
                  >
                    View Details
                  </Link>
                  <button
                    onClick={() => handleInvite(group)}
                    className="flex-1 text-sm font-medium text-[#1B998B] border border-[#1B998B] rounded-lg py-1.5 hover:bg-[#E8F8F6] transition"
                  >
                    Invite Member
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4"
          >
            <h2 className="text-lg font-bold text-gray-900">Create Group</h2>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Group Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Goa Trip"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B998B] focus:ring-2 focus:ring-[#1B998B]/20 transition"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
              <div className="grid grid-cols-4 gap-2">
                {GROUP_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewCategory(cat)}
                    className={`flex flex-col items-center py-3 rounded-xl border-2 transition text-sm font-medium gap-1 ${
                      newCategory === cat
                        ? 'border-[#1B998B] bg-[#E8F8F6] text-[#1B998B]'
                        : 'border-gray-100 text-gray-500 hover:border-gray-200'
                    }`}
                  >
                    <span className="text-xl">{CATEGORY_ICONS[cat]}</span>
                    <span className="capitalize">{cat}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Currency</label>
              <div className="flex flex-wrap gap-2">
                {CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setNewCurrency(c.code)}
                    className={`px-3 py-1.5 rounded-full border-2 text-sm font-semibold transition ${
                      newCurrency === c.code
                        ? 'border-[#1B998B] bg-[#E8F8F6] text-[#1B998B]'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {c.symbol} {c.code}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 py-3 rounded-xl bg-[#1B998B] hover:bg-[#158a7d] disabled:opacity-60 text-white text-sm font-semibold transition"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {inviteGroupId && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Invite to Group</h2>
            <p className="text-sm text-gray-500">Share this link with your friend so they can join the group.</p>

            {inviteLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-8 h-8 border-4 border-[#1B998B] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-600 bg-gray-50 outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 rounded-xl bg-[#1B998B] text-white text-sm font-semibold hover:bg-[#158a7d] transition whitespace-nowrap"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}

            <button
              onClick={() => { setInviteGroupId(null); setInviteUrl(''); }}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
