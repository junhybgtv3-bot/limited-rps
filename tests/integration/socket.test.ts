// 한정 가위바위보 통합 테스트 — 실제 서버(startServer(0), ephemeral 포트)를 띄워
// socket.io-client로 명세서 §12 시나리오를 종단 검증한다.
// §12-5(비공개) · §12-6(재접속) · §12-7(방 정원) + 전체 플로우 · 12라운드 완주 ·
// 에러 코드 · 중복 제출 · 미보유 카드 · forfeit · lobby:leave.
// src/ 코드는 건드리지 않는다. 실행: npx vitest run tests/integration/socket.test.ts

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// DATA_DIR은 attachSockets(서버 기동 시점)에 읽히므로, beforeAll/startServer보다
// 먼저 — 모듈 로드 시점에 임시 디렉토리로 고정한다.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lrps-integration-'));

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { startServer } from '../../src/server/start.js';
import type {
  CardType,
  LobbyState,
  PublicGameView,
  RevealPayload,
} from '../../src/shared/types.js';

// ---------------------------------------------------------------------------
// 서버 기동 / 정리
// ---------------------------------------------------------------------------

type StartedServer = Awaited<ReturnType<typeof startServer>>;

let httpServer: StartedServer['httpServer'];
let io: StartedServer['io'];
let baseUrl = '';

/** 테스트 중 열린 모든 클라이언트 소켓 (afterEach에서 정리) */
const openSockets = new Set<Socket>();

beforeAll(async () => {
  const srv = await startServer(0);
  httpServer = srv.httpServer;
  io = srv.io;
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
}, 120000);

function disconnectAll(): void {
  for (const s of [...openSockets]) {
    try {
      if (s.connected) s.disconnect();
    } catch {
      // 무시
    }
  }
  openSockets.clear();
}

afterEach(() => {
  disconnectAll();
});

afterAll(async () => {
  disconnectAll();
  io.close();
  // 잔여 keep-alive 연결이 vitest 종료를 막지 않도록 먼저 끊는다 (Node 18.2+)
  (httpServer as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
  try {
    fs.rmSync(process.env.DATA_DIR as string, { recursive: true, force: true });
  } catch {
    // 무시
  }
});

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/** 서버 연결된 클라이언트 소켓 1개 */
function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const sock = ioClient(baseUrl, { transports: ['websocket'] });
    openSockets.add(sock);
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
    sock.once('connect', () => {
      clearTimeout(timer);
      resolve(sock);
    });
    sock.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** ack를 Promise로 감싼 emit (서버가 ack를 호출하는 이벤트 전용) */
function emitAck(sock: Socket, event: string, payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    sock
      .timeout(5000)
      .emit(event, payload, (err: Error | null, res: unknown) => {
        if (err) reject(err);
        else resolve(res);
      });
  });
}

/** 서버 → 클라이언트 이벤트 1회 수신 대기 (predicate 불일치분은 건너뜀) */
function waitFor<T>(
  sock: Socket,
  event: string,
  opts?: { timeoutMs?: number; predicate?: (d: T) => boolean },
): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? 10000;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.off(event, handler);
      reject(new Error(`[waitFor] '${event}' ${timeoutMs}ms 내 수신 실패`));
    }, timeoutMs);
    const handler = (data: T) => {
      if (opts?.predicate && !opts.predicate(data)) return;
      clearTimeout(timer);
      sock.off(event, handler);
      resolve(data);
    };
    sock.on(event, handler);
  });
}

interface GameSetup {
  sockA: Socket;
  sockB: Socket;
  code: string;
  tokenA: string;
  tokenB: string;
  startViewA: PublicGameView;
  startViewB: PublicGameView;
}

/** 방 생성(A) → 입장(B)까지만. 로비 상태 유지 (게임 미시작) */
async function setupLobby(
  nickA: string,
  nickB: string,
): Promise<Omit<GameSetup, 'startViewA' | 'startViewB'>> {
  const sockA = await connect();
  const createRes: any = await emitAck(sockA, 'room:create', { nickname: nickA });
  expect(createRes.ok).toBe(true);
  expect(createRes.slot).toBe('A');

  const sockB = await connect();
  const joinRes: any = await emitAck(sockB, 'room:join', {
    roomCode: createRes.roomCode,
    nickname: nickB,
  });
  expect(joinRes.ok).toBe(true);
  expect(joinRes.slot).toBe('B');

  return {
    sockA,
    sockB,
    code: createRes.roomCode,
    tokenA: createRes.reconnectToken,
    tokenB: joinRes.reconnectToken,
  };
}

