# Limited RPS — 공유 인터페이스 명세 (모든 파트의 절대 기준)

이 문서는 프론트/백엔드/엔진/테스트 파트가 공유하는 타입·이벤트·API 계약이다.
어떤 파트도 이 계약을 임의로 바꾸지 않는다. 변경이 필요하면 코디네이터(나)에게 보고.

작업 루트: `~/workspace/limited-rps/`

---

## 1. 공유 타입 (`src/shared/types.ts`)

모든 파트가 import 해서 쓴다. Next.js 클라이언트와 Node 서버 양쪽에서 import 가능해야
하므로 Node 전용 API 사용 금지 (순수 타입 + 상수만).

```ts
export type CardType = 'rock' | 'scissors' | 'paper';
export type PlayerSlot = 'A' | 'B';            // 방 내 고정 슬롯
export type RoundResult = 'A' | 'B' | 'draw';
export type FinishReason = 'stars_zero' | 'cards_exhausted' | 'timeout' | 'forfeit';
export type RoomStatus = 'waiting' | 'ready' | 'playing' | 'finished' | 'expired';
export type GameStatus = 'playing' | 'revealing' | 'finished';

export interface HandCounts { rock: number; scissors: number; paper: number; }

export interface PlayerState {
  slot: PlayerSlot;
  nickname: string;
  hand: HandCounts;      // 남은 카드 종류별 잔량 (본인에게만 공개)
  stars: number;         // 남은 별
}

export interface RoundRecord {
  roundId: string;                 // crypto.randomUUID(), 라운드마다 고유
  roundNumber: number;             // 1부터 시작
  choices: Record<PlayerSlot, CardType | null>; // 제출 전에는 null
  submitted: Record<PlayerSlot, boolean>;
  result: RoundResult | null;
  resolvedAt: string | null;       // ISO
}

export interface GameState {
  gameId: string;
  roomCode: string;
  players: Record<PlayerSlot, PlayerState>;
  roundNumber: number;             // 현재 라운드 번호
  currentRound: RoundRecord;
  status: GameStatus;
  winner: PlayerSlot | 'draw' | null;
  finishReason: FinishReason | null;
  startedAt: string;               // ISO
  deadlineAt: string;              // startedAt + 4시간 (ISO)
  history: RoundRecord[];          // 종료된 라운드 기록 (choices 포함)
}

/** 상대에게 공개되는 마스킹 뷰 — 서버가 소켓으로 내려주는 유일한 게임 상태 형태 */
export interface PublicGameView {
  roomCode: string;
  roundNumber: number;
  roundId: string;
  status: GameStatus;
  deadlineAt: string;
  startedAt: string;
  me: { slot: PlayerSlot; nickname: string; hand: HandCounts; stars: number; submitted: boolean; choice: CardType | null };
  opponent: { nickname: string; stars: number; totalCards: number; submitted: boolean; connected: boolean };
  // 주의: opponent.hand(종류별 잔량), opponent의 제출 카드는 절대 포함 금지
  lastReveal: {
    roundNumber: number;
    choices: Record<PlayerSlot, CardType>;
    result: RoundResult;
    stars: Record<PlayerSlot, number>;
    winner: PlayerSlot | 'draw' | null;
    finishReason: FinishReason | null;
  } | null;
  winner: PlayerSlot | 'draw' | null;
  finishReason: FinishReason | null;
}

export interface LobbyPlayerInfo {
  slot: PlayerSlot; nickname: string; connected: boolean; ready: boolean;
}
export interface LobbyState {
  roomCode: string;
  status: RoomStatus;
  players: LobbyPlayerInfo[];   // 1~2명
  inviteUrlPath: string;        // `/room/<code>` (클라가 origin 붙여서 복사)
}

/** 방 에러 코드 (명세서 §2.3) */
export type RoomErrorCode = 'NOT_FOUND' | 'FULL' | 'IN_PROGRESS' | 'EXPIRED' | 'INVALID_CODE' | 'NICKNAME_TAKEN';

/** 제출 에러 코드 */
export type SubmitErrorCode = 'NOT_PLAYING' | 'ROUND_MISMATCH' | 'ALREADY_SUBMITTED' | 'NO_SUCH_CARD' | 'UNKNOWN_SLOT';
```

