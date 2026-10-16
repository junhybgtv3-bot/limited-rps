# App Store 출시 가이드 — Limited RPS (Capacitor iOS 래퍼)

## 구조

네이티브 앱은 웹사이트(https://limited-rps-jj0r.onrender.com)를 그대로 로드하는
Capacitor 래퍼다. 웹 코드는 건드리지 않았고, `capacitor.config.ts`의 `server.url`이
라이브 사이트를 가리킨다. 앱 아이콘·스플래시는 도리이 디자인으로 생성済
(`ios/App/App/Assets.xcassets`).

- Bundle ID: `com.emujsa.limitedrps` (원하면 변경 가능)
- 앱 이름: Limited RPS

## 필요 조건

- Mac + Xcode 15 이상
- Apple Developer Program 가입 ($99/년) — Xcode에 Apple ID로 로그인

## 빌드·업로드 절차 (Mac)

1. 리포지토리 클론 후 의존성 설치
   ```bash
   git clone https://github.com/junhybgtv3-bot/limited-rps.git
   cd limited-rps
   npm install
   ```
2. 네이티브 프로젝트 동기화 후 Xcode 열기
   ```bash
   npx cap sync ios
   npx cap open ios
   ```
3. Xcode에서 `App` 타겟 → **Signing & Capabilities** → Team에 본인 개발자 계정 선택
   (Bundle ID가 처음이면 자동으로 등록됨)
4. 상단 디바이스를 **Any iOS Device (arm64)** 로 두고
   **Product → Archive**
5. Organizer에서 **Distribute App → App Store Connect → Upload**
6. [App Store Connect](https://appstoreconnect.apple.com) → 새 앱 생성
   (Bundle ID `com.emujsa.limitedrps` 선택)
7. 앱 정보 입력 후 심사 제출:
   - 스크린샷: 6.7" (1290×2796) / 6.5" (1242×2688) 필수
   - 설명, 키워드, 카테고리(Games > Card), 연령 등급
   - 리뷰 노트: "로그인 불필요. 6자리 방 코드로 2인 실시간 대전. 별도 계정·결제 없음."
   - 개인정보: 수집하는 데이터 없음 (닉네임은 방 안에서만 사용, 서버에 영속 저장 안 함)

## Mac이 없을 때

클라우드 빌드 서비스 이용 (예: Codemagic):
1. Codemagic에 GitHub 리포지토리 연결
2. iOS 워크플로우에서 Apple Developer API 키 등록
3. 빌드 후 App Store Connect로 자동 업로드

## 심사 관련 주의

- Apple Guideline 4.2 (최소 기능 요건): 웹사이트 래퍼 형태라 심사관이
  "웹뷰 앱"으로 보고 리젝할 가능성이 있다. 실제 멀티플레이 게임이고
  네이티브 앱 아이콘·스플래시·PWA와 별개로 동작함을 리뷰 노트에 명시할 것.
- 리젝 시 대안: Capacitor에 네이티브 기능(푸시 알림 등)을 추가해
  "앱다운" 요소를 강화하거나, PWA 배포로 전환.

## 웹 코드 업데이트 시

웹사이트는 Render에서 자동 재배포되므로, 앱을 다시 빌드할 필요가 없다.
`capacitor.config.ts`의 URL만 바꾸지 않는 한 앱은 항상 최신 웹을 로드한다.
네이티브 설정(아이콘·Bundle ID 등)을 바꿨을 때만 `npx cap sync ios` 후 재빌드.
