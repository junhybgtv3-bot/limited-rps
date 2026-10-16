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
    'flex min-h-[6.5rem] flex-1 flex-col items-center justify-center gap-1 border-2 p-3 transition active:translate-x-[2px] active:translate-y-[2px] sm:min-h-[7.5rem]';
  const state = disabled
    ? 'cursor-not-allowed border-[#2c2f32] bg-[#141416] opacity-40'
    : selected
      ? 'border-[#b3122e] bg-[rgba(179,18,46,0.18)] shadow-[5px_5px_0_#000]'
      : 'border-[#57534a] bg-[#1c1e20] hover:border-[#b3122e]';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(card)}
      className={`${base} ${state}`}
      aria-label={t.room.cardAria(t.cardName[card], count)}
    >
      <span className="text-4xl sm:text-5xl">{CARD_EMOJI[card]}</span>
      <span className="text-sm font-bold text-[#ece7d8]">
        {t.cardName[card]}
      </span>
      <span className="text-xs font-medium text-[#9a9587]">
        {t.room.cardCount(count)}
      </span>
    </button>
  );
}
