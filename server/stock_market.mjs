// =====================================================================================================
//  老谋大富翁 · the market server (11-09: 「今天的行情能从当天种子算出来」, GPT review #1). A ranked round's market runs
//  here, not in the page: this service draws the three days' seeds, runs them with the game's own stock sim
//  (dogfight/stock_sim.js, byte for byte the page's sim.js) and sends each tick only once it has happened, so the page
//  never holds a price, a news outcome or a gap before its moment. The player's orders come in as bare actions and are
//  booked at this service's own current tick (a tick the page names is ignored). At the close the round — seeds, the
//  booked [tick, op] list and the money — goes to the backend, signed (HMAC, STOCK_MARKET_KEY), on loopback
//  (/stock_round); the backend re-runs it as it always did and only then are the seeds shown (to this player now, to
//  everyone with the replay). The replay format ({v, seeds, acts, cash}) is the one the old rounds have.
//  v4 (11-09, GPT review #1): a day's seed is 128 bits (crypto), the sim's randomness ChaCha20 keyed with it: the 30 s of
//  history and the first ticks no longer give the day away (a 32-bit seed could be searched for in seconds).
//  Protocol 2 (11-09, review #4-#6): a page that drops picks the round up again from the last tick and fill it has (all
//  it missed comes again, in order); the close's answer is kept for RESULT_KEEP by the round's token, so a page that
//  drops while the backend ranks it still gets it; after the answer the connection is closed; 'bye' ends a round left.
//
//  Its own process on its own port behind nginx (/dogfight/stock), apart from the fighting game's relay
//  (dogfight_net.mjs): a fault here can't touch a duel, and each has its own limits.
//
//  Protocol (JSON text frames). page → here:
//    {t:'hi', cv, name, bid, resume?, from?, nf?}  cv: the page's market protocol (2); resume: the token of a round to
//                      pick up again, from: the last tick the page has (all before it too), nf: the fills it has
//    {t:'bye'}         the page left the round: it ends here (nothing is ranked)
//    {t:'op', op, n}   an order (the sim's op code: stock * 32 + lev * 8 + kind), n the page's own counter
//    {t:'next'}        the day-end screen is done: open the next day
//    {t:'pause'} / {t:'resume'}   the page went to the background / came back (a few minutes a round, then it runs on)
//  here → page:
//    {t:'start', id, token, ids, hist, intro, v}  the round's three stocks (sim DEFS index) and the 30 s of history
//    {t:'k', k, p, l, e?}  ticks k, k+1, …: p the prices (3 per tick), l the boards (3 per tick), e what came out on
//                          those ticks: {k, i, ev} a news card (title fields only), {k, i, shake} a 洗盘 / 诱多 starting,
//                          {k, i, news2} a 辟谣, {k, night: {d, items}} tomorrow's headlines, {k, open: {d, items}} the gaps
//    {t:'f', n, k, op}     an order booked at tick k (the page books it there too, after that tick's 爆仓)
//    {t:'de', d}           day d is over: the clock waits for 'next'
//    {t:'back', id, tick, state}  picked up again: then every fill after the page's 'nf' and every tick after its 'from'
//    {t:'end', cash, seeds, acts, wiped, up}  the close: up = the backend's answer (rank …) or {error}; then it closes
//    {t:'no', why}         no ranked round now (busy, no key …): the page plays a local practice round
// =====================================================================================================
import { createServer, request } from 'node:http';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { isIPv6 } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// the sims in dogfight/ next to this file, or right next to it
const SIM = [join(HERE, 'dogfight', 'stock_sim.js'), join(HERE, 'stock_sim.js')].find(f => existsSync(f));
const S = createRequire(import.meta.url)(SIM);

