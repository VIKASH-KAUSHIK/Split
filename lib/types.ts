import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: Timestamp;
}

export type GroupCategory = 'trip' | 'home' | 'couple' | 'other';

export interface MemberDetail {
  displayName: string;
  email: string;
}

export interface Group {
  id: string;
  name: string;
  category: GroupCategory;
  currency: string;
  createdBy: string;
  members: string[];
  memberDetails: Record<string, MemberDetail>;
  createdAt: Timestamp;
  inviteToken?: string;
  whiteboard?: string;
}

export interface Settlement {
  id: string;
  from: string;
  to: string;
  amount: number;
  note?: string;
  date: Timestamp;
  createdAt: Timestamp;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  splits: Record<string, number>;
  date: Timestamp;
  createdBy: string;
  createdAt: Timestamp;
}

export interface Invite {
  groupId: string;
  createdBy: string;
  createdAt: Timestamp;
  // Group preview — embedded so join page works without auth
  groupName: string;
  groupCategory: GroupCategory;
  groupCurrency: string;
  groupMemberCount: number;
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
};

export const GROUP_CATEGORY_LABELS: Record<GroupCategory, string> = {
  trip: 'Trip',
  home: 'Home',
  couple: 'Couple',
  other: 'Other',
};

export interface Balance {
  uid: string;
  displayName: string;
  amount: number;
}

export interface FriendBalance {
  uid: string;
  displayName: string;
  email: string;
  netAmount: number;
  groups: { groupId: string; groupName: string; amount: number }[];
}

export function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol}${Math.abs(amount).toFixed(2)}`;
}

export function calculateGroupNetBalance(
  expenses: Expense[],
  currentUserId: string
): number {
  let net = 0;
  for (const expense of expenses) {
    if (expense.paidBy === currentUserId) {
      for (const amount of Object.values(expense.splits)) {
        net += amount;
      }
    } else if (expense.splits[currentUserId] !== undefined) {
      net -= expense.splits[currentUserId];
    }
  }
  return net;
}

export function calculateGroupBalances(
  expenses: Expense[],
  currentUserId: string,
  memberDetails: Group['memberDetails'],
  settlements?: Settlement[]
): Balance[] {
  const balanceMap: Record<string, number> = {};

  for (const expense of expenses) {
    if (expense.paidBy === currentUserId) {
      for (const [uid, amount] of Object.entries(expense.splits)) {
        balanceMap[uid] = (balanceMap[uid] ?? 0) + amount;
      }
    } else if (expense.splits[currentUserId] !== undefined) {
      const amount = expense.splits[currentUserId];
      balanceMap[expense.paidBy] = (balanceMap[expense.paidBy] ?? 0) - amount;
    }
  }

  for (const s of settlements ?? []) {
    if (s.from === currentUserId) {
      balanceMap[s.to] = (balanceMap[s.to] ?? 0) + s.amount;
    } else if (s.to === currentUserId) {
      balanceMap[s.from] = (balanceMap[s.from] ?? 0) - s.amount;
    }
  }

  return Object.entries(balanceMap)
    .filter(([, amount]) => Math.abs(amount) > 0.001)
    .map(([uid, amount]) => ({
      uid,
      displayName: memberDetails[uid]?.displayName ?? uid,
      amount,
    }));
}

export function calculateFriendBalances(
  groups: Group[],
  expensesByGroup: Record<string, Expense[]>,
  currentUserId: string,
  settlementsByGroup?: Record<string, Settlement[]>
): FriendBalance[] {
  const friendMap: Record<string, FriendBalance> = {};

  for (const group of groups) {
    const expenses = expensesByGroup[group.id] ?? [];
    const settlements = settlementsByGroup?.[group.id];
    const balances = calculateGroupBalances(expenses, currentUserId, group.memberDetails, settlements);

    for (const balance of balances) {
      if (!friendMap[balance.uid]) {
        const detail = group.memberDetails[balance.uid];
        friendMap[balance.uid] = {
          uid: balance.uid,
          displayName: detail?.displayName ?? balance.uid,
          email: detail?.email ?? '',
          netAmount: 0,
          groups: [],
        };
      }
      friendMap[balance.uid].netAmount += balance.amount;
      if (Math.abs(balance.amount) > 0.001) {
        friendMap[balance.uid].groups.push({
          groupId: group.id,
          groupName: group.name,
          amount: balance.amount,
        });
      }
    }
  }

  return Object.values(friendMap).filter((f) => Math.abs(f.netAmount) > 0.001);
}

export interface MemberNetBalance {
  uid: string;
  displayName: string;
  totalPaid: number;
  totalOwed: number;
  net: number;
}

export function calculateMemberNetBalances(
  expenses: Expense[],
  settlements: Settlement[],
  memberDetails: Group['memberDetails']
): MemberNetBalance[] {
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};

  for (const expense of expenses) {
    paid[expense.paidBy] = (paid[expense.paidBy] ?? 0) + expense.amount;
    for (const [uid, share] of Object.entries(expense.splits)) {
      owed[uid] = (owed[uid] ?? 0) + share;
    }
    const splitTotal = Object.values(expense.splits).reduce((s, v) => s + v, 0);
    const payerOwnShare = expense.amount - splitTotal;
    if (payerOwnShare > 0.001) {
      owed[expense.paidBy] = (owed[expense.paidBy] ?? 0) + payerOwnShare;
    }
  }

  const settlementAdj: Record<string, number> = {};
  for (const s of settlements) {
    settlementAdj[s.from] = (settlementAdj[s.from] ?? 0) + s.amount;
    settlementAdj[s.to] = (settlementAdj[s.to] ?? 0) - s.amount;
  }

  return Object.keys(memberDetails).map((uid) => {
    const p = paid[uid] ?? 0;
    const o = owed[uid] ?? 0;
    const adj = settlementAdj[uid] ?? 0;
    return {
      uid,
      displayName: memberDetails[uid]?.displayName ?? uid,
      totalPaid: p,
      totalOwed: o,
      net: p - o + adj,
    };
  });
}