/** setupLobby + 양쪽 ready → game:start 수신까지 */
async function setupGame(nickA: string, nickB: string): Promise<GameSetup> {
  const base = await setupLobby(nickA, nickB);
  const startA = waitFor<{ view: PublicGameView }>(base.sockA, 'game:start');
  const startB = waitFor<{ view: PublicGameView }>(base.sockB, 'game:start');
  base.sockA.emit('lobby:ready', { ready: true });
  base.sockB.emit('lobby:ready', { ready: true });
  const [{ view: startViewA }, { view: startViewB }] = await Promise.all([startA, startB]);
  expect(startViewA.status).toBe('playing');
  expect(startViewB.status).toBe('playing');
  expect(startViewA.me.slot).toBe('A');
  expect(startViewB.me.slot).toBe('B');
  expect(startViewA.roundNumber).toBe(1);
  return { ...base, startViewA, startViewB };
}

interface RoundOutcome {
  revealA: RevealPayload;
  revealB: RevealPayload;
  viewA: PublicGameView; // A 시점의 다음 라운드(또는 종료) view
  viewB: PublicGameView;
}

/** 한 라운드 진행: 양쪽 제출 → 양쪽 game:reveal 수신 */
async function playRound(
  sockA: Socket,
  sockB: Socket,
  roundId: string,
  cardA: CardType,
  cardB: CardType,
): Promise<RoundOutcome> {
  const revA = waitFor<{ reveal: RevealPayload; view: PublicGameView }>(sockA, 'game:reveal');
  const revB = waitFor<{ reveal: RevealPayload; view: PublicGameView }>(sockB, 'game:reveal');
  const ackA: any = await emitAck(sockA, 'game:submit', { roundId, card: cardA });
  expect(ackA.ok).toBe(true);
  const ackB: any = await emitAck(sockB, 'game:submit', { roundId, card: cardB });
  expect(ackB.ok).toBe(true);
  const [rA, rB] = await Promise.all([revA, revB]);
  return { revealA: rA.reveal, revealB: rB.reveal, viewA: rA.view, viewB: rB.view };
}

