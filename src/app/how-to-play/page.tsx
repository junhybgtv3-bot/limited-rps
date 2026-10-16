'use client';

import Link from 'next/link';
import { LanguageSwitcher, useLanguage } from '../i18n/LanguageContext';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
      <h2 className="mb-3 text-lg font-bold text-amber-300">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-300">
        {children}
      </div>
    </section>
  );
}

export default function HowToPlayPage() {
  const { t } = useLanguage();
  const h = t.howto;

  const roundSteps = [
    { name: h.stepCheck, desc: h.stepCheckDesc },
    {
      name: h.stepSet,
      desc: (
        <>
          {h.stepSetA}
          <strong className="text-amber-200">{h.stepSetStrong}</strong>
          {h.stepSetB}
        </>
      ),
    },
    { name: h.stepOpen, desc: h.stepOpenDesc },
    { name: h.stepResult, desc: h.stepResultDesc },
    { name: h.stepUpdate, desc: h.stepUpdateDesc },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#0b1220] to-[#020617] px-4 py-8 text-slate-100">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm font-bold text-slate-200 transition active:scale-95"
          >
            {h.back}
          </Link>
          <h1 className="text-2xl font-black text-amber-300">{h.title}</h1>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>

        <Section title={h.goalTitle}>
          <p>
            {h.goalA}
            <strong className="text-amber-200">{h.goalStrong}</strong>
            {h.goalB}
          </p>
        </Section>

        <Section title={h.dealTitle}>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {h.deal1a}
              <strong>{h.deal1b}</strong>
              {h.deal1c}
            </li>
            <li>
              {h.deal2a}
              <strong>{h.deal2b}</strong>
              {h.deal2c}
            </li>
          </ul>
        </Section>

        <Section title={h.roundsTitle}>
          <ol className="list-decimal space-y-1 pl-5">
            {roundSteps.map((s) => (
              <li key={s.name}>
                <strong className="text-slate-100">{s.name}</strong> — {s.desc}
              </li>
            ))}
          </ol>
          <p className="text-slate-400">{h.roundsNote}</p>
        </Section>

        <Section title={h.starsTitle}>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {h.star1a}
              <strong className="text-emerald-300">{h.star1b}</strong>
              {h.star1c}
              <strong className="text-red-300">{h.star1d}</strong>
              {h.star1e}
            </li>
            <li>{h.star2}</li>
          </ul>
        </Section>

        <Section title={h.winTitle}>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              {h.win1a}
              <strong className="text-amber-200">{h.win1b}</strong>
              {h.win1c}
            </li>
            <li>
              {h.win2a}
              <strong className="text-amber-200">{h.win2b}</strong>
              {h.win2c}
            </li>
            <li>
              {h.win3a}
              <strong className="text-amber-200">{h.win3b}</strong>
              {h.win3c}
            </li>
          </ol>
        </Section>

        <Section title={h.cardTitle}>
          <ul className="list-disc space-y-1 pl-5">
            {h.cardRules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        </Section>

        <Section title={h.dcTitle}>
          <p>
            {h.dcA}
            <strong className="text-amber-200">{h.dcStrong}</strong>
            {h.dcB}
          </p>
        </Section>

        <Link
          href="/"
          className="mt-2 w-full rounded-2xl bg-amber-400 px-6 py-4 text-center text-lg font-bold text-slate-900 transition active:scale-95"
        >
          {h.backToMain}
        </Link>
      </div>
    </main>
  );
}