### 상수
- `INITIAL_HAND: HandCounts = { rock: 4, scissors: 4, paper: 4 }`
- `INITIAL_STARS = 3`
- `TOTAL_ROUNDS = 12`
- `GAME_TIMEOUT_MS = 4 * 3600 * 1000`
- `RECONNECT_GRACE_MS` — 기본 60000, 환경변수 `RECONNECT_GRACE_MS`로 오버라이드 (테스트용)
- `LOBBY_EXPIRE_MS` — 기본 30분, 환경변수 `LOBBY_EXPIRE_MS`로 오버라이드. 마지막 활동 이후 이 시간이 지나고 게임이 시작되지 않은 방은 EXPIRED 후 삭제.

---

## 2. 게임 엔진 API (`src/game/engine.ts`) — 순수 함수, 결정론적, I/O 없음

```ts
import type { ... } from '../shared/types.js';

export class GameError extends Error { code: SubmitErrorCode; constructor(code, msg) }

export function createGame(roomCode: string, nickA: string, nickB: string, now?: Date): GameState;
export function submitCard(state: GameState, slot: PlayerSlot, card: CardType, roundId: string): GameState;
  // 검증 순서: status==='playing' → roundId 일치 → submitted 아님 → hand[card] > 0
  // 실패 시 GameError throw. 성공 시 hand 차감 + choices/submitted 기록한 새 state 반환 (원본 불변).
  // 같은 라운드 중복 제출 → ALREADY_SUBMITTED (카드 추가 소모 없음).
export function bothSubmitted(state: GameState): boolean;
export function resolveRound(state: GameState, now?: Date): { state: GameState; reveal: NonNullable<PublicGameView['lastReveal']> };
  // bothSubmitted 아니면 throw. 승패 판정 → 별 이동(승+1/패-1, 총합 6 유지) →
  // 종료 판정(① 패자 별 0 → 즉시 finished/stars_zero ② 양쪽 카드 0장 → 별 비교, 동점 draw/cards_exhausted)
  // 미종료면 roundNumber+1, 새 roundId의 currentRound로 다음 라운드.
export function checkTimeout(state: GameState, now?: Date): GameState;
  // deadlineAt 경과 && status!=='finished' → 별 비교로 finished/timeout (동점 draw)
export function toPublicView(state: GameState, me: PlayerSlot, opponentConnected: boolean): PublicGameView;
  // 마스킹 규칙 엄수: opponent는 nickname/stars/totalCards/submitted/connected만.
export function handTotal(h: HandCounts): number;
export function beats(a: CardType, b: CardType): RoundResult; // a 기준
```

불변성: 모든 함수는 입력 state를 변경하지 않고 새 객체를 반환한다.

---

## 3. 영속 스토어 API (`src/server/store.ts`) — JSON 파일 기반

- 저장 위치: `DATA_DIR` 환경변수 (기본 `<repo>/data`), 파일 `data/rooms/<CODE>.json`
- 원자적 쓰기: tmp 파일에 쓰고 rename.
- 재접속 토큰은 평문이 아닌 sha256 해시로 저장 (`reconnectTokenHash`).

```ts
export interface StoredRoomPlayer extends LobbyPlayerInfo { socketId: string | null; tokenHash: string; }
export interface StoredRoom {
  code: string;
  status: RoomStatus;
  players: Record<PlayerSlot, StoredRoomPlayer | null>; // 슬롯 고정
  game: GameState | null;
  createdAt: string; lastActiveAt: string;
  disconnectAt: Record<PlayerSlot, string | null>; // 연결 끊긴 시각 (재접속 유예 계산용)
}
export interface RoomStore {
  get(code: string): Promise<StoredRoom | null>;
  save(room: StoredRoom): Promise<void>;   // lastActiveAt 자동 갱신
  delete(code: string): Promise<void>;
  listCodes(): Promise<string[]>;
}
export function createRoomStore(dataDir?: string): RoomStore;
export function hashToken(token: string): string; // sha256 hex
```

