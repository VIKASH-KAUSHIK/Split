'use client';

// components/ai-category-chip.tsx
// Reusable chip that shows the AI-detected category with animations.
// Use <AiCategoryChip label="Food & Dining" emoji="🍕" color="#f97316" />

interface AiCategoryChipProps {
  label: string;
  emoji: string;
  color: string;
  /** When true shows the "AI analysing…" skeleton instead of the result */
  loading?: boolean;
  /** Show the sparkle + "AI" prefix. Default true. */
  showPrefix?: boolean;
  size?: 'sm' | 'md';
}

export function AiCategoryChip({
  label,
  emoji,
  color,
  loading = false,
  showPrefix = true,
  size = 'sm',
}: AiCategoryChipProps) {
  const textSize = size === 'md' ? 'text-xs' : 'text-[11px]';
  const padding = size === 'md' ? 'px-3 py-1' : 'px-2 py-0.5';

  if (loading) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 ${padding} rounded-full border border-gray-200 bg-gray-50 ${textSize} font-medium text-gray-400`}
      >
        {/* Animated dots */}
        <span className="ai-thinking flex gap-0.5">
          <span className="w-1 h-1 rounded-full bg-gray-400 inline-block" />
          <span className="w-1 h-1 rounded-full bg-gray-400 inline-block" />
          <span className="w-1 h-1 rounded-full bg-gray-400 inline-block" />
        </span>
        <span className="ai-shimmer-text font-semibold">AI analysing…</span>
      </span>
    );
  }

  return (
    <span
      className={`ai-fade-in ai-category-badge ${padding} ${textSize}`}
      style={{
        backgroundColor: `${color}18`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      {showPrefix && (
        <span className="opacity-70 text-[10px]">✦ AI</span>
      )}
      <span>{emoji}</span>
      <span>{label}</span>
    </span>
  );
}

// ── Inline input detector (used inside expense form) ──────────────────────────
// Shows thinking → result as the user types the description.

import { useState, useEffect, useRef } from 'react';
import { categorizeExpense, type CategoryResult } from '@/lib/ai-categorizer';

interface AiCategoryDetectorProps {
  description: string;
  /** Called when a category is detected (or null when cleared) */
  onCategory?: (result: CategoryResult | null) => void;
}

export function AiCategoryDetector({ description, onCategory }: AiCategoryDetectorProps) {
  const [state, setState] = useState<'idle' | 'thinking' | 'result'>('idle');
  const [result, setResult] = useState<CategoryResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!description || description.trim().length < 3) {
      setState('idle');
      setResult(null);
      onCategory?.(null);
      return;
    }

    setState('thinking');
    setResult(null);

    // Fake AI delay — 700–900 ms feels like real inference
    timerRef.current = setTimeout(() => {
      const cat = categorizeExpense(description);
      setResult(cat);
      setState(cat ? 'result' : 'idle');
      onCategory?.(cat);
    }, 800);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description]);

  if (state === 'idle') return null;

  if (state === 'thinking') {
    return (
      <div className="mt-1.5 flex items-center gap-1.5">
        <AiCategoryChip label="" emoji="" color="#1B998B" loading />
      </div>
    );
  }

  if (state === 'result' && result) {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <AiCategoryChip
          label={result.label}
          emoji={result.emoji}
          color={result.color}
          showPrefix
        />
        <span className="text-[11px] text-gray-400 font-medium">
          {result.confidence}% confidence
        </span>
      </div>
    );
  }

  return null;
}