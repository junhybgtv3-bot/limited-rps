import type { Server } from 'socket.io';
import { randomBytes } from 'node:crypto';
import {
  GameError,
  bothSubmitted,
  checkTimeout,
  createGame,
  forfeitGame,
  resolveRound,
  submitCard,
  toPublicView,
} from '../game/engine.js';
import {
  createRoomStore,
  generateRoomCode,
  hashToken,
  type RoomStore,
  type StoredRoom,
} from './store.js';
import {
  getLobbyExpireMs,
  getReconnectGraceMs,
  type CardType,
  type GameState,
  type LobbyPlayerInfo,
  type LobbyState,
  type PlayerSlot,
  type RevealPayload,
  type RoomErrorCode,
} from '../shared/types.js';

// Socket.IO 이벤트 핸들러 — 계약: docs/SPEC-INTERFACE.md §4 (+ §3 스토어).
// 모든 게임 판정은 engine.ts를 통해서만 수행한다. 이 레이어에서 별/카드를 직접 조작하지 않는다.
// 방 상태 변경은 전부 방 단위 뮤텍스(withRoomLock) 안에서 read-modify-write로 수행한다
// (동시 ready/제출/입장 등의 lost-update 레이스 방지). 같은 키의 중첩 락은 사용하지 않는다.

const SLOTS: PlayerSlot[] = ['A', 'B'];
const opponentOf = (slot: PlayerSlot): PlayerSlot => (slot === 'A' ? 'B' : 'A');
const VALID_CARDS: CardType[] = ['rock', 'scissors', 'paper'];
const CODE_RE = /^\d{6}$/; // 방 코드는 숫자 6자리
const SWEEP_INTERVAL_MS = 60_000;
const CREATE_LOCK_KEY = '__room_create__'; // 방 생성(코드 발급+저장) 전용 전역 락 키

type Ack = (res: Record<string, unknown>) => void;

function getAck(raw: unknown): Ack {
  return typeof raw === 'function' ? (raw as Ack) : () => {};
}

function normalizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const nickname = raw.trim();
  if (nickname.length === 0 || nickname.length > 24) return null;
  return nickname;
}

function buildLobbyView(room: StoredRoom): LobbyState {
  const players: LobbyPlayerInfo[] = [];
  for (const slot of SLOTS) {
    const p = room.players[slot];
    if (p) {
      players.push({
        slot: p.slot,
        nickname: p.nickname,
        connected: p.connected,
        ready: p.ready,
      });
    }
  }
  return {
    roomCode: room.code,
    status: room.status,
    players,
    inviteUrlPath: `/room/${room.code}`,
  };
}

function isGameLive(room: StoredRoom): boolean {
  return room.status === 'playing' && !!room.game && room.game.status !== 'finished';
}

