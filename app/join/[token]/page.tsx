'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { getInvite, joinGroup } from '@/lib/firestore';
import { GROUP_CATEGORY_LABELS } from '@/lib/types';
import type { Invite } from '@/lib/types';

const CATEGORY_ICONS: Record<string, string> = {
  trip: '✈️',
  home: '🏠',
  couple: '❤️',
  other: '📦',
};

export default function JoinGroupPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { user, profile, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [fetching, setFetching] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Fetch invite doc only — no auth required (public read rule)
  useEffect(() => {
    if (!token) return;
    async function fetchInvite() {
      try {
        const inv = await getInvite(token);
        if (!inv) {
          setFetchError('This invite link is invalid or has expired.');
          return;
        }
        setInvite(inv);
      } catch (err) {
        console.error('[JoinPage] fetchInvite error:', err);
        setFetchError('Failed to load invite. Please try again.');
      } finally {
        setFetching(false);
      }
    }
    fetchInvite();
  }, [token]);

  // Once auth resolves and we have the invite, check membership via the groups page
  // (group reads require auth — we do this lazily after login)
  async function handleJoin() {
    if (!user || !profile || !invite) return;
    setJoining(true);
    setJoinError('');
    try {
      await joinGroup(invite.groupId, user.uid, {
        displayName: profile.displayName,
        email: profile.email,
      });
      setJoined(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setJoinError(msg || 'Failed to join group. Please try again.');
    } finally {
      setJoining(false);
    }
  }

  if (fetching || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#1B998B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-[#1B998B] items-center justify-center mb-3 shadow-lg shadow-[#1B998B]/30">
            <span className="text-white text-2xl font-bold">S</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Split-It</h1>
        </div>

        {fetchError ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <div className="text-4xl mb-3">😕</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Invalid Invite</h2>
            <p className="text-sm text-gray-500 mb-4">{fetchError}</p>
            <Link href="/groups" className="text-[#1B998B] font-semibold text-sm hover:underline">
              Go to your groups
            </Link>
          </div>
        ) : invite ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            {/* Group preview — uses data embedded in the invite doc, no extra Firestore read */}
            <div className="flex items-center gap-3 mb-6">
              <div className="text-4xl w-14 h-14 flex items-center justify-center bg-gray-50 rounded-xl">
                {CATEGORY_ICONS[invite.groupCategory] ?? '📦'}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{invite.groupName}</h2>
                <p className="text-sm text-gray-400">
                  {GROUP_CATEGORY_LABELS[invite.groupCategory]} ·{' '}
                  {invite.groupMemberCount} member{invite.groupMemberCount !== 1 ? 's' : ''} ·{' '}
                  {invite.groupCurrency}
                </p>
              </div>
            </div>

            {joined || alreadyMember ? (
              <div className="text-center">
                <div className="text-3xl mb-2">🎉</div>
                <p className="font-semibold text-gray-900 mb-1">
                  {alreadyMember ? "You're already a member!" : "You've joined the group!"}
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Open the Split-It mobile app to see expenses and start splitting.
                </p>
                <Link
                  href="/groups"
                  className="block w-full text-center py-3 rounded-xl bg-[#1B998B] text-white font-semibold text-sm hover:bg-[#158a7d] transition"
                >
                  View my groups
                </Link>
              </div>
            ) : !user ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 text-center mb-4">
                  You&apos;ve been invited to join <strong>{invite.groupName}</strong>.
                  Sign in or create an account to join.
                </p>
                <Link
                  href={`/login?next=/join/${token}`}
                  className="block w-full text-center py-3 rounded-xl bg-[#1B998B] text-white font-semibold text-sm hover:bg-[#158a7d] transition"
                >
                  Sign In to Join
                </Link>
                <Link
                  href={`/signup?next=/join/${token}`}
                  className="block w-full text-center py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition"
                >
                  Create Account
                </Link>
              </div>
            ) : (
              <div>
                {joinError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                    {joinError}
                  </div>
                )}
                <p className="text-sm text-gray-600 text-center mb-4">
                  Signed in as <strong>{profile?.displayName}</strong>.<br />
                  Join <strong>{invite.groupName}</strong> to start splitting expenses.
                </p>
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="w-full py-3 rounded-xl bg-[#1B998B] hover:bg-[#158a7d] disabled:opacity-60 text-white font-semibold text-sm transition"
                >
                  {joining ? 'Joining…' : `Join ${invite.groupName}`}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