/** §12-5 마스킹 단언: view.opponent에 hand/choice 키가 없어야 한다 */
function expectOpponentMasked(view: PublicGameView): void {
  const oppJson = JSON.stringify(view.opponent);
  expect(oppJson).not.toContain('"hand"');
  expect(oppJson).not.toContain('"choice"');
  expect(Object.keys(view.opponent).sort()).toEqual([
    'connected',
    'nickname',
    'stars',
    'submitted',
    'totalCards',
  ]);
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe('limited-rps socket integration', () => {
  it('1. 전체 플로우: 생성→입장→ready→game:start→A 3연승→B 별 0→game:finish', async () => {
    const { sockA, sockB, code, startViewA } = await setupGame('철수', '영희');
    expect(startViewA.roomCode).toBe(code);
    expect(startViewA.me.hand).toEqual({ rock: 4, scissors: 4, paper: 4 });
    expect(startViewA.me.stars).toBe(3);

    let roundId = startViewA.roundId;
    // 바위 vs 가위 × 2 → A 2연승 (별 5-1)
    for (let i = 0; i < 2; i++) {
      const { revealA, viewA } = await playRound(sockA, sockB, roundId, 'rock', 'scissors');
      expect(revealA.result).toBe('A');
      expect(revealA.stars).toEqual({ A: 4 + i, B: 2 - i });
      roundId = viewA.roundId;
    }

    // 3번째 라운드: B 별 0 → game:finish (winner A, stars_zero)
    const finishA = waitFor<{ winner: string; finishReason: string; view: PublicGameView }>(
      sockA,
      'game:finish',
    );
    const finishB = waitFor<{ winner: string; finishReason: string; view: PublicGameView }>(
      sockB,
      'game:finish',
    );
    const { revealA } = await playRound(sockA, sockB, roundId, 'rock', 'scissors');
    expect(revealA.result).toBe('A');
    expect(revealA.stars).toEqual({ A: 6, B: 0 });
    expect(revealA.finishReason).toBe('stars_zero');

    const [fA, fB] = await Promise.all([finishA, finishB]);
    expect(fA.winner).toBe('A');
    expect(fA.finishReason).toBe('stars_zero');
    expect(fB.winner).toBe('A');
    expect(fB.finishReason).toBe('stars_zero');
    expect(fA.view.me.stars).toBe(6);
    expect(fA.view.opponent.stars).toBe(0);
    expect(fA.view.status).toBe('finished');
  });

  it('2. 12라운드 완주: 전부 무승부 → winner draw, cards_exhausted, 별 3-3 동점', async () => {
    const { sockA, sockB, startViewA } = await setupGame('무승부A', '무승부B');
    let roundId = startViewA.roundId;
    // 각 카드 4장씩 전부 소진: 바위×4 → 가위×4 → 보×4, 전부 무승부
    const cards: CardType[] = [
      'rock', 'rock', 'rock', 'rock',
      'scissors', 'scissors', 'scissors', 'scissors',
      'paper', 'paper', 'paper', 'paper',
    ];
    for (let i = 0; i < 12; i++) {
      const isLast = i === 11;
      const finishA = isLast
        ? waitFor<{ winner: string; finishReason: string; view: PublicGameView }>(sockA, 'game:finish')
        : null;
      const finishB = isLast
        ? waitFor<{ winner: string; finishReason: string; view: PublicGameView }>(sockB, 'game:finish')
        : null;
      const { revealA, viewA } = await playRound(sockA, sockB, roundId, cards[i], cards[i]);
      expect(revealA.result).toBe('draw');
      // 무승부 라운드에서는 별 이동 없음
      expect(revealA.stars).toEqual({ A: 3, B: 3 });
      roundId = viewA.roundId;

      if (isLast) {
        expect(revealA.finishReason).toBe('cards_exhausted');
        const [fA, fB] = await Promise.all([finishA!, finishB!]);
        expect(fA.winner).toBe('draw');
        expect(fA.finishReason).toBe('cards_exhausted');
        expect(fB.winner).toBe('draw');
        expect(fB.finishReason).toBe('cards_exhausted');
        // 수학적 증명: 12라운드 내내 무승부 → 별 이동 없음 → 항상 3-3 동점
        expect(fA.view.me.stars).toBe(3);
        expect(fA.view.opponent.stars).toBe(3);
        expect(fB.view.me.stars).toBe(3);
        expect(fB.view.opponent.stars).toBe(3);
        // 양쪽 카드 전부 소진
        expect(fA.view.me.hand).toEqual({ rock: 0, scissors: 0, paper: 0 });
        expect(fA.view.opponent.totalCards).toBe(0);
      }
    }
  });

  it('3. §12-5 비공개: game:update에는 상대 카드 정보 없음, reveal 후엔 공개 정상', async () => {
    const { sockA, sockB, startViewA, startViewB } = await setupGame('비밀A', '비밀B');
    // 게임 시작 시점 view부터 마스킹 확인
    expectOpponentMasked(startViewA);
    expectOpponentMasked(startViewB);

    const roundId = startViewA.roundId;
    // A가 먼저 제출 → B가 받는 game:update에는 A의 카드 정보가 없어야 한다
    const updateForB = waitFor<{ view: PublicGameView }>(sockB, 'game:update');
    const revealForB = waitFor<{ reveal: RevealPayload; view: PublicGameView }>(
      sockB,
      'game:reveal',
    );
    const ackA: any = await emitAck(sockA, 'game:submit', { roundId, card: 'paper' });
    expect(ackA.ok).toBe(true);

    const { view } = await updateForB;
    expect(view.opponent.submitted).toBe(true); // 제출 여부는 공개
    expect(view.opponent.nickname).toBe('비밀A');
    expectOpponentMasked(view); // 카드는 비공개

    // B가 제출 → reveal에서는 양쪽 카드가 동시 공개되는 것이 정상
    const ackB: any = await emitAck(sockB, 'game:submit', { roundId, card: 'rock' });
    expect(ackB.ok).toBe(true);
    const { reveal, view: revealView } = await revealForB;
    expect(reveal.choices).toEqual({ A: 'paper', B: 'rock' });
    expect(reveal.result).toBe('A'); // 보 > 바위
    expectOpponentMasked(revealView);
  });

  it('4. §12-6 재접속: 게임 중 disconnect → 토큰 재접속 → 상태 복원 + 상대 알림', async () => {
    const { sockA, sockB, code, tokenA, startViewA } = await setupGame('재접A', '재접B');

    // 1라운드: A 승 → A 별 4, 바위 3장 남음 (복원 비교용 스냅샷)
    const { viewA } = await playRound(sockA, sockB, startViewA.roundId, 'rock', 'scissors');
    const beforeStars = viewA.me.stars;
    const beforeHand = { ...viewA.me.hand };
    expect(beforeStars).toBe(4);
    expect(beforeHand.rock).toBe(3);

    // B는 A의 연결 끊김/복귀 알림을 대기
    const goneNotice = waitFor<{ slot: string; connected: boolean }>(sockB, 'opponent:status', {
      predicate: (d) => d.slot === 'A' && d.connected === false,
    });
    const backNotice = waitFor<{ slot: string; connected: boolean }>(sockB, 'opponent:status', {
      predicate: (d) => d.slot === 'A' && d.connected === true,
    });

    sockA.disconnect();
    const gone = await goneNotice;
    expect(gone).toEqual({ slot: 'A', connected: false });

    // 새 소켓으로 저장된 reconnectToken으로 재접속
    const sockA2 = await connect();
    const reRes: any = await emitAck(sockA2, 'room:reconnect', {
      roomCode: code,
      reconnectToken: tokenA,
    });
    expect(reRes.ok).toBe(true);
    expect(reRes.slot).toBe('A');
    expect(reRes.phase).toBe('game');

    const gameView = reRes.game as PublicGameView;
    expect(gameView.me.slot).toBe('A');
    expect(gameView.status).toBe('playing');
    expect(gameView.roundNumber).toBe(2);
    expect(gameView.me.stars).toBe(beforeStars);
    expect(gameView.me.hand).toEqual(beforeHand);

    // 상대(B)에게 복귀 알림 전달
    const back = await backNotice;
    expect(back).toEqual({ slot: 'A', connected: true });
  });

  it('5. §12-7 방 정원: 로비에 2명 찬 방에 세 번째 join → FULL', async () => {
    const { code } = await setupLobby('꽉A', '꽉B'); // ready 안 함 → 로비 상태 유지
    const sockC = await connect();
    const res: any = await emitAck(sockC, 'room:join', { roomCode: code, nickname: '꽉C' });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('FULL');
  });

  it('6. 에러 코드: NOT_FOUND / INVALID_CODE / IN_PROGRESS / NICKNAME_TAKEN', async () => {
    const sockX = await connect();

    // 존재하지 않는 코드
    const nf: any = await emitAck(sockX, 'room:join', { roomCode: '999999', nickname: '유령' });
    expect(nf.ok).toBe(false);
    expect(nf.code).toBe('NOT_FOUND');

    // 6자리 숫자가 아닌 코드
    const ic1: any = await emitAck(sockX, 'room:join', { roomCode: '12ab', nickname: '유령' });
    expect(ic1.ok).toBe(false);
    expect(ic1.code).toBe('INVALID_CODE');
    const ic2: any = await emitAck(sockX, 'room:join', { roomCode: '12345', nickname: '유령' });
    expect(ic2.ok).toBe(false);
    expect(ic2.code).toBe('INVALID_CODE');

    // 게임 시작 후 join → IN_PROGRESS
    const { code } = await setupGame('진행A', '진행B');
    const inprog: any = await emitAck(sockX, 'room:join', { roomCode: code, nickname: '늦참' });
    expect(inprog.ok).toBe(false);
    expect(inprog.code).toBe('IN_PROGRESS');

    // 중복 닉네임 (대소문자 무시)
    const sockY = await connect();
    const cr: any = await emitAck(sockY, 'room:create', { nickname: '중복이' });
    expect(cr.ok).toBe(true);
    const sockZ = await connect();
    const dup: any = await emitAck(sockZ, 'room:join', {
      roomCode: cr.roomCode,
      nickname: '중복이',
    });
    expect(dup.ok).toBe(false);
    expect(dup.code).toBe('NICKNAME_TAKEN');
  });

  it('7. 중복 제출: 같은 라운드 2회 submit → ALREADY_SUBMITTED, 카드 1장만 소모', async () => {
    const { sockA, sockB, startViewA } = await setupGame('중복A', '중복B');
    const roundId = startViewA.roundId;

    const updA = waitFor<{ view: PublicGameView }>(sockA, 'game:update');
    const first: any = await emitAck(sockA, 'game:submit', { roundId, card: 'rock' });
    expect(first.ok).toBe(true);
    const second: any = await emitAck(sockA, 'game:submit', { roundId, card: 'rock' });
    expect(second.ok).toBe(false);
    expect(second.code).toBe('ALREADY_SUBMITTED');

    // 카드 1장만 소모되었는지 본인 view로 확인
    const { view } = await updA;
    expect(view.me.submitted).toBe(true);
    expect(view.me.hand.rock).toBe(3);

    // 라운드는 정상 종료되어야 한다 (B 제출 → reveal)
    const revealA = waitFor<{ reveal: RevealPayload; view: PublicGameView }>(sockA, 'game:reveal');
    const ackB: any = await emitAck(sockB, 'game:submit', { roundId, card: 'scissors' });
    expect(ackB.ok).toBe(true);
    const { reveal, view: rv } = await revealA;
    expect(reveal.result).toBe('A'); // 바위 > 가위
    expect(rv.me.hand.rock).toBe(3);
  });

  it('8. 미보유 카드 제출: 바위 4장 소진 후 다시 바위 → NO_SUCH_CARD', async () => {
    const { sockA, sockB, startViewA } = await setupGame('소진A', '소진B');
    let roundId = startViewA.roundId;
    // 4라운드 연속 바위 무승부 → A 바위 0장
    for (let i = 0; i < 4; i++) {
      const { revealA, viewA } = await playRound(sockA, sockB, roundId, 'rock', 'rock');
      expect(revealA.result).toBe('draw');
      roundId = viewA.roundId;
    }

    const res: any = await emitAck(sockA, 'game:submit', { roundId, card: 'rock' });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('NO_SUCH_CARD');

    // 보유 중인 다른 카드는 정상 제출 가능 (라운드 멈춤 없음)
    const ok: any = await emitAck(sockA, 'game:submit', { roundId, card: 'scissors' });
    expect(ok.ok).toBe(true);
  });

  it('9. forfeit: RECONNECT_GRACE_MS 경과 후 남은 플레이어 승리', async () => {
    const prev = process.env.RECONNECT_GRACE_MS;
    process.env.RECONNECT_GRACE_MS = '800'; // 이 테스트에서만 짧게, 이후 복원
    try {
      const { sockA, sockB } = await setupGame('기권A', '기권B');
      const finishB = waitFor<{ winner: string; finishReason: string }>(sockB, 'game:finish', {
        timeoutMs: 15000,
      });
      sockA.disconnect();
      const fin = await finishB;
      expect(fin.winner).toBe('B');
      expect(fin.finishReason).toBe('forfeit');
    } finally {
      if (prev === undefined) delete process.env.RECONNECT_GRACE_MS;
      else process.env.RECONNECT_GRACE_MS = prev;
    }
  });

  it('10. lobby:leave: B가 나가면 A에게 lobby:update, 방 상태 반영', async () => {
    const { sockA, sockB, code } = await setupLobby('나감A', '나감B');
    // 주의: B 입장 시의 lobby:update(2명)가 뒤늦게 도착할 수 있으니
    // B 퇴장 후의 상태(1명)만 골라 받는다
    const upd = waitFor<{ lobby: LobbyState }>(sockA, 'lobby:update', {
      predicate: (d) => d.lobby.players.length === 1,
    });
    sockB.emit('lobby:leave'); // ack 없음
    const { lobby } = await upd;
    expect(lobby.roomCode).toBe(code);
    expect(lobby.status).toBe('waiting');
    expect(lobby.players).toHaveLength(1);
    expect(lobby.players[0].slot).toBe('A');
    expect(lobby.players[0].nickname).toBe('나감A');
    expect(lobby.players[0].connected).toBe(true);
  });
});