export const PROTOCOL = 2;                       // the page's 'cv': pages speaking another one are told to refresh
const PORT = Number(process.env.STOCK_MARKET_PORT || 8794);
const API_PORT = Number(process.env.DOGFIGHT_API_PORT ?? 8779);
const KEY = String(process.env.STOCK_MARKET_KEY || '').trim();
// tests only: the clock runs this many times faster (rounds this fast are refused by the backend, see dogfight.py)
const SPEED = Math.max(1, Number(process.env.STOCK_MARKET_SPEED || 1));
const TICK_MS = 1000 / S.TPS / SPEED;
const INTRO_MS = 1500 / SPEED;                   // the page's 3 · 2 · 1 (game.js INTRO)
// ticks per message: one, as it happens (10 a second, ~80 bytes each). Two (11-09 02:20 – ) held every other tick back
// 100 ms, and the page, playing in step with its music, kept running into the tick it didn't have yet: the market moved
// 67 / 133 ms / 67 … instead of every 100 ms (11-09 lag check). Pages of any version take a 'k' of any length.
const BATCH = 1;
const MAX_CONN = 800, MAX_PER_IP = 6, MAX_ROUNDS = 500;
const MAX_MSG = 512, MAX_BURST = 30, MAX_RATE = 12;   // message bucket per connection: 30 at once, 12 a second after
const HELLO_MS = 10000;                          // a connection that doesn't say hi in 10 s is closed
const DAYEND_MAX = 180000 / SPEED;               // the day-end screen may sit this long, then the next day opens anyway
const PAUSE_MAX = 180000 / SPEED;                // background time a round may stop the clock for, in all
const GRACE_MS = 30000;                          // a dropped round waits this long to be picked up again, paused
const OUT_HARD = 256 * 1024;                     // a connection that doesn't read what it's sent is closed
const RESULT_KEEP = 120000;                      // a finished round's answer, kept this long for a page that dropped at the close

const conns = new Set(), perIp = new Map(), rounds = new Map();   // rounds: id -> round
const results = new Map();                       // token -> {R, msg (the 'end'), at}: finished rounds, for RESULT_KEEP
let draining = false;

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
function ipKey(ip) {                             // IPv4 as is, IPv6 by its /64 (as the relay)
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1];
  const a = String(ip).split('%')[0];
  if (!isIPv6(a)) return a;
  const [head, tail] = a.split('::'), h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const g = tail === undefined ? h : [...h, ...new Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return g.slice(0, 4).map(x => parseInt(x, 16).toString(16)).join(':') + '::/64';
}

// ---------- minimal RFC 6455 (text, ping/pong, close; no extensions, no fragments) ----------
function frame(op, payload) {
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | op, n]);
  else if (n < 65536) head = Buffer.from([0x80 | op, 126, n >> 8, n & 255]);
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeUInt32BE(n, 6); }
  return Buffer.concat([head, payload]);
}
function send(c, obj) {
  if (c.closed) return;
  const data = frame(1, Buffer.from(JSON.stringify(obj)));
  c.sock.write(data);
  c.outAt = Date.now();
  if (c.round) c.round.bytesOut += data.length;
  if (c.sock.writableLength > OUT_HARD) setImmediate(() => close(c));
}
// soft: what was written still goes out (the close's answer) before the socket is let go
function close(c, soft) {
  if (c.closed) return;
  c.closed = true;
  conns.delete(c);
  const n = (perIp.get(c.ipk) || 1) - 1;
  if (n > 0) perIp.set(c.ipk, n); else perIp.delete(c.ipk);
  try { c.sock.end(frame(8, Buffer.alloc(0))); } catch { /* gone */ }
  if (soft) setTimeout(() => c.sock.destroy(), 3000).unref();
  else c.sock.destroy();
  const R = c.round;
  c.round = null;
  if (R && R.conn === c) {
    R.conn = null;
    if (!R.over) R.dropAt = Date.now();          // kept a while, paused, to be picked up again
  }
}
function onData(c, chunk) {
  c.buf = c.buf.length ? Buffer.concat([c.buf, chunk]) : chunk;
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const fin = b[0] & 0x80, op = b[0] & 15, masked = b[1] & 0x80;
    let len = b[1] & 127, off = 2;
    if (!fin || !masked || len === 127) return close(c);
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    if (len > MAX_MSG) return close(c);
    if (b.length < off + 4 + len) return;
    const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
    c.buf = b.subarray(off + 4 + len);
    c.seen = Date.now();
    if (c.round) c.round.bytesIn += off + 4 + len;
    if (--c.tokens < 0) return close(c);
    if (op === 8) return close(c);
    if (op === 9) { c.sock.write(frame(10, data)); continue; }
    if (op !== 1) continue;
    let msg;
    try { msg = JSON.parse(data.toString('utf8')); } catch { return close(c); }
    if (msg && typeof msg === 'object') {
      try { handle(c, msg); } catch (e) {          // one bad message closes its own connection, never the process
        console.log(`bad message closed ip=${c.ip} err=${String(e && e.message).slice(0, 200)}`);
        close(c);
        return;
      }
    }
    if (c.closed) return;
  }
}

