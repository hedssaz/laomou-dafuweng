'use strict';
// =====================================================================================================
//  老谋炒股 · the market. A round is a pure function of its seed: three 狗股 over three 交易日 of 40 seconds at 10 ticks a
//  second, the news that moves them and the overnight 跳空 between the days. The player's trades are a list of [tick, op];
//  run(seed, acts) replays them and gives the money at the close of day 3. The page plays it, the server re-runs it
//  (dogfight/stock_verify.js, a byte-identical copy) before a result goes on the board.
//  Integers only (prices and money in units of ¥0.0001, moves in basis points; no Math.exp / Math.log / floats that could
//  round differently in Safari's engine and Node's), so the same seed and trades give the same yuan everywhere.
//  Rules version: bump VERSION whenever a price or a rule changes, copy this file to the server as stock_sim.js and keep
//  the old one there (and next to the game, for replays) as stock_sim_v<N>.js / sim_v<N>.js.
//  v2 (11-08): long or short, 1× / 3× / 10× leverage, 爆仓. v3 (11-08): three days with overnight news and gaps, three
//  stocks, one piece of news at a time with a 1.5 s warning, news sources you can learn to trust (or not), a ¥5 minimum fee,
//  a seed per day (the next one only after today's trades are in), nothing new opened while a stock sits on a board.
// =====================================================================================================
(function (root) {
  const VERSION = 3;
  const TPS = 10, BEAT = 5, BAR = 20;   // 120 BPM: a beat is 5 ticks, a bar 2 s
  const DAYS = 3, DAY = 400, TICKS = DAY * DAYS;   // three trading days of 40 s; tick t is day floor(t / DAY)
  const PREVIEW = DAY - 80;             // 明日预告 shows 8 s before the close (still time to decide what to hold overnight)
  const HIST = 300;                     // 30 s of prices before the first open, so the chart isn't empty at the start
  const PU = 10000;                     // units per yuan
  const START = 10000 * PU;             // ¥10,000
  const FEE_BP = 15;                    // 0.15 % of what is traded (each way, on the whole leveraged amount) …
  const MIN_FEE = 5 * PU;               // … but at least ¥5 a trade (印花税 + 佣金): mashing the buttons costs money
  const MIN_PRICE = 500;                // ¥0.05
  const LEAD = 3 * BEAT;                // news shows, the price starts moving three beats (1.5 s) later
  const LEAD_LM = 4 * BEAT;             // 老谋's countdown: 我 · 丢 · 雷 · 老某！ then it hits
  const HALT = 4 * BEAT;                // 熔断: no trading for 2 s
  const SHAKE = 4;                      // ticks of 洗盘 / 诱多 before a run to the limit
  const GAP_MIN = 60;                   // at least 6 s between one piece of news and the next
  const MAX_ACTS = 800;
  const LEVS = [1, 3, 10];
  const MAINT = 20;                     // 爆仓 when a position is down to 20 % of its margin; what is left is lost
  const CAP = 100000 * PU;              // one stock's position is at most ¥100,000 (at its entry prices)

  // the 狗股 (dog = 老谋格斗 roster index). 老谋币 is in every round, two of the others join it.
  const DEFS = [
    { name: '老谋币', code: 'LMB', dog: 23, lo: 8, hi: 14, vol: 30, color: '#ff8a1e' },
    { name: '海豹股份', code: 'SEAL', dog: 20, lo: 40, hi: 60, vol: 14, color: '#bfe3ff' },
    { name: '熔岩科技', code: 'LAVA', dog: 11, lo: 20, hi: 34, vol: 24, color: '#ff5a1a' },
    { name: '苔藓农业', code: 'MOSS', dog: 18, lo: 5, hi: 9, vol: 18, color: '#b6bd1d' },
    { name: '青花瓷文旅', code: 'CHINA', dog: 15, lo: 60, hi: 90, vol: 16, color: '#5b7be0' },
    { name: '赛博狗链', code: 'CYBR', dog: 7, lo: 2, hi: 4, vol: 36, color: '#d24bff' },
    { name: '巧克力食品', code: 'CHOC', dog: 19, lo: 15, hi: 25, vol: 18, color: '#c27a45' },
    { name: '冰雪能源', code: 'ICE', dog: 12, lo: 25, hi: 40, vol: 20, color: '#96c8ff' },
    { name: '彩虹娱乐', code: 'RNBW', dog: 5, lo: 10, hi: 18, vol: 24, color: '#ff3fa4' },
  ];
  const N = 3;                          // stocks in a round

  // news kinds (v2's GOOD / BAD are one kind here, NEWS, with sent = +1 / -1)
  const NEWS = 1, CHAT = 3, MEME = 4, BULL = 5, BEAR = 6, CRASH = 7, MOON = 8, DRUNK = 9;
  // where news comes from: 狗市快讯 is right; 群聊小道消息 is right half the time; when 老谋喝多了 it mostly goes the other way
  const SRC_NEWS = 0, SRC_CHAT = 1, SRC_DRUNK = 2;

  // ---------- randomness: integer only ----------
  function mix(a) {
    a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
    a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
    return (a ^ (a >>> 16)) >>> 0;
  }
  function rng(seed) {
    let s = seed >>> 0;
    const f = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
    f.int = (a, b) => a + (f() % (b - a + 1));          // a..b inclusive
    f.noise = v => f.int(-v, v) + f.int(-v, v) + f.int(-v, v);   // about v basis points either way, bell-shaped
    return f;
  }
  const pct = (p, bp) => Math.trunc(p * bp / 10000);     // bp of a price, rounded toward zero (unbiased)
  const glide = (from, to, i, n) => Math.trunc((to - from) * (i + 1) / n) - Math.trunc((to - from) * i / n);

  // ---------- the round's news ----------
  // Every day has a seed of its own. The client only gets tomorrow's after today's trades are committed to the server
  // (dogfight.py chains the tickets), so the prices of a day can't be known before that day starts, and tonight's 明日预告
  // (made from today's seed) only says what the news is: whether it comes true, and by how much, comes from tomorrow's.
  // A day's deck: two 快讯, one 群聊 or 老谋喝多了, one more of 群聊 / 老谋喝多了 / 妖股 / 大盘, and one day in four 老谋
  // himself; shuffled and dealt out one at a time (at least 6 s apart, each after the last has played out).
  function makeDay(seed, d) {
    const r = rng(mix((seed ^ 0xA5A5A5A5) + d));
    const extra = [CHAT, DRUNK, MEME, r.int(0, 1) ? BULL : BEAR][r.int(0, 3)];
    const deck = [NEWS, NEWS, r.int(0, 1) ? CHAT : DRUNK, extra];
    for (let i = deck.length - 1; i > 0; i--) { const j = r.int(0, i); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    if (r.int(0, 99) < 25) deck.splice(r.int(d === 0 ? 1 : 0, deck.length), 0, r.int(0, 99) < 70 ? CRASH : MOON);
    const events = [];
    let at = r.int(30, 45);
    for (const type of deck) {
      const e = build(r, type, d * DAY + at);
      if (e.end - d * DAY > PREVIEW - 10) continue;        // no room left today
      events.push(e);
      at = Math.max(at + GAP_MIN, e.end - d * DAY + r.int(15, 30));
    }
    // tonight's 明日预告 (not after day 3): one or two headlines, each about a stock, from a source, saying up or down
    const night = [];
    if (d < DAYS - 1) {
      const n = r.int(0, 1) ? 2 : 1, first = r.int(0, N - 1);
      for (let i = 0; i < n; i++) {
        const w = r.int(0, 99);
        night.push({ s: (first + i) % N, src: w < 40 ? SRC_NEWS : w < 75 ? SRC_CHAT : SRC_DRUNK, sent: r.int(0, 1) ? 1 : -1, v: r.int(0, 999) });
      }
    }
    return { events, night };
  }
  // what last night's headlines turned out to be, from the new day's seed: 快讯 right 85 %, 群聊 50 %, 老谋喝多了 25 %
  function outcome(seed, d, items) {
    const r = rng(mix((seed ^ 0x0F0F0F0F) + d));
    return items.map(it => {
      const hit = r.int(0, 99), right = it.src === SRC_NEWS ? hit < 85 : it.src === SRC_CHAT ? hit < 50 : hit < 25;
      const g = it.src === SRC_NEWS ? (right ? r.int(900, 1800) : r.int(300, 700)) : r.int(500, 1400);
      return Object.assign({}, it, { dir: right ? it.sent : -it.sent, g, lock: g >= 1000 ? r.int(15, 40) : 0 });
    });
  }
  function build(r, type, news) {
    const e = { type, news, target: -1, v: r.int(0, 999) };
    if (type === NEWS || type === CHAT || type === DRUNK || type === MEME) e.target = r.int(0, 99) < 40 ? 0 : r.int(0, N - 1);   // 老谋币 a bit more
    if (type === MOON) e.target = 0;
    if (type === NEWS) {
      e.src = SRC_NEWS;
      e.sent = r.int(0, 1) ? 1 : -1;
      e.at = news + LEAD;
      e.g = r.int(1100, 2000);
      e.ramp = r.int(7, 12);
      e.lock = r.int(10, 20);
      // once the board opens: more often some of it goes back, but four times in ten it keeps going (连板): betting against
      // the board is a gamble, not a sure thing (and during the board only closing is allowed, see trade)
      e.back = r.int(-60, 80);
      e.tail = r.int(20, 28);
      e.shake = r.int(0, 99) < 35 ? r.int(400, 900) : 0;   // 洗盘 / 诱多 first: harmless at 1×, can 爆仓 a 10×
      e.end = e.at + (e.shake ? SHAKE : 0) + e.ramp + e.lock + e.tail;
    } else if (type === CHAT) {
      e.src = SRC_CHAT;
      e.sent = r.int(0, 1) ? 1 : -1;
      e.real = r.int(0, 1) === 1;
      e.g = r.int(600, 1200);
      e.at = news + LEAD;
      e.news2 = e.real ? -1 : e.at + 8;                    // 辟谣
      e.end = e.at + 24;
    } else if (type === DRUNK) {
      e.src = SRC_DRUNK;
      e.sent = r.int(0, 1) ? 1 : -1;
      e.dir = r.int(0, 99) < 25 ? e.sent : -e.sent;        // mostly the other way
      e.g = r.int(600, 1300);
      e.at = news + LEAD;
      e.dur = 20;
      e.end = e.at + e.dur + 6;
    } else if (type === MEME) {
      e.at = news + LEAD;
      e.g = r.int(0, 6) ? r.int(-1000, 2600) : r.int(5000, 8000);
      e.dur = 40;
      e.end = e.at + e.dur;
    } else if (type === BULL || type === BEAR) {
      e.at = news + LEAD;
      e.g = r.int(400, 800) * (type === BULL ? 1 : -1);
      e.dur = 40;
      e.end = e.at + e.dur;
    } else if (type === CRASH) {
      e.at = news + LEAD_LM;
      e.g = r.int(800, 1400);
      e.back = r.int(45, 95);
      e.tail = 30;
      e.end = e.at + HALT + e.tail;
    } else {                                               // MOON: 老谋币 only
      e.at = news + LEAD_LM;
      e.g = r.int(2500, 4500);
      e.ramp = 10;
      e.lock = r.int(12, 18);
      e.back = r.int(-30, 80);
      e.tail = 25;
      e.shake = 0;
      e.sent = 1;
      e.end = e.at + e.ramp + e.lock + e.tail;
    }
    return e;
  }

  // ---------- prices ----------
  function pickStocks(seed) {
    const r = rng(mix(seed ^ 0x5EED5EED)), rest = [];
    for (let i = 1; i < DEFS.length; i++) rest.push(i);
    for (let i = rest.length - 1; i > 0; i--) { const j = r.int(0, i); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    return [0].concat(rest.slice(0, N - 1));
  }
  const goodSeeds = seeds => Array.isArray(seeds) && seeds.length >= 1 && seeds.length <= DAYS && seeds.every(x => Number.isInteger(x) && x >= 0 && x <= 0xFFFFFFFF);

  // seeds: the days' seeds known so far (1 to 3); the market is made up to the end of the last of those days (later
  // ticks stay empty). Day d's prices depend only on seeds[0..d].
  function make(seeds) {
    if (!goodSeeds(seeds)) throw new Error('bad seeds');
    const known = seeds.length, ids = pickStocks(seeds[0]);
    const days = seeds.map((sd, d) => makeDay(sd, d));
    const events = [].concat(...days.map(x => x.events));
    const nights = days.slice(0, DAYS - 1).map(x => x.night);
    const opens = [];                                          // what last night's news did, for the days we know
    for (let d = 1; d < known; d++) opens[d] = outcome(seeds[d], d, nights[d - 1]);
    const stocks = ids.map((id, s) => {
      const d0 = DEFS[id], P = new Array(HIST + TICKS).fill(0), L = new Int8Array(TICKS);
      const R = seeds.map((sd, d) => rng(mix((sd + Math.imul(977, id + 1) + Math.imul(131, d)) >>> 0) ^ 0x51ED27));
      let r = R[0], p = r.int(d0.lo * PU, d0.hi * PU), trend = 0;
      const base = Math.trunc(d0.vol * 7 / 10);                // quieter between the news than v2: the chart is worth reading
      const mine = events.filter(e => e.target === s || e.target === -1);
      let st = null;
      for (let k = 0; k < HIST + known * DAY; k++) {
        const t = k - HIST;
        let drift = 0, vol = base, lock = 0, set = -1;
        // the open of day 2 and 3: the night's news moves it (跳空), a big one opens on the board (一字板)
        if (t > 0 && t % DAY === 0) {
          r = R[t / DAY];
          const item = opens[t / DAY].find(x => x.s === s);
          set = p + pct(p, item ? item.dir * item.g : r.noise(40));
          st = item && item.lock ? { e: null, lim: set, up: item.dir > 0, n: item.lock } : null;
        }
        if (k % 100 === 0 || (t > 0 && t % DAY === 0)) trend = r.int(-3, 2);
        if (st && st.e === null) {                             // still on the opening board
          if (st.n > 0) { set = st.lim; lock = st.up ? 1 : -1; st.n--; }
          else st = null;
        }
        const e = t >= 0 && !(st && st.e === null) ? mine.find(x => x.news <= t && t < x.end) : null;
        if (e && (!st || st.e !== e)) st = { e, p0: 0, base: 0 };
        if (e) {
          const ty = e.type;
          if (t < e.at) {                                      // between the news and the move: a small hint (快讯 only)
            if (ty === NEWS || ty === MOON) drift = pct(p, 3 * (e.sent || 1));
            if (ty === CRASH) { drift = pct(p, -3); vol = vol * 3 >> 1; }
          } else {
            if (t === e.at) st.p0 = p;
            const p0 = st.p0;
            if (ty === NEWS || ty === MOON) {
              const up = e.sent > 0, lim = p0 + (up ? 1 : -1) * pct(p0, e.g), sh = e.shake ? SHAKE : 0;
              const i = t - e.at - sh;
              if (i < 0) {                                     // 洗盘 / 诱多
                const j = i + sh, dest = p0 - (up ? 1 : -1) * pct(p0, e.shake);
                set = j < 2 ? p0 + Math.trunc((dest - p0) * (j + 1) / 2) : dest + pct(dest, r.noise(vol));
              } else {
                if (i === 0) st.base = p;
                const b = st.base;
                if (i < e.ramp) {
                  const a = i + 1, prev = b + Math.trunc((lim - b) * i * (2 * e.ramp - i) / (e.ramp * e.ramp));
                  const next = b + Math.trunc((lim - b) * a * (2 * e.ramp - a) / (e.ramp * e.ramp));
                  drift = next - prev;
                  vol = vol >> 1;
                  if (a === e.ramp) set = lim;
                  else { const q = p + drift + pct(p, r.noise(vol)); set = up ? Math.min(q, lim - 1) : Math.max(q, lim + 1); }
                } else if (i < e.ramp + e.lock) { set = lim; lock = up ? 1 : -1; }
                else {
                  const j = i - e.ramp - e.lock, dest = lim - Math.trunc((lim - p0) * e.back / 100);
                  drift = glide(lim, dest, j, e.tail);
                  vol = vol * 3 >> 1;
                }
              }
            } else if (ty === CHAT) {
              const s2 = e.sent, i = t - e.at;
              if (e.real) { if (i < 15) drift = glide(p0, p0 + s2 * pct(p0, e.g), i, 15); }
              else if (i < 8) drift = glide(p0, p0 + s2 * pct(p0, Math.trunc(e.g / 3)), i, 8);
              else {
                const from = p0 + s2 * pct(p0, Math.trunc(e.g / 3)), j = i - 8;
                if (j < 12) drift = glide(from, p0 - s2 * pct(p0, Math.trunc(e.g * 7 / 10)), j, 12);
                vol = vol * 3 >> 1;
              }
            } else if (ty === DRUNK) {
              const i = t - e.at;
              if (i < e.dur) { drift = glide(p0, p0 + e.dir * pct(p0, e.g), i, e.dur); vol = vol * 3 >> 1; }
            } else if (ty === MEME) {
              drift = glide(p0, p0 + pct(p0, e.g), t - e.at, e.dur);
              vol = vol * 3;
            } else if (ty === BULL || ty === BEAR) {
              drift = glide(p0, p0 + pct(p0, e.g), t - e.at, e.dur);
            } else if (ty === CRASH) {
              const low = p0 - pct(p0, e.g), i = t - e.at;
              if (i < HALT) { set = low; lock = 2; }
              else { drift = glide(low, low + Math.trunc((p0 - low) * e.back / 100), i - HALT, e.tail); vol = vol * 3 >> 1; }
            }
          }
        }
        if (set >= 0) p = set;
        else p = p + drift + pct(p, trend + r.noise(vol));
        if (p < MIN_PRICE) p = MIN_PRICE;
        P[k] = p;
        if (t >= 0) L[t] = lock;
      }
      return { id, def: d0, P, L };
    });
    return { v: VERSION, seeds: seeds.slice(), known, stocks, events, nights, opens };
  }

  // ---------- the player's account (as v2, with three stocks and a ¥5 minimum fee) ----------
  // One position per stock: long (dir 1) or short (dir -1), at 1× / 3× / 10×. margin = the cash put up; the position is
  // worth margin + dir × (shares × price − what the shares cost at entry), never less than nothing.
  // op = stock * 32 + lev * 8 + kind. kind 0-2: the 买 side (a quarter / half / all): opens or adds to a long, or closes
  // that share of a short. kind 3-5: the 卖 side: closes that share of a long, or opens / adds to a short. lev (0-2 =
  // 1× / 3× / 10×) is read only when a position is opened; adding keeps the position's own.
  // Locks act on the order's side: 涨停 = the 买 side can't trade, 跌停 = the 卖 side can't; 熔断 stops both. And while a
  // stock sits on a board nothing new can be opened on it, either way: only closing (a long on 涨停, a short on 跌停).
  // Positions are kept overnight: the next day opens with its 跳空 (and a 爆仓 at the open if it goes the wrong way).
  const QUARTERS = [1, 2, 4, 1, 2, 4];
  const feeOf = amt => Math.max(MIN_FEE, Math.floor(amt * FEE_BP / 10000));
  function account() {
    return { cash: START, dir: new Array(N).fill(0), lev: new Array(N).fill(0), sh: new Array(N).fill(0),
      basis: new Array(N).fill(0), margin: new Array(N).fill(0), paid: new Array(N).fill(0),
      trades: 0, wins: 0, best: 0, worst: 0, limitSells: 0, fails: 0, liqs: 0, shorts: 0, fees: 0 };
  }
  const price = (m, s, t) => m.stocks[s].P[HIST + t];
  function posValue(a, s, p) {
    if (a.sh[s] <= 0) return 0;
    return Math.max(0, a.margin[s] + a.dir[s] * (a.sh[s] * p - a.basis[s]));
  }
  function liqPrice(a, s) {
    const n = a.sh[s];
    if (n <= 0) return 0;
    const keep = a.margin[s] - Math.trunc(a.margin[s] * MAINT / 100);
    return a.dir[s] > 0 ? Math.max(0, Math.trunc((a.basis[s] - keep) / n)) : Math.trunc((a.basis[s] + keep) / n);
  }
  function trade(m, a, t, op) {
    const s = op >> 5, lv = (op >> 3) & 3, kind = op & 7, q4 = QUARTERS[kind], p = price(m, s, t), lock = m.stocks[s].L[t];
    const side = kind < 3 ? 1 : -1;
    if (lock === 2) return fail(a, 'halt');
    if (side > 0 && lock === 1) return fail(a, 'limit_up');
    if (side < 0 && lock === -1) return fail(a, 'limit_down');
    if (a.sh[s] > 0 && a.dir[s] !== side) return close1(a, s, q4 === 4 ? a.sh[s] : Math.max(1, Math.trunc(a.sh[s] * q4 / 4)), p, lock, false);
    if (lock !== 0) return fail(a, 'board');
    const lev = a.sh[s] > 0 ? a.lev[s] : LEVS[lv];
    const budget = q4 === 4 ? a.cash : Math.trunc(a.cash * q4 / 4);
    let n = Math.min(Math.floor(budget * lev * 10000 / (p * (10000 + lev * FEE_BP))), Math.floor((CAP - a.basis[s]) / p));
    if (n <= 0 && a.sh[s] > 0 && a.basis[s] + p > CAP) return fail(a, 'cap');
    let amt = n * p, margin = Math.ceil(amt / lev), fee = feeOf(amt);
    while (n > 0 && margin + fee > Math.min(a.cash, budget + MIN_FEE)) { n--; amt = n * p; margin = Math.ceil(amt / lev); fee = feeOf(amt); }
    if (n <= 0 || margin + fee > a.cash) return fail(a, 'no_cash');
    a.cash -= margin + fee;
    a.fees += fee;
    if (a.sh[s] === 0) { a.dir[s] = side; a.lev[s] = lev; if (side < 0) a.shorts++; }
    a.sh[s] += n;
    a.basis[s] += amt;
    a.margin[s] += margin;
    a.paid[s] += fee;
    return { ok: true, open: true, dir: side, lev, s, n, p, amt, margin, fee };
  }
  function close1(a, s, n, p, lock, liq) {
    const all = n >= a.sh[s], N0 = a.sh[s];
    if (all) n = N0;
    const part = v => (all ? v : Math.trunc(v * n / N0));
    const basis = part(a.basis[s]), margin = part(a.margin[s]), paid = part(a.paid[s]), dir = a.dir[s], lev = a.lev[s];
    const amt = n * p, fee = liq ? 0 : feeOf(amt);
    const back = liq ? 0 : Math.max(0, margin + dir * (amt - basis) - fee);
    const pnl = back - margin - paid;
    a.cash += back;
    if (!liq) a.fees += fee;
    a.sh[s] -= n;
    a.basis[s] -= basis;
    a.margin[s] -= margin;
    a.paid[s] -= paid;
    if (a.sh[s] === 0) { a.dir[s] = 0; a.lev[s] = 0; a.basis[s] = 0; a.margin[s] = 0; a.paid[s] = 0; }
    a.trades++;
    if (pnl > 0) a.wins++;
    if (pnl > a.best) a.best = pnl;
    if (pnl < a.worst) a.worst = pnl;
    if (liq) a.liqs++;
    else if (lock === dir) a.limitSells++;
    return { ok: true, open: false, dir, lev, s, n, p, amt, fee, pnl, back, liq, onLimit: !liq && lock === dir };
  }
  function fail(a, why) { a.fails++; return { ok: false, why }; }
  function liquidate(m, a, t) {
    const out = [];
    for (let s = 0; s < N; s++) {
      if (a.sh[s] <= 0) continue;
      const p = price(m, s, t);
      if (a.margin[s] + a.dir[s] * (a.sh[s] * p - a.basis[s]) <= Math.trunc(a.margin[s] * MAINT / 100)) out.push(close1(a, s, a.sh[s], p, 0, true));
    }
    return out;
  }
  function close(m, a) {
    const out = [];
    for (let s = 0; s < N; s++) if (a.sh[s] > 0) out.push(close1(a, s, a.sh[s], price(m, s, TICKS - 1), 0, false));
    return out;
  }
  function equity(m, a, t) {
    let v = a.cash;
    for (let s = 0; s < N; s++) v += posValue(a, s, price(m, s, t));
    return v;
  }

  function checkActs(acts) {
    if (!Array.isArray(acts) || acts.length > MAX_ACTS) return 'bad_acts';
    let last = 0;
    for (const x of acts) {
      if (!Array.isArray(x) || x.length !== 2) return 'bad_acts';
      const [t, op] = x;
      if (!Number.isInteger(t) || !Number.isInteger(op) || t < last || t >= TICKS || op < 0 || op >= N * 32 || (op & 7) > 5 || ((op >> 3) & 3) > 2) return 'bad_acts';
      last = t;
    }
    return null;
  }
  // the whole round from the three days' seeds and the trades: what the server checks
  function run(seeds, acts) {
    if (!goodSeeds(seeds) || seeds.length !== DAYS) return { ok: false, error: 'bad_seed' };
    const bad = checkActs(acts);
    if (bad) return { ok: false, error: bad };
    const m = make(seeds), a = account();
    let i = 0;
    for (let t = 0; t < TICKS; t++) {
      liquidate(m, a, t);
      while (i < acts.length && acts[i][0] === t) trade(m, a, t, acts[i++][1]);
    }
    close(m, a);
    return { ok: true, version: VERSION, cash: a.cash, trades: a.trades, wins: a.wins, best: a.best, worst: a.worst,
      limitSells: a.limitSells, fails: a.fails, liqs: a.liqs, fees: a.fees };
  }

  const api = { VERSION, goodSeeds, makeDay, outcome, TPS, BEAT, BAR, DAYS, DAY, PREVIEW, TICKS, HIST, PU, START, FEE_BP, MIN_FEE, LEAD, LEAD_LM, HALT, SHAKE, GAP_MIN,
    MAX_ACTS, LEVS, MAINT, CAP, DEFS, N, NEWS, CHAT, MEME, BULL, BEAR, CRASH, MOON, DRUNK, SRC_NEWS, SRC_CHAT, SRC_DRUNK,
    rng, mix, make, account, trade, liquidate, close, equity, posValue, liqPrice, price, checkActs, run };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockSim = api;
})(typeof window !== 'undefined' ? window : this);
