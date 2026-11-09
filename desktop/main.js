// (주)휴즈랩 디자인 — 윈도우 프로그램(디자인 작업 알림)
// 창 = 운영 웹앱 그대로. 닫으면 트레이로 숨고, 서버에 20초마다 물어 새 소식이 있으면
// ① 오른쪽 아래 알림 창  ② 작업표시줄 주황 깜빡임(창을 볼 때까지 주황 유지)  ③ 빨간 숫자
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell, net, safeStorage, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const APP_ID = 'com.huezlab.designalarm';
const NAME = '(주)휴즈랩 디자인';
// 웹앱 주소(배포 ID). 시험할 때만 환경변수로 바꿈
// 배포 ID는 저장소에 안 올림: 빌드할 때 config.json(.gitignore)에서 읽음
const CFG = (() => { try { return require('./config.json'); } catch { return {}; } })();
const DEPLOY = process.env.DA_DEPLOY || (CFG.d ? Buffer.from(CFG.d.split('').reverse().join(''), 'base64').toString().split('').reverse().join('') : '');
const EXEC = process.env.DA_EXEC || 'https://script.google.com/macros/s/' + DEPLOY + '/exec';
const TEST = process.env.DA_TEST === '1';
const SITE = EXEC + (TEST ? '?test=1' : '');
const POLL_MS = 20000;
const ICON = path.join(__dirname, 'build', 'icon.png');
const STATE_FILE = () => path.join(app.getPath('userData'), 'state.json');
let HIDDEN = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId(APP_ID);

let win = null, tray = null, quitting = false, painter = null, deskSeen = false;
let state = { tok: '', name: '', last: {}, rev: '' };   // last[이름|시험] = 알림 띄운 마지막 기록 번호
let status = { n: 0, ok: false, err: '', name: '' };
const popups = [];

/* ---------- 저장 ---------- */
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
    if (s.tokEnc && safeStorage.isEncryptionAvailable()) s.tok = safeStorage.decryptString(Buffer.from(s.tokEnc, 'base64'));
    delete s.tokEnc; delete s.rev; state = Object.assign(state, s);
  } catch { /* 처음 */ }
}
function saveState() {
  try {
    const o = Object.assign({}, state); delete o.tok; delete o.rev;
    if (state.tok && safeStorage.isEncryptionAvailable()) o.tokEnc = safeStorage.encryptString(state.tok).toString('base64');
    fs.writeFileSync(STATE_FILE(), JSON.stringify(o));
  } catch { /* 무시 */ }
}