// ---------- rounds ----------
const seed128 = () => randomBytes(16).toString('hex');   // a day's seed: 128 bits, 32 hex digits (sim v4)
function newRound(c, msg) {
  const seeds = [seed128(), seed128(), seed128()], m = S.make(seeds);
  const R = { id: randomBytes(8).toString('hex'), token: randomBytes(16).toString('hex'), seeds, m, a: S.account(), acts: [],
    tick: -1, clock: -INTRO_MS, last: Date.now(), state: 'play', paused: false, pausedMs: 0, dayEndAt: 0,
    out: [], ev: [], evLog: [], fills: [], sentTo: -1, over: false, conn: c, dropAt: 0, started: Date.now(), ended: 0,
    name: typeof msg.name === 'string' ? msg.name.slice(0, 40) : '', bid: typeof msg.bid === 'string' && /^[0-9a-f]{32}$/.test(msg.bid) ? msg.bid : null,
    ip: c.ip, ua: c.ua, bytesOut: 0, bytesIn: 0, n: 0 };
  rounds.set(R.id, R);
  c.round = R;
  const H = S.HIST;
  send(c, { t: 'start', v: S.VERSION, id: R.id, token: R.token, ids: m.stocks.map(st => st.id), hist: m.stocks.map(st => st.P.slice(0, H)), intro: INTRO_MS * SPEED });
  return R;
}
// what comes out on tick k (and only then): the title of a news card, a 洗盘 starting, a 辟谣, tonight's headlines, the gaps
function reveals(R, k) {
  const m = R.m, out = [];
  m.events.forEach((e, i) => {
    if (e.news === k) out.push({ k, i, ev: { type: e.type, news: e.news, at: e.at, target: e.target, v: e.v, src: e.src, sent: e.sent } });
    if (e.at === k && e.shake) out.push({ k, i, shake: 1 });
    if (e.news2 === k && e.news2 >= 0) out.push({ k, i, news2: k });
  });
  const d = Math.floor(k / S.DAY);
  if (k % S.DAY === S.PREVIEW && d < S.DAYS - 1) out.push({ k, night: { d, items: m.nights[d] } });
  if (k > 0 && k % S.DAY === 0 && m.opens[d]) out.push({ k, open: { d, items: m.opens[d] } });
  return out;
}
const wipedAt = (R, k) => R.a.liqs > 0 && !R.a.sh.some(x => x > 0) && R.a.cash < S.price(R.m, 0, k) * 2 + S.START * 0.01;   // game.js onTick
function step(R, k) {
  R.tick = k;
  S.liquidate(R.m, R.a, k);
  for (const st of R.m.stocks) R.out.push(st.P[S.HIST + k]);
  for (const st of R.m.stocks) R.out.push(st.L[k]);
  for (const x of reveals(R, k)) { R.ev.push(x); R.evLog.push(x); }
}
// ticks a..b (and what came out on them) as one 'k' message, from the market itself: a page picked up again gets these
function ticksMsg(R, a, b) {
  const p = [], l = [];
  for (let k = a; k <= b; k++) for (const st of R.m.stocks) { p.push(st.P[S.HIST + k]); l.push(st.L[k]); }
  const msg = { t: 'k', k: a, p, l }, e = R.evLog.filter(x => x.k >= a && x.k <= b);
  if (e.length) msg.e = e;
  return msg;
}
function flush(R, force) {
  const n = R.tick - R.sentTo;
  if (n <= 0 || (!force && n < BATCH && !R.ev.length)) return;
  const p = [], l = [], N = R.m.stocks.length;
  for (let j = 0; j < n; j++) for (let s = 0; s < N; s++) { p.push(R.out[j * 2 * N + s]); l.push(R.out[j * 2 * N + N + s]); }
  const msg = { t: 'k', k: R.sentTo + 1, p, l };
  if (R.ev.length) msg.e = R.ev;
  if (R.conn) send(R.conn, msg);                   // (dropped: the page asks for what it missed when it's back)
  R.sentTo = R.tick;
  R.out = [];
  R.ev = [];
}
function advance(R, now) {
  const dt = now - R.last;
  R.last = now;
  if (R.over) return;
  if (!R.conn) {                                   // dropped: paused, kept for GRACE_MS
    if (now - R.dropAt > GRACE_MS) { R.over = true; rounds.delete(R.id); }
    return;
  }
  if (R.state === 'dayend') {
    if (now - R.dayEndAt > DAYEND_MAX) openNext(R);
    return;
  }
  if (R.paused) {
    R.pausedMs += dt;
    if (R.pausedMs < PAUSE_MAX) return;
    R.paused = false;                              // out of pause time: it runs on
  }
  R.clock += dt;
  const target = Math.min(S.TICKS - 1, Math.floor(R.clock / TICK_MS));
  while (R.tick < target) {
    const k = R.tick + 1;
    step(R, k);
    if (wipedAt(R, k)) { flush(R, true); return finish(R, true); }
    if (k === S.TICKS - 1) { flush(R, true); return finish(R, false); }
    if (k % S.DAY === S.DAY - 1) {               // the close of day 1 / 2: wait for the page's 'next'
      flush(R, true);
      R.state = 'dayend';
      R.dayEndAt = now;
      send(R.conn, { t: 'de', d: Math.floor(k / S.DAY) });
      return;
    }
  }
  flush(R, false);
}
function openNext(R) {
  if (R.state !== 'dayend') return;
  R.state = 'play';
  R.clock = (R.tick + 1) * TICK_MS;               // the next day's first tick comes at once
  R.last = Date.now();
  advance(R, R.last);
}
function order(c, msg) {
  const R = c.round;
  if (!R || R.over || R.state !== 'play' || R.tick < 0 || !isInt(msg.op, 0, (R.m.stocks.length - 1) * 32 + 2 * 8 + 5) || (msg.op & 7) > 5 ||
      ((msg.op >> 3) & 3) > 2 || R.acts.length >= S.MAX_ACTS) {
    send(c, { t: 'f', n: msg.n, k: -1 });          // not booked (before the open, on the day-end screen, a bad code, too many)
    return;
  }
  const k = R.tick, n = isInt(msg.n, 0, 2 ** 31) ? msg.n : 0;   // booked now, at this service's tick (msg.k / msg.t are not read)
  R.acts.push([k, msg.op]);
  R.fills.push({ t: 'f', n, k, op: msg.op });
  S.trade(R.m, R.a, k, msg.op);
  flush(R, true);                                  // the page has every tick up to k before it hears of the order
  send(c, R.fills[R.fills.length - 1]);
}
function finish(R, wiped) {
  R.over = true;
  R.ended = Date.now();
  if (!wiped) S.close(R.m, R.a);
  const check = S.run(R.seeds, R.acts);
  if (!check.ok || (!wiped && check.cash !== R.a.cash)) console.log(`round ${R.id} re-run mismatch ${JSON.stringify(check).slice(0, 200)} cash=${R.a.cash}`);
  const tell = up => {
    const end = { t: 'end', cash: R.a.cash, seeds: R.seeds, acts: R.acts, wiped, up };
    results.set(R.token, { R, msg: end, at: Date.now() });   // (a page that dropped meanwhile asks again with its token)
    rounds.delete(R.id);
    if (R.conn) { const c = R.conn; send(c, end); close(c, true); }
    console.log(`round ${R.id} end cash=${R.a.cash} acts=${R.acts.length} wiped=${wiped} out=${R.bytesOut} in=${R.bytesIn} up=${JSON.stringify(up).slice(0, 120)}`);
  };
  if (wiped) return tell({ off: '爆仓出局，这局不上榜' });
  if (!R.acts.length) return tell({ off: '一笔没交易，不上榜' });
  const rec = { id: R.id, v: S.VERSION, seeds: R.seeds, acts: R.acts, cash: R.a.cash, name: R.name, bid: R.bid, ip: R.ip, ua: R.ua,
    started: R.started, ended: R.ended, paused: Math.round(R.pausedMs * SPEED), speed: SPEED, bytes: R.bytesOut + R.bytesIn };
  postRecord(rec, tell);
}
// the signed record, to the backend on loopback; its answer (rank …) goes to the page
export function sign(body, key = KEY) { return createHmac('sha256', key).update(body).digest('hex'); }
function postRecord(rec, then) {
  const body = JSON.stringify(rec), payload = JSON.stringify({ rec: body, sig: sign(body) });
  let done = false;
  const once = x => { if (!done) { done = true; then(x); } };
  const r = request({ host: '127.0.0.1', port: API_PORT, path: '/stock_round', method: 'POST', timeout: 20000,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
    let b = '';
    res.on('data', d => { if (b.length < 65536) b += d; });
    res.on('end', () => {
      let o = null;
      try { o = JSON.parse(b); } catch { /* below */ }
      if (res.statusCode >= 200 && res.statusCode < 300 && o) once(o);
      else once({ error: (o && (o.message || (o.error && o.error.message))) || `服务器 ${res.statusCode}` });
    });
  });
  r.on('timeout', () => r.destroy(new Error('timeout')));
  r.on('error', e => once({ error: '成绩没传上：' + e.message }));
  r.end(payload);
}

