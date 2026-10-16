# DEPLOY.md — 한정 가위바위보 배포 가이드

## 전제: 서버리스 배포 불가

이 프로젝트는 Socket.IO **장기 연결(WebSocket)** 을 사용합니다. Vercel, Netlify Functions, Cloudflare Workers 같은 서버리스/엣지 환경에는 배포할 수 없습니다. **단일 Node 프로세스**(`npm start`)로 실행되는 환경을 사용하세요.

## Railway

1. Railway에서 새 프로젝트 → GitHub 리포지토리 연결
2. 서비스 설정:
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
3. `PORT` 환경변수는 Railway가 자동 주입합니다. (코드는 `process.env.PORT`를 읽습니다)
4. **데이터 퍼시스턴스 주의**: 기본 `DATA_DIR`은 리포지토리 내 `./data`이며, 재배포 시 방 JSON이 사라집니다.
   - Railway 볼륨을 마운트(예: 마운트 경로 `/data`)한 뒤 환경변수 `DATA_DIR=/data`로 지정하세요.

## Render

**원클릭 배포:** https://render.com/deploy?repo=https://github.com/junhybgtv3-bot/limited-rps
(리포지토리 루트의 `render.yaml` 블루프린트를 자동으로 읽어 무료 Web Service로 생성한다.
Render 계정으로 로그인한 뒤 GitHub 계정을 연결하면 된다.)

수동 생성 시:
2. **Build Command**: `npm install && npm run build`
3. **Start Command**: `npm start`
4. `PORT`는 Render가 자동 주입합니다.
5. 디스크(Disk)를 추가한 경우 마운트 경로(예: `/data`)에 맞춰 `DATA_DIR=/data` 환경변수를 설정하세요. 디스크 없이 배포하면 재배포 시 방 데이터가 사라집니다.

## Fly.io

`fly launch` 없이 수동 구성 시 예시입니다.

**Dockerfile** (리포지토리 루트):

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

**볼륨 마운트 예시**:

```bash
fly volumes create lrps_data --size 1
```

`fly.toml`에 추가:

```toml
[mounts]
  source = "lrps_data"
  destination = "/data"

[env]
  DATA_DIR = "/data"
```

## HTTPS / WSS

- 위 세 플랫폼 모두 HTTPS를 자동 제공합니다.
- 클라이언트는 **같은 origin**에서 Socket.IO에 접속하므로 별도의 WSS 설정이나 CORS 작업이 필요 없습니다.

## 운영 주의사항

- **단일 인스턴스로 실행하세요.** 여러 인스턴스로 스케일 아웃하면 인스턴스 간 소켓 상태가 공유되지 않아 방이 깨집니다. 다중 인스턴스가 필요해지면 Socket.IO Redis 어댑터 도입이 필요합니다 (추후 확장 과제).
- **로그**: 소켓 연결/종료, 방 생성/만료, 게임 종료 사유(`stars_zero` / `cards_exhausted` / `timeout` / `forfeit`)를 남기면 장애 추적에 유용합니다.
- **data/ 백업**: 방 JSON은 `data/rooms/<CODE>.json`에 저장됩니다. 볼륨 스냅샷이나 주기적 백업을 권장합니다.
- **로비 만료 sweep**은 60초 간격으로 동작하며, 만료된 방(`LOBBY_EXPIRE_MS` 경과)은 삭제됩니다.

## PostgreSQL 마이그레이션 경로

MVP는 JSON 파일 스토어(`src/server/store.ts`의 `RoomStore` 인터페이스)를 사용합니다. Postgres로 옮기려면 스토어 구현만 교체하면 됩니다.

- `RoomStore` 인터페이스(`get` / `save` / `delete` / `listCodes`)를 그대로 구현하는 `PostgresRoomStore` 클래스를 만들고, `createRoomStore()`를 호출하는 위치에서 교체합니다.
- 게임 엔진(`src/game/engine.ts`)은 순수 함수라 DB와 무관하게 그대로 사용 가능합니다. `GameState`는 ISO 문자열 시간만 사용하므로 JSONB에 직렬화해도 안전합니다.

**테이블 설계안**:

```sql
CREATE TABLE rooms (
  code           TEXT PRIMARY KEY,          -- 6자리 방 코드
  status         TEXT NOT NULL,             -- waiting | ready | playing | finished | expired
  players        JSONB NOT NULL,            -- Record<PlayerSlot, StoredRoomPlayer | null>
  game           JSONB,                     -- GameState | null
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rooms_last_active_at ON rooms (last_active_at);
```

- `last_active_at` 인덱스: 로비 만료 sweep(`LOBBY_EXPIRE_MS` 경과 방 조회)용.
- `players` JSONB 안의 `disconnect_at` 상당 필드: 재접속 유예(`RECONNECT_GRACE_MS`) 초과 여부 판단용. 필요하면 별도 컬럼으로 분리해도 됩니다.
- 재접속 토큰은 현재처럼 sha256 해시만 저장합니다 (`tokenHash`).