방 코드는 숫자 6자리 문자열, `crypto.randomInt(0, 1000000)`을 6자리 zero-pad.
충돌 시 재생성 (store에 존재하면 다시).

---

## 4. Socket.IO 이벤트 명세 (네임스페이스 `/`, JSON)

### Client → Server
| 이벤트 | 페이로드 | 응답/브로드캐스트 |
|---|---|---|
| `room:create` | `{ nickname: string }` | ack → `{ ok: true, roomCode, slot: 'A', reconnectToken }` / `{ ok: false, error }` |
| `room:join` | `{ roomCode: string, nickname: string }` | ack → `{ ok: true, slot, reconnectToken }` / `{ ok: false, code: RoomErrorCode, message }`. 성공 시 방 전체에 `lobby:update` |
| `room:reconnect` | `{ roomCode: string, reconnectToken: string }` | ack → `{ ok: true, slot, phase: 'lobby'|'game', lobby?: LobbyState, game?: PublicGameView }` / `{ ok: false, code }` |
| `lobby:ready` | `{ ready: boolean }` | 방 전체 `lobby:update`. 양쪽 ready=true → 서버가 게임 생성 후 양쪽에 `game:start` |
| `lobby:leave` | `{}` | 방에서 제거. 상대에게 `lobby:update`. 방이 비면 삭제. |
| `game:submit` | `{ roundId: string, card: CardType }` | ack → `{ ok: true }` / `{ ok: false, code: SubmitErrorCode }`. 제출자에게만 `game:submitted { roundId }`(본인 제출 확인). 상대에게는 마스킹된 `game:update { view }` (submitted=true만 반영, 카드 비공개). 양쪽 제출 완료 시 양쪽에 `game:reveal { reveal, view }`. 종료 시 `game:finish { winner, finishReason, view }`. |

### Server → Client
| 이벤트 | 페이로드 | 설명 |
|---|---|---|
| `lobby:update` | `{ lobby: LobbyState }` | 입장/준비/연결상태 변경 시 방 전체 |
| `game:start` | `{ view: PublicGameView }` | 게임 시작 |
| `game:update` | `{ view: PublicGameView }` | 제출 상태 변경 등 (카드 비공개 유지) |
| `game:submitted` | `{ roundId: string }` | 본인 제출 ack 대체 (서버가 ack 대신 이 이벤트만 써도 됨 — 둘 중 하나로 통일: ack 사용) |
| `game:reveal` | `{ reveal: PublicGameView['lastReveal'], view: PublicGameView }` | 동시 공개 + 결과 |
| `game:finish` | `{ winner, finishReason, view }` | 게임 종료 (stars_zero/cards_exhausted/timeout/forfeit) |
| `room:error` | `{ code: RoomErrorCode, message: string }` | join 실패 등 |
| `opponent:status` | `{ slot, connected: boolean }` | 상대 연결 끊김/복귀 알림 |

