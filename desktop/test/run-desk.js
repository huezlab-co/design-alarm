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
      // 맨 위 줄(프로그램이 그림): 이름·버튼 3개·높이 46, 웹앱은 그 아래
      W().show(); await wait(300);
      const tb = await W().webContents.executeJavaScript("(() => { const b = document.getElementById('hzBar'), f = document.getElementById('app'); return b ? [b.textContent, b.querySelectorAll('.hzb').length, b.getBoundingClientRect().height, getComputedStyle(f).top, getComputedStyle(b).webkitAppRegion] : null; })()");
      check(tb && /휴즈랩 디자인/.test(tb[0]) && tb[1] === 3 && Math.round(tb[2]) === 40 && tb[3] === '40px' && tb[4] === 'drag', '맨 위 줄: 이름·버튼 3개·높이 40·끌어서 창 옮기기, 웹앱은 아래로 ' + JSON.stringify(tb));
      check(W().isMaximized() === false, '처음엔 최대화 아님');
      // 최대화(시험 화면엔 창 관리자가 없어 실제 최대화는 윈도우에서 확인) — 버튼이 프로그램에 전달되는지·모양 바뀌는지
      let asked = null; const om = W().maximize, ou = W().unmaximize; W().maximize = () => { asked = 'max'; }; W().unmaximize = () => { asked = 'un'; };
      await W().webContents.executeJavaScript("document.querySelector('#hzBar .hzb[data-a=max]').click()"); await wait(400);
      check(asked === 'max', '최대화 버튼 → 프로그램이 창 최대화'); W().maximize = om; W().unmaximize = ou;
      W().webContents.send('desk-chrome', { title: '(주)휴즈랩 디자인', icon: '', max: true, zf: 1 }); await wait(200);
      check((await W().webContents.executeJavaScript("document.querySelector('#hzBar .hzb[data-a=max]').title")) === '이전 크기로', '최대화 상태면 버튼이 「이전 크기로」 모양');
      W().webContents.send('desk-chrome', { title: '(주)휴즈랩 디자인', icon: '', max: false, zf: 1 }); await wait(200);
      let mn = 0; const omn = W().minimize; W().minimize = () => { mn++; };
      await W().webContents.executeJavaScript("document.querySelector('#hzBar .hzb[data-a=min]').click()"); await wait(400); W().minimize = omn;
      check(mn === 1, '최소화 버튼 → 프로그램이 창 최소화');
      D.setZoom(1); await wait(500);
      const zh = await W().webContents.executeJavaScript("(() => { const b = document.getElementById('hzBar'); return [b.getBoundingClientRect().height, getComputedStyle(document.getElementById('app')).top]; })()");
      check(Math.abs(zh[0] * 1.2 - 40) < 1.5 && Math.abs(parseFloat(zh[1]) * 1.2 - 40) < 1.5, 'Ctrl+휠로 크게 해도 맨 위 줄 크기는 그대로 ' + JSON.stringify(zh));
      const cap = await W().webContents.capturePage(); require('fs').writeFileSync('/tmp/tb_zoom.png', cap.toPNG());
      D.setZoom(0); await wait(500); W().setSize(1360, 900); await wait(300);
      const cap0 = await W().webContents.capturePage(); require('fs').writeFileSync('/tmp/tb_bar.png', cap0.toPNG());
      await W().webContents.executeJavaScript("document.querySelector('#hzBar .hzb[data-a=close]').click()"); await wait(500);
      check(!W().isVisible() && !W().isDestroyed(), '닫기 = 트레이로 숨김(프로그램은 계속)'); W().show(); await wait(300);
      // 업데이트 띠
      W().show(); W().webContents.send('desk-update', '1.0.9'); await wait(500);
      const bar = await W().webContents.executeJavaScript("(() => { const b = document.getElementById('hzUpd'), f = document.getElementById('app'); return b ? [b.textContent, getComputedStyle(f).top] : null; })()");
      check(bar && /새 업데이트가 나왔어요\(1\.0\.9\)/.test(bar[0]) && bar[1] === '84px', '업데이트 받으면 맨 위 줄 바로 아래 띠(웹앱은 아래로 밀림)');
      const img = await W().webContents.capturePage(); require('fs').writeFileSync('/tmp/upd_bar.png', img.toPNG());
      await ev('logout()'); await wait(800); check(D.state.tok === '', '웹앱 로그아웃도 바로 전달');
    }
    console.log('PASS', ok.length, 'FAIL', bad.length); bad.forEach(x => console.log('  ✗', x)); app.exit(0);
  });
});
