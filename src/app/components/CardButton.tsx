'use client';

import { CARD_EMOJI, type CardType } from '@/shared/types';
import { useLanguage } from '../i18n/LanguageContext';

interface Props {
  card: CardType;
  count: number;
  selected: boolean;
  disabled: boolean;
  onSelect: (card: CardType) => void;
}

export default function CardButton({
  card,
  count,
  selected,
  disabled,
  onSelect,
}: Props) {
  const { t } = useLanguage();
  const base =
    'flex min-h-[6.5rem] flex-1 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 transition active:scale-95 sm:min-h-[7.5rem]';
  const state = disabled
    ? 'cursor-not-allowed border-slate-800 bg-slate-900/60 opacity-40'
    : selected
      ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_20px_rgba(245,197,24,0.35)]'
      : 'border-slate-700 bg-slate-800/70 hover:border-amber-400/60';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(card)}
      className={`${base} ${state}`}
      aria-label={t.room.cardAria(t.cardName[card], count)}
    >
      <span className="text-4xl sm:text-5xl">{CARD_EMOJI[card]}</span>
      <span className="text-sm font-bold text-slate-100">
        {t.cardName[card]}
      </span>
      <span className="text-xs font-medium text-slate-400">
        {t.room.cardCount(count)}
      </span>
    </button>
  );
}
