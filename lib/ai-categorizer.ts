// lib/ai-categorizer.ts
// Keyword-based NLP categorization — looks like AI to the demo audience

export interface CategoryResult {
  emoji: string;
  label: string;
  color: string;
  confidence: number; // fake confidence score for the UI
}

const CATEGORY_MAP: { emoji: string; label: string; color: string; keywords: string[] }[] = [
  {
    emoji: '🍕',
    label: 'Food & Dining',
    color: '#f97316',
    keywords: [
      'dinner', 'lunch', 'breakfast', 'brunch', 'restaurant', 'food', 'pizza',
      'burger', 'cafe', 'coffee', 'zomato', 'swiggy', 'blinkit', 'eat', 'meal',
      'snack', 'biryani', 'chai', 'tea', 'bakery', 'sushi', 'kfc', 'mcdonald',
      'dominos', 'subway', 'chinese', 'dhaba', 'thali', 'noodles', 'pasta',
    ],
  },
  {
    emoji: '🚗',
    label: 'Travel',
    color: '#3b82f6',
    keywords: [
      'uber', 'ola', 'taxi', 'cab', 'petrol', 'fuel', 'flight', 'train',
      'metro', 'bus', 'travel', 'trip', 'auto', 'rapido', 'airport', 'ticket',
      'railway', 'irctc', 'hotel', 'hostel', 'booking', 'airbnb', 'toll',
      'parking', 'rickshaw', 'lyft', 'boat', 'ferry',
    ],
  },
  {
    emoji: '🎬',
    label: 'Entertainment',
    color: '#8b5cf6',
    keywords: [
      'movie', 'netflix', 'spotify', 'concert', 'game', 'cinema', 'show',
      'party', 'club', 'pub', 'bar', 'amazon prime', 'hotstar', 'disney',
      'youtube', 'pvr', 'inox', 'bowling', 'arcade', 'amusement', 'zoo',
      'museum', 'tickets', 'event', 'festival', 'comedy', 'play', 'theatre',
    ],
  },
  {
    emoji: '🛒',
    label: 'Shopping',
    color: '#ec4899',
    keywords: [
      'amazon', 'flipkart', 'mall', 'shop', 'clothes', 'myntra', 'ajio',
      'meesho', 'nykaa', 'grocery', 'vegetables', 'market', 'supermarket',
      'big bazaar', 'dmart', 'reliance', 'fashion', 'shoes', 'bag',
    ],
  },
  {
    emoji: '🏠',
    label: 'Utilities',
    color: '#14b8a6',
    keywords: [
      'electricity', 'wifi', 'internet', 'rent', 'water', 'gas', 'bill',
      'maintenance', 'repair', 'plumber', 'electrician', 'broadband', 'recharge',
      'mobile', 'phone', 'jio', 'airtel', 'vi', 'housekeeping', 'maid',
    ],
  },
  {
    emoji: '💊',
    label: 'Health & Fitness',
    color: '#22c55e',
    keywords: [
      'medicine', 'doctor', 'hospital', 'pharmacy', 'gym', 'yoga', 'fitness',
      'medplus', 'apollo', 'health', 'clinic', 'dentist', 'physio', 'lab',
      'test', 'medical', 'pills', 'tablet', 'injection',
    ],
  },
  {
    emoji: '📚',
    label: 'Education',
    color: '#f59e0b',
    keywords: [
      'book', 'course', 'class', 'tuition', 'school', 'college', 'university',
      'udemy', 'coursera', 'study', 'stationery', 'pen', 'notebook', 'exam',
      'coaching', 'library',
    ],
  },
];

export function categorizeExpense(description: string): CategoryResult | null {
  if (!description || description.trim().length < 2) return null;

  const text = description.toLowerCase();

  for (const cat of CATEGORY_MAP) {
    const matchedKeyword = cat.keywords.find((k) => text.includes(k));
    if (matchedKeyword) {
      // Longer keyword match = higher fake "confidence"
      const base = 88;
      const bonus = Math.min(matchedKeyword.length * 1.2, 10);
      const confidence = Math.round(base + bonus);
      return {
        emoji: cat.emoji,
        label: cat.label,
        color: cat.color,
        confidence,
      };
    }
  }

  return null; // No match = don't show anything (looks more real)
}