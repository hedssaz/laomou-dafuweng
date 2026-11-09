'use strict';
// =====================================================================================================
//  老谋炒股 · the market. A round is a pure function of its seed: four 狗股, 60 seconds of prices at 10 ticks a second,
//  and the news that moves them. The player's trades are a list of [tick, op]; run(seed, acts) replays them and gives the
//  money at the close. The page plays it, the server re-runs it (dogfight/stock_verify.js, a byte-identical copy) before a
//  result goes on the board.
//  Integers only (prices and money in units of ¥0.0001, moves in basis points; no Math.exp / Math.log / floats that could
//  round differently in Safari's engine and Node's), so the same seed and trades give the same yuan everywhere.
//  Rules version: bump VERSION whenever a price or a rule changes, and copy this file to the server.
// =====================================================================================================
(function (root) {
  const VERSION = 1;
  const TPS = 10, BEAT = 5, BAR = 20, BARS = 30, TICKS = BAR * BARS;   // 120 BPM: a beat is 5 ticks, a bar 2 s
  const HIST = 300;                     // 30 s of prices before the open, so the chart isn't empty at the start
  const PU = 10000;                     // units per yuan
  const START = 10000 * PU;             // ¥10,000
  const FEE_BP = 12;                    // 0.12 % a trade (each way): spamming buy/sell costs
  const MIN_PRICE = 500;                // ¥0.05
  const LEAD = 2 * BEAT;                // news shows, the price starts moving two beats later
  const LEAD_LM = 4 * BEAT;             // 老谋's countdown: 我 · 丢 · 雷 · 老某！ then it hits on the next bar
  const HALT = 4 * BEAT;                // 熔断: no trading for a bar
  const MAX_ACTS = 600;

  // the 狗股 (dog = 老谋格斗 roster index). 老谋币 is in every round, three of the others join it.
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
  const N = 4;                          // stocks in a round

  // news kinds
  const GOOD = 1, BAD = 2, RUMOR = 3, MEME = 4, BULL = 5, BEAR = 6, CRASH = 7, MOON = 8;

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

  // ---------- the round's news ----------
  // A fixed deck (four good, three bad, two rumours, one 妖股, one market-wide, one 老谋), shuffled and dealt onto every
  // other bar from bar 1 on, so every seed has the same amount of chances and the boards compare like with like.
  function makeEvents(seed, n) {
    const r = rng(mix(seed ^ 0xA5A5A5A5));
    const deck = [GOOD, GOOD, GOOD, GOOD, BAD, BAD, BAD, RUMOR, RUMOR, MEME, r.int(0, 1) ? BULL : BEAR];
    for (let i = deck.length - 1; i > 0; i--) { const j = r.int(0, i); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    deck.splice(r.int(4, 7), 0, r.int(0, 99) < 62 ? CRASH : MOON);
    const free = new Array(n).fill(0), out = [];
    let bar = 1;
    for (const type of deck) {
      for (let tries = 0; tries < 8 && bar <= BARS - 2; tries++, bar++) {
        const news = bar * BAR, all = type === BULL || type === BEAR || type === CRASH;
        let target = -1;
        if (all) {
          if (free.some(f => f > news)) continue;
        } else if (type === MOON) {
          if (free[0] > news) continue;
          target = 0;
        } else {
          const ok = [];
          for (let s = 0; s < n; s++) if (free[s] <= news) ok.push(s);
          if (!ok.length) continue;
          let w = 0;
          for (const s of ok) w += s === 0 ? 3 : 2;    // 老谋币 is in the news a bit more
          let k = r.int(0, w - 1);
          for (const s of ok) { k -= s === 0 ? 3 : 2; if (k < 0) { target = s; break; } }
        }
        const e = { type, news, target, v: r.int(0, 999) };
        if (type === GOOD || type === BAD) {
          e.at = news + LEAD;
          e.g = r.int(1300, 2400);             // to the limit, bp
          e.ramp = r.int(7, 12);
          e.lock = r.int(10, 22);
          e.back = type === GOOD ? r.int(50, 80) : r.int(25, 55);   // % given back once the board opens
          e.tail = r.int(20, 28);
          e.end = e.at + e.ramp + e.lock + e.tail;
        } else if (type === RUMOR) {
          e.at = news + LEAD;
          e.sent = r.int(0, 1) ? 1 : -1;       // what the rumour says
          e.real = r.int(0, 1) === 1;           // whether it is true (a coin flip: rumours are a gamble)
          e.g = r.int(500, 900);
          e.news2 = e.real ? -1 : e.at + 8;    // 辟谣
          e.end = e.at + 22;
        } else if (type === MEME) {
          e.at = news + LEAD;
          // where the frenzy ends up, bp: mostly -12 % … +28 %, one in seven a 翻倍妖股
          e.g = r.int(0, 6) ? r.int(-1200, 2800) : r.int(5000, 9000);
          e.dur = 40;
          e.end = e.at + e.dur;
        } else if (type === BULL || type === BEAR) {
          e.at = news + LEAD;
          e.g = r.int(500, 900) * (type === BULL ? 1 : -1);
          e.dur = 40;
          e.end = e.at + e.dur;
        } else if (type === CRASH) {
          e.at = news + LEAD_LM;
          e.g = r.int(800, 1400);              // the gap down, bp
          e.back = r.int(45, 95);              // % of it won back after the halt
          e.tail = 30;
          e.end = e.at + HALT + e.tail;
        } else {                               // MOON: 老谋币 only
          e.at = news + LEAD_LM;
          e.g = r.int(3000, 5000);
          e.ramp = 10;
          e.lock = r.int(12, 18);
          e.back = r.int(55, 80);
          e.tail = 25;
          e.end = e.at + e.ramp + e.lock + e.tail;
        }
        if (all) free.fill(e.end + BEAT); else free[target] = e.end + BEAT;
        out.push(e);
        bar += 2;
        break;
      }
    }
    return out;
  }

  // ---------- prices ----------
  function pickStocks(seed) {
    const r = rng(mix(seed ^ 0x5EED5EED)), rest = [];
    for (let i = 1; i < DEFS.length; i++) rest.push(i);
    for (let i = rest.length - 1; i > 0; i--) { const j = r.int(0, i); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    return [0].concat(rest.slice(0, N - 1));
  }

  function make(seed) {
    seed = seed >>> 0;
    const ids = pickStocks(seed), events = makeEvents(seed, N);
    const stocks = ids.map((id, s) => {
      const d = DEFS[id], r = rng(mix((seed + Math.imul(977, id + 1)) >>> 0) ^ 0x51ED27);
      const P = new Array(HIST + TICKS), L = new Int8Array(TICKS);
      let p = r.int(d.lo * PU, d.hi * PU), trend = 0;
      const mine = events.filter(e => e.target === s || e.target === -1);
      let st = null;                                           // the event being played on this stock, and its state
      for (let k = 0; k < HIST + TICKS; k++) {
        const t = k - HIST;
        if (k % 100 === 0) trend = r.int(-4, 3);               // a slow lean every 10 s (a little more often down): charts are worth reading
        let drift = 0, vol = d.vol, lock = 0, set = -1;
        const e = t >= 0 ? mine.find(x => x.news <= t && t < x.end) : null;
        if (e && (!st || st.e !== e)) st = { e, p0: 0 };
        if (e) {
          const ty = e.type;
          if (t < e.at) {                                      // between the news and the move: a small hint
            if (ty === GOOD || ty === MOON) drift = pct(p, 4);
            else if (ty === BAD || ty === CRASH) drift = pct(p, -4);
            if (ty === CRASH) vol = vol * 3 >> 1;
          } else {
            if (t === e.at) st.p0 = p;
            const p0 = st.p0, i = t - e.at;
            if (ty === GOOD || ty === BAD || ty === MOON) {
              const up = ty !== BAD, lim = p0 + (up ? 1 : -1) * pct(p0, e.g);
              if (i < e.ramp) {                                // ease out to the limit
                const a = i + 1, prev = p0 + Math.trunc((lim - p0) * i * (2 * e.ramp - i) / (e.ramp * e.ramp));
                const next = p0 + Math.trunc((lim - p0) * a * (2 * e.ramp - a) / (e.ramp * e.ramp));
                drift = next - prev;
                vol = vol >> 1;
                if (a === e.ramp) set = lim;
              } else if (i < e.ramp + e.lock) {                // 涨停 / 跌停 板: flat, and one side can't trade
                set = lim;
                lock = up ? 1 : -1;
              } else {                                         // the board opens: some of it goes back
                const j = i - e.ramp - e.lock, dest = lim - Math.trunc((lim - p0) * e.back / 100);
                drift = Math.trunc((dest - lim) * (j + 1) / e.tail) - Math.trunc((dest - lim) * j / e.tail);
                vol = vol * 3 >> 1;
              }
              if (i < e.ramp && set < 0) {                     // don't touch the limit before the last ramp tick
                const q = p + drift + pct(p, r.noise(vol));
                set = up ? Math.min(q, lim - 1) : Math.max(q, lim + 1);
              }
            } else if (ty === RUMOR) {
              const s = e.sent;
              if (e.real) {
                const dest = p0 + s * pct(p0, e.g);
                if (i < 15) drift = Math.trunc((dest - p0) * (i + 1) / 15) - Math.trunc((dest - p0) * i / 15);
              } else if (i < 8) {
                const dest = p0 + s * pct(p0, Math.trunc(e.g / 3));
                drift = Math.trunc((dest - p0) * (i + 1) / 8) - Math.trunc((dest - p0) * i / 8);
              } else {                                         // 辟谣: the other way
                const from = p0 + s * pct(p0, Math.trunc(e.g / 3)), dest = p0 - s * pct(p0, e.g), j = i - 8;
                if (j < 12) drift = Math.trunc((dest - from) * (j + 1) / 12) - Math.trunc((dest - from) * j / 12);
                vol = vol * 3 >> 1;
              }
            } else if (ty === MEME) {                          // 妖股: wild, and on average up
              const dest = p0 + pct(p0, e.g);
              drift = Math.trunc((dest - p0) * (i + 1) / e.dur) - Math.trunc((dest - p0) * i / e.dur);
              vol = vol * 4;
            } else if (ty === BULL || ty === BEAR) {
              const dest = p0 + pct(p0, e.g);
              drift = Math.trunc((dest - p0) * (i + 1) / e.dur) - Math.trunc((dest - p0) * i / e.dur);
            } else if (ty === CRASH) {                         // 熔断: gap down, a bar with no trading, then a bounce
              const low = p0 - pct(p0, e.g);
              if (i < HALT) { set = low; lock = 2; }
              else {
                const j = i - HALT, dest = low + Math.trunc((p0 - low) * e.back / 100);
                drift = Math.trunc((dest - low) * (j + 1) / e.tail) - Math.trunc((dest - low) * j / e.tail);
                vol = vol * 3 >> 1;
              }
            }
          }
        }
        if (set >= 0) p = set;
        else p = p + drift + pct(p, trend + r.noise(vol));
        if (p < MIN_PRICE) p = MIN_PRICE;
        P[k] = p;
        if (t >= 0) L[t] = lock;
      }
      return { id, def: d, P, L };
    });
    return { v: VERSION, seed, stocks, events };
  }

  // ---------- the player's account ----------
  // op = stock * 8 + kind; kinds 0-2 buy a quarter / half / all of the cash, 3-5 sell a quarter / half / all of the stock
  const QUARTERS = [1, 2, 4, 1, 2, 4];
  function account() {
    return { cash: START, sh: new Array(N).fill(0), cost: new Array(N).fill(0), trades: 0, wins: 0, best: 0, worst: 0,
      limitSells: 0, fails: 0 };
  }
  const price = (m, s, t) => m.stocks[s].P[HIST + t];
  // what one op does at tick t: {ok, ...} or {ok:false, why}
  function trade(m, a, t, op) {
    const s = op >> 3, kind = op & 7, q4 = QUARTERS[kind], p = price(m, s, t), lock = m.stocks[s].L[t];
    if (kind < 3) {
      if (lock === 2) return fail(a, 'halt');
      if (lock === 1) return fail(a, 'limit_up');
      const budget = q4 === 4 ? a.cash : Math.trunc(a.cash * q4 / 4);
      const n = Math.floor(budget * 10000 / (p * (10000 + FEE_BP)));
      if (n <= 0) return fail(a, 'no_cash');
      const amt = n * p, fee = Math.floor(amt * FEE_BP / 10000);
      a.cash -= amt + fee;
      a.sh[s] += n;
      a.cost[s] += amt + fee;
      return { ok: true, buy: true, s, n, p, amt, fee };
    }
    if (lock === 2) return fail(a, 'halt');
    if (lock === -1) return fail(a, 'limit_down');
    if (a.sh[s] <= 0) return fail(a, 'no_stock');
    return sell(a, s, q4 === 4 ? a.sh[s] : Math.max(1, Math.trunc(a.sh[s] * q4 / 4)), p, lock === 1);
  }
  function sell(a, s, n, p, onLimit) {
    const amt = n * p, fee = Math.floor(amt * FEE_BP / 10000);
    const base = n === a.sh[s] ? a.cost[s] : Math.trunc(a.cost[s] * n / a.sh[s]);
    const pnl = amt - fee - base;
    a.cash += amt - fee;
    a.sh[s] -= n;
    a.cost[s] -= base;
    a.trades++;
    if (pnl > 0) a.wins++;
    if (pnl > a.best) a.best = pnl;
    if (pnl < a.worst) a.worst = pnl;
    if (onLimit) a.limitSells++;
    return { ok: true, buy: false, s, n, p, amt, fee, pnl, onLimit };
  }
  function fail(a, why) { a.fails++; return { ok: false, why }; }
  // the bell: whatever is still held is sold at the last price (locks don't matter any more)
  function close(m, a) {
    const out = [];
    for (let s = 0; s < N; s++) if (a.sh[s] > 0) out.push(sell(a, s, a.sh[s], price(m, s, TICKS - 1), false));
    return out;
  }
  function equity(m, a, t) {
    let v = a.cash;
    for (let s = 0; s < N; s++) v += a.sh[s] * price(m, s, t);
    return v;
  }

  function checkActs(acts) {
    if (!Array.isArray(acts) || acts.length > MAX_ACTS) return 'bad_acts';
    let last = 0;
    for (const x of acts) {
      if (!Array.isArray(x) || x.length !== 2) return 'bad_acts';
      const [t, op] = x;
      if (!Number.isInteger(t) || !Number.isInteger(op) || t < last || t >= TICKS || op < 0 || (op & 7) > 5 || (op >> 3) >= N) return 'bad_acts';
      last = t;
    }
    return null;
  }
  // the whole round from the seed and the trades: what the server checks
  function run(seed, acts) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) return { ok: false, error: 'bad_seed' };
    const bad = checkActs(acts);
    if (bad) return { ok: false, error: bad };
    const m = make(seed), a = account();
    for (const [t, op] of acts) trade(m, a, t, op);
    close(m, a);
    return { ok: true, version: VERSION, cash: a.cash, trades: a.trades, wins: a.wins, best: a.best, worst: a.worst,
      limitSells: a.limitSells, fails: a.fails };
  }

  const api = { VERSION, TPS, BEAT, BAR, BARS, TICKS, HIST, PU, START, FEE_BP, LEAD, LEAD_LM, HALT, MAX_ACTS, DEFS, N,
    GOOD, BAD, RUMOR, MEME, BULL, BEAR, CRASH, MOON, rng, mix, make, account, trade, close, equity, price, checkActs, run };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockSim = api;
})(typeof window !== 'undefined' ? window : this);
