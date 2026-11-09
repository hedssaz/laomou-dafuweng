// stock_market.mjs: a ranked 老谋大富翁 round run on the server. node --test test_stock_market.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const S = createRequire(import.meta.url)(join(HERE, 'dogfight', 'stock_sim.js'));
const KEY = 'k'.repeat(64), SPEED = 20;
let nextPort = 19400 + Math.floor(Math.random() * 400);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// a stand-in for dogfight.py's /stock_round: keeps what it gets, answers like the backend
function backend(delay = 0) {
  const got = [];
  const srv = createServer((req, res) => {
    let b = '';
    req.on('data', d => { b += d; });
    req.on('end', () => {
      got.push({ path: req.url, body: JSON.parse(b) });
      setTimeout(() => {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 7, on_board: true, rank_today: 1, rank_all: 3 }));
      }, delay);
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, got, port: srv.address().port })));
}
function startMarket(env) {
  const port = nextPort++;
  const p = spawn(process.execPath, [join(HERE, 'stock_market.mjs')], { env: { ...process.env, STOCK_MARKET_PORT: String(port), STOCK_MARKET_SPEED: String(SPEED), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.out = '';
  p.stdout.on('data', d => { p.out += d; });
  p.stderr.on('data', d => { p.out += d; });
  p.port = port;
  return new Promise((res, rej) => {
    const t = setInterval(() => {
      if (/stock market on/.test(p.out)) { clearInterval(t); res(p); } else if (p.exitCode !== null) { clearInterval(t); rej(new Error(p.out)); }
    }, 20);
  });
}
function client(port, ip = '203.0.113.9') {
  return new Promise(res => {
    // deaf: what arrives is dropped (written by the service, lost on the way); raw: every text frame as it came
    const s = net.connect(port, '127.0.0.1'), c = { msgs: [], raw: [], closed: false, deaf: false, buf: Buffer.alloc(0), status: 0 };
    let up = false;
    s.on('connect', () => s.write(`GET /dogfight/stock HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nX-Hedssaz-Verified-Ip: ${ip}\r\n\r\n`));
    s.on('data', d => {
      c.buf = Buffer.concat([c.buf, d]);
      if (!up) {
        const i = c.buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        c.status = / 101 /.test(c.buf.subarray(0, i).toString()) ? 101 : 503;
        c.buf = c.buf.subarray(i + 4);
        up = true;
        res(c);
      }
      for (;;) {
        const b = c.buf;
        if (b.length < 2) break;
        let n = b[1] & 127, off = 2;
        if (n === 126) { if (b.length < 4) break; n = b.readUInt16BE(2); off = 4; }
        if (n === 127 && b.length < 10) break;
        if (b.length < off + n) break;
        if (n === 127) { n = b.readUInt32BE(off + 4); off += 8; if (b.length < off + n) break; }
        if ((b[0] & 15) === 1 && !c.deaf) { c.raw.push(b.subarray(off, off + n).toString()); c.msgs.push(JSON.parse(c.raw[c.raw.length - 1])); }
        if ((b[0] & 15) === 8) c.closed = true;
        c.buf = b.subarray(off + n);
      }
    });
    s.on('close', () => { c.closed = true; if (!up) res(c); });
    s.on('error', () => {});
    c.send = obj => {
      const p = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)), m = randomBytes(4);
      const h = p.length < 126 ? Buffer.from([0x81, 0x80 | p.length]) : Buffer.from([0x81, 0xfe, p.length >> 8, p.length & 255]);
      s.write(Buffer.concat([h, m, Buffer.from(p.map((x, i) => x ^ m[i & 3]))]));
    };
    c.end = () => s.destroy();
    c.wait = async (f, ms = 15000) => {
      const t0 = Date.now();
      for (;;) {
        const m = c.msgs.find(f);
        if (m) return m;
        if (Date.now() - t0 > ms) throw new Error('timeout; last: ' + JSON.stringify(c.msgs.slice(-3)).slice(0, 400));
        await sleep(5);
      }
    };
  });
}
// the ticks a page has been sent so far
const lastTick = c => c.msgs.filter(m => m.t === 'k').reduce((x, m) => Math.max(x, m.k + m.p.length / 3 - 1), -1);
const health = port => fetch(`http://127.0.0.1:${port}/health`).then(r => r.json());
// the ticks of one or more connections in a row, as the page keeps them: every tick from 0 once, never a hole
function prices(...cs) {
  const P = [];
  for (const c of cs) for (const m of c.msgs.filter(x => x.t === 'k')) {
    assert.ok(m.k <= P.length / 3, `a hole before tick ${m.k} (had ${P.length / 3})`);
    for (let j = 0; j < m.p.length; j++) P[m.k * 3 + j] = m.p[j];
  }
  return P;
}
// day ends: say 'next' each time (from whichever connection is the live one)
async function playOut(get) {
  for (let d = 0; d < 2; d++) { await get().wait(m => m.t === 'de' && m.d === d, 20000); get().send({ t: 'next' }); }
}

test('a ranked round: ticks only once they happen, orders booked at the market\'s own tick, a signed record at the close', async () => {
  const B = await backend();
  const M = await startMarket({ STOCK_MARKET_KEY: KEY, DOGFIGHT_API_PORT: String(B.port) });
  try {
    const c = await client(M.port);
    c.send({ t: 'hi', cv: 2, name: '测试狗', bid: 'a'.repeat(32) });
    const st = await c.wait(m => m.t === 'start');
    assert.equal(st.ids.length, 3);
    assert.equal(st.hist[0].length, S.HIST);
    assert.ok(!('seeds' in st));
    await c.wait(m => m.t === 'k' && m.k + m.p.length / 3 > 60);
    // an order naming a tick (past or future) is booked at the market's tick, never the one it names
    const before = lastTick(c);
    c.send({ t: 'op', op: 2, n: 1, k: 1199, t2: 5 });
    const f1 = await c.wait(m => m.t === 'f' && m.n === 1);
    assert.ok(f1.k >= before && f1.k < S.DAY, `booked at ${f1.k}, page had ${before}`);
    assert.ok(lastTick(c) >= f1.k);                                            // every tick up to it came first
    c.send({ t: 'op', op: 5, n: 2, k: 0 });
    const f2 = await c.wait(m => m.t === 'f' && m.n === 2);
    assert.ok(f2.k >= f1.k);
    c.send({ t: 'op', op: 999, n: 3 });                                        // not an order: not booked
    assert.equal((await c.wait(m => m.t === 'f' && m.n === 3)).k, -1);
    // day 1 ends: the clock waits for the page
    const de = await c.wait(m => m.t === 'de');
    assert.equal(de.d, 0);
    const at = lastTick(c);
    assert.equal(at, S.DAY - 1);
    await sleep(300);
    assert.equal(lastTick(c), at);
    c.send({ t: 'next' });
    await c.wait(m => m.t === 'de' && m.d === 1, 20000);
    c.send({ t: 'next' });
    const end = await c.wait(m => m.t === 'end', 20000);
    assert.equal(lastTick(c), S.TICKS - 1);
    // v4: the days' seeds are 128 bits from crypto, and nothing the page got before the close holds one
    assert.equal(S.VERSION, 4);
    assert.equal(end.seeds.length, 3);
    for (const sd of end.seeds) assert.match(sd, /^[0-9a-f]{32}$/);
    assert.equal(new Set(end.seeds).size, 3);
    const early = c.raw.slice(0, c.msgs.indexOf(end)).join('\n');
    for (const sd of end.seeds) {
      for (let i = 0; i + 8 <= 32; i += 4) if (/[a-f]/.test(sd.slice(i, i + 8))) assert.ok(!early.includes(sd.slice(i, i + 8)), 'part of a seed went out early');
    }
    // and after the close's answer the service closes the connection
    await sleep(300);
    assert.ok(c.closed, 'the connection stays open after the end');
    // what came out, and when: a news card's title on its own tick, never what it will do
    const ev = c.msgs.filter(m => m.t === 'k' && m.e).flatMap(m => m.e);
    for (const x of ev) {
      if (x.ev) {
        assert.equal(x.ev.news, x.k);
        for (const secret of ['g', 'real', 'dir', 'shake', 'news2', 'end', 'ramp', 'lock', 'back', 'tail']) assert.ok(!(secret in x.ev), secret);
      }
      if (x.night) assert.equal(x.k % S.DAY, S.PREVIEW);
      if (x.open) assert.equal(x.k % S.DAY, 0);
    }
    // the record: signed, the booked ticks, money the sim agrees with
    assert.equal(B.got.length, 1);
    const { body } = B.got[0];
    assert.equal(B.got[0].path, '/stock_round');
    assert.equal(createHmac('sha256', KEY).update(body.rec).digest('hex'), body.sig);
    const rec = JSON.parse(body.rec);
    assert.deepEqual(rec.acts, [[f1.k, 2], [f2.k, 5]]);
    assert.deepEqual(rec.seeds, end.seeds);
    assert.deepEqual(prices(c).length, S.TICKS * 3);
    assert.equal(S.run(rec.seeds, rec.acts).cash, rec.cash);
    assert.equal(end.cash, rec.cash);
    assert.equal(rec.speed, SPEED);                                            // (the backend refuses anything but 1)
    assert.equal(rec.v, 4);
    assert.ok(rec.bytes > 1000 && rec.bytes < 200000, `bytes ${rec.bytes}`);
    assert.deepEqual(end.up, { id: 7, on_board: true, rank_today: 1, rank_all: 3 });
    // the page that knows the seeds only now can rebuild every price it was sent
    const m = S.make(end.seeds);
    for (const k of c.msgs.filter(x => x.t === 'k')) for (let j = 0; j < k.p.length; j++) assert.equal(k.p[j], m.stocks[j % 3].P[S.HIST + k.k + Math.floor(j / 3)]);
    c.end();
  } finally { M.kill('SIGKILL'); B.srv.close(); }
});

test('old pages, no key, limits, bad messages and a dropped page picked up again', async () => {
  const B = await backend();
  const M = await startMarket({ STOCK_MARKET_KEY: KEY, DOGFIGHT_API_PORT: String(B.port) });
  const off = await startMarket({ STOCK_MARKET_KEY: '', DOGFIGHT_API_PORT: String(B.port) });
  try {
    const old = await client(M.port);
    old.send({ t: 'hi', cv: 0 });
    assert.equal((await old.wait(m => m.t === 'no')).why, 'refresh');
    const nokey = await client(off.port);
    nokey.send({ t: 'hi', cv: 2 });
    assert.equal((await nokey.wait(m => m.t === 'no')).why, 'off');
    // six connections an address, the seventh refused
    const many = [];
    for (let i = 0; i < 6; i++) many.push(await client(M.port, '198.51.100.7'));
    assert.ok(many.every(c => c.status === 101));
    assert.equal((await client(M.port, '198.51.100.7')).status, 503);
    many.forEach(c => c.end());
    // a broken message closes its own connection; the service and other rounds go on
    const a = await client(M.port, '203.0.113.20'), b = await client(M.port, '203.0.113.21');
    a.send({ t: 'hi', cv: 2 });
    b.send({ t: 'hi', cv: 2 });
    await a.wait(m => m.t === 'start');
    await b.wait(m => m.t === 'start');
    a.send('not json');
    await sleep(200);
    assert.ok(a.closed);
    const k0 = lastTick(b);
    await sleep(300);
    assert.ok(lastTick(b) > k0);
    // b drops and comes back with its token: the same round, no tick missed, the clock stood still meanwhile
    const tok = (b.msgs.find(m => m.t === 'start')).token;
    await b.wait(m => m.t === 'k' && m.k > 30);
    const had = lastTick(b);
    b.end();
    await sleep(400);                                                          // (80 ticks at this speed, had it run on)
    const b2 = await client(M.port, '203.0.113.21');
    b2.send({ t: 'hi', cv: 2, resume: tok });
    const back = await b2.wait(m => m.t === 'back');
    assert.ok(back.tick <= had + 12, `the clock ran on while it was gone: had ${had}, now ${back.tick}`);
    await b2.wait(m => m.t === 'k' && m.k > back.tick);
    const unknown = await client(M.port);
    unknown.send({ t: 'hi', cv: 2, resume: 'f'.repeat(32) });
    assert.equal((await unknown.wait(m => m.t === 'no')).why, 'gone');
    const h = await health(M.port);
    assert.equal(h.ok, true);
    [old, nokey, b2, unknown].forEach(c => c.end());
  } finally { M.kill('SIGKILL'); off.kill('SIGKILL'); B.srv.close(); }
});

test('leaving: \'bye\' ends the round and its connection; a page that left frees its place for the next round', async () => {
  const B = await backend();
  const M = await startMarket({ STOCK_MARKET_KEY: KEY, DOGFIGHT_API_PORT: String(B.port) });
  try {
    const ip = '198.51.100.40';
    for (let round = 0; round < 3; round++) {                                  // six rounds an address, left, three times over
      const cs = [];
      for (let i = 0; i < 6; i++) cs.push(await client(M.port, ip));
      assert.ok(cs.every(c => c.status === 101), `round ${round}: refused`);
      for (const c of cs) c.send({ t: 'hi', cv: 2 });
      for (const c of cs) await c.wait(m => m.t === 'start');
      assert.equal((await health(M.port)).rounds, 6);
      for (const c of cs) c.send({ t: 'bye' });
      await sleep(200);
      assert.ok(cs.every(c => c.closed), 'the service kept a connection after bye');
      assert.equal((await health(M.port)).rounds, 0);
      const tok = cs[0].msgs.find(m => m.t === 'start').token, again = await client(M.port, ip);
      again.send({ t: 'hi', cv: 2, resume: tok });                             // a round left can't be picked up again
      assert.equal((await again.wait(m => m.t === 'no')).why, 'gone');
      again.end();
      await sleep(100);
    }
    assert.equal(B.got.length, 0);                                             // (nothing left is ranked)
  } finally { M.kill('SIGKILL'); B.srv.close(); }
});

test('picked up again: the ticks and the fill lost on the way come again, in order; a dead connection is replaced', async () => {
  const B = await backend();
  const M = await startMarket({ STOCK_MARKET_KEY: KEY, DOGFIGHT_API_PORT: String(B.port) });
  try {
    const c = await client(M.port, '203.0.113.30');
    c.send({ t: 'hi', cv: 2 });
    const tok = (await c.wait(m => m.t === 'start')).token;
    await c.wait(m => m.t === 'k' && m.k > 30);
    // the service writes ticks and a fill, the page never gets them (the network went away under them)
    c.deaf = true;
    c.send({ t: 'op', op: 2, n: 1 });
    await sleep(150);
    const had = lastTick(c);
    assert.ok(!c.msgs.some(m => m.t === 'f'));
    c.end();
    const c2 = await client(M.port, '203.0.113.30');
    c2.send({ t: 'hi', cv: 2, resume: tok, from: had, nf: 0 });
    const back = await c2.wait(m => m.t === 'back');
    assert.ok(back.tick > had, `nothing was missed? had ${had}, service at ${back.tick}`);
    const first = await c2.wait(m => m.t === 'k');
    assert.equal(first.k, had + 1);                                            // straight on from what the page had
    const f = await c2.wait(m => m.t === 'f' && m.n === 1);
    assert.ok(f.k > 30 && f.k <= back.tick, `fill at ${f.k}`);
    assert.ok(c2.msgs.indexOf(f) < c2.msgs.indexOf(first));                     // (fills first: the page holds one till its tick)
    // the connection dies without a word (the service still thinks it's there): a new one with the token takes over
    await c2.wait(m => m.t === 'k' && m.k > f.k + 20);
    c2.deaf = true;
    const had2 = lastTick(c2);
    const c3 = await client(M.port, '203.0.113.30');
    c3.send({ t: 'hi', cv: 2, resume: tok, from: had2, nf: 1 });
    await c3.wait(m => m.t === 'back');
    await sleep(100);
    assert.ok(c2.closed, 'the old connection was kept');
    assert.equal((await c3.wait(m => m.t === 'k')).k, had2 + 1);
    let live = c3;
    await playOut(() => live);
    const end = await c3.wait(m => m.t === 'end', 20000);
    assert.ok(!c3.msgs.some(m => m.t === 'f' && m.n === 1));                     // (it had that fill: not sent again)
    // every tick once, in order, across the three connections, and each the market's own
    const P = prices(c, c2, c3), m = S.make(end.seeds);
    assert.equal(P.length, S.TICKS * 3);
    for (let k = 0; k < S.TICKS; k++) for (let s = 0; s < 3; s++) assert.equal(P[k * 3 + s], m.stocks[s].P[S.HIST + k], `tick ${k}`);
    assert.deepEqual(end.acts, [[f.k, 2]]);
    c3.end();
  } finally { M.kill('SIGKILL'); B.srv.close(); }
});

test('a drop at the close: the answer is kept for the round\'s token, and the page gets it when it comes back', async () => {
  const B = await backend(1200);                                              // the backend takes its time ranking it
  const M = await startMarket({ STOCK_MARKET_KEY: KEY, DOGFIGHT_API_PORT: String(B.port) });
  try {
    const c = await client(M.port, '203.0.113.31');
    c.send({ t: 'hi', cv: 2 });
    const tok = (await c.wait(m => m.t === 'start')).token;
    await c.wait(m => m.t === 'k' && m.k > 30);
    c.send({ t: 'op', op: 2, n: 1 });
    await c.wait(m => m.t === 'f');
    await playOut(() => c);
    await c.wait(m => m.t === 'k' && m.k + m.p.length / 3 === S.TICKS, 20000);   // the last tick: the backend is ranking it now
    c.end();                                                                   // … and the page drops
    const c2 = await client(M.port, '203.0.113.31');                           // back while the backend is still at it
    c2.send({ t: 'hi', cv: 2, resume: tok, from: lastTick(c), nf: 1 });
    await c2.wait(m => m.t === 'back');
    const end = await c2.wait(m => m.t === 'end', 5000);
    assert.deepEqual(end.up, { id: 7, on_board: true, rank_today: 1, rank_all: 3 });
    await sleep(300);
    assert.ok(c2.closed);
    // and again later, from a page that missed the last 50 ticks too: those, then the same answer, at once
    const c3 = await client(M.port, '203.0.113.31');
    c3.send({ t: 'hi', cv: 2, resume: tok, from: S.TICKS - 51, nf: 1 });
    const end3 = await c3.wait(m => m.t === 'end', 1000);
    assert.deepEqual([end3.up, end3.seeds], [end.up, end.seeds]);
    const ks = c3.msgs.filter(m => m.t === 'k');
    assert.deepEqual(ks.map(m => [m.k, m.p.length / 3]), [[S.TICKS - 50, 50]]);
    assert.ok(c3.msgs.indexOf(ks[0]) < c3.msgs.indexOf(end3));
    await sleep(300);
    assert.ok(c3.closed);
    assert.equal(B.got.length, 1);                                             // (ranked once)
    assert.equal((await health(M.port)).results, 1);
  } finally { M.kill('SIGKILL'); B.srv.close(); }
});

test('at real speed a tick goes out on its own, as it happens (one a message, every 100 ms): pages of every version read it', async () => {
  const M = await startMarket({ STOCK_MARKET_KEY: KEY, STOCK_MARKET_SPEED: '1' });
  try {
    const c = await client(M.port, '203.0.113.41');
    c.send({ t: 'hi', cv: 2 });
    await c.wait(m => m.t === 'start');
    await c.wait(m => m.t === 'k', 4000);
    const at = [];                                                             // when each 'k' came in
    let seen = c.msgs.length;
    const t0 = Date.now();
    while (Date.now() - t0 < 1500) {
      await sleep(2);
      for (; seen < c.msgs.length; seen++) if (c.msgs[seen].t === 'k') at.push([Date.now(), c.msgs[seen]]);
    }
    assert.ok(at.length >= 13 && at.length <= 16, `${at.length} messages in 1.5 s`);
    for (const [, m] of at) assert.equal(m.p.length, 3, `tick ${m.k} came with ${m.p.length / 3 - 1} others`);
    for (let i = 1; i < at.length; i++) {
      assert.equal(at[i][1].k, at[i - 1][1].k + 1);
      const gap = at[i][0] - at[i - 1][0];
      assert.ok(gap > 50 && gap < 150, `${gap} ms between ticks ${at[i - 1][1].k} and ${at[i][1].k}`);
    }
    c.send({ t: 'bye' });
  } finally { M.kill('SIGKILL'); }
});
