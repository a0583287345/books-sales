'use client';

import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Book } from '@/lib/entities';
import { money, normalizeSearch } from '@/lib/format';

/** בחירת ספר מהקטלוג בהקלדה (שם / קוד / הוצאה) */
export function BookPicker({
  books,
  excludeIds,
  onPick,
  placeholder = 'הוספת ספר – הקלידו שם או קוד...',
}: {
  books: Book[];
  excludeIds?: Set<string>;
  onPick: (book: Book) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = normalizeSearch(query);
    return books
      .filter((b) => b.is_active && !excludeIds?.has(b.id))
      .filter((b) => !q || normalizeSearch(`${b.code} ${b.name} ${b.publisher ?? ''}`).includes(q))
      .slice(0, 30);
  }, [books, excludeIds, query]);

  const pick = (b: Book) => {
    onPick(b);
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
      <input
        ref={inputRef}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">
              {books.length ? 'לא נמצא ספר מתאים (אולי כבר ברשימה?)' : 'הקטלוג ריק – יש להוסיף ספרים במסך "קטלוג ספרים"'}
            </li>
          ) : (
            results.map((b, i) => (
              <li key={b.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(b)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-right text-sm ${i === active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="w-14 shrink-0 text-xs text-slate-400">{b.code}</span>
                  <span className="flex-1">{b.name}</span>
                  <span className="text-xs text-slate-500">{money(b.sale_price)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
