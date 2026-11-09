// electron test/run.js — main.js를 그대로 띄우고 시나리오를 돌림
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const { S, srv } = require('./mock-server.js');
const OUT = '/tmp/da-shots/'; fs.mkdirSync(OUT, { recursive: true });
process.env.DA_SELFTEST = '1';
app.setPath('userData', '/tmp/da-user-' + Date.now());
const ok = [], bad = []; const check = (c, m) => (c ? ok : bad).push(m);
const wait = ms => new Promise(r => setTimeout(r, ms));
srv.listen(0, () => {
  process.env.DA_EXEC = 'http://127.0.0.1:' + srv.address().port + '/exec';
  require('../main.js');
  app.whenReady().then(async () => {
    await wait(4000);
    const D = global.__da, W = () => D.win;
    let flashes = []; const of = W().flashFrame.bind(W()); W().flashFrame = v => { flashes.push(v); of(v); };
    let overlay = []; const oo = W().setOverlayIcon.bind(W()); W().setOverlayIcon = (img, d) => { overlay.push(img ? d : 'none'); oo(img, d); };
    const inner = () => W().webContents.mainFrame.framesInSubtree.find(f => /inner/.test(f.url));
    const ev = c => inner().executeJavaScript(c);
    check(W().isVisible(), '처음 실행하면 창이 보임');
    await D.tick(); check(D.status.err === 'login', '로그인 전: 「로그인해 주세요」 상태');
    await ev('login()'); S.items = [{ i: 0, id: 'DR-012', title: '옛 작업', k: 'comment', by: '김준혁', s: '예전 메시지', round: 0 }]; S.rev++;
    await D.tick();
    check(D.status.ok && D.status.n === 1 && D.state.tok === 'tok123', 'PIN 로그인하면 창에서 토큰을 읽어 숫자 1');
    check(W().isFocused() ? D.popups.length === 0 : (D.popups.length === 1 && /안 읽은 소식 1개/.test(decodeURIComponent(D.popups[0]))), '설치 후 처음: 창을 보고 있으면 알림 창 없음, 아니면 「안 읽은 소식 1개」 한 번');
    D.closeAllPopups(); flashes = [];
    // 창 닫기 → 트레이
    W().close(); await wait(300); check(!W().isDestroyed() && !W().isVisible(), '닫기 누르면 꺼지지 않고 숨음(트레이)');
    // 새 소식 2개
    S.items.push({ i: 1, id: 'DR-013', title: 'G6312 고티바쉬 리뉴얼', k: 'submit', by: '김준혁', s: '', nf: 3, round: 1 }, { i: 2, id: 'DR-013', title: 'G6312 고티바쉬 리뉴얼', k: 'comment', by: '김주환', s: '로고 조금만 키워 주세요. 상세페이지 첫 화면도 같이 봐 주세요', nf: 0, round: 1 }); S.rev++;
    await D.tick(); await wait(900);
    check(D.status.n === 3 && D.popups.length === 2, '새 소식 2개 → 알림 창 2개, 숫자 3');
    check(W().isVisible(), '숨어 있던 창이 작업표시줄로 돌아옴(가상 화면엔 창 관리자가 없어 최소화 여부는 윈도우에서 확인)');
    check(flashes[flashes.length - 1] === true, '작업표시줄 주황 깜빡임 켜짐');
    check(overlay.some(x => /3개/.test(x)), '작업표시줄 빨간 숫자 3');
    // 사진
    const all = BrowserWindow.getAllWindows().filter(w => w !== W() && w.isVisible());
    for (let k = 0; k < all.length; k++) { const img = await all[k].webContents.capturePage(); fs.writeFileSync(OUT + 'popup' + k + '.png', img.toPNG()); }
    const ti = await (async () => { const { nativeImage } = require('electron'); return null; })();
    // 같은 소식은 다시 안 뜸
    D.closeAllPopups(); S.rev++; await D.tick(); check(D.popups.length === 0, '같은 소식은 다시 알림 안 뜸');
    // 알림 창 누르기 → 그 작업 열림
    S.items.push({ i: 3, id: 'DR-014', title: '스티커', k: 'revise', by: '김준혁', s: '', round: 2 }); S.rev++; await D.tick(); await wait(900);
    const pw = BrowserWindow.getAllWindows().find(w => w !== W() && /data:text\/html/.test(w.webContents.getURL()) && w.isVisible());
    await pw.webContents.executeJavaScript("document.getElementById('b').click()"); await wait(1500);
    check(W().isVisible() && !W().isMinimized() && (await ev('OPEN')) === 'DR-014', '알림 창 누르면 창이 열리고 그 작업(DR-014)으로');
    check(flashes[flashes.length - 1] === false, '창을 열면 주황 꺼짐');
    // 보고 있는 중이면 알림 창 대신 화면 새로고침
    W().focus(); await wait(200);
    if (W().isFocused()) { const w0 = await ev('window.__woke||0'); S.items.push({ i: 4, id: 'DR-014', title: '스티커', k: 'comment', by: '김준혁', s: '네', round: 2 }); S.rev++; await D.tick(); await wait(600);
      check(D.popups.length === 0 && (await ev('window.__woke||0')) > w0, '창을 보고 있으면 알림 창 없이 화면만 새로고침'); }
    else check(true, '(가상 화면이라 포커스 시험 건너뜀)');
    // 읽음 → 0
    S.seen = 99; S.rev++; await D.tick(); await wait(300);
    check(D.status.n === 0 && overlay[overlay.length - 1] === 'none', '다른 기기에서 읽으면 숫자 0, 빨간 숫자 사라짐');
    // 연결 끊김
    S.down = true; S.rev++; await D.tick(); check(D.status.err === 'net', '연결 끊기면 「다시 시도 중」');
    S.down = false; await D.tick(); check(D.status.ok && !D.status.err, '연결 돌아오면 정상');
    // 로그아웃(웹앱 안) → 토큰 비움
    await ev('logout()'); await D.tick(); check(D.status.err === 'login' && !D.state.tok, '웹앱에서 로그아웃하면 프로그램도 로그인 필요');
    await ev('login()'); await D.tick(); check(D.status.ok, '다시 로그인하면 이어서');
    // PIN 바뀜(서버가 AUTH)
    S.auth = false; S.rev++; await D.tick(); check(D.status.err === 'login', 'PIN 바뀌어 토큰이 무효면 로그인 필요'); S.auth = true;
    // 저장 파일에 토큰 맨글자 없음
    const st = fs.readFileSync(path.join(app.getPath('userData'), 'state.json'), 'utf8');
    check(!/"rev"/.test(st), '다시 켜면 처음부터 물어봄(rev 저장 안 함)');
    check(!/tok123/.test(st), '저장 파일에 토큰이 그대로 적히지 않음(암호화 또는 빈 값)');
    for (const [n, sz, base] of [[3, 32, false], [12, 32, true], [120, 32, true]]) fs.writeFileSync(OUT + 'badge_' + n + '_' + base + '.png', (await D.paint(n, sz, base)).resize({ width: 96, height: 96, quality: 'best' }).toPNG());
    console.log('PASS', ok.length, 'FAIL', bad.length); bad.forEach(x => console.log('  ✗', x));
    app.exit(0);
  });
});
