import { NextRequest, NextResponse } from 'next/server';
import { doc, getFirestore, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { getApp, getApps, initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: 'AIzaSyBlehEG6-drNvgjmdBtlrxFtiA6LgmzQSs',
  authDomain: 'split-it-80a37.firebaseapp.com',
  projectId: 'split-it-80a37',
  storageBucket: 'split-it-80a37.firebasestorage.app',
  messagingSenderId: '664811535679',
  appId: '1:664811535679:web:640c6012df0a969a14278a',
};

function getDb() {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  return getFirestore(app);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groupId, userId } = body as { groupId?: string; userId?: string };

    if (!groupId || !userId) {
      return NextResponse.json({ error: 'groupId and userId are required' }, { status: 400 });
    }

    const db = getDb();

    const groupSnap = await getDoc(doc(db, 'groups', groupId));
    if (!groupSnap.exists()) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const groupData = groupSnap.data();
    if (!Array.isArray(groupData.members) || !groupData.members.includes(userId)) {
      return NextResponse.json({ error: 'User is not a member of this group' }, { status: 403 });
    }

    const token = crypto.randomUUID();
    await setDoc(doc(db, 'invites', token), {
      groupId,
      createdBy: userId,
      createdAt: serverTimestamp(),
    });

    const origin = request.headers.get('origin') ?? request.nextUrl.origin;
    const inviteUrl = `${origin}/join/${token}`;

    return NextResponse.json({ token, url: inviteUrl });
  } catch (err) {
    console.error('Invite API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
