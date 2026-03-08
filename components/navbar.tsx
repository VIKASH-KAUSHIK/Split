'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';

const NAV_LINKS = [
  { href: '/groups', label: 'Groups', icon: '📋' },
  { href: '/friends', label: 'Friends', icon: '👥' },
  { href: '/activity', label: 'Activity', icon: '⚡' },
];

export function Navbar() {
  const { user, logOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await logOut();
    router.push('/login');
  }

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/groups" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-[#1B998B] flex items-center justify-center shadow shadow-[#1B998B]/30">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">Split-It</span>
          </Link>

          {user && (
            <div className="hidden sm:flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/groups' && pathname.startsWith(link.href)) || (link.href === '/groups' && (pathname === '/groups' || pathname.startsWith('/groups/')));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      isActive
                        ? 'bg-[#E8F8F6] text-[#1B998B]'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <span>{link.icon}</span>
                    {link.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {user && (
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-900 font-medium transition"
          >
            Log out
          </button>
        )}
      </div>

      {/* Mobile bottom tab bar */}
      {user && (
        <div className="sm:hidden flex border-t border-gray-100">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/groups' && pathname.startsWith(link.href)) || (link.href === '/groups' && (pathname === '/groups' || pathname.startsWith('/groups/')));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition ${
                  isActive ? 'text-[#1B998B]' : 'text-gray-400'
                }`}
              >
                <span className="text-lg">{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
