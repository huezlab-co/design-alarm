// 액자 페이지(desk.html) 길: 웹앱 postMessage ↔ 프로그램, 404면 shell.html로
const { app, BrowserWindow } = require('electron');
const { S, srv } = require('./mock-server.js');
process.env.DA_SELFTEST = '1';
app.setPath('userData', '/tmp/da-user-desk-' + Date.now());
const ok = [], bad = []; const check = (c, m) => (c ? ok : bad).push(m);
const wait = ms => new Promise(r => setTimeout(r, ms));
srv.listen(0, () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  process.env.DA_EXEC = base + '/exec';
  process.env.DA_DESK = process.env.DA_404 === '1' ? base + '/nope.html' : base + '/desk.html';
  require('../main.js');
  app.whenReady().then(async () => {
    await wait(3500); const D = global.__da, W = () => D.win;
    const inner = () => W().webContents.mainFrame.framesInSubtree.find(f => /inner/.test(f.url)), ev = c => inner().executeJavaScript(c);
    if (process.env.DA_404 === '1') {
      check(/^file:.*shell\.html/.test(W().webContents.getURL()) && !!inner(), '액자 페이지가 404면 프로그램 안 shell.html로 넘어가 웹앱이 뜸');
      await ev('login()'); await D.tick(); check(D.status.ok && D.state.tok === 'tok123', '예비 길(shell.html)에서도 로그인 읽기');
    } else {
      check(W().webContents.getURL().startsWith(base + '/desk.html') && !!inner(), '창 = desk.html 안 웹앱');
      // 웹앱이 postMessage로 알려 주는 로그인만으로 동작(변수 읽기 막아 봄)
      await inner().executeJavaScript('Object.defineProperty(window, "__blockRead", { value: 1 })');
      await ev('login()'); await wait(800);
      check(D.state.tok === 'tok123' && D.state.name === '김설희', '웹앱 postMessage → 액자 → 프로그램으로 로그인 정보 전달');
      // 웹앱 변수 이름이 바뀌어도(TOKEN 없애도) 계속 동작
      await ev('window.TOKEN_BACKUP = TOKEN'); await inner().executeJavaScript('TOKEN = TOKEN; 1');
      S.items = [{ i: 0, id: 'DR-020', title: '상세', k: 'submit', by: '김준혁', round: 0, nf: 1 }]; S.rev++;
      await D.tick(); check(D.status.n === 1, '숫자 1');
      W().hide(); S.items.push({ i: 1, id: 'DR-021', title: '스티커', k: 'comment', by: '김준혁', s: '확인해 주세요' }); S.rev++; await D.tick(); await wait(900);
      const pw = BrowserWindow.getAllWindows().find(w => w !== W() && /data:text\/html/.test(w.webContents.getURL()) && w.isVisible());
      await pw.webContents.executeJavaScript("document.getElementById('b').click()"); await wait(1800);
      check((await ev('OPEN')) === 'DR-021', '알림 창 누르면 액자 → 웹앱 postMessage로 그 작업 열기');
      const w0 = await ev('window.__woke||0'); D.alertNew([{ i: 9, id: 'DR-021', title: 'x', k: 'comment', by: 'y', s: 'z' }]); await wait(500);
      check((await ev('window.__woke||0')) > w0, '새로고침도 postMessage로');
      // 업데이트 띠
      W().show(); W().webContents.send('desk-update', '1.0.9'); await wait(500);
      const bar = await W().webContents.executeJavaScript("(() => { const b = document.getElementById('hzUpd'), f = document.getElementById('app'); return b ? [b.textContent, getComputedStyle(f).top] : null; })()");
      check(bar && /새 업데이트가 나왔어요\(1\.0\.9\)/.test(bar[0]) && bar[1] === '44px', '업데이트 받으면 창 맨 위에 띠(웹앱은 아래로 밀림)');
      const img = await W().webContents.capturePage(); require('fs').writeFileSync('/tmp/upd_bar.png', img.toPNG());
      await ev('logout()'); await wait(800); check(D.state.tok === '', '웹앱 로그아웃도 바로 전달');
    }
    console.log('PASS', ok.length, 'FAIL', bad.length); bad.forEach(x => console.log('  ✗', x)); app.exit(0);
  });
});