### 서버 규칙 (소켓 레이어)
- 모든 게임 판정은 engine.ts를 통해서만. 소켓 레이어에서 별/카드 직접 조작 금지.
- `game:submit`은 engine.submitCard → 저장 → ack. `bothSubmitted`면 resolveRound → 저장 → `game:reveal` 브로드캐스트. 종료면 `game:finish`도 함께 (reveal에 winner/finishReason 포함이므로 reveal 하나로 충분 — finish는 별도 이벤트로도 보냄).
- 연결 끊김: 해당 슬롯 connected=false, disconnectAt 기록, 상대에게 `opponent:status`. RECONNECT_GRACE_MS 내 `room:reconnect`(토큰 검증) 시 복구. 타임아웃 시 게임을 `forfeit`로 종료 (남은 플레이어 승리) 후 `game:finish` 브로드캐스트. 로비 단계에서 끊기면 그냥 connected=false 표시.
- 재접속 토큰: `crypto.randomBytes(32).toString('hex')`, 서버는 해시만 저장. localStorage 키: `lrps:<CODE>` = `{ slot, reconnectToken }`.
- 4시간 타임아웃: 제출/라운드 전환 시점 + 60초 간격 sweep에서 checkTimeout 검사.
- 로비 만료 sweep: 60초 간격, LOBBY_EXPIRE_MS 경과한 waiting/ready 방 → EXPIRED → 삭제.
- 같은 소켓이 두 슬롯을 점유하지 못하게: room:join 시 이미 방에 있는 socketId면 기존 슬롯으로 안내(중복 입장 방지). 재접속은 token으로만.

---

## 5. 서버 진입점

- `server.ts` (루트): Next.js 커스텀 서버. `createServer()`가 `{ httpServer, io, app }` 반환 또는 `startServer(port)` 형태로 export → `src/server/start.ts`에 구현, `server.ts`는 `startServer(process.env.PORT ?? 3000)` 호출만.
- 테스트에서 `startServer(0)`으로 랜덤 포트 기동 가능해야 함 (integration 테스트용).
- Next.js App Router가 `src/app`을 페이지로 서빙. `next.config.mjs`에서 별도 설정 불필요.

---

## 6. 프론트 라우트

- `/` — 메인: 방 만들기 / 방 참가하기 / 게임 방법 버튼. 만들기는 닉네임 입력 모달 → `room:create` → `/room/<code>`로 이동. 참가하기는 코드 6자리 + 닉네임 입력 → `room:join`.
- `/room/[code]` — 소켓 연결 후: 게임 미시작이면 로비 UI(방 코드 + 복사 버튼, 초대 URL 복사 버튼, 플레이어1/2 + 연결상태, 준비 버튼, 나가기). 게임 시작되면 게임 UI.
- `/how-to-play` — 게임 방법 설명 페이지.
- 게임 UI: 상단(방 코드, 남은 시간(deadlineAt 기준 카운트다운), 라운드, 연결 상태), 상대(닉네임, 별 ⭐, 남은 카드 총수, 제출 여부), 나(닉네임, 별, 카드 종류별 잔량, 선택한 카드), 하단 카드 3버튼(✊✌️✋ + 잔량) + SET 버튼.
- 한국어 UI, 다크 네이비/차콜 + 금색 포인트, 반응형 (모바일 우선).
- 재접속: 마운트 시 localStorage의 `lrps:<code>`가 있으면 `room:reconnect` 먼저 시도.

## 7. 테스트

- `npm test` = vitest run (unit + integration).
- unit (`tests/unit/engine.test.ts`): 명세서 §12 테스트 1~4, 8(엔진 부분).
- integration (`tests/integration/socket.test.ts`): socket.io-client로 실제 서버 기동 후 — 테스트 5(비공개: 상대에게 카드 정보가 전달되지 않음), 6(재접속 복구), 7(세 번째 입장 거부), 전체 12라운드 플로우, forfeit(짧은 RECONNECT_GRACE_MS 사용).
- 통합 테스트는 `startServer`를 import해 ephemeral 포트로 띄운다. 전역 타임아웃 넉넉히 (vitest config `testTimeout: 30000`).

## 8. 공통 규칙

- 명세서 §11 제외 기능(로그인/매칭/채팅/랭킹/AI/관전 등) 추가 금지.
- 클라이언트가 보낸 별/카드 값을 서버가 신뢰하는 코드가 있으면 안 됨.
- 모든 시간은 ISO 문자열, 서버 기준.
- TypeScript strict, ESLint는 생략 가능, `tsc --noEmit` 통과 필수.