// everything after what a page picked up again says it has (msg.from: its last tick, msg.nf: its fills): the fills first
// (the page holds a fill until it reaches its tick, so it can't play past one it hasn't heard of yet), then the ticks,
// with what came out on them
function catchUp(c, R, msg) {
  for (const f of R.fills.slice(isInt(msg.nf, 0, R.fills.length) ? msg.nf : 0)) send(c, f);
  const from = isInt(msg.from, -1, S.TICKS - 1) ? Math.min(msg.from, R.sentTo) : -1;
  if (R.sentTo > from) send(c, ticksMsg(R, from + 1, R.sentTo));
}
function handle(c, msg) {
  if (msg.t === 'hi') {
    if (c.round) return;
    if (msg.cv !== PROTOCOL) return send(c, { t: 'no', why: 'refresh' });
    if (typeof msg.resume === 'string') {           // picked up again after a drop: the same round, from where it was
      const done = results.get(msg.resume);
      if (done) {                                  // over already: what the page missed of it, then its answer again
        catchUp(c, done.R, msg);
        send(c, done.msg);
        close(c, true);
        return;
      }
      const R = [...rounds.values()].find(x => x.token === msg.resume);
      if (!R) return send(c, { t: 'no', why: 'gone' });
      if (R.conn) close(R.conn);                   // (the old connection died without a word: the token is the round's)
      R.sentTo = R.tick;                           // (what was still to go comes with the catch-up below)
      R.out = [];
      R.ev = [];
      R.conn = c;
      c.round = R;
      R.last = Date.now();
      send(c, { t: 'back', id: R.id, tick: R.tick, state: R.state });
      catchUp(c, R, msg);
      return;                                      // (a round over but not yet ranked: its 'end' comes when it is)
    }
    if (!KEY) return send(c, { t: 'no', why: 'off' });
    if (draining || rounds.size >= MAX_ROUNDS) return send(c, { t: 'no', why: 'busy' });
    newRound(c, msg);
    return;
  }
  const R = c.round;
  if (!R) return close(c);
  if (msg.t === 'op') return order(c, msg);
  if (msg.t === 'next') return openNext(R);
  if (msg.t === 'pause') { if (R.state === 'play' && R.pausedMs < PAUSE_MAX) R.paused = true; return; }
  if (msg.t === 'resume') { R.paused = false; R.last = Date.now(); return; }
  if (msg.t === 'bye') {                           // left: the round ends here, unranked, and so does the connection
    if (!R.over) { R.over = true; rounds.delete(R.id); console.log(`round ${R.id} left at tick ${R.tick}`); }
    close(c, true);
  }
}

