/* 휴즈랩 디자인 작업 — 알림 받는 일꾼(서비스 워커)
 * 서버가 보내는 건 내용 없는 「깨우기」. 받으면 서버에 안 읽은 소식을 물어 새 것만 알림으로 띄운다. */
const VER = 'da-sw-1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
const DB = (() => { let p; const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('da', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  return { get: k => open().then(d => new Promise(res => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); })),
    set: (k, v) => open().then(d => new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); })) }; })();
const VERB = { order: '새 작업을 요청했어요', edit: '요청을 수정했어요', start: '작업을 시작했어요', eta: '예상 완료일을 정했어요', submit: '시안을 올렸어요', revise: '수정을 요청했어요', reopen: '다시 수정을 요청했어요', done: '작업을 완료했어요', undel: '작업을 되살렸어요', note: '번호 답글을 달았어요' };
function lineOf(x) {
  if (x.k === 'comment') return x.s || (x.nf ? '파일 ' + x.nf + '개를 보냈어요' : '메시지를 보냈어요');
  if (x.k === 'note') return '번호 답글 · ' + (x.s || '');
  if (x.k === 'eta' || x.k === 'start') { const m = /\d{4}-(\d{2})-(\d{2})/.exec(x.s || ''); return VERB[x.k] + (m ? ' · 예상 ' + (+m[1]) + '/' + (+m[2]) : ''); }
  if (x.k === 'submit') return (x.round ? (x.round + 1) + '차 ' : '') + '시안을 올렸어요' + (x.nf ? ' · ' + x.nf + '개' : '');
  if (x.k === 'revise' || x.k === 'reopen') return (x.round ? x.round + '차 ' : '') + '수정을 요청했어요';
  if (x.k === 'edit') return '요청을 수정했어요' + (x.s ? ' · ' + x.s : '');
  return VERB[x.k] || '새 소식이 있어요';
}
async function onPush() {
  const exec = await DB.get('exec'), tok = await DB.get('tok');
  const generic = () => self.registration.showNotification('디자인 작업', { body: '새 소식이 있어요', icon: 'icon-192.png', badge: 'badge.png', tag: 'da-any', data: { id: '' } });
  if (!exec || !tok) return generic();
  let r;
  try { r = await (await fetch(exec, { method: 'POST', body: JSON.stringify({ api: 'poll', tok }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })).json(); } catch (e) { return generic(); }
  if (!r || !r.ok) return r && r.err === 'AUTH' ? self.registration.showNotification('디자인 작업', { body: '다시 로그인해 주세요. 앱을 열어 PIN을 넣으면 알림이 이어져요', icon: 'icon-192.png', badge: 'badge.png', tag: 'da-login', data: { id: '' } }) : generic();
  if (self.navigator.setAppBadge) { try { r.n ? await self.navigator.setAppBadge(r.n) : await self.navigator.clearAppBadge(); } catch (e) {} }
  const key = 'last_' + r.name + (r.test ? '|T' : '');
  let last = await DB.get(key); if (last !== undefined && last >= r.last) last = -1;   // 기록 줄이 줄었으면 다시 맞춤
  const fresh = r.items.filter(x => last === undefined ? true : x.i > last);
  await DB.set(key, r.last - 1);
  // 앱을 보고 있는 중이면 알림 대신 화면만 새로고침
  const W = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (W.some(w => w.visibilityState === 'visible' && w.focused)) { W.forEach(w => w.postMessage({ wake: 1 })); return; }
  // 이미 읽은 작업의 알림은 정리
  const live = new Set(r.items.map(x => x.id));
  (await self.registration.getNotifications()).forEach(n => { if (n.data && n.data.id && !live.has(n.data.id)) n.close(); });
  // 새 것이 없어도(다른 기기에서 이미 읽음·연달아 온 깨우기) 크롬 규칙상 알림 하나는 꼭 띄움 → 남은 수를 조용히 한 줄로
  if (!fresh.length) { await self.registration.showNotification('디자인 작업', { body: r.n ? '안 읽은 소식 ' + r.n + '개가 있어요' : '새 소식을 모두 확인했어요', icon: 'icon-192.png', badge: 'badge.png', tag: 'da-sum', silent: true, renotify: false, data: { id: '' }  });
    if (!r.n) { await new Promise(res => setTimeout(res, 4000)); (await self.registration.getNotifications({ tag: 'da-sum' })).forEach(n => n.close()); }
    return; }
  // 작업마다 알림 하나(같은 작업은 최신 내용으로 바꿔 다시 울림)
  const by = {}; fresh.forEach(x => { (by[x.id] = by[x.id] || []).push(x); });
  const ids = Object.keys(by).slice(-4);
  for (const id of ids) {
    const L = by[id], x = L[L.length - 1], cnt = r.items.filter(y => y.id === id).length;
    await self.registration.showNotification(x.by + ' · ' + x.title, {
      body: lineOf(x) + (cnt > 1 ? '  (안 읽은 소식 ' + cnt + '개)' : ''), icon: 'icon-192.png', badge: 'badge.png',
      tag: 'da-' + id, renotify: true, timestamp: Date.now(), data: { id }, vibrate: [120, 60, 120]
    });
  }
}
self.addEventListener('push', e => e.waitUntil(onPush()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const id = (e.notification.data && e.notification.data.id) || '';
  e.waitUntil((async () => {
    const L = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = L.find(w => new URL(w.url).origin === self.location.origin);
    if (c) { await c.focus(); if (id) c.postMessage({ open: id }); return; }
    await self.clients.openWindow('./' + (id ? '?open=' + encodeURIComponent(id) : ''));
  })());
});
