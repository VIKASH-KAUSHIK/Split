'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Navbar } from '@/components/navbar';
import { subscribeToUserGroups, subscribeToGroupExpenses } from '@/lib/firestore';
import { formatAmount, type Group, type Expense } from '@/lib/types';

interface ActivityItem extends Expense {
  groupId: string;
  groupName: string;
  groupCurrency: string;
  memberDetails: Group['memberDetails'];
}

export default function ActivityPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    const expenseUnsubs: (() => void)[] = [];
    const groupExpensesMap: Record<string, Expense[]> = {};
    let currentGroups: Group[] = [];

    function rebuildFeed() {
      const all: ActivityItem[] = [];
      for (const group of currentGroups) {
        for (const exp of groupExpensesMap[group.id] ?? []) {
          all.push({
            ...exp,
            groupId: group.id,
            groupName: group.name,
            groupCurrency: group.currency,
            memberDetails: group.memberDetails,
          });
        }
      }
      all.sort((a, b) => {
        const aTime = a.date?.toMillis?.() ?? 0;
        const bTime = b.date?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      setItems(all);
      setLoading(false);
    }

    const unsubGroups = subscribeToUserGroups(user.uid, (fetchedGroups) => {
      currentGroups = fetchedGroups;
      expenseUnsubs.forEach((u) => u());
      expenseUnsubs.length = 0;

      if (fetchedGroups.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      for (const group of fetchedGroups) {
        groupExpensesMap[group.id] = [];
        const unsub = subscribeToGroupExpenses(group.id, (exps) => {
          groupExpensesMap[group.id] = exps;
          rebuildFeed();
        });
        expenseUnsubs.push(unsub);
      }
    });

    return () => {
      unsubGroups();
      expenseUnsubs.forEach((u) => u());
    };
  }, [user, authLoading, router]);

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
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Activity</h1>
        <p className="text-sm text-gray-400 mb-5">Recent expenses across all your groups</p>

        {items.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">⚡</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No activity yet</h2>
            <p className="text-gray-500 text-sm mb-6">Expenses added to your groups will appear here</p>
            <Link
              href="/groups"
              className="bg-[#1B998B] text-white font-semibold px-6 py-3 rounded-xl text-sm hover:bg-[#158a7d] transition"
            >
              Go to Groups
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isPaidByMe = item.paidBy === user?.uid;
              const paidByName = isPaidByMe
                ? 'You'
                : (item.memberDetails[item.paidBy]?.displayName ?? item.paidBy);
              const myShare = item.splits[user?.uid ?? ''] ?? 0;
              const totalPaid = Object.values(item.splits).reduce((s, v) => s + v, 0);

              let statusText = '';
              let statusColor = 'text-gray-400';
              if (isPaidByMe) {
                const lentToOthers = Object.entries(item.splits)
                  .filter(([uid]) => uid !== user?.uid)
                  .reduce((s, [, v]) => s + v, 0);
                if (lentToOthers > 0) {
                  statusText = `You get back ${formatAmount(lentToOthers, item.groupCurrency)}`;
                  statusColor = 'text-[#1B998B]';
                } else {
                  statusText = 'You paid for yourself';
                  statusColor = 'text-gray-400';
                }
              } else if (myShare > 0) {
                statusText = `You owe ${formatAmount(myShare, item.groupCurrency)}`;
                statusColor = 'text-[#E84545]';
              } else {
                statusText = 'Not involved';
                statusColor = 'text-gray-400';
              }

              const dateStr = item.date?.toDate?.().toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }) ?? '';

              return (
                <div key={`${item.groupId}-${item.id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#E8F8F6] flex items-center justify-center text-lg shrink-0">
                    🧾
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 leading-snug">
                      <span className="font-bold">{paidByName}</span>
                      {' added '}
                      <span className="font-semibold">&quot;{item.description}&quot;</span>
                      {' in '}
                      <Link
                        href={`/groups/${item.groupId}`}
                        className="font-semibold text-[#1B998B] hover:underline"
                      >
                        {item.groupName}
                      </Link>
                    </p>
                    <p className={`text-xs font-semibold mt-1 ${statusColor}`}>{statusText}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-gray-900">{formatAmount(totalPaid, item.groupCurrency)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
