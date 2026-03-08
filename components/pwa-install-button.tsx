'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'android' | 'ios' | 'desktop' | null;

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true
  );
}

export default function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>(null);
  const [showIosModal, setShowIosModal] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isRunningStandalone()) return; // Already installed — hide everything

    const p = detectPlatform();
    setPlatform(p);

    if (p === 'ios') {
      // iOS can't use beforeinstallprompt; always show the FAB so user can get instructions
      setVisible(true);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (platform === 'ios') {
      setShowIosModal(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!visible || installed) return null;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={handleInstallClick}
        aria-label="Install Split-It app"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-white shadow-lg hover:bg-[#158a7d] active:scale-95 transition-all duration-150 text-sm font-semibold"
        style={{ boxShadow: '0 4px 24px 0 rgba(27,153,139,0.45)' }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 shrink-0"
        >
          <path d="M12 3v13M7 11l5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Install App
      </button>

      {/* iOS instructions modal */}
      {showIosModal && (
        <div
          className="fixed inset-0 z-60 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowIosModal(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-6 pb-10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Install Split-It</h2>
              <button
                onClick={() => setShowIosModal(false)}
                className="rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-6">
              Add Split-It to your Home Screen for the best experience — it works just like a native app.
            </p>

            {/* Step 1 */}
            <div className="flex items-start gap-4 mb-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white text-sm font-bold">
                1
              </span>
              <div>
                <p className="font-medium text-gray-800 text-sm">Tap the Share button</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tap the{' '}
                  <span className="inline-flex items-center gap-1 font-medium text-gray-700">
                    <ShareIcon />
                    Share
                  </span>{' '}
                  icon in Safari&apos;s toolbar (bottom or top of the screen).
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-4 mb-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white text-sm font-bold">
                2
              </span>
              <div>
                <p className="font-medium text-gray-800 text-sm">Tap &quot;Add to Home Screen&quot;</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Scroll down in the share sheet and tap{' '}
                  <span className="font-medium text-gray-700">Add to Home Screen</span>.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white text-sm font-bold">
                3
              </span>
              <div>
                <p className="font-medium text-gray-800 text-sm">Tap &quot;Add&quot;</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Confirm by tapping <span className="font-medium text-gray-700">Add</span> in the top-right corner.
                </p>
              </div>
            </div>

            {/* Divider + tip */}
            <div className="mt-6 rounded-xl bg-primary-light px-4 py-3 text-xs text-primary font-medium flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
              </svg>
              Make sure you&apos;re using Safari — other browsers don&apos;t support this on iOS.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ShareIcon() {
  return (
    <svg
      className="inline w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
