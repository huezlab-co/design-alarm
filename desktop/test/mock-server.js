// 웹앱·서버 흉내: GET /exec = 구글처럼 iframe 두 겹 속 웹앱, POST /exec = poll
const http = require('http');
const S = { items: [], seen: -1, rev: 1, auth: true, down: false, polls: 0, last: 0 };
const inner = `<!doctype html><meta charset=utf-8><body><script>
let TOKEN = localStorage.getItem('t') || '', ME = TOKEN ? '김설희' : '', TESTMODE = false, OPEN = '';
function openTask(id) { OPEN = id; document.title = 'open:' + id; window.__opened = (window.__opened || []).concat(id); }
function wake() { window.__woke = (window.__woke || 0) + 1; }
const tell = () => { try { window.top.postMessage({ hz: 'tok', tok: TOKEN, name: TOKEN ? ME : '', test: 0 }, '*'); } catch (e) {} };
window.login = () => { TOKEN = 'tok123'; ME = '김설희'; localStorage.setItem('t', TOKEN); tell(); };
window.logout = () => { TOKEN = ''; ME = ''; localStorage.removeItem('t'); tell(); };
window.addEventListener('message', e => { const d = e.data; if (!d || !TOKEN) return; if (d.hz === 'hello') tell(); if (d.hz === 'open') openTask(d.id); if (d.hz === 'wake') wake(); });
</script>앱</body>`;
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/desk.html')) { r.setHeader('content-type', 'text/html'); r.end(require('fs').readFileSync(__dirname + '/../../docs/desk.html', 'utf8').replace(/const APP_ORIGIN = .*;/, 'const APP_ORIGIN = /^http:\\/\\/127\\.0\\.0\\.1:\\d+$/;').replace(/if \(\/\^AKfy[^\n]*\n/, "frame.src = '/sandbox';\n")); return; }
  if (q.url.startsWith('/nope')) { r.statusCode = 404; r.end('<h1>404</h1>'); return; }
  if (q.url.startsWith('/inner')) { r.end(inner); return; }
  if (q.url.startsWith('/sandbox')) { r.end('<!doctype html><iframe src="/inner" style="width:100%;height:80vh"></iframe>'); return; }
  if (q.method === 'GET') { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><iframe src="/sandbox" style="width:100%;height:90vh"></iframe>'); return; }
  let b = ''; q.on('data', d => b += d); q.on('end', () => {
    S.polls++;
    if (q.url.startsWith('/sandbox')) { r.end('<iframe src="/inner"></iframe>'); return; }
    if (S.down) { r.statusCode = 502; r.end('x'); return; }
    const p = JSON.parse(b || '{}'); r.setHeader('content-type', 'application/json');
    if (!S.auth || p.tok !== 'tok123') return r.end(JSON.stringify({ ok: 0, err: 'AUTH' }));
    if (p.rev && +p.rev === S.rev) return r.end(JSON.stringify({ ok: 1, same: 1, rev: String(S.rev) }));
    const items = S.items.filter(x => x.i > S.seen);
    r.end(JSON.stringify({ ok: 1, rev: String(S.rev), name: '김설희', role: 'designer', test: 0, n: items.length, last: S.items.length ? S.items[S.items.length - 1].i + 1 : 0, items }));
  });
});
srv.on('request', (q) => { if (q.method === 'GET' && q.url.startsWith('/sandbox')) {} });
module.exports = { S, srv };