/* ---------- 창 ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 420, minHeight: 560, show: false,
    title: NAME, icon: ICON, autoHideMenuBar: true, backgroundColor: '#f6f2ec',
    webPreferences: { contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'desk-preload.js') },
  });
  loadSite();
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/script\.google\.com\/macros\//.test(url)) { loadSite(); return { action: 'deny' }; }
    shell.openExternal(url); return { action: 'deny' };
  });
  win.on('page-title-updated', e => e.preventDefault());
  // 웹앱의 「새 버전 → 새로고침」 등이 창 전체를 구글 주소로 바꾸려 하면 액자 페이지를 다시 띄움(맨 위 구글 띠 방지)
  win.webContents.on('will-navigate', (e, url) => { if (!/^file:/.test(url) && url.split('#')[0] !== DESK) { e.preventDefault(); loadSite(); } });
  win.on('focus', () => { win.flashFrame(false); closeAllPopups(); });
  win.on('close', e => { if (quitting) return; e.preventDefault(); win.hide(); });
  win.webContents.on('did-finish-load', () => { applyZoom(); showUpdBar(); setTimeout(tick, 2500); });
  // 확대·축소: Ctrl+마우스 휠, Ctrl + / Ctrl − / Ctrl 0 — 맞춘 크기는 기억
  win.webContents.on('zoom-changed', (_e, dir) => setZoom((state.zoom || 0) + (dir === 'in' ? 0.5 : -0.5)));
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown' || i.alt) return;
    // 새로고침: F5 · Ctrl+F5 · Ctrl+R
    if (i.key === 'F5' || ((i.control || i.meta) && (i.key === 'r' || i.key === 'R'))) { e.preventDefault(); state.rev = ''; loadSite(); setTimeout(tick, 3000); return; }
    if (!(i.control || i.meta)) return;
    const k = i.key;
    if (k === '=' || k === '+' || i.code === 'NumpadAdd') { e.preventDefault(); setZoom((state.zoom || 0) + 0.5); }
    else if (k === '-' || k === '_' || i.code === 'NumpadSubtract') { e.preventDefault(); setZoom((state.zoom || 0) - 0.5); }
    else if (k === '0' || i.code === 'Numpad0') { e.preventDefault(); setZoom(0); }
  });
  // 액자 페이지가 404 등 오류 화면으로 열리면 프로그램 안 shell.html로
  win.webContents.on('did-navigate', (_e, url, code) => { if (code >= 400 && !useLocal && !/^file:/.test(url)) { useLocal = true; loadSite(); } });
  win.webContents.on('render-process-gone', () => setTimeout(() => win && !win.isDestroyed() && win.reload(), 3000));
  win.webContents.on('did-fail-load', (_e, code, _d, _u, isMain) => { if (isMain && code !== -3 && !useLocal) { useLocal = true; return loadSite(); } if (isMain && code !== -3) setTimeout(() => win && !win.isDestroyed() && loadSite(), 15000); });
  if (!HIDDEN) win.once('ready-to-show', () => win.show());
}
// 창 = 액자 페이지(GitHub Pages desk.html, 안 되면 프로그램 안 shell.html) 속 웹앱
const DESK = process.env.DA_SHELL === 'local' ? '' : (process.env.DA_DESK || 'https://huezlab-co.github.io/design-alarm/desk.html');
let useLocal = !DESK;
function applyZoom() { if (win && !win.isDestroyed()) win.webContents.setZoomLevel(state.zoom || 0); }
function setZoom(z) { state.zoom = Math.max(-3, Math.min(3, Math.round(z * 2) / 2)); saveState(); applyZoom(); }
function loadSite() {
  if (!win || win.isDestroyed()) return;
  if (useLocal) { deskSeen = false; win.loadFile(path.join(__dirname, 'shell.html'), { query: { u: SITE } }); }
  else win.loadURL(DESK + '#u=' + DEPLOY + (TEST ? '&t=1' : ''));
}
function showWindow(taskId) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus(); win.flashFrame(false); closeAllPopups();
  if (taskId) openInApp(taskId);
}

/* 웹앱 → 액자 페이지 → 프로그램: 로그인 정보(웹앱이 postMessage로 알려 줌) */
ipcMain.on('desk-login', (e, o) => {
  if (!win || e.sender !== win.webContents) return;
  deskSeen = true;
  if (o.tok !== state.tok) { state.tok = o.tok; state.name = o.name; state.rev = ''; saveState(); setTimeout(tick, 300); }
});
/* 창 안 웹앱(구글 iframe 속)에서 실행 — 액자 말 전달이 안 될 때(프로그램 안 shell.html)만 쓰는 예비 길 */
async function inApp(code) {
  if (!win || win.isDestroyed()) return null;
  for (const f of win.webContents.mainFrame.framesInSubtree) {
    try { const r = await f.executeJavaScript('(function(){ if (typeof openTask !== "function" || typeof TOKEN === "undefined") return null; ' + code + ' })()'); if (r !== null && r !== undefined) return r; } catch { /* 다른 출처·로딩 중 */ }
  }
  return null;
}
function openInApp(id, n = 0) {
  if (!/^(DR|T)-\d{1,5}$/.test(id)) return;
  if (deskSeen) { [0, 1500, 4000].forEach(t => setTimeout(() => win && !win.isDestroyed() && win.webContents.send('desk-open', id), t)); return; }
  inApp('if (OPEN !== ' + JSON.stringify(id) + ') openTask(' + JSON.stringify(id) + '); return 1;').then(r => { if (!r && n < 20) setTimeout(() => openInApp(id, n + 1), 1000); });
}
/* 웹앱 로그인 상태 읽기: PIN으로 들어가면 토큰, 로그아웃하면 빈 값 */
async function readLogin() {
  if (deskSeen) return;
  const r = await inApp('return { tok: TOKEN ? ((typeof TESTMODE !== "undefined" && TESTMODE) ? "T:" : "") + TOKEN : "", name: (typeof ME !== "undefined" && TOKEN) ? ME : "" };');
  if (r && typeof r.tok === 'string' && r.tok !== state.tok) { state.tok = r.tok; state.name = r.name || ''; state.rev = ''; saveState(); }
}

