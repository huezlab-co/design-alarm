// 창 안 액자 페이지(desk.html·shell.html)만 프로그램과 말을 주고받게 함 — 웹앱 변수 이름에 기대지 않음
const { contextBridge, ipcRenderer } = require('electron');
const okOrigin = location.protocol === 'file:' || location.origin === 'https://huezlab-co.github.io' || (process.env.DA_SELFTEST === '1' && /^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin));

/* 맨 위 줄 — 윈도우 기본 줄보다 높게, 최소화·최대화·닫기 버튼도 크게(창 테두리는 프로그램이 직접 그림)
 * 확대·축소(Ctrl+휠)를 해도 이 줄 크기는 그대로(배율만큼 거꾸로 줄임) */
const TB = 52;            // 줄 높이
const UPD = 44;           // 업데이트 띠 높이
let zf = 1, updOn = false;
const ICONS = {
  min: '<svg width="20" height="20" viewBox="0 0 16 16"><path d="M2 8.5h12" stroke="currentColor" stroke-width="1.4"/></svg>',
  max: '<svg width="20" height="20" viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  res: '<svg width="20" height="20" viewBox="0 0 16 16"><rect x="2.5" y="5" width="8.5" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 5V3.5a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.4"/></svg>',
};
function layout() {
  const bar = document.getElementById('hzBar'); if (!bar) return;
  bar.style.zoom = String(1 / zf);
  const top = TB / zf, upd = document.getElementById('hzUpd');
  if (upd) upd.style.top = top + 'px';
  const f = document.getElementById('app');
  if (f) { const t = top + (updOn ? UPD : 0); f.style.top = t + 'px'; f.style.height = 'calc(100% - ' + t + 'px)'; }
}
function drawBar(o) {
  if (!document.body) return;
  zf = Number(o.zf) > 0 ? Number(o.zf) : 1;
  let bar = document.getElementById('hzBar');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'hzBar';
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;height:' + TB + 'px;z-index:10;display:flex;align-items:center;background:#231e1c;color:#fff;-webkit-app-region:drag;user-select:none;font:600 17px "Malgun Gothic","맑은 고딕",sans-serif;letter-spacing:-.2px';
    const st = document.createElement('style');
    st.textContent = '#hzBar .hzb{-webkit-app-region:no-drag;width:66px;height:' + TB + 'px;border:0;margin:0;padding:0;background:transparent;color:#fff;display:flex;align-items:center;justify-content:center;cursor:default}' +
      '#hzBar .hzb:hover{background:rgba(255,255,255,.14)}#hzBar .hzb:active{background:rgba(255,255,255,.22)}#hzBar .hzb.x:hover{background:#e81123}#hzBar .hzb.x:active{background:#c50f1f}';
    bar.appendChild(st);
    const ic = document.createElement('img'); ic.id = 'hzBarIc'; ic.alt = ''; ic.style.cssText = 'width:26px;height:26px;margin:0 11px 0 15px;flex:none';
    const tt = document.createElement('span'); tt.id = 'hzBarT'; tt.style.cssText = 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    bar.append(ic, tt);
    [['min', '최소화'], ['max', '최대화'], ['close', '닫기']].forEach(([a, label]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'hzb' + (a === 'close' ? ' x' : ''); b.dataset.a = a; b.title = label; b.setAttribute('aria-label', label);
      b.onclick = () => ipcRenderer.send('desk-win', a);
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }
  bar.querySelector('#hzBarT').textContent = String(o.title || '');
  const ic = bar.querySelector('#hzBarIc'); if (/^data:image\/png;base64,/.test(o.icon || '')) { ic.src = o.icon; ic.style.display = ''; } else ic.style.display = 'none';
  bar.querySelectorAll('.hzb').forEach(b => {
    const a = b.dataset.a, k = a === 'max' && o.max ? 'res' : a;
    b.innerHTML = ICONS[k]; if (a === 'max') { b.title = o.max ? '이전 크기로' : '최대화'; b.setAttribute('aria-label', b.title); }
  });
  layout();
}
ipcRenderer.on('desk-chrome', (_e, o) => drawBar(o || {}));

if (okOrigin) {
  contextBridge.exposeInMainWorld('hzDesk', {
    login: o => ipcRenderer.send('desk-login', { tok: String((o && o.tok) || ''), name: String((o && o.name) || ''), test: o && o.test ? 1 : 0 }),
    onOpen: fn => ipcRenderer.on('desk-open', (_e, id) => fn(id)),
    onWake: fn => ipcRenderer.on('desk-wake', () => fn()),
  });
  // 새 버전을 받아 두면 맨 위 줄 바로 아래에 띠 — 누르면 바로 업데이트하고 다시 켬
  ipcRenderer.on('desk-update', (_e, ver) => {
    if (document.getElementById('hzUpd')) return;
    const b = document.createElement('button');
    b.id = 'hzUpd'; b.type = 'button';
    b.textContent = '새 업데이트가 나왔어요(' + String(ver || '') + '). 업데이트하려면 눌러 주세요';
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;height:' + UPD + 'px;z-index:9;border:0;margin:0;cursor:pointer;background:#e8783a;color:#fff;font:700 15px "Malgun Gothic",sans-serif;letter-spacing:-.2px';
    b.onmouseenter = () => { b.style.background = '#d96a2c'; }; b.onmouseleave = () => { b.style.background = '#e8783a'; };
    b.onclick = () => { b.textContent = '업데이트하는 중이에요… 잠시 뒤 다시 열려요'; b.disabled = true; ipcRenderer.send('desk-update-now'); };
    document.body.appendChild(b);
    updOn = true; layout();
  });
}
