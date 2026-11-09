# 휴즈랩 디자인 작업 알림

디자인 작업 요청·현황판 웹앱(구글 Apps Script)의 **알림 전용** 저장소입니다. 비밀값·웹앱 주소는 소스에 적지 않습니다(빌드할 때 `desktop/config.json`, 저장소 제외).

- `desktop/` — 윈도우 프로그램(Electron). 창 = 웹앱 그대로. 닫으면 트레이로 숨고, 새 소식이 오면 오른쪽 아래 알림 창 → 작업표시줄 주황 → 빨간 숫자.
  - 빌드(리눅스): `npm install` → `npx electron-builder --win nsis --x64 --publish never` (wine64 + wine32 필요). `dist/`의 `latest.yml`·`design-alarm-setup-버전.exe`·`.blockmap`을 `docs/update/`에 넣고 올리면, 설치된 PC가 창을 안 볼 때 스스로 업데이트.
  - 시험: `xvfb-run -a npx electron --no-sandbox test/run.js` (가짜 서버로 알림 흐름).
- `docs/` — GitHub Pages. 폰(안드로이드) 알림 앱(`index.html`·`sw.js`·`manifest.webmanifest`)과 윈도우 업데이트 파일(`update/`).
  - 처음 한 번은 설치 링크(`…/design-alarm/#u=배포ID`)로 열어야 웹앱 주소가 그 폰에 저장됨.
- 서버(Apps Script `Code.gs` v23~): `doPost` 창구 `poll`·`vapid`·`sub`·`unsub`, 폰 알림 「깨우기」(VAPID ES256, 개인 키는 스크립트 속성에만).
