'use client';

// components/ai-reminder-button.tsx  ← NEW FILE
//
// Drop this wherever you show balances — friends/page.tsx or groups/[id]/page.tsx
//
// Usage:
//   <AiReminderButton
//     friendName="Rahul"
//     amount={640}
//     currency="INR"
//     context="Goa trip"
//     daysAgo={8}
//   />

import { useState } from 'react';

interface AiReminderButtonProps {
  friendName: string;
  amount: number;
  currency: string;
  context?: string;
  daysAgo?: number;
}

function generateMessage(name: string, amount: number, currency: string, context?: string, daysAgo?: number): string {
  const symbol = currency === 'INR' ? '₹' : '$';
  const amtStr = `${symbol}${Math.abs(amount).toFixed(0)}`;
  const ago = daysAgo ? `${daysAgo} days ago` : 'recently';

  const templates = [
    `Hey ${name}! Quick reminder about the ${amtStr} from ${context ?? 'our recent outing'} — no rush, whenever you get a chance 😊`,
    `Hi ${name}! The ${amtStr} split from ${context ?? 'our expense'} (${ago}) is still pending. Settle whenever works! 🙌`,
    `${name}, friendly nudge — ${amtStr} from ${context ?? 'our last outing'} ${ago}. Thanks! 🤝`,
  ];
  return templates[name.length % templates.length];
}

export function AiReminderButton({ friendName, amount, currency, context, daysAgo }: AiReminderButtonProps) {
  const [state, setState] = useState<'idle' | 'generating' | 'preview' | 'sent'>('idle');
  const [message, setMessage] = useState('');

  function handleRemind() {
    setState('generating');
    // Simulate AI generation
    setTimeout(() => {
      setMessage(generateMessage(friendName, amount, currency, context, daysAgo));
      setState('preview');
    }, 900);
  }

  if (state === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] bg-[#E8F8F6] text-[#0F6E56] border border-[#5DCAA5] px-3 py-1.5 rounded-full font-semibold">
        ✓ Reminder sent
      </span>
    );
  }

  if (state === 'generating') {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex gap-0.5">
          {[0, 150, 300].map(d => (
            <span key={d} className="w-1 h-1 rounded-full bg-[#1B998B] inline-block animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
        <span className="text-[11px] text-[#1B998B] font-medium">AI writing…</span>
      </div>
    );
  }

  if (state === 'preview') {
    return (
      <div className="mt-2 w-full ai-fade-in">
        <div className="bg-[#E8F8F6] border border-[#5DCAA5] rounded-xl p-3">
          <p className="text-[10px] text-[#0F6E56] font-semibold mb-1.5">✦ AI drafted message</p>
          <p className="text-xs text-gray-700 leading-relaxed italic">&quot;{message}&quot;</p>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setState('sent')}
            className="flex-1 text-xs bg-[#1B998B] text-white py-2 rounded-xl font-bold hover:bg-[#158a7d] transition"
          >
            Send ✓
          </button>
          <button
            onClick={() => setState('idle')}
            className="text-xs text-gray-400 px-4 py-2 rounded-xl hover:bg-gray-100 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleRemind}
      className="text-[11px] border border-[#1B998B] text-[#1B998B] px-3 py-1.5 rounded-full font-semibold hover:bg-[#E8F8F6] transition"
    >
      ✦ Remind
    </button>
  );
}