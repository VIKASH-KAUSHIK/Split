import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase';
import type { Group, Invite, Settlement, UserProfile } from './types';

export async function createUserProfile(
  uid: string,
  displayName: string,
  email: string
): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    uid,
    displayName,
    email,
    createdAt: serverTimestamp(),
  });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export function subscribeToUserGroups(
  uid: string,
  callback: (groups: Group[]) => void
): () => void {
  const q = query(collection(db, 'groups'), where('members', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group));
    callback(groups);
  });
}

export async function getInvite(token: string): Promise<Invite | null> {
  const snap = await getDoc(doc(db, 'invites', token));
  return snap.exists() ? (snap.data() as Invite) : null;
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const snap = await getDoc(doc(db, 'groups', groupId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Group) : null;
}

export async function joinGroup(
  groupId: string,
  uid: string,
  userProfile: { displayName: string; email: string }
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    members: arrayUnion(uid),
    [`memberDetails.${uid}`]: {
      displayName: userProfile.displayName,
      email: userProfile.email,
    },
  });
}

export async function createInvite(
  group: Group,
  createdBy: string,
  existingToken?: string
): Promise<string> {
  if (existingToken) return existingToken;

  const token = crypto.randomUUID();
  await setDoc(doc(db, 'invites', token), {
    groupId: group.id,
    createdBy,
    createdAt: serverTimestamp(),
    groupName: group.name,
    groupCategory: group.category,
    groupCurrency: group.currency,
    groupMemberCount: group.members.length,
  });
  await updateDoc(doc(db, 'groups', group.id), { inviteToken: token });
  return token;
}

export async function createGroup(
  name: string,
  category: Group['category'],
  currency: string,
  createdBy: string,
  creatorProfile: { displayName: string; email: string }
): Promise<string> {
  const ref = await addDoc(collection(db, 'groups'), {
    name,
    category,
    currency,
    createdBy,
    members: [createdBy],
    memberDetails: {
      [createdBy]: {
        displayName: creatorProfile.displayName,
        email: creatorProfile.email,
      },
    },
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeToGroupExpenses(
  groupId: string,
  callback: (expenses: import('./types').Expense[]) => void
): () => void {
  const q = query(
    collection(db, 'groups', groupId, 'expenses'),
    orderBy('date', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const expenses = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as import('./types').Expense)
    );
    callback(expenses);
  });
}

export function subscribeToGroupSettlements(
  groupId: string,
  callback: (settlements: Settlement[]) => void
): () => void {
  const q = query(
    collection(db, 'groups', groupId, 'settlements'),
    orderBy('date', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Settlement)));
  });
}

export async function addSettlement(
  groupId: string,
  from: string,
  to: string,
  amount: number,
  note?: string
): Promise<void> {
  await addDoc(collection(db, 'groups', groupId, 'settlements'), {
    from,
    to,
    amount,
    note: note ?? '',
    date: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}

export async function updateGroupWhiteboard(
  groupId: string,
  content: string
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { whiteboard: content });
}

export async function addExpense(
  groupId: string,
  description: string,
  amount: number,
  paidBy: string,
  splits: Record<string, number>,
  createdBy: string
): Promise<void> {
  await addDoc(collection(db, 'groups', groupId, 'expenses'), {
    description,
    amount,
    paidBy,
    splits,
    date: serverTimestamp(),
    createdBy,
    createdAt: serverTimestamp(),
  });
}
