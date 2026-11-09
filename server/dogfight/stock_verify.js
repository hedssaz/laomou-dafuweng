'use strict';
// 老谋炒股: re-runs one uploaded round. stdin: {"v", "seed" (v1/v2) or "seeds" (v3: the three days' 32-bit
// seeds; v4: their 128-bit hex), "acts"}.
// stdout: {version, ok, cash, trades} or {version, ok:false, error}.
// stock_sim.js here must be byte-identical to the game's game/stock/sim.js (copy it whenever the game changes). Older
// rules stay next to it as stock_sim_v<N>.js, so results played on them can still be re-run (v1: long only; v2: 60 s, four stocks;
// v3: today's rules on 32-bit seeds).
const fs = require('fs'), path = require('path');
let Sim = require('./stock_sim.js');
const MAX = 64 * 1024;
let buf = '';
const out = o => process.stdout.write(JSON.stringify(Object.assign({ version: Sim.VERSION }, o)));
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => {
  buf += d;
  if (buf.length > MAX) { out({ ok: false, error: 'too_long' }); process.exit(0); }
});
process.stdin.on('end', () => {
  let rep;
  try { rep = JSON.parse(buf); } catch (e) { out({ ok: false, error: 'bad_json' }); return; }
  const v = rep && Number.isInteger(rep.v) ? rep.v : 0, other = path.join(__dirname, `stock_sim_v${v}.js`);
  if (v && v !== Sim.VERSION && v > 0 && v < 100 && fs.existsSync(other)) Sim = require(other);
  if (!rep || rep.v !== Sim.VERSION) { out({ ok: false, error: 'bad_version' }); return; }
  let r;
  try { r = Sim.run(v >= 3 ? rep.seeds : rep.seed, rep.acts); } catch (e) { r = { ok: false, error: 'bad_replay' }; }
  out(r.ok ? { ok: true, cash: r.cash, trades: r.trades } : { ok: false, error: r.error });
});
