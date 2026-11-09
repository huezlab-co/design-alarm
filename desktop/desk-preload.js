// 창 안 액자 페이지(desk.html·shell.html)만 프로그램과 말을 주고받게 함 — 웹앱 변수 이름에 기대지 않음
const { contextBridge, ipcRenderer } = require('electron');
const okOrigin = location.protocol === 'file:' || location.origin === 'https://huezlab-co.github.io' || (process.env.DA_SELFTEST === '1' && /^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin));
if (okOrigin) {
  contextBridge.exposeInMainWorld('hzDesk', {
    login: o => ipcRenderer.send('desk-login', { tok: String((o && o.tok) || ''), name: String((o && o.name) || ''), test: o && o.test ? 1 : 0 }),
    onOpen: fn => ipcRenderer.on('desk-open', (_e, id) => fn(id)),
    onWake: fn => ipcRenderer.on('desk-wake', () => fn()),
  });
  // 새 버전을 받아 두면 창 맨 위에 띠 — 누르면 바로 업데이트하고 다시 켬
  ipcRenderer.on('desk-update', (_e, ver) => {
    if (document.getElementById('hzUpd')) return;
    const H = 44, b = document.createElement('button');
    b.id = 'hzUpd'; b.type = 'button';
    b.textContent = '새 업데이트가 나왔어요(' + String(ver || '') + '). 업데이트하려면 눌러 주세요';
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;height:' + H + 'px;z-index:9;border:0;margin:0;cursor:pointer;background:#e8783a;color:#fff;font:700 15px "Malgun Gothic",sans-serif;letter-spacing:-.2px';
    b.onmouseenter = () => { b.style.background = '#d96a2c'; }; b.onmouseleave = () => { b.style.background = '#e8783a'; };
    b.onclick = () => { b.textContent = '업데이트하는 중이에요… 잠시 뒤 다시 열려요'; b.disabled = true; ipcRenderer.send('desk-update-now'); };
    document.body.appendChild(b);
    const f = document.getElementById('app'); if (f) { f.style.top = H + 'px'; f.style.height = 'calc(100% - ' + H + 'px)'; }
  });
}
