'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CARD_EMOJI,
  TOTAL_ROUNDS,
  type CardType,
  type FinishReason,
  type LobbyState,
  type PlayerSlot,
  type PublicGameView,
  type RevealPayload,
} from '@/shared/types';
import {
  clearSession,
  emitAck,
  getSocket,
  loadSession,
  saveSession,
  type JoinAck,
  type ReconnectAck,
  type SubmitAck,
} from '@/app/lib/socket';
import { toast } from '@/app/components/Toaster';
import { ZawaBackground } from '@/app/components/Kaiji';
import { LanguageSwitcher, useLanguage } from '@/app/i18n/LanguageContext';
import Stars from '@/app/components/Stars';
import CardButton from '@/app/components/CardButton';

type Phase = 'connecting' | 'join' | 'lobby' | 'game' | 'finished';

interface FinalResult {
  winner: PublicGameView['winner'];
  finishReason: FinishReason | null;
  view: PublicGameView;
}

const CARDS: CardType[] = ['rock', 'scissors', 'paper'];

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

function deltaText(d: number): string {
  return d > 0 ? `+${d}` : `${d}`;
}

export default function RoomPage() {
  const params = useParams();
  const code = (
    Array.isArray(params.code) ? params.code[0] : params.code
  ) as string;
  const router = useRouter();
  const { t } = useLanguage();

  const [phase, setPhase] = useState<Phase>('connecting');
  const [connFailed, setConnFailed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [mySlot, setMySlot] = useState<PlayerSlot | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [view, setView] = useState<PublicGameView | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [revealDelta, setRevealDelta] = useState<{
    me: number;
    opp: number;
  } | null>(null);
  const [final, setFinal] = useState<FinalResult | null>(null);
  const [selected, setSelected] = useState<CardType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [joinName, setJoinName] = useState('');
  const [joinErr, setJoinErr] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);

  // 리스너 클로저가 최신 상태를 보도록 ref 동기화
  const phaseRef = useRef<Phase>('connecting');
  const mySlotRef = useRef<PlayerSlot | null>(null);
  const viewRef = useRef<PublicGameView | null>(null);
  const revealRef = useRef<RevealPayload | null>(null);
  const pendingFinishRef = useRef<FinalResult | null>(null);
  const attemptingRef = useRef(false);
  // 토스트/에러 메시지가 최신 언어를 사용하도록 ref 동기화
  const tRef = useRef(t);
  tRef.current = t;

  const setPhaseAll = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // ---- 재접속 시도 ----
  const doReconnect = useCallback(async () => {
    if (attemptingRef.current) return;
    const sess = loadSession(code);
    if (!sess) {
      setPhaseAll('join');
      return;
    }
    attemptingRef.current = true;
    setConnFailed(false);
    try {
      const ack = await emitAck<ReconnectAck>(
        'room:reconnect',
        { roomCode: code, reconnectToken: sess.reconnectToken },
        12000,
      );
      if (ack.ok) {
        mySlotRef.current = ack.slot;
        setMySlot(ack.slot);
        if (ack.phase === 'game' && ack.game) {
          viewRef.current = ack.game;
          setView(ack.game);
          setSelected(null);
          setPhaseAll('game');
        } else {
          if (ack.lobby) setLobby(ack.lobby);
          setPhaseAll('lobby');
        }
      } else {
        clearSession(code);
        setJoinErr(
          tRef.current.errors.reconnect[ack.code] ??
            tRef.current.common.unknownError,
        );
        setPhaseAll('join');
      }
    } catch {
      setConnFailed(true);
    } finally {
      attemptingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const doReconnectRef = useRef(doReconnect);
  doReconnectRef.current = doReconnect;

  // ---- 소켓 리스너 ----
  useEffect(() => {
    const s = getSocket();
    setConnected(s.connected);

    const applyFinish = (fin: FinalResult) => {
      viewRef.current = fin.view;
      setView(fin.view);
      setReveal(null);
      setRevealDelta(null);
      revealRef.current = null;
      pendingFinishRef.current = null;
      clearSession(code);
      setFinal(fin);
      setPhaseAll('finished');
    };

    const onConnect = () => {
      setConnected(true);
      void doReconnectRef.current();
    };
    const onDisconnect = () => setConnected(false);

    const onLobbyUpdate = (p: { lobby: LobbyState }) => {
      setLobby(p.lobby);
      if (phaseRef.current !== 'finished') setPhaseAll('lobby');
    };

    const onGameStart = (p: { view: PublicGameView }) => {
      viewRef.current = p.view;
      setView(p.view);
      setSelected(null);
      setReveal(null);
      setPhaseAll('game');
    };

    const onGameUpdate = (p: { view: PublicGameView }) => {
      const prev = viewRef.current;
      viewRef.current = p.view;
      setView(p.view);
      if (prev && prev.roundId !== p.view.roundId) setSelected(null);
    };

    const onGameReveal = (p: {
      reveal: RevealPayload;
      view: PublicGameView;
    }) => {
      const prev = viewRef.current;
      const slot = mySlotRef.current;
      revealRef.current = p.reveal;
      setReveal(p.reveal);
      if (slot && prev) {
        const opp: PlayerSlot = slot === 'A' ? 'B' : 'A';
        setRevealDelta({
          me: p.reveal.stars[slot] - prev.me.stars,
          opp: p.reveal.stars[opp] - prev.opponent.stars,
        });
      } else {
        setRevealDelta(null);
      }
      setSelected(null);
      window.setTimeout(() => {
        revealRef.current = null;
        viewRef.current = p.view;
        setView(p.view);
        setReveal(null);
        setRevealDelta(null);
        const fin = pendingFinishRef.current;
        if (fin) applyFinish(fin);
      }, 2500);
    };

    const onGameFinish = (p: {
      winner: PublicGameView['winner'];
      finishReason: FinishReason | null;
      view: PublicGameView;
    }) => {
      const fin: FinalResult = {
        winner: p.winner,
        finishReason: p.finishReason,
        view: p.view,
      };
      if (revealRef.current) {
        pendingFinishRef.current = fin;
      } else {
        applyFinish(fin);
      }
    };

    const onOpponentStatus = (p: {
      slot: PlayerSlot;
      connected: boolean;
    }) => {
      if (p.slot === mySlotRef.current) return;
      const update = (v: PublicGameView | null) =>
        v ? { ...v, opponent: { ...v.opponent, connected: p.connected } } : v;
      viewRef.current = update(viewRef.current);
      setView((v) => update(v));
    };

    const onRoomError = (p: { code: string; message?: string }) => {
      toast(p.message || tRef.current.common.unknownError, 'error');
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('lobby:update', onLobbyUpdate);
    s.on('game:start', onGameStart);
    s.on('game:update', onGameUpdate);
    s.on('game:reveal', onGameReveal);
    s.on('game:finish', onGameFinish);
    s.on('opponent:status', onOpponentStatus);
    s.on('room:error', onRoomError);

    void doReconnectRef.current();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('lobby:update', onLobbyUpdate);
      s.off('game:start', onGameStart);
      s.off('game:update', onGameUpdate);
      s.off('game:reveal', onGameReveal);
      s.off('game:finish', onGameFinish);
      s.off('opponent:status', onOpponentStatus);
      s.off('room:error', onRoomError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // 게임 중 1초 카운트다운
  useEffect(() => {
    if (phase !== 'game') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  // ---- 액션 ----
  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    const name = joinName.trim();
    if (!name) {
      setJoinErr(t.errors.create.NICKNAME_REQUIRED);
      return;
    }
    setJoinBusy(true);
    setJoinErr('');
    try {
      const ack = await emitAck<JoinAck>('room:join', {
        roomCode: code,
        nickname: name,
      });
      if (ack.ok) {
        saveSession(code, {
          slot: ack.slot,
          reconnectToken: ack.reconnectToken,
        });
        mySlotRef.current = ack.slot;
        setMySlot(ack.slot);
        setPhaseAll('lobby'); // 이후 lobby:update 로 상세 갱신
      } else {
        setJoinErr(
          t.errors.join[ack.code] ?? ack.message ?? t.common.unknownError,
        );
      }
    } catch {
      setJoinErr(t.common.serverUnreachable);
    } finally {
      setJoinBusy(false);
    }
  };

  const toggleReady = () => {
    const me = lobby?.players.find((p) => p.slot === mySlot);
    getSocket().emit('lobby:ready', { ready: !(me?.ready ?? false) });
  };

  const leaveRoom = () => {
    try {
      getSocket().emit('lobby:leave', {});
    } catch {
      // 무시
    }
    clearSession(code);
    router.push('/');
  };

  const copyText = async (text: string, kind: 'code' | 'invite') => {
    try {
      await navigator.clipboard.writeText(text);
      toast(
        kind === 'code' ? t.room.lobby.copiedCode : t.room.lobby.copiedInvite,
        'success',
      );
    } catch {
      toast(t.room.lobby.copyFailed, 'error');
    }
  };

  const submitCard = async () => {
    if (!selected || !view || submitting || view.me.submitted) return;
    setSubmitting(true);
    try {
      const ack = await emitAck<SubmitAck>('game:submit', {
        roundId: view.roundId,
        card: selected,
      });
      if (!ack.ok) {
        toast(
          t.errors.submit[ack.code] ?? t.room.game.submitFailed,
          'error',
        );
        if (ack.code === 'ROUND_MISMATCH') setSelected(null);
      }
    } catch {
      toast(t.common.serverUnreachable, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const pageClass =
    'kaiji-bg relative min-h-screen overflow-hidden px-4 py-6 text-[#ece7d8]';

  // ============ 연결 중 ============
  if (phase === 'connecting') {
    return (
      <main className={`${pageClass} flex items-center justify-center`}>
        <ZawaBackground />
        <div className="absolute right-4 top-4 z-10">
          <LanguageSwitcher />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="font-serif-jp text-5xl font-black text-[#c1121f]" aria-hidden="true">
            ざわ‥
          </div>
          <p className="text-lg font-bold text-[#ece7d8]">
            {connFailed ? t.common.serverUnreachable : t.room.connecting}
          </p>
          {connFailed && (
            <button
              type="button"
              onClick={() => void doReconnectRef.current()}
              className="kaiji-btn kaiji-btn-blood px-6 py-3 font-bold"
            >
              {t.room.retry}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-sm text-[#9a9587] underline"
          >
            {t.common.backToMain}
          </button>
        </div>
      </main>
    );
  }

  // ============ 참가 (토큰 없음) ============
  if (phase === 'join') {
    return (
      <main className={`${pageClass} flex items-center justify-center`}>
        <ZawaBackground />
        <div className="absolute right-4 top-4 z-10">
          <LanguageSwitcher />
        </div>
        <form
          onSubmit={handleJoin}
          className="relative z-10 w-full max-w-sm border-2 border-[#2c2f32] bg-[#141416]/95 p-6"
        >
          <p className="mb-1 text-center text-sm text-[#9a9587]">
            {t.common.roomCode}
          </p>
          <p className="font-display mb-5 text-center text-3xl tracking-[0.3em] text-[#ece7d8]">
            {code}
          </p>
          <label className="mb-1 block text-sm font-semibold text-[#9a9587]">
            {t.common.nickname}
          </label>
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            maxLength={12}
            placeholder={t.common.nicknamePlaceholder}
            className="w-full border-2 border-[#2c2f32] bg-[#0b0c0d] px-4 py-3 text-lg text-[#ece7d8] placeholder:text-[#57534a] focus:border-[#b3122e] focus:outline-none"
          />
          {joinErr && (
            <p className="mt-3 text-center text-sm font-medium text-[#ff6b6b]">
              {joinErr}
            </p>
          )}
          <button
            type="submit"
            disabled={joinBusy}
            className="kaiji-btn kaiji-btn-blood mt-4 w-full px-6 py-3 text-base font-bold disabled:opacity-50"
          >
            {joinBusy ? t.home.joining : t.home.joinRoom}
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-3 w-full text-center text-sm text-[#9a9587] underline"
          >
            {t.common.backToMain}
          </button>
        </form>
      </main>
    );
  }

  // ============ 로비 ============
  if (phase === 'lobby') {
    const slots: PlayerSlot[] = ['A', 'B'];
    const me = lobby?.players.find((p) => p.slot === mySlot);
    const inviteUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${lobby?.inviteUrlPath ?? `/room/${code}`}`
        : `/room/${code}`;

    return (
      <main className={pageClass}>
        <ZawaBackground />
        <div className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-4">
          <div className="flex justify-end">
            <LanguageSwitcher />
          </div>
          <div className="text-center">
            <p className="text-sm text-[#9a9587]">{t.common.roomCode}</p>
            <p className="font-display text-5xl tracking-[0.2em] text-[#ece7d8]">
              {code}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => void copyText(code, 'code')}
                className="kaiji-btn kaiji-btn-ghost px-4 py-2 text-sm font-bold"
              >
                {t.room.lobby.copyCode}
              </button>
              <button
                type="button"
                onClick={() => void copyText(inviteUrl, 'invite')}
                className="kaiji-btn kaiji-btn-ghost px-4 py-2 text-sm font-bold"
              >
                {t.room.lobby.copyInvite}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {slots.map((slot, i) => {
              const p = lobby?.players.find((x) => x.slot === slot);
              const isMe = slot === mySlot;
              return (
                <div
                  key={slot}
                  className={`border-2 p-4 ${
                    isMe
                      ? 'border-[#b3122e] bg-[rgba(179,18,46,0.08)]'
                      : 'border-[#2c2f32] bg-[#141416]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#9a9587]">
                        {t.room.lobby.player(i)}
                        {isMe && (
                          <span className="ml-1 font-bold text-[#d41f2f]">
                            {t.room.lobby.youSuffix}
                          </span>
                        )}
                      </p>
                      <p className="text-lg font-bold text-[#ece7d8]">
                        {p ? p.nickname : t.room.lobby.waiting}
                      </p>
                    </div>
                    {p && (
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`text-sm font-bold ${p.connected ? 'text-emerald-400' : 'text-[#57534a]'}`}
                        >
                          {p.connected ? '●' : '○'}{' '}
                          {p.connected
                            ? t.room.lobby.connected
                            : t.room.lobby.disconnected}
                        </span>
                        <span
                          className={`px-3 py-1 text-xs font-bold ${
                            p.ready
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-[#2c2f32] text-[#9a9587]'
                          }`}
                        >
                          {p.ready
                            ? t.room.lobby.ready
                            : t.room.lobby.notReady}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!lobby && (
            <p className="text-center text-sm text-[#9a9587]">
              {t.room.lobby.loading}
            </p>
          )}

          <button
            type="button"
            onClick={toggleReady}
            disabled={!me}
            className={`kaiji-btn w-full px-6 py-4 text-lg font-bold disabled:opacity-50 ${
              me?.ready ? 'kaiji-btn-dark' : 'kaiji-btn-blood'
            }`}
          >
            {me?.ready
              ? t.room.lobby.unreadyButton
              : t.room.lobby.readyButton}
          </button>
          <p className="text-center text-xs text-[#9a9587]">
            {t.room.lobby.readyHint}
          </p>

          <button
            type="button"
            onClick={leaveRoom}
            className="kaiji-btn kaiji-btn-dark w-full px-6 py-3 text-base font-bold"
          >
            {t.room.lobby.leaveRoom}
          </button>
        </div>
      </main>
    );
  }

  // ============ 종료 화면 ============
  if (phase === 'finished' && final) {
    const fview = final.view;
    const mySlotNow = mySlot ?? fview.me.slot;
    const isDraw = final.winner === 'draw';
    const isWin = final.winner === mySlotNow;

    const title = isDraw
      ? t.room.finished.drawTitle
      : isWin
        ? t.room.finished.winTitle
        : t.room.finished.loseTitle;
    const titleColor = isDraw
      ? 'text-[#ece7d8]'
      : isWin
        ? 'text-emerald-300'
        : 'text-[#ff6b6b]';

    let desc = t.room.finished.defaultDesc;
    if (final.finishReason === 'stars_zero') {
      desc = isWin
        ? t.room.finished.starsZeroWin
        : t.room.finished.starsZeroLose;
    } else if (final.finishReason === 'cards_exhausted') {
      desc = isDraw
        ? t.room.finished.exhaustedDraw
        : t.room.finished.exhaustedWin;
    } else if (final.finishReason === 'timeout') {
      desc = isDraw
        ? t.room.finished.timeoutDraw
        : t.room.finished.timeoutWin;
    } else if (final.finishReason === 'forfeit') {
      desc = isWin
        ? t.room.finished.forfeitWin
        : t.room.finished.forfeitLose;
    }

    return (
      <main className={`${pageClass} flex items-center justify-center`}>
        <ZawaBackground />
        <div className="absolute right-4 top-4 z-10">
          <LanguageSwitcher />
        </div>
        <div className="animate-rps-pop relative z-10 flex w-full max-w-sm flex-col items-center border-2 border-[#2c2f32] bg-[#141416] p-8 shadow-[8px_8px_0_#000]">
          <div className="mb-2 text-6xl" aria-hidden="true">
            {isDraw ? '🤝' : isWin ? '🏆' : '😞'}
          </div>
          <h1 className={`font-display text-4xl tracking-wide ${titleColor}`}>{title}</h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-[#9a9587]">
            {desc}
          </p>
          <div className="mt-6 flex w-full items-center justify-between border border-[#2c2f32] bg-[#1c1e20] px-5 py-4">
            <div className="text-center">
              <p className="text-xs text-[#9a9587]">{t.common.you}</p>
              <Stars count={fview.me.stars} />
            </div>
            <div className="text-center">
              <p className="text-xs text-[#9a9587]">
                {fview.opponent.nickname || t.common.opponentFallback}
              </p>
              <Stars count={fview.opponent.stars} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="kaiji-btn kaiji-btn-blood mt-6 w-full px-6 py-4 text-lg font-bold"
          >
            {t.common.backToMain}
          </button>
        </div>
      </main>
    );
  }

  // ============ 게임 화면 ============
  if (phase === 'game' && view) {
    const mySlotNow = mySlot ?? view.me.slot;
    const oppSlot: PlayerSlot = mySlotNow === 'A' ? 'B' : 'A';
    const remaining = new Date(view.deadlineAt).getTime() - now;
    const submitted = view.me.submitted;

    const revealMyCard = reveal ? reveal.choices[mySlotNow] : null;
    const revealOppCard = reveal ? reveal.choices[oppSlot] : null;
    const revealWon =
      reveal && mySlot ? reveal.result === mySlot : false;
    const revealDraw = reveal?.result === 'draw';

    return (
      <main className={pageClass}>
        <ZawaBackground />
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col gap-4">
          <div className="flex justify-end">
            <LanguageSwitcher />
          </div>
          {/* 상단 바 */}
          <header className="flex items-center justify-between border-2 border-[#2c2f32] bg-[#141416] px-4 py-3">
            <div className="text-sm font-bold text-[#9a9587]">
              {t.room.game.roomLabel}{' '}
              <span className="font-display tracking-widest text-[#d41f2f]">{code}</span>
            </div>
            <div className="text-sm font-bold text-[#ece7d8]">
              ⏱ {formatRemaining(remaining)}
            </div>
            <div className="font-display text-sm tracking-widest text-[#ece7d8]">
              {view.roundNumber} / {TOTAL_ROUNDS}R
            </div>
            <div
              className={`text-sm font-bold ${connected ? 'text-emerald-400' : 'text-[#c1121f]'}`}
            >
              {connected ? '●' : '○'}
            </div>
          </header>

          {/* 상대 패널 */}
          <section className="border-2 border-[#2c2f32] bg-[#141416] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#9a9587]">{t.common.opponent}</p>
                <p className="text-lg font-bold text-[#ece7d8]">
                  {view.opponent.nickname || t.common.opponentFallback}
                </p>
              </div>
              {!view.opponent.connected && (
                <span className="bg-[#c1121f]/20 px-3 py-1 text-xs font-bold text-[#ff6b6b]">
                  {t.room.game.oppDisconnected}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Stars count={view.opponent.stars} />
              <span className="text-sm text-[#9a9587]">
                <strong>{t.room.game.cardsLeft(view.opponent.totalCards)}</strong>
              </span>
            </div>
            <div className="mt-2">
              <span
                className={`inline-block px-3 py-1 text-xs font-bold ${
                  view.opponent.submitted
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-[#2c2f32] text-[#9a9587]'
                }`}
              >
                {view.opponent.submitted
                  ? t.room.game.submitted
                  : t.room.game.choosing}
              </span>
            </div>
          </section>

          {/* 내 패널 */}
          <section className="border-2 border-[#b3122e] bg-[#141416] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#9a9587]">{t.common.you}</p>
                <p className="text-lg font-bold text-[#ece7d8]">
                  {view.me.nickname}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Stars count={view.me.stars} />
              <span className="text-sm text-[#9a9587]">
                <strong>
                  {t.room.game.cardsLeft(
                    view.me.hand.rock +
                      view.me.hand.scissors +
                      view.me.hand.paper,
                  )}
                </strong>
              </span>
            </div>
            <div className="mt-2 flex gap-2 text-sm">
              {CARDS.map((c) => (
                <span
                  key={c}
                  className="flex-1 border border-[#2c2f32] bg-[#1c1e20] px-2 py-1 text-center font-bold text-[#ece7d8]"
                >
                  {CARD_EMOJI[c]} {t.cardName[c]} ×{view.me.hand[c]}
                </span>
              ))}
            </div>
          </section>

          <div className="flex-1" />

          {/* 하단: 카드 선택 + SET */}
          {!submitted ? (
            <>
              <div className="flex gap-2">
                {CARDS.map((c) => (
                  <CardButton
                    key={c}
                    card={c}
                    count={view.me.hand[c]}
                    selected={selected === c}
                    disabled={view.me.hand[c] === 0 || submitting}
                    onSelect={setSelected}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => void submitCard()}
                disabled={!selected || submitting}
                className="kaiji-btn kaiji-btn-blood font-display w-full px-6 py-4 text-xl tracking-[0.2em] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? t.room.game.submitting : t.room.game.set}
              </button>
            </>
          ) : (
            <div className="border-2 border-[#2c2f32] bg-[#141416] p-6 text-center">
              <p className="text-lg font-bold text-[#ece7d8]">
                {view.opponent.submitted
                  ? t.room.game.revealing
                  : t.room.game.waitingOpponent}
              </p>
              <p className="mt-1 text-sm text-[#9a9587]">
                {t.room.game.submittedCard(
                  selected
                    ? `${CARD_EMOJI[selected]} ${t.cardName[selected]}`
                    : view.me.choice
                      ? `${CARD_EMOJI[view.me.choice]} ${t.cardName[view.me.choice]}`
                      : '—',
                )}
              </p>
            </div>
          )}
        </div>

        {/* 결과 오버레이 */}
        {reveal && revealMyCard && revealOppCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
            <div className="animate-rps-pop w-full max-w-sm border-2 border-[#b3122e]/60 bg-[#141416] p-6 text-center shadow-[8px_8px_0_#000]">
              <p className="text-sm font-bold text-[#9a9587]">
                {t.room.game.roundResult(reveal.roundNumber)}
              </p>
              <div className="mt-4 flex items-center justify-around">
                <div>
                  <p className="mb-1 text-xs text-[#9a9587]">{t.common.you}</p>
                  <p className="text-6xl">{CARD_EMOJI[revealMyCard]}</p>
                  <p className="mt-1 text-sm font-bold text-[#ece7d8]">
                    {t.cardName[revealMyCard]}
                  </p>
                  {revealDelta && (
                    <p
                      className={`mt-1 text-sm font-bold ${revealDelta.me >= 0 ? 'text-emerald-300' : 'text-[#ff6b6b]'}`}
                    >
                      ⭐ {deltaText(revealDelta.me)}
                    </p>
                  )}
                </div>
                <p className="font-display text-3xl text-[#57534a]">VS</p>
                <div>
                  <p className="mb-1 text-xs text-[#9a9587]">
                    {t.common.opponent}
                  </p>
                  <p className="text-6xl">{CARD_EMOJI[revealOppCard]}</p>
                  <p className="mt-1 text-sm font-bold text-[#ece7d8]">
                    {t.cardName[revealOppCard]}
                  </p>
                  {revealDelta && (
                    <p
                      className={`mt-1 text-sm font-bold ${revealDelta.opp >= 0 ? 'text-emerald-300' : 'text-[#ff6b6b]'}`}
                    >
                      ⭐ {deltaText(revealDelta.opp)}
                    </p>
                  )}
                </div>
              </div>
              <p
                className={`font-display mt-5 text-3xl tracking-wide ${
                  revealDraw
                    ? 'text-[#ece7d8]'
                    : revealWon
                      ? 'text-emerald-300'
                      : 'text-[#ff6b6b]'
                }`}
              >
                {revealDraw
                  ? t.room.game.draw
                  : revealWon
                    ? t.room.game.win
                    : t.room.game.lose}
              </p>
            </div>
          </div>
        )}
      </main>
    );
  }

  // 폴백 (상태 전이 중)
  return (
    <main className={`${pageClass} flex items-center justify-center`}>
      <ZawaBackground />
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher />
      </div>
      <p className="relative z-10 text-[#9a9587]">{t.common.loading}</p>
    </main>
  );
}