/* 작업표시줄 주황: 숨은 창은 작업표시줄에 최소화로 올린 뒤, 아이콘이 생길 시간을 두고 여러 번 주황을 켬
 * (아이콘이 생기기 전에 한 번만 켜면 윈도우가 무시함 — 11-09 대표 PC에서 알림 창만 뜨고 주황이 안 들어옴) */
function flashOrange() {
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible()) { win.showInactive(); win.minimize(); }
  const go = () => { if (win && !win.isDestroyed() && !(win.isVisible() && !win.isMinimized() && win.isFocused())) win.flashFrame(true); };
  go(); [400, 1500, 4000].forEach(t => setTimeout(go, t));
}
function wakeApp() { if (deskSeen) { if (win && !win.isDestroyed()) win.webContents.send('desk-wake'); } else inApp('wake(); return 1;'); }

/* ---------- 서버에 묻기 ---------- */
async function api(body) {
  const res = await net.fetch(EXEC, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('응답 ' + res.status);
  const t = await res.text();
  try { return JSON.parse(t); } catch { throw new Error('응답 형식'); }
}
let busy = false, first = true;
async function tick() {
  if (busy) return; busy = true;
  try {
    await readLogin();
    if (!state.tok) { setStatus({ n: 0, ok: false, err: 'login', name: '' }); return; }
    const r = await api({ api: 'poll', tok: state.tok, rev: state.rev });
    if (!r.ok) {
      if (r.err === 'AUTH') { state.tok = ''; state.name = ''; state.rev = ''; saveState(); setStatus({ n: 0, ok: false, err: 'login', name: '' }); }
      else setStatus(Object.assign({}, status, { err: 'net' }));
      return;
    }
    if (r.same) { setStatus(Object.assign({}, status, { ok: true, err: '' })); return; }
    state.rev = r.rev; state.name = r.name;
    const key = r.name + (r.test ? '|T' : '');
    let seenMax = state.last[key];
    if (seenMax !== undefined && seenMax >= r.last) seenMax = -1;   // 기록 줄이 줄었으면(시험 초기화 등) 다시 맞춤
    const fresh = seenMax === undefined ? [] : r.items.filter(x => x.i > seenMax);
    state.last[key] = r.last - 1;
    saveState();
    const before = status.n;
    setStatus({ n: r.n, ok: true, err: '', name: r.name });
    if (fresh.length) alertNew(fresh);
    else if (first && r.n > 0 && seenMax === undefined) alertNew([], r.n);   // 설치 후 처음: 안 읽은 게 있으면 한 번 알림
    else if (first && r.n > 0 && before === 0 && HIDDEN) alertNew([], r.n);   // 컴퓨터 켜고 처음
    first = false;
  } catch (e) {
    setStatus(Object.assign({}, status, { err: 'net' }));
  } finally { busy = false; }
}

/* ---------- 알림 ---------- */
const VERB = {
  order: '새 작업을 요청했어요', edit: '요청을 수정했어요', start: '작업을 시작했어요', eta: '예상 완료일을 정했어요',
  submit: '시안을 올렸어요', revise: '수정을 요청했어요', reopen: '다시 수정을 요청했어요', done: '작업을 완료했어요',
  undel: '작업을 되살렸어요', note: '번호 답글을 달았어요', del: '작업을 삭제했어요',
};
function lineOf(x) {
  if (x.k === 'comment') return x.s || (x.nf ? '파일 ' + x.nf + '개를 보냈어요' : '메시지를 보냈어요');
  if (x.k === 'note') return '번호 답글 · ' + (x.s || '');
  if (x.k === 'eta' || x.k === 'start') { const m = /\d{4}-(\d{2})-(\d{2})/.exec(x.s || ''); return VERB[x.k] + (m ? ' · 예상 ' + (+m[1]) + '/' + (+m[2]) : ''); }
  if (x.k === 'submit') return (x.round ? (x.round + 1) + '차 ' : '') + '시안을 올렸어요' + (x.nf ? ' · ' + x.nf + '개' : '');
  if (x.k === 'revise' || x.k === 'reopen') return (x.round ? x.round + '차 ' : '') + '수정을 요청했어요';
  if (x.k === 'edit') return '요청을 수정했어요' + (x.s ? ' · ' + x.s : '');
  return VERB[x.k] || '새 소식이 있어요';
}
function alertNew(items, total) {
  const front = win && win.isVisible() && !win.isMinimized() && win.isFocused();
  if (front) { wakeApp(); return; }   // 보고 있는 중이면 화면만 바로 새로고침
  if (items.length) {
    const show = items.slice(-3);
    show.forEach(x => showPopup({ title: x.by + ' · ' + x.title, body: lineOf(x), id: x.id, kind: x.k }));
    if (items.length > 3) showPopup({ title: NAME, body: '새 소식 ' + items.length + '개가 있어요', id: '' });
  } else if (total) showPopup({ title: NAME, body: '안 읽은 소식 ' + total + '개가 있어요', id: '' });
  wakeApp();
  // 작업표시줄 주황: 창이 숨어 있으면 작업표시줄에 다시 올려(최소화 상태) 주황으로
  flashOrange();
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND_COLOR = { submit: '#2f6bff', revise: '#e5484d', reopen: '#e5484d', order: '#e8783a', done: '#18a058', comment: '#7a5af8', note: '#7a5af8' };
function popupHtml(title, body, kind) {
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden;user-select:none;font-family:"Malgun Gothic","맑은 고딕",sans-serif}
  .b{position:absolute;inset:6px;background:#fff;border-radius:14px;box-shadow:0 8px 24px rgba(40,30,20,.22);border:1px solid #ece6de;display:flex;gap:12px;padding:14px 34px 14px 14px;cursor:pointer;box-sizing:border-box;animation:in .22s ease-out}
  @keyframes in{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
  .b:hover{background:#fffaf5}
  .i{width:42px;height:42px;border-radius:12px;background:${KIND_COLOR[kind] || '#e8783a'};flex:none;display:grid;place-items:center}
  .c{min-width:0;flex:1;display:flex;flex-direction:column;justify-content:center}
  .t{font-weight:700;font-size:14px;color:#2b241d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m{font-size:13px;color:#5d544b;margin-top:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:keep-all}
  .x{position:absolute;top:8px;right:10px;color:#9a9087;font-size:18px;line-height:1;border:0;background:none;cursor:pointer;padding:2px}
  .x:hover{color:#2b241d}
  </style><div class="b" id="b"><div class="i"><svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a1.6 1.6 0 0 1 1.6 1.6v.5A6.5 6.5 0 0 1 18.5 10.5v3.6l1.7 2.4c.4.6 0 1.5-.8 1.5H4.6c-.8 0-1.2-.9-.8-1.5l1.7-2.4v-3.6a6.5 6.5 0 0 1 4.9-6.4v-.5A1.6 1.6 0 0 1 12 2Zm-2.6 17h5.2a2.6 2.6 0 0 1-5.2 0Z"/></svg></div>
  <div class="c"><div class="t">${esc(title)}</div><div class="m">${esc(body)}</div></div><button class="x" id="x" title="닫기">×</button></div>
  <script>const { ipcRenderer } = require('electron');document.getElementById('b').addEventListener('click', e => ipcRenderer.send('popup-click', e.target.closest('#x') ? 'close' : 'open'));</script>`;
}
function layoutPopups() {
  const { workArea } = screen.getPrimaryDisplay();
  let y = workArea.y + workArea.height - 10;
  for (const p of popups) { const [w, h] = p.getSize(); y -= h; p.setPosition(workArea.x + workArea.width - w - 10, y); y -= 2; }
}
function closePopup(p) { const i = popups.indexOf(p); if (i >= 0) popups.splice(i, 1); if (!p.isDestroyed()) p.close(); layoutPopups(); }
function closeAllPopups() { popups.slice().forEach(closePopup); }
function showPopup({ title, body, id, kind }) {
  const p = new BrowserWindow({
    width: 380, height: 100, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
  p.setAlwaysOnTop(true, 'screen-saver');
  p.__taskId = id;
  p.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(popupHtml(title, body, kind)));
  p.once('ready-to-show', () => p.showInactive());
  popups.unshift(p);
  while (popups.length > 4) closePopup(popups[popups.length - 1]);
  layoutPopups();
  setTimeout(() => closePopup(p), 12000);
}
ipcMain.on('popup-click', (e, what) => {
  const p = BrowserWindow.fromWebContents(e.sender); if (!p) return;
  const id = p.__taskId; closePopup(p);
  if (what === 'open') showWindow(id);
});

/* ---------- 빨간 숫자(작업표시줄·트레이) ---------- */
async function paint(n, size, withBase) {
  if (!painter) {
    const pw = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { offscreen: true } });
    painter = pw.loadURL('data:text/html,<canvas></canvas>').then(() => pw);
  }
  const pw = await painter;
  const base = withBase ? nativeImage.createFromPath(ICON).resize({ width: size, height: size }).toDataURL() : '';
  const url = await pw.webContents.executeJavaScript(`(async () => {
    const S = ${size}, c = document.querySelector('canvas'); c.width = c.height = S; const x = c.getContext('2d'); x.clearRect(0,0,S,S);
    if (${JSON.stringify(base)}) { const im = new Image(); im.src = ${JSON.stringify(base)}; await im.decode(); x.drawImage(im, 0, 0, S, S); }
    const t = ${JSON.stringify(n > 99 ? '99+' : String(n))};
    const r = ${withBase ? 'S*0.34' : 'S/2'}, cx = S - r, cy = ${withBase ? 'r' : 'S/2'};
    x.fillStyle = '#e5484d'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI*2); x.fill();
    x.lineWidth = Math.max(1, S/16); x.strokeStyle = '#fff'; x.stroke();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold ' + Math.round(r * (t.length > 2 ? 0.95 : t.length > 1 ? 1.15 : 1.4)) + 'px Arial'; x.fillText(t, cx, cy + r*0.08);
    return c.toDataURL(); })()`);
  return nativeImage.createFromDataURL(url);
}
let lastPaint = '';
async function setStatus(s) {
  status = s;
  const tip = s.err === 'login' ? NAME + ' — 창을 열어 PIN으로 로그인해 주세요' : s.err === 'net' ? NAME + ' — 연결이 끊겨 다시 시도하고 있어요' : NAME + (s.name ? ' · ' + s.name : '') + (s.n ? ' — 안 읽은 소식 ' + s.n + '개' : '');
  if (tray) tray.setToolTip(tip);
  const k = s.n + '|' + s.err;
  if (k === lastPaint) return; lastPaint = k;
  try {
    if (win && !win.isDestroyed()) win.setOverlayIcon(s.n > 0 ? await paint(s.n, 32, false) : null, s.n > 0 ? '안 읽은 소식 ' + s.n + '개' : '');
    if (tray) tray.setImage(s.n > 0 ? await paint(s.n, 32, true) : nativeImage.createFromPath(ICON).resize({ width: 32, height: 32 }));
    if (s.n === 0 && win && !win.isDestroyed()) win.flashFrame(false);
    app.setBadgeCount && process.platform !== 'win32' && app.setBadgeCount(s.n);
  } catch { /* 무시 */ }
}

/* ---------- 트레이 ---------- */
function autoStartOn() { return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin; }
function setAutoStart(on) { app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] }); }
function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 32, height: 32 }));
  tray.setToolTip(NAME);
  const build = () => Menu.buildFromTemplate([
    { label: '열기', click: () => showWindow() },
    { label: '새로고침', click: () => { win && win.reload(); state.rev = ''; } },
    { type: 'separator' },
    { label: '컴퓨터 켜면 자동 실행', type: 'checkbox', checked: autoStartOn(), click: m => setAutoStart(m.checked) },
    { label: updReady ? '다시 시작해서 업데이트' : '업데이트 확인', click: () => updReady ? installUpdate() : checkUpdate(true) },
    { label: '버전 ' + app.getVersion() + (TEST ? ' (시험)' : ''), enabled: false },
    { type: 'separator' },
    { label: '종료 (알림도 꺼져요)', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(build());
  tray.on('click', () => showWindow());
  tray.on('right-click', () => tray.setContextMenu(build()));
}

/* ---------- 자동 업데이트(GitHub Pages의 update 폴더) ---------- */
let updater = null, updReady = false, updVer = '';
function showUpdBar() { if (updReady && win && !win.isDestroyed()) win.webContents.send('desk-update', updVer); }
ipcMain.on('desk-update-now', e => { if (win && e.sender === win.webContents && updReady) { state.startHidden = false; saveState(); installUpdate(); } });
function checkUpdate(manual) {
  if (!updater) { if (manual) showPopup({ title: NAME, body: '업데이트는 설치한 프로그램에서만 확인해요', id: '' }); return; }
  updater.checkForUpdates().then(r => {
    if (manual && (!r || !r.isUpdateAvailable)) showPopup({ title: NAME, body: '지금이 최신 버전이에요 (' + app.getVersion() + ')', id: '' });
  }).catch(() => { if (manual) showPopup({ title: NAME, body: '업데이트를 확인하지 못했어요. 잠시 뒤 다시 해 주세요', id: '' }); });
}
function installUpdate() { quitting = true; updater.quitAndInstall(true, true); }
function setupUpdater() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = true; updater.autoInstallOnAppQuit = true;
    updater.on('update-downloaded', info => {
      updReady = true; updVer = (info && info.version) || '';
      showUpdBar();
      // 창을 안 보고 있을 때 조용히 바꿔 다시 켬(알림·로그인은 그대로)
      const tryNow = () => {
        const away = !win || !win.isVisible() || win.isMinimized() || powerMonitor.getSystemIdleTime() > 300;
        if (away) { state.startHidden = !win || !win.isVisible() || win.isMinimized(); saveState(); installUpdate(); } else setTimeout(tryNow, 60000);
      };
      setTimeout(tryNow, 5000);
    });
    setTimeout(() => checkUpdate(false), 30000);
    setInterval(() => checkUpdate(false), 6 * 3600 * 1000);
  } catch { updater = null; }
}

/* ---------- 시작 ---------- */
app.on('second-instance', () => showWindow());
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* 트레이에 남음 */ });
app.whenReady().then(() => {
  loadState();
  Menu.setApplicationMenu(null);   // Alt를 눌러도 영어 기본 메뉴(File·Exit)가 안 나오게 — 끄기는 트레이 메뉴에서만
  if (state.startHidden) { HIDDEN = true; state.startHidden = false; saveState(); }   // 업데이트로 다시 켜졌을 때 원래처럼 숨긴 채
  // 처음 설치하면 「컴퓨터 켜면 자동 실행」 켜 둠(트레이 메뉴에서 끌 수 있음)
  if (!state.autoStartSet) { if (app.isPackaged) setAutoStart(true); state.autoStartSet = true; saveState(); }
  createWindow(); createTray(); setupUpdater();
  setInterval(tick, POLL_MS);
  powerMonitor.on('resume', () => setTimeout(tick, 4000));
  powerMonitor.on('unlock-screen', () => setTimeout(tick, 2000));
  setTimeout(tick, 1500);
});
// 시험용(DA_SELFTEST=1): 상태를 밖에서 볼 수 있게
if (process.env.DA_SELFTEST === '1') {
  global.__da = { get status() { return status; }, get popups() { return popups.map(p => p.webContents.getURL()); }, get state() { return state; }, tick, showWindow, get win() { return win; }, alertNew, closeAllPopups, paint };
}