const STOCK_PATH = /^\/(dogfight\/)?stock\/?(\?.*)?$/;
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rounds: rounds.size, results: results.size, conns: conns.size, key: !!KEY, draining }));
    return;
  }
  res.writeHead(404);
  res.end();
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  const ip = String(req.headers['x-hedssaz-verified-ip'] || req.socket.remoteAddress || ''), ipk = ipKey(ip);
  sock.on('error', () => {});
  // (while draining too: a page that dropped picks its round up again here; its 'hi' for a new round is turned away)
  if (!STOCK_PATH.test(req.url) || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket' ||
      conns.size >= MAX_CONN || (perIp.get(ipk) || 0) >= MAX_PER_IP) {
    sock.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n', () => sock.destroy());
    setTimeout(() => sock.destroy(), 5000).unref();
    return;
  }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const c = { sock, ip, ipk, ua: String(req.headers['user-agent'] || '').slice(0, 300), buf: Buffer.alloc(0), seen: Date.now(), connAt: Date.now(),
    tokens: MAX_BURST, round: null, closed: false };
  conns.add(c);
  perIp.set(ipk, (perIp.get(ipk) || 0) + 1);
  sock.on('data', d => onData(c, d));
  sock.on('close', () => close(c));
  sock.on('end', () => close(c));
});
// the market clock: every round, every 25 ms (a tick is 100 ms); a round that throws is dropped, never the loop
setInterval(() => {
  const now = Date.now();
  for (const R of [...rounds.values()]) {
    try { advance(R, now); } catch (e) {
      console.log(`round ${R.id} dropped: ${String(e && e.stack).slice(0, 300)}`);
      rounds.delete(R.id);
      if (R.conn) { send(R.conn, { t: 'no', why: 'error' }); close(R.conn); }
    }
  }
}, 25 / SPEED > 5 ? 25 / SPEED : 5);
setInterval(() => {                                // message buckets, silent and idle connections, keep-alive pings
  const now = Date.now();
  for (const [tok, x] of results) if (now - x.at > RESULT_KEEP) results.delete(tok);
  for (const c of [...conns]) {
    c.tokens = Math.min(MAX_BURST, c.tokens + MAX_RATE);
    // (the day-end screen sends nothing either way for minutes: a ping keeps nginx's 90 s read timeout from cutting it;
    // the browser answers with a pong, which counts as seen)
    if (now - (c.outAt || c.connAt) > 20000 && !c.closed) { c.sock.write(frame(9, Buffer.alloc(0))); c.outAt = now; }
    if ((!c.round && now - c.connAt > HELLO_MS) || now - c.seen > 60000) close(c);
  }
}, 1000);
// SIGTERM (systemctl stop / restart): no new rounds; rounds already running finish (at most a few minutes), then exit
process.on('SIGTERM', () => {
  draining = true;
  const t = setInterval(() => { if (!rounds.size) { clearInterval(t); process.exit(0); } }, 500);
  setTimeout(() => process.exit(0), 6 * 60 * 1000).unref();
});
server.listen(PORT, '127.0.0.1', () => console.log(`stock market on 127.0.0.1:${PORT} key=${!!KEY} speed=${SPEED}`));