export function attachSockets(io: Server): void {
  const store: RoomStore = createRoomStore(process.env.DATA_DIR);

  // 소켓 → 슬롯 매핑 (재접속은 토큰으로만, 같은 소켓의 중복 입장은 이 맵으로 차단)
  const socketRoom = new Map<string, { code: string; slot: PlayerSlot }>();
  // 재접속 유예 타이머 (프로세스 메모리에만 — 재시작 시 startup 복구로 재가동)
  const forfeitTimers = new Map<string, NodeJS.Timeout>();
  // 방 단위 직렬화 락
  const roomLocks = new Map<string, Promise<void>>();

  /** 같은 방 코드에 대한 비동기 작업을 직렬화한다. */
  function withRoomLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const prev = roomLocks.get(code) ?? Promise.resolve();
    const task = prev.then(fn, fn); // 이전 작업이 실패해도 다음 작업은 실행
    const tail: Promise<void> = task.then(
      () => undefined,
      () => undefined,
    );
    roomLocks.set(code, tail);
    void tail.then(() => {
      if (roomLocks.get(code) === tail) roomLocks.delete(code);
    });
    return task;
  }

  const forfeitTimerKey = (code: string, slot: PlayerSlot): string => `${code}:${slot}`;

  function clearForfeitTimer(code: string, slot: PlayerSlot): void {
    const key = forfeitTimerKey(code, slot);
    const timer = forfeitTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      forfeitTimers.delete(key);
    }
  }

  function clearRoomTimers(code: string): void {
    for (const slot of SLOTS) clearForfeitTimer(code, slot);
  }

  function emitGameUpdate(room: StoredRoom, game: GameState): void {
    for (const slot of SLOTS) {
      const p = room.players[slot];
      if (!p?.socketId) continue;
      const opp = room.players[opponentOf(slot)];
      io.to(p.socketId).emit('game:update', {
        view: toPublicView(game, slot, opp?.connected ?? false),
      });
    }
  }

  function emitGameReveal(room: StoredRoom, game: GameState, reveal: RevealPayload): void {
    for (const slot of SLOTS) {
      const p = room.players[slot];
      if (!p?.socketId) continue;
      const opp = room.players[opponentOf(slot)];
      io.to(p.socketId).emit('game:reveal', {
        reveal,
        view: toPublicView(game, slot, opp?.connected ?? false),
      });
    }
  }

  function emitGameFinish(room: StoredRoom): void {
    const game = room.game;
    if (!game) return;
    for (const slot of SLOTS) {
      const p = room.players[slot];
      if (!p?.socketId) continue;
      const opp = room.players[opponentOf(slot)];
      io.to(p.socketId).emit('game:finish', {
        winner: game.winner,
        finishReason: game.finishReason,
        view: toPublicView(game, slot, opp?.connected ?? false),
      });
    }
  }

  /** 유예 만료 시 기권 처리: 남은 플레이어 승리 → finished → game:finish 브로드캐스트 */
  function armForfeitTimer(code: string, slot: PlayerSlot): void {
    clearForfeitTimer(code, slot);
    const timer = setTimeout(() => {
      forfeitTimers.delete(forfeitTimerKey(code, slot));
      void withRoomLock(code, async () => {
        const room = await store.get(code);
        if (!room || !room.game || room.game.status === 'finished') return;
        const player = room.players[slot];
        if (!player || player.connected) return; // 유예 내 복귀함
        room.game = forfeitGame(room.game, opponentOf(slot));
        room.status = 'finished';
        await store.save(room);
        emitGameFinish(room);
      }).catch(() => {});
    }, getReconnectGraceMs());
    if (typeof timer.unref === 'function') timer.unref();
    forfeitTimers.set(forfeitTimerKey(code, slot), timer);
  }

  /** 소켓 연결 종료 시 공통 처리: connected=false + disconnectAt 기록 + 상대 알림 */
  async function handleSocketGone(socketId: string): Promise<void> {
    const entry = socketRoom.get(socketId);
    if (!entry) return;
    const { code, slot } = entry;
    await withRoomLock(code, async () => {
      // 락 대기 중 매핑이 바뀌었을 수 있으니 재확인
      const current = socketRoom.get(socketId);
      if (!current || current.code !== code || current.slot !== slot) return;
      socketRoom.delete(socketId);
      const room = await store.get(code);
      if (!room) return;
      const player = room.players[slot];
      if (!player || player.socketId !== socketId) return; // 이미 다른 소켓으로 교체됨
      player.connected = false;
      player.socketId = null;
      room.disconnectAt[slot] = new Date().toISOString();
      try {
        await store.save(room);
      } catch {
        // 저장 실패해도 상대 알림은 시도
      }
      io.to(code).emit('opponent:status', { slot, connected: false });
      // 로비 단계면 타이머 없이 그냥 둔다. 게임 진행 중에만 유예 타이머 가동.
      if (isGameLive(room)) {
        armForfeitTimer(code, slot);
      } else {
        clearForfeitTimer(code, slot);
      }
    }).catch(() => {});
  }

  /** 다른 방으로 이동하기 전, 이전 방에서는 연결이 끊긴 것으로 처리 */
  async function detachSocket(socketId: string): Promise<void> {
    if (socketRoom.has(socketId)) {
      await handleSocketGone(socketId);
    }
  }

  /** 60초 간격 sweep: ① 로비 만료 삭제 ② playing 방 checkTimeout */
  async function sweepOnce(): Promise<void> {
    let codes: string[];
    try {
      codes = await store.listCodes();
    } catch {
      return;
    }
    const nowMs = Date.now();
    for (const code of codes) {
      await withRoomLock(code, async () => {
        const room = await store.get(code);
        if (!room) return;
        // ① 게임 시작 전 방이 만료되면 조용히 삭제 (EXPIRED 이벤트 생략)
        if (room.status === 'waiting' || room.status === 'ready') {
          if (nowMs - Date.parse(room.lastActiveAt) > getLobbyExpireMs()) {
            clearRoomTimers(code);
            await store.delete(code);
          }
          return;
        }
        // ② 진행 중 게임의 4시간 타임아웃 검사
        if (isGameLive(room)) {
          const timed = checkTimeout(room.game as GameState);
          if (timed.status === 'finished') {
            room.game = timed;
            room.status = 'finished';
            await store.save(room);
            emitGameFinish(room);
          }
        }
      }).catch(() => {});
    }
  }

  /**
   * 서버 재시작 복구: 모든 방 로드 → 전원 connected=false/disconnectAt=now
   * (소켓은 어차피 끊김). 진행 중 게임에서 유예를 이미 초과한 슬롯은 즉시 forfeit.
   * 타이머는 프로세스 메모리에만 있으므로 진행 중 게임의 유예 타이머를 재가동한다.
   */
  async function recoverOnStartup(): Promise<void> {
    let codes: string[];
    try {
      codes = await store.listCodes();
    } catch {
      return;
    }
    const nowIso = new Date().toISOString();
    for (const code of codes) {
      await withRoomLock(code, async () => {
        const room = await store.get(code);
        if (!room) return;
        // 유예 초과분은 저장된 disconnectAt 기준으로 즉시 forfeit
        if (isGameLive(room)) {
          for (const slot of SLOTS) {
            const goneAt = room.disconnectAt[slot];
            if (goneAt && Date.now() - Date.parse(goneAt) > getReconnectGraceMs()) {
              room.game = forfeitGame(room.game as GameState, opponentOf(slot));
              room.status = 'finished';
              break;
            }
          }
        }
        for (const slot of SLOTS) {
          const p = room.players[slot];
          if (p) {
            p.connected = false;
            p.socketId = null;
          }
          room.disconnectAt[slot] = nowIso;
        }
        await store.save(room);
        // 진행 중 게임은 재접속 유예 타이머 재가동 (재접속 시 해제됨)
        if (isGameLive(room)) {
          for (const slot of SLOTS) {
            if (room.players[slot]) armForfeitTimer(code, slot);
          }
        }
      }).catch(() => {});
    }
  }

  io.on('connection', (socket) => {
    // ---- room:create ----
    socket.on('room:create', async (payload: unknown, ackRaw?: unknown) => {
      const ack = getAck(ackRaw);
      const nickname = normalizeNickname(
        (payload as { nickname?: unknown } | null)?.nickname,
      );
      if (!nickname) {
        ack({ ok: false, code: 'NICKNAME_REQUIRED', error: '닉네임을 입력해 주세요.' });
        return;
      }
      try {
        await detachSocket(socket.id);
        // 코드 발급+저장을 전역 락 안에서 원자적으로 (충돌 재생성 포함)
        const created = await withRoomLock(CREATE_LOCK_KEY, async () => {
          const code = await generateRoomCode(async (c) => (await store.get(c)) !== null);
          const reconnectToken = randomBytes(32).toString('hex');
          const nowIso = new Date().toISOString();
          const room: StoredRoom = {
            code,
            status: 'waiting',
            players: {
              A: {
                slot: 'A',
                nickname,
                connected: true,
                ready: false,
                socketId: socket.id,
                tokenHash: hashToken(reconnectToken),
              },
              B: null,
            },
            game: null,
            createdAt: nowIso,
            lastActiveAt: nowIso,
            disconnectAt: { A: null, B: null },
          };
          await store.save(room);
          return { code, reconnectToken };
        });
        socket.join(created.code);
        socketRoom.set(socket.id, { code: created.code, slot: 'A' });
        ack({ ok: true, roomCode: created.code, slot: 'A', reconnectToken: created.reconnectToken });
      } catch {
        ack({ ok: false, code: 'CREATE_FAILED', error: '방 생성에 실패했습니다.' });
      }
    });

    // ---- room:join ----
    socket.on('room:join', async (payload: unknown, ackRaw?: unknown) => {
      const ack = getAck(ackRaw);
      const body = (payload ?? {}) as { roomCode?: unknown; nickname?: unknown };
      const roomCode = typeof body.roomCode === 'string' ? body.roomCode.trim() : '';
      const fail = (code: RoomErrorCode, message: string): void => {
        ack({ ok: false, code, message });
      };
      if (!CODE_RE.test(roomCode)) {
        fail('INVALID_CODE', '방 코드는 6자리 숫자입니다.');
        return;
      }
      const nickname = normalizeNickname(body.nickname);
      if (!nickname) {
        fail('NICKNAME_TAKEN', '닉네임을 입력해 주세요.');
        return;
      }
      // 다른 방에 있던 소켓이면 먼저 이전 방에서 연결 종료 처리한 뒤 새 방 락 진입
      // (락 중첩 방지: detach는 항상 어떤 방 락보다 먼저 수행)
      if (socketRoom.get(socket.id)?.code !== roomCode) {
        await detachSocket(socket.id);
      }
      try {
        await withRoomLock(roomCode, async () => {
          const room = await store.get(roomCode);
          if (!room) {
            fail('NOT_FOUND', '방을 찾을 수 없습니다.');
            return;
          }
          if (
            (room.status === 'waiting' || room.status === 'ready') &&
            Date.now() - Date.parse(room.lastActiveAt) > getLobbyExpireMs()
          ) {
            fail('EXPIRED', '만료된 방입니다. 새 방을 만들어 주세요.');
            return;
          }
          if (room.status === 'playing' || room.status === 'finished') {
            fail('IN_PROGRESS', '이미 게임이 진행 중이거나 종료된 방입니다.');
            return;
          }
          // 같은 소켓의 중복 입장 → 기존 슬롯으로 안내 (FULL 판정보다 먼저)
          for (const s of SLOTS) {
            const p = room.players[s];
            if (p && p.socketId === socket.id) {
              socketRoom.set(socket.id, { code: roomCode, slot: s });
              ack({ ok: true, slot: s });
              return;
            }
          }
          if (room.players.A && room.players.B) {
            fail('FULL', '방이 가득 찼습니다.');
            return;
          }
          const nicknameTaken = SLOTS.some((s) => {
            const p = room.players[s];
            return !!p && p.nickname.trim().toLowerCase() === nickname.toLowerCase();
          });
          if (nicknameTaken) {
            fail('NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.');
            return;
          }

          // (이전 방 detach는 락 진입 전에 완료됨)
          const slot: PlayerSlot = room.players.B ? 'A' : 'B';
          const reconnectToken = randomBytes(32).toString('hex');
          room.players[slot] = {
            slot,
            nickname,
            connected: true,
            ready: false,
            socketId: socket.id,
            tokenHash: hashToken(reconnectToken),
          };
          room.disconnectAt[slot] = null;
          await store.save(room);
          socket.join(roomCode);
          socketRoom.set(socket.id, { code: roomCode, slot });
          ack({ ok: true, slot, reconnectToken });
          io.to(roomCode).emit('lobby:update', { lobby: buildLobbyView(room) });
        });
      } catch {
        fail('NOT_FOUND', '입장 중 오류가 발생했습니다.');
      }
    });

    // ---- room:reconnect ----
    socket.on('room:reconnect', async (payload: unknown, ackRaw?: unknown) => {
      const ack = getAck(ackRaw);
      const body = (payload ?? {}) as { roomCode?: unknown; reconnectToken?: unknown };
      const roomCode = typeof body.roomCode === 'string' ? body.roomCode : '';
      const token = typeof body.reconnectToken === 'string' ? body.reconnectToken : '';
      const fail = (): void => {
        ack({ ok: false, code: 'NOT_FOUND' });
      };
      if (!CODE_RE.test(roomCode) || token.length === 0) {
        fail();
        return;
      }
      // 다른 방에 있던 소켓이면 먼저 이전 방에서 연결 종료 처리 (락 중첩 방지)
      if (socketRoom.get(socket.id)?.code !== roomCode) {
        await detachSocket(socket.id);
      }
      try {
        await withRoomLock(roomCode, async () => {
          const room = await store.get(roomCode);
          if (!room) {
            fail();
            return;
          }
          const tokenHash = hashToken(token);
          const slot: PlayerSlot | null =
            SLOTS.find((s) => room.players[s]?.tokenHash === tokenHash) ?? null;
          const player = slot ? room.players[slot] : null;
          if (!slot || !player) {
            fail();
            return;
          }
          clearForfeitTimer(roomCode, slot);
          player.connected = true;
          player.socketId = socket.id;
          room.disconnectAt[slot] = null;
          await store.save(room);
          socket.join(roomCode);
          socketRoom.set(socket.id, { code: roomCode, slot });

          const opp = room.players[opponentOf(slot)];
          const res: Record<string, unknown> = {
            ok: true,
            slot,
            phase: room.game ? 'game' : 'lobby',
            lobby: buildLobbyView(room),
          };
          if (room.game) {
            res.game = toPublicView(room.game, slot, opp?.connected ?? false);
          }
          ack(res);
          socket.to(roomCode).emit('opponent:status', { slot, connected: true });
        });
      } catch {
        fail();
      }
    });

    // ---- lobby:ready ----
    socket.on('lobby:ready', async (payload: unknown) => {
      const entry = socketRoom.get(socket.id);
      if (!entry) return;
      const { code, slot } = entry;
      await withRoomLock(code, async () => {
        const room = await store.get(code);
        if (!room || room.status !== 'waiting') return; // 게임 시작 후 ready는 무시
        const player = room.players[slot];
        if (!player) return;
        player.ready = (payload as { ready?: unknown } | null)?.ready === true;
        await store.save(room);
        io.to(code).emit('lobby:update', { lobby: buildLobbyView(room) });

        // 양쪽 ready → 게임 생성 (A/B 슬롯 순서 고정), 각자 시점의 view로 game:start
        const a = room.players.A;
        const b = room.players.B;
        if (!a || !b || !a.ready || !b.ready || room.game) return;
        const game = createGame(code, a.nickname, b.nickname);
        room.game = game;
        room.status = 'playing';
        await store.save(room);
        for (const s of SLOTS) {
          const p = room.players[s];
          if (!p?.socketId) continue;
          const opp = room.players[opponentOf(s)];
          io.to(p.socketId).emit('game:start', {
            view: toPublicView(game, s, opp?.connected ?? false),
          });
        }
      }).catch(() => {});
    });

    // ---- lobby:leave ----
    socket.on('lobby:leave', async () => {
      const entry = socketRoom.get(socket.id);
      if (!entry) return;
      const { code, slot } = entry;
      await withRoomLock(code, async () => {
        const current = socketRoom.get(socket.id);
        if (!current || current.code !== code || current.slot !== slot) return;
        socketRoom.delete(socket.id);
        try {
          socket.leave(code);
        } catch {
          // 무시
        }
        clearForfeitTimer(code, slot);
        const room = await store.get(code);
        if (!room) return;
        const player = room.players[slot];
        if (!player || player.socketId !== socket.id) return; // 이미 교체됨
        room.players[slot] = null;
        room.disconnectAt[slot] = null;
        const hasAnyoneLeft = SLOTS.some((s) => room.players[s] !== null);
        if (!hasAnyoneLeft) {
          clearRoomTimers(code);
          await store.delete(code);
          return;
        }
        await store.save(room);
        io.to(code).emit('lobby:update', { lobby: buildLobbyView(room) });
      }).catch(() => {});
    });

    // ---- game:submit ----
    socket.on('game:submit', async (payload: unknown, ackRaw?: unknown) => {
      const ack = getAck(ackRaw);
      const body = (payload ?? {}) as { roundId?: unknown; card?: unknown };
      const fail = (code: string): void => {
        ack({ ok: false, code });
      };
      const entry = socketRoom.get(socket.id);
      if (!entry) {
        fail('UNKNOWN_SLOT');
        return;
      }
      const card = body.card;
      // 클라이언트가 보낸 값을 신뢰하지 않는다 — 화이트리스트 검증
      if (typeof card !== 'string' || !VALID_CARDS.includes(card as CardType)) {
        fail('NO_SUCH_CARD');
        return;
      }
      const { code, slot } = entry;
      try {
        await withRoomLock(code, async () => {
          const room = await store.get(code);
          if (!room || !room.game || room.status !== 'playing') {
            fail('NOT_PLAYING');
            return;
          }
          if (!room.players[slot]) {
            fail('UNKNOWN_SLOT');
            return;
          }

          // 제출 시점 4시간 타임아웃 선검사
          const timed = checkTimeout(room.game);
          if (timed.status === 'finished' && room.game.status !== 'finished') {
            room.game = timed;
            room.status = 'finished';
            await store.save(room);
            emitGameFinish(room);
            fail('NOT_PLAYING');
            return;
          }

          let game: GameState;
          try {
            // 모든 판정은 엔진에 위임 (검증 순서: playing → roundId → 중복 → 잔량)
            game = submitCard(room.game, slot, card as CardType, String(body.roundId));
          } catch (err) {
            fail(err instanceof GameError ? err.code : 'NOT_PLAYING');
            return;
          }
          room.game = game;
          await store.save(room);
          ack({ ok: true });
          emitGameUpdate(room, game);

          if (bothSubmitted(game)) {
            const { state: next, reveal } = resolveRound(game);
            room.game = next;
            if (next.status === 'finished') room.status = 'finished';
            await store.save(room);
            emitGameReveal(room, next, reveal);
            if (next.status === 'finished') {
              emitGameFinish(room);
            }
          }
        });
      } catch {
        fail('NOT_PLAYING');
      }
    });

    // ---- disconnect ----
    socket.on('disconnect', () => {
      void handleSocketGone(socket.id);
    });
  });

  // 서버 재시작 복구 (비동기, 시그니처는 void 유지)
  void recoverOnStartup().catch(() => {});
  // 60초 간격 sweep
  const sweepTimer = setInterval(() => {
    void sweepOnce().catch(() => {});
  }, SWEEP_INTERVAL_MS);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
}
