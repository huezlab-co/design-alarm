// 창 안 액자 페이지(desk.html·shell.html)만 프로그램과 말을 주고받게 함 — 웹앱 변수 이름에 기대지 않음
const { contextBridge, ipcRenderer } = require('electron');
const okOrigin = location.protocol === 'file:' || location.origin === 'https://huezlab-co.github.io' || (process.env.DA_SELFTEST === '1' && /^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin));
if (okOrigin) contextBridge.exposeInMainWorld('hzDesk', {
  login: o => ipcRenderer.send('desk-login', { tok: String((o && o.tok) || ''), name: String((o && o.name) || ''), test: o && o.test ? 1 : 0 }),
  onOpen: fn => ipcRenderer.on('desk-open', (_e, id) => fn(id)),
  onWake: fn => ipcRenderer.on('desk-wake', () => fn()),
});
