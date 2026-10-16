'use client';

import Link from 'next/link';
import { ZawaBackground } from '../components/Kaiji';
import { LanguageSwitcher, useLanguage } from '../i18n/LanguageContext';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-2 border-[#2c2f32] bg-[#141416] p-5">
      <h2 className="font-display mb-3 text-lg tracking-wide text-[#ece7d8]">
        <span className="mr-2 inline-block h-4 w-1.5 bg-[#c1121f]" aria-hidden="true" />
        {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-[#9a9587]">
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
          <strong className="text-[#e8c547]">{h.stepSetStrong}</strong>
          {h.stepSetB}
        </>
      ),
    },
    { name: h.stepOpen, desc: h.stepOpenDesc },
    { name: h.stepResult, desc: h.stepResultDesc },
    { name: h.stepUpdate, desc: h.stepUpdateDesc },
  ];

  return (
    <main className="kaiji-bg relative min-h-screen overflow-hidden px-4 py-8 text-[#ece7d8]">
      <ZawaBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="kaiji-btn kaiji-btn-ghost px-3 py-2 text-sm font-bold"
          >
            {h.back}
          </Link>
          <h1 className="font-display text-2xl tracking-wide text-[#ece7d8]">{h.title}</h1>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>

        <Section title={h.goalTitle}>
          <p>
            {h.goalA}
            <strong className="text-[#e8c547]">{h.goalStrong}</strong>
            {h.goalB}
          </p>
        </Section>

        <Section title={h.dealTitle}>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {h.deal1a}
              <strong className="text-[#ece7d8]">{h.deal1b}</strong>
              {h.deal1c}
            </li>
            <li>
              {h.deal2a}
              <strong className="text-[#ece7d8]">{h.deal2b}</strong>
              {h.deal2c}
            </li>
          </ul>
        </Section>

        <Section title={h.roundsTitle}>
          <ol className="list-decimal space-y-1 pl-5">
            {roundSteps.map((s) => (
              <li key={s.name}>
                <strong className="text-[#ece7d8]">{s.name}</strong> — {s.desc}
              </li>
            ))}
          </ol>
          <p className="text-[#57534a]">{h.roundsNote}</p>
        </Section>

        <Section title={h.starsTitle}>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {h.star1a}
              <strong className="text-emerald-300">{h.star1b}</strong>
              {h.star1c}
              <strong className="text-[#ff6b6b]">{h.star1d}</strong>
              {h.star1e}
            </li>
            <li>{h.star2}</li>
          </ul>
        </Section>

        <Section title={h.winTitle}>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              {h.win1a}
              <strong className="text-[#e8c547]">{h.win1b}</strong>
              {h.win1c}
            </li>
            <li>
              {h.win2a}
              <strong className="text-[#e8c547]">{h.win2b}</strong>
              {h.win2c}
            </li>
            <li>
              {h.win3a}
              <strong className="text-[#e8c547]">{h.win3b}</strong>
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
            <strong className="text-[#e8c547]">{h.dcStrong}</strong>
            {h.dcB}
          </p>
        </Section>

        <Link
          href="/"
          className="kaiji-btn kaiji-btn-blood mt-2 block w-full px-6 py-4 text-center text-lg font-bold"
        >
          {h.backToMain}
        </Link>
      </div>
    </main>
  );
}
