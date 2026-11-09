'use strict';
// =====================================================================================================
//  老谋大富翁 · 老谋游戏 (was 老谋炒股; renamed 11-08, with a disclaimer to agree to first) — 60 seconds on the dog market. Four 狗股 tick live; ¥10,000 to start. News pops up on the beat:
//  官宣利好 → it runs to 涨停 (and then you can't buy any more), 利空 → 跌停 (and then you can't sell), 传闻 might be
//  辟谣'd, 妖股 go mad, and when 老谋 swears (「我丢雷老某」) the whole market 熔断s. Sell into the 涨停 board, dodge the
//  跌停, and see how many times over you can turn the money. The round is a seed (sim.js); the trades are a list, and the
//  server re-runs both before a result goes on the board.
//  Layout: portrait world 720 wide (height follows the screen), landscape world 720 tall; scaled to fit the window.
// =====================================================================================================
// ---------- 部署配置（开源版）：全部留空 = 纯静态页面，只能玩练习局 ----------
//  API_BASE   排行榜 / 回放 / 游玩人数的后端（本仓库不含），例 'https://example.com/v1/dogfight'
//  MARKET_WS  排位局行情服务（server/stock_market.mjs）的 WebSocket 地址，例 'ws://127.0.0.1:8794/stock'；
//             以 / 开头则按本页同源拼成 ws(s)://本站/…，例 '/dogfight/stock'。连不上就自动改成练习局
//  SHARE_SITE 分享图上印的网址，要和 assets/qr.png 的二维码一致（自己部署就两个一起换）
const CONFIG = { API_BASE: '', MARKET_WS: '', SHARE_SITE: 'hedssaz.com/game/dafuweng' };
const S = window.StockSim;
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ' +
  '"Noto Sans CJK SC", "Source Han Sans SC", sans-serif';
const UP = '#ff3b55', DOWN = '#19c97a', GOLD = '#ffcf3a', INK = '#fff', MUTED = '#c7b6e6', PANEL = '#2a1240', DEEP = '#1b0f2e';
const TICKS = S.TICKS, HIST = S.HIST, PU = S.PU, START = S.START;
// what a piece of news is, whatever rules version made it (v1/v2 types as they are; v3's 快讯 is GOOD or BAD by its sent,
// its 群聊 a RUMOR): e.kind, set by normEvents
const K = { GOOD: 1, BAD: 2, RUMOR: 3, MEME: 4, BULL: 5, BEAR: 6, CRASH: 7, MOON: 8, DRUNK: 9 };
const CANDLE = 10;                                 // ticks per candle (1 s)
const SHOW = 34;                                   // candles on the chart
// how much: q when nothing is held (押 that much of the cash), h when something is (the same share of what is held or of the
// cash), s on the 收手 button (11-08: plain words for people who never traded: no 仓 / 平 / 空单)
const FRACS = [{ q: '押¼', h: '¼', s: '收¼' }, { q: '押一半', h: '一半', s: '收一半' }, { q: '全押', h: '全部', s: '全收' }];
const LEV_NAME = ['不放大', '放大3×', '放大10×'];
const LEV_SAY = ['不放大：涨跌多少就赚赔多少，最稳', '放大3×：赚的、赔的都×3', '放大10×：赚赔都×10，反着走一点就爆仓'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const TEST = /[?&]test=1/.test(location.search);

// the 狗股 as the page shows them (sim.js DEFS has the numbers): short name for the headlines
const DOGNAME = { LMB: '老谋币', SEAL: '海豹', LAVA: '熔岩狗', MOSS: '苔藓狗', CHINA: '青花瓷狗', CYBR: '赛博狗', CHOC: '巧克力狗', ICE: '冰雪狗', RNBW: '彩虹狗' };
const TABNAME = { LMB: '老谋币', SEAL: '海豹', LAVA: '熔岩', MOSS: '苔藓', CHINA: '青花瓷', CYBR: '赛博', CHOC: '巧克力', ICE: '冰雪', RNBW: '彩虹' };
const SHORT = { LMB: '老谋', SEAL: '海豹', LAVA: '熔岩狗', MOSS: '苔藓狗', CHINA: '青花瓷狗', CYBR: '赛博狗', CHOC: '巧克力狗', ICE: '冰雪狗', RNBW: '彩虹狗' };
// headlines: per stock first, then the generic ones ({d} = the dog). Picked by the event's own number, so a seed always reads the same.
const NEWS = {
  [K.GOOD]: {
    all: ['{d}登上抖音热榜第一', '{d}代言辣条，一夜卖空', '{d}合成出了限定海豹', '{d}打赢了逆天难度电脑', '{d}直播带货破纪录',
      '狗狗日报头版：{d}太可爱了', '{d}获神秘富豪狗 10 亿打赏', '{d}新品狗粮被抢光', '{d}被评为年度最萌狗'],
    LMB: ['老谋骂人上热搜！', '老谋表情包刷屏全网', '「我丢雷老某」成年度热词'], SEAL: ['海豹在海洋馆表演爆火', '海豹拿下游泳冠军'],
    LAVA: ['熔岩科技发布喷火狗窝', '熔岩狗烤的肠卖爆了'], MOSS: ['苔藓农业种出了狗粮树', '苔藓狗获评环保大使'],
    CHINA: ['青花瓷狗拍出天价', '青花瓷狗进了故宫展'], CYBR: ['赛博狗链上线大交易所', '赛博狗链：每只狗发一个币'],
    CHOC: ['巧克力狗推出狗能吃的巧克力', '巧克力狗情人节订单爆单'], ICE: ['寒潮来了！冰雪能源订单暴增', '冰雪狗拿下冬奥会赞助'],
    RNBW: ['彩虹狗新歌霸榜', '彩虹娱乐演唱会门票秒空'],
  },
  [K.BAD]: {
    all: ['{d}偷吃狗粮被抓现行', '{d}掉毛严重，粉丝脱粉', '{d}直播骂粉丝，翻车了', '{d}被曝造假？狗狗警察介入', '{d}被海豹打了一顿',
      '{d}拆家视频曝光', '{d}代言的狗粮被曝难吃'],
    LMB: ['老谋骂错人了，被反骂', '老谋被禁言 24 小时'], SEAL: ['海豹被举报！', '海豹偷渡被抓了'],
    LAVA: ['熔岩科技：火山熄火了', '熔岩狗把公司烧了'], MOSS: ['大旱！苔藓全干了', '苔藓狗被除草机误伤'],
    CHINA: ['青花瓷狗被鉴定是仿的', '青花瓷狗摔了一跤，裂了'], CYBR: ['赛博狗链被黑客偷了', '赛博狗链：服务器拔电了'],
    CHOC: ['巧克力狗被太阳晒化了', '巧克力狗被查出代可可脂'], ICE: ['暖冬来了，冰雪能源没人买', '冰雪狗的冰箱坏了'],
    RNBW: ['彩虹狗假唱被抓', '彩虹娱乐演唱会退票潮'],
  },
  rumorUp: ['传闻：{d}要上春晚', '网传：{d}要被收购了', '小道消息：{d}要出新皮肤', '传闻：{d}要和老谋联名'],
  rumorDown: ['传闻：{d}要退市？', '网传：{d}老板跑路了', '小道消息：{d}被查了', '传闻：{d}要被海豹收购'],
  drunkUp: ['老谋喝多了：{d}给我涨！', '老谋喝多了：{d}要起飞了！', '老谋喝多了：all in {d}！'],
  drunkDown: ['老谋喝多了：{d}要完蛋了', '老谋喝多了：{d}迟早跌没', '老谋喝多了：快跑，{d}不行了'],
  [K.MEME]: ['{d}被老谋点名，突然疯了！', '{d}一下子火遍全网！', '全场狗狗集体冲进{d}'],
  [K.BULL]: ['狗市牛市来了！全体起飞', '狗粮降价，全市场大涨'],
  [K.BEAR]: ['海豹集体做空狗市', '狗粮涨价，全市场大跌'],
  [K.CRASH]: ['老谋怒了：我丢雷老某！'],
  [K.MOON]: ['我丢雷老某！老谋币起飞！'],
};
const TAGS = {
  [K.GOOD]: { tag: '利好', mark: '好', bg: UP, hint: '要涨！快点「押涨」，涨到头（涨停）就押不进了' },
  [K.BAD]: { tag: '利空', mark: '空', bg: '#11a866', hint: '要跌！快点「押跌」，跌到头（跌停）就押不进了' },
  rumor: { tag: '传闻', mark: '传', bg: '#7a6a99', hint: '小道消息，可能是真的，也可能被辟谣' },
  debunk: { tag: '辟谣', mark: '谣', bg: '#7a6a99', hint: '假消息！价格要往回走了' },
  [K.DRUNK]: { tag: '醉话', mark: '醉', bg: '#b14bff', hint: '老谋喝多了说的，常常反着来' },
  [K.MEME]: { tag: '疯狗', mark: '疯', bg: '#b14bff', hint: '乱涨乱跌，敢不敢赌一把？' },
  [K.BULL]: { tag: '大盘', mark: '牛', bg: '#ff9a1f', hint: '全部一起涨，押涨就对了' },
  [K.BEAR]: { tag: '大盘', mark: '熊', bg: '#11a866', hint: '全部一起跌，押涨的快收手，可以押跌' },
  [K.CRASH]: { tag: '熔断', mark: '熔', bg: '#e0112b', hint: '老谋要骂人了！押涨的快收手，敢的押跌！' },
  [K.MOON]: { tag: '起飞', mark: '飞', bg: '#ff7a12', hint: '老谋币要冲了！快押涨！' },
};
// where news comes from (rules v3): learn whom to trust
const SRC = [{ name: '狗市快讯', trust: '靠谱', bg: '#e0112b' }, { name: '群聊小道', trust: '一半是假的', bg: '#7a6a99' }, { name: '老谋喝多了', trust: '常常反着来', bg: '#b14bff' }];
const NIGHT = {
  news: [['{d}明天公布大喜事', '{d}拿下大订单，明天公布'], ['{d}明天要被罚款', '{d}闯祸了，明天公布']],
  chat: [['听说{d}明天要涨停', '内部消息：明天拉{d}'], ['听说{d}明天要出事', '内部消息：明天砸{d}']],
  drunk: [['{d}明天必涨！谁不买谁后悔', '明天{d}起飞，我说的'], ['{d}明天必跌！快跑', '明天{d}要完，我说的']],
};
function nightHead(m, it) {
  const d = SHORT[m.stocks[it.s].def.code], key = ['news', 'chat', 'drunk'][it.src], list = NIGHT[key][it.sent > 0 ? 0 : 1];
  return list[it.v % list.length].replace('{d}', d);
}
// what a round's money makes you (multiple of the start)
const RANKS = [
  { min: 0, name: '韭菜狗', dog: '02', quip: '我丢雷老某，钱呢？' },
  { min: 0.7, name: '接盘狗', dog: '08', quip: '高位站岗，风景不错' },
  { min: 0.95, name: '保本狗', dog: '17', quip: '忙活一分钟，白干' },
  { min: 1.1, name: '小赚狗', dog: '01', quip: '够买两包辣条了' },
  { min: 1.5, name: '高手狗', dog: '09', quip: '有点东西啊' },
  { min: 2.2, name: '土豪狗', dog: '10', quip: '涨停冲锋队队长' },
  { min: 3, name: '狗市大鳄', dog: '11', quip: '散户狗瑟瑟发抖' },
  { min: 4, name: '大富翁狗', dog: '16', quip: '老谋都得叫你一声哥' },
  { min: 8, name: '狗市传说', dog: '07', quip: '庄家都在抄你的作业' },
  { min: 16, name: '老谋本谋', dog: '23', quip: '我丢雷老某，你才是老谋' },
];
const WIPED = { name: '爆仓狗', dog: '12', quip: '我丢雷老某，裤衩都亏没了', wiped: true };
const rankOf = mult => RANKS.reduce((r, x) => (mult >= x.min ? x : r), RANKS[0]);

// ---------- saved on this device (conveniences only) ----------
const SAVE_KEY = 'laomou-stock-v1';
let save = { best: 0, plays: 0, muted: false, mine: [] };
try { save = Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* private mode */ }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

// ---------- the backend (CONFIG.API_BASE): play counts, seeds, the board (best effort, never blocks the game) ----------
const API = CONFIG.API_BASE || (/[?&]api=local/.test(location.search) ? 'http://127.0.0.1:8779/v1/dogfight' : null);
// 浏览器 ID: the same one 老谋格斗 keeps ('dogfight-bid'), sent with uploads so a ban can follow a browser
const BID = (() => {
  const make = () => {
    const a = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (let i = 0; i < 16; i++) a[i] = Math.random() * 256;
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  try {
    let v = localStorage.getItem('dogfight-bid');
    if (!/^[0-9a-f]{32}$/.test(v || '')) { v = make(); localStorage.setItem('dogfight-bid', v); }
    return v;
  } catch (e) { return make(); }
})();
async function apiFetch(path, opts, ms) {
  if (!API || !window.fetch) throw new Error('离线');
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms || 8000) : 0;
  try {
    const r = await fetch(API + path, Object.assign({ cache: 'no-store', credentials: 'omit', mode: 'cors' }, opts, ctl ? { signal: ctl.signal } : {}));
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) throw Object.assign(new Error((data && data.message) || `服务器开小差了（${r.status}）`), { status: r.status });
    return data || {};
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('网络超时了');
    if (e instanceof TypeError) throw new Error('网络不给力');
    throw e;
  } finally { if (timer) clearTimeout(timer); }
}
const postJSON = (path, body, ms) => apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dogfight-Bid': BID }, body: JSON.stringify(body) }, ms);
let plays = null;
function loadPlays() { apiFetch('/stats?game=stock', {}, 6000).then(d => { if (d.players > 0) plays = d; }).catch(() => {}); }
const playsLine = () => (plays ? `已有 ${plays.players} 人玩过 · 今日 ${plays.today} 局` : '');
loadPlays();

// a seed for the next round, asked for ahead of time so 开盘 is instant; without the service the round is played on a
// local seed and just doesn't go on the board
// the market service (stock_market.mjs, 11-09): a ranked round's market runs there and comes here a tick at a time, once
// it has happened (a page holding the day's seed could work out the day's prices and pick its trades offline: GPT
// review #1). A local copy may point at one with ?mkt=ws://127.0.0.1:port/dogfight/stock.
const MKT = (() => {
  try {
    const q = new URLSearchParams(location.search).get('mkt');
    if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return q;
  } catch (e) { /* old browser */ }
  const u = CONFIG.MARKET_WS;
  if (!u) return null;
  return u[0] === '/' ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + u : u;
})();
const MKT_CV = 2;                                 // the market protocol this page speaks (stock_market.mjs PROTOCOL)
const PRACTICE = '练习局：不上榜';
// a day's seed for a local round: 128 bits as 32 hex digits (sim v4)
function localSeed() {
  const a = new Uint32Array(4);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < 4; i++) a[i] = Math.floor(Math.random() * 4294967296);
  let h = '';
  for (let i = 0; i < 4; i++) h += ('0000000' + a[i].toString(16)).slice(-8);
  return h;
}

// ---------- 游戏须知与免责声明 (index.html #terms) ----------
// Read to the end, tick 「我已阅读、理解并同意以上全部内容」, then 同意并开始: before the first round, the tutorial and any replay,
// and again whenever TERMS_VERSION goes up (change the text in index.html → bump it). Kept per version in this browser;
// where the browser keeps nothing it is asked once per page load. 不同意 goes back to /game/.
const TERMS_VERSION = 1, TERMS_KEY = 'laomou-dafuweng-terms';
const termsEl = document.getElementById('terms'), termsBody = document.getElementById('terms-body');
const termsCheck = document.getElementById('terms-check'), termsYes = document.getElementById('terms-yes');
const termsHint = document.getElementById('terms-hint'), termsLabel = document.getElementById('terms-check-label');
let termsMem = 0, termsThen = null;
function termsAgreed() {
  if (termsMem >= TERMS_VERSION) return true;
  try { return +(localStorage.getItem(TERMS_KEY) || 0) >= TERMS_VERSION; } catch (e) { return false; }
}
function requireTerms(then) {
  if (termsAgreed()) return then();
  termsThen = then;
  termsEl.hidden = false;
  termsBody.scrollTop = 0;
  termsCheck.checked = false;
  termsCheck.disabled = true;
  termsLabel.classList.add('off');
  termsYes.disabled = true;
  termsHint.hidden = false;
  termsHint.textContent = '请先往下滑，读到最后';
  ptr.down = false;
  setTimeout(termsScrolled, 50);                          // (a tall screen shows it all: nothing to scroll)
}
function termsScrolled() {
  if (termsBody.scrollTop + termsBody.clientHeight < termsBody.scrollHeight - 6 || !termsCheck.disabled) return;
  termsCheck.disabled = false;
  termsLabel.classList.remove('off');
  termsHint.textContent = '读完了，勾选上面这一项';
}
termsBody.addEventListener('scroll', termsScrolled, { passive: true });
termsCheck.addEventListener('change', () => {
  termsYes.disabled = !termsCheck.checked;
  termsHint.hidden = termsCheck.checked;
});
termsYes.addEventListener('click', () => {
  if (!termsCheck.checked) return;
  termsMem = TERMS_VERSION;
  try { localStorage.setItem(TERMS_KEY, String(TERMS_VERSION)); } catch (e) { /* this page load only */ }
  termsEl.hidden = true;
  const then = termsThen;
  termsThen = null;
  if (then) then();
});
document.getElementById('terms-no').addEventListener('click', () => { location.href = '/game/'; });

// ---------- the name: the one 老谋格斗 keeps ('dogfight-nick'), asked once ----------
const NAME_KEY = 'dogfight-nick', NAME_ASKED = 'dogfight-name-asked';
const nameForm = document.getElementById('name'), nameInput = document.getElementById('name-input');
let nameMem = null, nameThen = null, nameAskedMem = false;
function myName() {
  if (nameMem !== null) return nameMem;
  try { return (localStorage.getItem(NAME_KEY) || '').trim().slice(0, 12); } catch (e) { return ''; }
}
function nameAsked() { if (nameAskedMem) return true; try { return localStorage.getItem(NAME_ASKED) === '1' || !!myName(); } catch (e) { return true; } }
function typedName() {
  const v = nameInput.value.trim().slice(0, 12);
  if (!v || /^(请输入.*|输入.*|点击输入.*)$/.test(v)) return '';
  if (window.DogContentNames && window.DogContentNames.blocked(v)) return '';
  return v;
}
function openName(then) {
  nameThen = then || null;
  nameInput.value = myName();
  nameForm.hidden = false;
  ptr.down = false;
  setTimeout(() => { try { nameInput.focus(); } catch (e) { /* ignore */ } }, 50);
}
function closeName() {
  nameForm.hidden = true;
  nameInput.blur();
  nameAskedMem = true;
  try { localStorage.setItem(NAME_ASKED, '1'); } catch (e) { /* private mode */ }
  try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
  const then = nameThen;
  nameThen = null;
  if (then) then();
}
nameForm.addEventListener('submit', e => {
  e.preventDefault();
  const v = typedName();
  if (v) { try { localStorage.setItem(NAME_KEY, v); nameMem = localStorage.getItem(NAME_KEY) === v ? null : v; } catch (err) { nameMem = v; } }
  closeName();
});
document.getElementById('name-skip').addEventListener('click', () => closeName());

// ---------- sound: synthesised effects, a 120 BPM loop the news lands on, and 老谋's voice ----------
// 「我丢雷老某」: one of 合成大老谋's 43 clips (copied into assets/voice/) at random, none heard lately; a few kept ready,
// one more fetched after each
const VOICE_N = 43, VOICE_POOL = 3, VOICE_URL = 'assets/voice/';
const CHORDS = [[110, 220, 261.6, 329.6], [87.3, 174.6, 220, 261.6], [130.8, 261.6, 329.6, 392], [98, 196, 246.9, 293.7]];   // Am F C G
const SFX = {
  ctx: null, out: null, mus: null, noiseBuf: null, vPool: [], vLoading: 0, vRecent: [], vGen: 0, vAt: 0, vCur: null,
  unlock() {
    if (this.ctx && (this.stale && this.ctx.state !== 'running')) { try { this.ctx.close(); } catch (e) { /* closed */ } this.ctx = null; }
    this.stale = false;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      const c = this.ctx, comp = c.createDynamicsCompressor();
      comp.connect(c.destination);
      this.out = c.createGain();
      this.out.gain.value = save.muted ? 0 : 0.75;
      this.out.connect(comp);
      this.mus = c.createGain();
      this.mus.gain.value = 0.55;
      this.musLP = c.createBiquadFilter();
      this.musLP.type = 'lowpass';
      this.musLP.frequency.value = 18000;
      this.mus.connect(this.musLP);
      this.musLP.connect(this.out);
      this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050);
      s.connect(c.destination);
      s.start(0);
      this.vPool = []; this.vLoading = 0; this.vGen++;
      this.voiceFill();
      Music.reset();
    }
    if (this.ctx.state !== 'running') { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
  },
  setMuted(m) {
    save.muted = m;
    persist();
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.75, this.ctx.currentTime, 0.02);
  },
  // keep VOICE_POOL clips decoded and ready, each a random one not heard lately
  voiceFill() {
    const c = this.ctx, gen = this.vGen;
    if (!c) return;
    while (this.vPool.length + this.vLoading < VOICE_POOL) {
      let k, tries = 0;
      do k = 1 + Math.floor(Math.random() * VOICE_N);
      while ((this.vRecent.includes(k) || this.vPool.some(v => v.k === k)) && ++tries < 20);
      this.vRecent.push(k);
      if (this.vRecent.length > 8) this.vRecent.shift();
      this.vLoading++;
      fetch(`${VOICE_URL}${String(k).padStart(2, '0')}.mp3?v=1`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then(buf => new Promise((ok, no) => { const p = c.decodeAudioData(buf, ok, no); if (p && p.catch) p.catch(no); }))
        .then(b => { if (this.vGen === gen) this.vPool.push({ k, b }); }, () => {})
        .then(() => { if (this.vGen === gen) this.vLoading--; });
    }
  },
  // 老谋 swears at you (a different voice each time, never piled up)
  voice(force) {
    const c = this.ctx;
    if (!c || save.muted) return;
    const now = performance.now();
    if (!force && now - this.vAt < 2500) return;
    const v = this.vPool.shift();
    this.voiceFill();
    if (!v) return;
    this.vAt = now;
    if (this.vCur) { try { this.vCur.stop(); } catch (e) { /* over */ } }
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = v.b;
    g.gain.value = 0.5;
    s.connect(g);
    g.connect(this.out);
    s.start(0);
    this.vCur = s;
  },
  tone(f, dur, type, vol, f2, at, dest) {
    const c = this.ctx;
    if (!c) return;
    const t = at || c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.out);
    o.start(t);
    o.stop(t + dur + 0.03);
  },
  noise(dur, vol, ftype, f, f2, at, dest) {
    const c = this.ctx;
    if (!c) return;
    const t = at || c.currentTime, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    fl.type = ftype || 'lowpass';
    fl.frequency.setValueAtTime(f || 1000, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(dest || this.out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.03);
  },
  play(name, k) {
    if (!this.ctx) return;
    const T = this.ctx.currentTime;
    k = k || 0;
    switch (name) {
      case 'click': this.tone(880, 0.05, 'square', 0.08); break;
      case 'tab': this.tone(660, 0.04, 'triangle', 0.12); this.tone(990, 0.05, 'triangle', 0.08, 0, T + 0.03); break;
      case 'buy':                                   // ka-chunk
        this.noise(0.05, 0.25, 'bandpass', 2500); this.tone(520, 0.08, 'square', 0.1, 780);
        this.tone(1040, 0.12, 'triangle', 0.1, 0, T + 0.06); break;
      case 'sell': {                                // coins, higher with the streak
        const p = Math.pow(1.06, Math.min(k, 10));
        [988, 1319, 1568, 1976].forEach((f, i) => this.tone(f * p, 0.12, 'square', 0.07, 0, T + i * 0.05));
        this.noise(0.15, 0.12, 'highpass', 5000, 0, T + 0.02);
        break;
      }
      case 'bigsell': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.16, 'square', 0.09, 0, T + i * 0.06)); break;
      case 'loss': [440, 415, 392, 330].forEach((f, i) => this.tone(f, 0.18, 'sawtooth', 0.07, f * 0.97, T + i * 0.13)); break;
      case 'fail': this.tone(140, 0.18, 'square', 0.12, 110); this.tone(147, 0.18, 'square', 0.08, 115); break;
      case 'news': this.tone(1318, 0.09, 'triangle', 0.16); this.tone(1046, 0.16, 'triangle', 0.14, 0, T + 0.1); break;
      case 'newsbad': this.tone(659, 0.1, 'triangle', 0.16); this.tone(494, 0.2, 'triangle', 0.14, 0, T + 0.11); break;
      case 'siren':
        for (let i = 0; i < 4; i++) this.tone(700, 0.24, 'sawtooth', 0.07, 1100, T + i * 0.5);
        break;
      case 'count': this.tone(k ? 1046 : 784, k ? 0.3 : 0.12, 'square', 0.12); if (k) this.tone(1568, 0.3, 'square', 0.06); break;
      case 'word': this.tone(196 * Math.pow(1.19, k), 0.18, 'sawtooth', 0.12); this.noise(0.08, 0.2, 'bandpass', 900); break;
      case 'crash':
        this.noise(1.1, 0.7, 'lowpass', 2400, 60); this.tone(120, 0.9, 'sine', 0.55, 28); this.noise(0.25, 0.4, 'highpass', 2500, 500);
        break;
      case 'limitup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'square', 0.09, 0, T + i * 0.045)); this.noise(0.3, 0.15, 'bandpass', 3000, 6000); break;
      case 'limitdown': [784, 622, 523, 392].forEach((f, i) => this.tone(f, 0.12, 'square', 0.09, 0, T + i * 0.05)); this.tone(98, 0.4, 'sine', 0.3, 50); break;
      case 'tick': this.tone(k ? 1760 : 1320, 0.04, 'square', 0.07); break;
      case 'milestone': [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.2, 'square', 0.08, 0, T + i * 0.07)); break;
      case 'bell': [523, 1046, 1568].forEach((f, i) => this.tone(f, 1.6, 'sine', 0.22 - i * 0.05)); this.tone(262, 1.8, 'triangle', 0.12); break;
      case 'tally': this.tone(1200 + k * 40, 0.03, 'square', 0.04); break;
      case 'rank': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'square', 0.09, 0, T + i * 0.09)); this.noise(0.4, 0.2, 'highpass', 4000, 0, T + 0.4); break;
      case 'sad': [392, 370, 349, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, 0, T + i * 0.22)); break;
    }
  },
};

// the loop: Am F C G, a bar each (2 s at 120 BPM, the sim's own bar). level 0 title, 1 trading, 2 the last 10 s, 3 熔断 (just a pulse)
// how much to pull game time toward the music this frame (never enough to stop it: at most half a frame either way)
function musicNudge(dt) {
  const c = SFX.ctx;
  if (!c || c.state !== 'running' || !Music.on) return 0;
  const ct = c.currentTime;
  if (ct > Music.ct + 1e-4) Music.ctAt = clock;            // the audio clock moved since last frame
  Music.ct = ct;
  if (clock - Music.ctAt > 0.2) return 0;                  // it hasn't moved for a while: ignore it
  const d = ct - Music.t0 - (R.t + dt);
  // drifted apart: re-anchor the music (ranked: where the game is, not MUSIC_LEAD behind it: the buffer stays as it is)
  if (Math.abs(d) > 0.25) { Music.start(R.t + dt + (R.live ? MUSIC_LEAD : 0), Music.level); return 0; }
  return clamp(d * 0.2, -dt / 2, dt / 2);
}
// s the music's first note is put ahead of the audio clock (so it isn't late): game time, nudged to the music, runs this
// much behind the moment it was started at
const MUSIC_LEAD = 0.06;
const Music = {
  ct: 0, ctAt: -9,
  on: false, t0: 0, step: 0, level: 1, timer: 0,
  reset() { this.step = 0; },
  // start (or line up again) so that 16th step 0 is audio time t0; `at` = where in the loop we are, in seconds
  start(at, level) {
    const c = SFX.ctx;
    if (!c) return;
    this.on = true;
    this.level = level;
    this.t0 = c.currentTime + MUSIC_LEAD - at;
    this.step = Math.max(0, Math.ceil((c.currentTime + MUSIC_LEAD - this.t0) / 0.125));
    if (!this.timer) this.timer = setInterval(() => this.pump(), 25);
  },
  stop() { this.on = false; },
  pump() {
    const c = SFX.ctx;
    if (!this.on || !c || c.state !== 'running') return;
    while (this.t0 + this.step * 0.125 < c.currentTime + 0.12) {
      const t = this.t0 + this.step * 0.125;
      if (t > c.currentTime - 0.02) this.note(this.step, t);
      this.step++;
    }
  },
  note(n, t) {
    const L = this.level, st = n % 16, ch = CHORDS[Math.floor(n / 16) % 4], M = SFX.mus;
    if (L === 3) {                                         // 熔断: a heartbeat and nothing else
      if (st === 0 || st === 3) SFX.tone(70, 0.18, 'sine', 0.35, 40, t, M);
      return;
    }
    if (st % 4 === 0 && (L > 0 || st === 0 || st === 8)) SFX.tone(150, 0.13, 'sine', L ? 0.55 : 0.3, 42, t, M);   // kick
    if (L > 0 && (st === 4 || st === 12)) SFX.noise(0.12, 0.22, 'bandpass', 1800, 0, t, M);                       // clap
    if (st % 4 === 2) SFX.noise(0.04, L ? 0.12 : 0.06, 'highpass', 7000, 0, t, M);                                 // hat
    if (L === 2 && st % 2 === 1) SFX.noise(0.025, 0.06, 'highpass', 9000, 0, t, M);
    if (L > 0 && st % 2 === 0) SFX.tone(ch[0] * (st % 4 === 2 ? 2 : 1), 0.11, 'sawtooth', 0.06, 0, t, M);          // octave bass
    if (L === 0 && st === 0) ch.slice(1).forEach(f => SFX.tone(f, 1.6, 'triangle', 0.025, 0, t, M));             // pad
    if (L > 0 && (st === 2 || st === 7 || st === 10)) ch.slice(1).forEach(f => SFX.tone(f * 2, 0.08, 'square', 0.014, 0, t, M));   // stabs
    if (L === 2) SFX.tone(ch[1 + (st % 3)] * 2, 0.07, 'triangle', 0.03, 0, t, M);                               // arp
  },
  duck(on) { if (SFX.musLP) SFX.musLP.frequency.setTargetAtTime(on ? 500 : 18000, SFX.ctx.currentTime, 0.08); },
};
for (const ev of ['click', 'touchend', 'keyup']) document.addEventListener(ev, () => SFX.unlock(), true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (SFX.ctx) SFX.stale = true;
    if (scene === 'play' || scene === 'intro') pauseRound();
    Music.away = Music.on;
    Music.stop();
  } else {
    if (SFX.ctx && SFX.ctx.state !== 'running') { const p = SFX.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    // back: the title / result / day-end loop picks up again (a round stays on its pause screen until 继续玩)
    if (Music.away && scene !== 'pause' && scene !== 'play' && scene !== 'intro') Music.start(0, Music.level);
    Music.away = false;
  }
});
const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not here */ } };

// ---------- canvas, view and layout ----------
const cv = document.getElementById('game');
let ctx = cv.getContext('2d');
let DPR = 1, cw = 0, ch = 0, WW = 720, WH = 1280, PORT = true, view = { s: 1, ox: 0, oy: 0 }, Lay = {}, bgCache = null;
// the iPhone notch and home bar (viewport-fit=cover): the game stays inside env(safe-area-inset-*), the background doesn't
const safeProbe = document.createElement('div');
safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
  'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(safeProbe);
function safeInsets() {
  const cs = getComputedStyle(safeProbe), n = v => parseFloat(v) || 0;
  return { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
}
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cw = window.innerWidth;
  ch = window.innerHeight;
  cv.width = Math.round(cw * DPR);
  cv.height = Math.round(ch * DPR);
  cv.style.width = cw + 'px';
  cv.style.height = ch + 'px';
  const ins = safeInsets(), aw = Math.max(1, cw - ins.l - ins.r), ah = Math.max(1, ch - ins.t - ins.b);
  PORT = aw <= ah * 1.08;
  if (PORT) { WW = 720; WH = clamp(Math.round(720 * ah / aw), 1180, 1560); }
  else { WH = 720; WW = clamp(Math.round(720 * aw / ah), 1120, 1640); }
  const s = Math.min(aw / WW, ah / WH);
  view = { s, ox: ins.l + (aw - WW * s) / 2, oy: ins.t + (ah - WH * s) / 2 };
  bgCache = null;
  layout();
}
// 「跳过教程」 sits where nothing else is (11-08: at the top right it covered the day and the clock, and on a wide screen
// the cash panel): on a tall screen in the strip under 买涨 / 买跌, on a wide one under the chart, which gives up that
// strip while the tutorial runs (Lay.tut: which layout this is; render lays out again when it changes)
function layout() {
  const tut = !!(R && R.mode === 'tut');
  if (PORT) {
    const H = WH;
    Lay = {
      hud: { x: 0, y: 0, w: 720, h: 118 },
      tabs: { x: 12, y: 124, w: 696, h: 128 },
      chart: { x: 12, y: 262, w: 696, h: H - 262 - 518 },
      pos: { x: 12, y: H - 506, w: 696, h: 100 },
      chips: { x: 12, y: H - 396, w: 696, h: 66 },
      levs: { x: 12, y: H - 316, w: 696, h: 66 },
      btns: { x: 12, y: H - 236, w: 696, h: 180, row: true },
      skip: { x: 250, y: H - 42, w: 220, h: 36 },
    };
  } else {
    const RW = 470, LW = WW - RW;
    Lay = {
      hud: { x: 0, y: 0, w: LW, h: 96 },
      tabs: { x: 12, y: 104, w: LW - 24, h: 110 },
      chart: { x: 12, y: 224, w: LW - 24, h: 720 - 224 - 14 - (tut ? 56 : 0) },
      pos: { x: LW, y: 14, w: RW - 14, h: 142 },
      chips: { x: LW, y: 166, w: RW - 14, h: 64 },
      levs: { x: LW, y: 240, w: RW - 14, h: 64 },
      btns: { x: LW, y: 316, w: RW - 14, h: 390, row: false },
      skip: { x: (LW - 220) / 2, y: 720 - 54, w: 220, h: 40 },
    };
  }
  Lay.tut = tut;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
const toWorld = (x, y) => ({ x: (x - view.ox) / view.s, y: (y - view.oy) / view.s });

// ---------- pictures ----------
const IMG = {};
function img(src) { if (!IMG[src]) { const im = new Image(); im.src = src; IMG[src] = im; } return IMG[src]; }
const dogImg = d => img(`assets/dogs/${String(d).padStart(2, '0')}.webp?v=1`);
const faceImg = d => img(`assets/faces/${String(d).padStart(2, '0')}.webp?v=1`);
const MEME = img('assets/laomou.webp?v=1'), QR = img('assets/qr.png?v=2');
S.DEFS.forEach(d => { dogImg(d.dog); faceImg(d.dog); });
const ok = im => im && im.complete && im.naturalWidth > 0;

// ---------- drawing helpers ----------
function rr(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// a rounded rectangle added to the current path (a hole in a spotlight), without starting a new one
function rrSub(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function font(size, weight) { return `${weight || 900} ${size}px ${FONT}`; }
function txt(s, x, y, size, fill, o) {
  o = o || {};
  ctx.font = font(size, o.weight);
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = 'middle';
  if (o.max) { const w = ctx.measureText(s).width; if (w > o.max) { size = size * o.max / w; ctx.font = font(size, o.weight); } }
  if (o.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.sw || size / 6;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
}
function bigText(s, x, y, size, c1, c2, rot, max) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.font = font(size);
  if (max) { const w = ctx.measureText(s).width; if (w > max) { size *= max / w; ctx.font = font(size); } }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size / 4;
  ctx.strokeStyle = '#fff';
  ctx.strokeText(s, 0, 0);
  ctx.lineWidth = size / 8;
  ctx.strokeStyle = '#3a0a14';
  ctx.strokeText(s, 0, 0);
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, c1 || '#fffbe0');
  g.addColorStop(1, c2 || '#ff9a1a');
  ctx.fillStyle = g;
  ctx.fillText(s, 0, 0);
  ctx.restore();
}
let buttons = [];
// a chunky button: o.fill (colour or gradient), o.sub (a second, smaller line), o.dim (looks off but still answers)
function button(id, label, x, y, w, h, o) {
  o = o || {};
  const hot = ptr.down && ptr.btn === id;
  const dy = hot ? 5 : 0;
  ctx.save();
  if (!o.flat) { rr(x, y + 7, w, h, o.r || h / 3); ctx.fillStyle = o.shadow || 'rgba(10,2,24,0.55)'; ctx.fill(); }
  rr(x, y + dy, w, h, o.r || h / 3);
  ctx.fillStyle = o.fill || '#e0112b';
  ctx.fill();
  if (o.gloss !== false) {
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(0, y + dy, 0, y + dy + h * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + dy, w, h * 0.5);
    ctx.restore();
  }
  ctx.lineWidth = o.lw || 4;
  ctx.strokeStyle = o.line || '#fff';
  ctx.stroke();
  if (o.dim) { rr(x, y + dy, w, h, o.r || h / 3); ctx.fillStyle = 'rgba(30,14,50,0.55)'; ctx.fill(); }
  const size = o.size || h * 0.42, cy = y + dy + h / 2 - (o.sub ? size * 0.32 : 0);
  if (o.icon) {                                               // an icon, then the label (if any), centred together
    const is = o.iconSize || size * 1.05, gap = label ? size * 0.28 : 0;
    ctx.font = font(size);
    const tw = label ? Math.min(ctx.measureText(label).width, w - 24 - is - gap) : 0, x0 = x + w / 2 - (is + gap + tw) / 2;
    icon(o.icon, x0 + is / 2, cy, is, o.iconColor || '#fff');
    if (label) txt(label, x0 + is + gap, cy, size, o.color || '#fff', { align: 'left', stroke: o.stroke || '#2a0c22', sw: size / 6, max: tw });
  } else txt(label, x + w / 2, cy, size, o.color || '#fff', { stroke: o.stroke || '#2a0c22', sw: size / 6, max: w - 20 });
  if (o.sub) txt(o.sub, x + w / 2, cy + size * 0.82, o.subSize || size * 0.42, o.subColor || 'rgba(255,255,255,0.92)', { stroke: o.stroke || '#2a0c22', sw: 4, weight: 800, max: w - 16 });
  ctx.restore();
  buttons.push({ id, x, y, w, h });
}
// small icons drawn with shapes, centred on (x, y), s tall: no emoji anywhere in the game's own drawing (old Android
// webviews show them as empty boxes, 11-09). col: the main colour; every icon has a dark outline so it reads on anything.
const ICON_INK = '#2a0c22';
function icon(name, x, y, s, col) {
  const u = s / 24;                                            // drawn on a 24-unit grid
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(u, u);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const fillOut = (c, w) => { ctx.fillStyle = c || col; ctx.lineWidth = w || 3; ctx.strokeStyle = ICON_INK; ctx.stroke(); ctx.fill(); };
  const line = (c, w) => { ctx.lineWidth = (w || 2.6) + 2.4; ctx.strokeStyle = ICON_INK; ctx.stroke(); ctx.lineWidth = w || 2.6; ctx.strokeStyle = c || col; ctx.stroke(); };
  ctx.beginPath();
  if (name === 'trophy') {
    ctx.moveTo(-7, -10); ctx.lineTo(7, -10); ctx.lineTo(6, -2); ctx.quadraticCurveTo(4, 4, 0, 4); ctx.quadraticCurveTo(-4, 4, -6, -2); ctx.closePath(); fillOut();
    ctx.beginPath(); ctx.moveTo(-7, -8); ctx.quadraticCurveTo(-12, -8, -11, -3); ctx.quadraticCurveTo(-10, 0, -6, -1); line(col, 2);
    ctx.beginPath(); ctx.moveTo(7, -8); ctx.quadraticCurveTo(12, -8, 11, -3); ctx.quadraticCurveTo(10, 0, 6, -1); line(col, 2);
    ctx.beginPath(); ctx.rect(-2, 4, 4, 4); fillOut();
    ctx.beginPath(); ctx.rect(-6, 8, 12, 3.5); fillOut();
  } else if (name === 'book') {
    ctx.moveTo(0, -6); ctx.quadraticCurveTo(-6, -10, -11, -8); ctx.lineTo(-11, 8); ctx.quadraticCurveTo(-6, 6, 0, 10); ctx.quadraticCurveTo(6, 6, 11, 8);
    ctx.lineTo(11, -8); ctx.quadraticCurveTo(6, -10, 0, -6); ctx.closePath(); fillOut();
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 10); ctx.lineWidth = 2; ctx.strokeStyle = ICON_INK; ctx.stroke();
  } else if (name === 'help') {
    ctx.arc(0, 0, 10.5, 0, Math.PI * 2); fillOut();
    ctx.restore();
    txt('?', x, y + s * 0.02, s * 0.72, '#e0112b', { weight: 900 });
    return;
  } else if (name === 'news') {
    ctx.rect(-11, -9, 22, 18); fillOut();
    ctx.beginPath(); ctx.rect(-8, -6, 7, 6); ctx.fillStyle = '#e0112b'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(1, -5); ctx.lineTo(8, -5); ctx.moveTo(1, -1); ctx.lineTo(8, -1); ctx.moveTo(-8, 3); ctx.lineTo(8, 3); ctx.moveTo(-8, 6.5); ctx.lineTo(5, 6.5);
    ctx.lineWidth = 1.8; ctx.strokeStyle = ICON_INK; ctx.stroke();
  } else if (name === 'coin') {
    ctx.arc(0, 1, 10, 0, Math.PI * 2); fillOut();
    ctx.beginPath(); ctx.arc(0, 1, 6.5, 0, Math.PI * 2); ctx.lineWidth = 1.8; ctx.strokeStyle = ICON_INK; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(0, 1); ctx.lineTo(3, -3); ctx.moveTo(0, 1); ctx.lineTo(0, 6); ctx.moveTo(-3, 2); ctx.lineTo(3, 2); ctx.moveTo(-3, 4.5); ctx.lineTo(3, 4.5);
    ctx.lineWidth = 1.8; ctx.stroke();
  } else if (name === 'flame') {
    ctx.moveTo(0, -12); ctx.bezierCurveTo(8, -4, 10, 2, 8, 6); ctx.quadraticCurveTo(5, 12, 0, 12); ctx.quadraticCurveTo(-5, 12, -8, 6);
    ctx.bezierCurveTo(-10, 0, -5, -2, -4, -7); ctx.quadraticCurveTo(-2, -3, 0, -12); ctx.closePath(); fillOut(col || '#ff7a12');
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.bezierCurveTo(4, 2, 5, 6, 3, 9); ctx.quadraticCurveTo(0, 11, -3, 9); ctx.quadraticCurveTo(-5, 5, 0, -2); ctx.closePath();
    ctx.fillStyle = '#ffe14d'; ctx.fill();
  } else if (name === 'sound' || name === 'mute') {
    ctx.moveTo(-10, -4); ctx.lineTo(-5, -4); ctx.lineTo(1, -9); ctx.lineTo(1, 9); ctx.lineTo(-5, 4); ctx.lineTo(-10, 4); ctx.closePath(); fillOut();
    ctx.beginPath();
    if (name === 'sound') { ctx.arc(2, 0, 5, -0.9, 0.9); ctx.moveTo(2 + 9 * Math.cos(-0.9), 9 * Math.sin(-0.9)); ctx.arc(2, 0, 9, -0.9, 0.9); line(col, 2); }
    else { ctx.moveTo(5, -4); ctx.lineTo(11, 4); ctx.moveTo(11, -4); ctx.lineTo(5, 4); line('#ff6a7c', 2.4); }
  } else if (name === 'pencil') {
    ctx.rotate(-Math.PI / 4);
    ctx.rect(-3, -10, 6, 15); fillOut();
    ctx.beginPath(); ctx.moveTo(-3, 5); ctx.lineTo(0, 11); ctx.lineTo(3, 5); ctx.closePath(); fillOut('#ffe0b0');
    ctx.beginPath(); ctx.rect(-3, -12, 6, 3); fillOut('#ff8aa0');
  } else if (name === 'bulb') {
    ctx.arc(0, -3, 8.5, 0.75 * Math.PI, 2.25 * Math.PI); ctx.lineTo(3.5, 7); ctx.lineTo(-3.5, 7); ctx.closePath(); fillOut(col || '#ffe14d');
    ctx.beginPath(); ctx.rect(-3.5, 7, 7, 4); fillOut('#c7b6e6');
  } else if (name === 'calendar') {
    ctx.rect(-10, -8, 20, 18); fillOut('#fff');
    ctx.beginPath(); ctx.rect(-10, -8, 20, 6); ctx.fillStyle = '#e0112b'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = ICON_INK; ctx.strokeRect(-10, -8, 20, 18);
    ctx.beginPath(); ctx.moveTo(-5, -11); ctx.lineTo(-5, -6); ctx.moveTo(5, -11); ctx.lineTo(5, -6); line(ICON_INK, 1.6);
    ctx.beginPath(); ctx.rect(-6, 1, 4, 3); ctx.rect(2, 1, 4, 3); ctx.fillStyle = ICON_INK; ctx.fill();
  } else if (name === 'chart') {
    ctx.rect(-11, -10, 22, 20); fillOut('#fff');
    ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(-3, 0); ctx.lineTo(1, 3); ctx.lineTo(8, -6); line('#e0112b', 2.4);
    ctx.beginPath(); ctx.moveTo(3, -6); ctx.lineTo(8, -6); ctx.lineTo(8, -1); line('#e0112b', 2.4);
  } else if (name === 'rocket') {
    ctx.moveTo(0, -12); ctx.quadraticCurveTo(6, -6, 5, 6); ctx.lineTo(-5, 6); ctx.quadraticCurveTo(-6, -6, 0, -12); ctx.closePath(); fillOut('#f2f2ff');
    ctx.beginPath(); ctx.arc(0, -3, 2.4, 0, Math.PI * 2); ctx.fillStyle = '#7ad7ff'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(-9, 8); ctx.lineTo(-4, 6); ctx.moveTo(5, 2); ctx.lineTo(9, 8); ctx.lineTo(4, 6); fillOut('#e0112b', 2);
    ctx.beginPath(); ctx.moveTo(-3, 7); ctx.lineTo(0, 13); ctx.lineTo(3, 7); ctx.closePath(); ctx.fillStyle = '#ffb000'; ctx.fill();
  } else if (name === 'bell') {
    ctx.moveTo(-8, 6); ctx.quadraticCurveTo(-7, -9, 0, -9); ctx.quadraticCurveTo(7, -9, 8, 6); ctx.lineTo(10, 8); ctx.lineTo(-10, 8); ctx.closePath(); fillOut(col || '#ffcf3a');
    ctx.beginPath(); ctx.arc(0, 10, 2.5, 0, Math.PI * 2); fillOut(col || '#ffcf3a', 2);
  } else if (name === 'up') {                                  // a big arrow pointing up (the tutorial's pointer)
    ctx.moveTo(0, -12); ctx.lineTo(10, 0); ctx.lineTo(4, 0); ctx.lineTo(4, 12); ctx.lineTo(-4, 12); ctx.lineTo(-4, 0); ctx.lineTo(-10, 0); ctx.closePath(); fillOut();
  } else if (name === 'close') {
    ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); line(col, 3.4);
  } else if (name === 'pause') {
    ctx.rect(-6, -8, 4, 16); ctx.rect(2, -8, 4, 16); fillOut(col, 2);
  } else if (name === 'play') {
    ctx.moveTo(-6, -9); ctx.lineTo(9, 0); ctx.lineTo(-6, 9); ctx.closePath(); fillOut(col, 2);
  } else if (name === 'replay') {                              // a round arrow: from the start again
    const a0 = -Math.PI / 2 + 0.7, a1 = a0 + Math.PI * 2 - 1.3, cx = Math.cos(a1), sy = Math.sin(a1);
    ctx.arc(0, 1, 8, a0, a1); line(col, 3);
    const ex = 8 * cx, ey = 1 + 8 * sy, tx = -sy, ty = cx;     // the end, and the way it goes on (clockwise)
    ctx.beginPath(); ctx.moveTo(ex + tx * 5, ey + ty * 5); ctx.lineTo(ex + cx * 4.5, ey + sy * 4.5); ctx.lineTo(ex - cx * 4.5, ey - sy * 4.5); ctx.closePath(); fillOut(col, 2);
  } else if (name === 'medal1' || name === 'medal2' || name === 'medal3') {
    const c = { medal1: '#ffcf3a', medal2: '#d8dce6', medal3: '#e09a5a' }[name];
    ctx.moveTo(-6, -12); ctx.lineTo(-1, -2); ctx.lineTo(1, -2); ctx.lineTo(6, -12); ctx.lineTo(2, -12); ctx.lineTo(0, -7); ctx.lineTo(-2, -12); ctx.closePath(); fillOut('#e0112b', 2);
    ctx.beginPath(); ctx.arc(0, 4, 8.5, 0, Math.PI * 2); fillOut(c);
    ctx.restore();
    txt(name.slice(-1), x, y + s * 0.17, s * 0.42, ICON_INK, { weight: 900 });
    return;
  }
  ctx.restore();
}
function goldFill(y, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#fff36a');
  g.addColorStop(1, '#ff9a1f');
  return g;
}
function grad(y, h, a, b) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}
function panel(x, y, w, h, o) {
  o = o || {};
  rr(x, y, w, h, o.r || 22);
  ctx.fillStyle = o.fill || 'rgba(42,18,64,0.92)';
  ctx.fill();
  ctx.lineWidth = o.lw || 3;
  ctx.strokeStyle = o.line || 'rgba(255,207,58,0.35)';
  ctx.stroke();
}
function drawImg(im, x, y, w, h, o) {
  if (!ok(im)) return;
  o = o || {};
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.flip) ctx.scale(-1, 1);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.drawImage(im, -w / 2, -h / 2, w, h);
  ctx.restore();
}
// a dog sprite standing on (x, y) (its feet), h tall
function drawDog(d, x, y, h, o) {
  const im = dogImg(d);
  if (!ok(im)) return;
  const w = h * im.naturalWidth / im.naturalHeight;
  drawImg(im, x, y - h / 2, w, h, o);
}
function face(d, x, y, r, ring) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff3d6';
  ctx.fill();
  ctx.clip();
  const im = faceImg(d);
  if (ok(im)) ctx.drawImage(im, x - r * 1.12, y - r * 1.08, r * 2.24, r * 2.24);
  ctx.restore();
  if (ring) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = ring;
    ctx.stroke();
  }
}
const yuan = u => Math.round(u / PU);
// money in hand plus what the positions are worth (every rules version: v1's longs are shown as 1× positions)
function eqOf(m, a, t) {
  let v = a.cash;
  for (let s = 0; s < m.stocks.length; s++) if (a.sh[s] > 0) v += Math.max(0, a.margin[s] + a.dir[s] * (a.sh[s] * m.stocks[s].P[HIST + t] - a.basis[s]));
  return v;
}
function money(u, sign) {
  const v = Math.round(u / PU), s = Math.abs(v).toLocaleString('en-US');
  return (v < 0 ? '-' : sign && v > 0 ? '+' : '') + s + '金币';      // virtual coins: never a currency sign
}
const priceStr = u => (u / PU).toFixed(u >= 1000 * PU ? 0 : 2);
const pctStr = (x, d) => (x > 0 ? '+' : '') + (x * 100).toFixed(d == null ? 1 : d) + '%';
const multStr = m => '×' + (m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2));
const colorOf = x => (x > 0 ? UP : x < 0 ? DOWN : '#e8dcff');

// ---------- input ----------
const ptr = { x: 0, y: 0, down: false, btn: null, sx: 0, sy: 0, scroll: 0 };
function hit(p) { for (let i = buttons.length - 1; i >= 0; i--) { const b = buttons[i]; if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b; } return null; }
function ptrDown(e) {
  SFX.unlock();
  const p = toWorld(e.clientX, e.clientY);
  Object.assign(ptr, p, { down: true, sx: p.x, sy: p.y, moved: 0 });
  const b = hit(p);
  ptr.btn = b ? b.id : null;
  // trading buttons fire on the press, not the release: a fast thumb is the whole game
  if (b && b.id === 'scrub' && scene === 'play' && R && R.rp) { R.rp.scrubbing = true; R.rp.paused = true; Music.stop(); scrubTo(p.x); ptr.fired = true; return; }
  if (b && FAST.has(b.id) && scene === 'play') { press(b.id); ptr.fired = true; } else ptr.fired = false;
}
function ptrMove(e) {
  const p = toWorld(e.clientX, e.clientY);
  if (ptr.down && R && R.rp && R.rp.scrubbing) scrubTo(p.x);
  if (ptr.down && scene === 'board') { board.scroll = clamp(board.scroll - (p.y - ptr.y), 0, board.maxScroll || 0); ptr.moved += Math.abs(p.y - ptr.y); }
  ptr.x = p.x;
  ptr.y = p.y;
}
function ptrUp(e) {
  if (R && R.rp) R.rp.scrubbing = false;
  if (!ptr.down) return;
  const p = toWorld(e.clientX, e.clientY);
  ptr.down = false;
  if (ptr.fired) return;
  const b = hit(p);
  if (b && b.id === ptr.btn && !(scene === 'board' && ptr.moved > 12)) press(b.id);
}
if (window.PointerEvent) {
  cv.addEventListener('pointerdown', ptrDown);
  window.addEventListener('pointermove', ptrMove);
  window.addEventListener('pointerup', ptrUp);
  window.addEventListener('pointercancel', () => { ptr.down = false; });
} else {
  let touchAt = -1e9;
  const each = (e, f) => { touchAt = Date.now(); for (let i = 0; i < e.changedTouches.length; i++) f(e.changedTouches[i]); };
  cv.addEventListener('touchstart', e => each(e, ptrDown));
  window.addEventListener('touchmove', e => each(e, ptrMove));
  window.addEventListener('touchend', e => each(e, ptrUp));
  window.addEventListener('touchcancel', () => { touchAt = Date.now(); ptr.down = false; });
  const mouse = f => e => { if (Date.now() - touchAt > 800) f(e); };
  cv.addEventListener('mousedown', mouse(ptrDown));
  window.addEventListener('mousemove', mouse(ptrMove));
  window.addEventListener('mouseup', mouse(ptrUp));
}
const FAST = new Set(['buy', 'sell', 'tab0', 'tab1', 'tab2', 'tab3', 'frac0', 'frac1', 'frac2', 'lev0', 'lev1', 'lev2', 'news']);
window.addEventListener('keydown', e => {
  if (!nameForm.hidden || !termsEl.hidden || !document.getElementById('share').hidden || (helpEl && !helpEl.hidden)) return;
  const k = e.key;
  if (scene === 'play' && R && R.rp && (k === ' ' || k === 'Escape')) { press(k === ' ' ? 'rpPlay' : 'rpExit'); e.preventDefault(); return; }
  if (scene === 'play') {
    if (k >= '1' && k <= '4') press('tab' + (+k - 1));
    else if (k === 'j' || k === 'J' || k === 'ArrowUp' || k === ' ') press('buy');
    else if (k === 'k' || k === 'K' || k === 'ArrowDown') press('sell');
    else if (k === 'z' || k === 'Z') press('frac0');
    else if (k === 'x' || k === 'X') press('frac1');
    else if (k === 'c' || k === 'C') press('frac2');
    else if (k === 'a' || k === 'A') press('lev0');
    else if (k === 's' || k === 'S') press('lev1');
    else if (k === 'd' || k === 'D') press('lev2');
    else if (k === 'Escape') press('menu');
    else return;
    e.preventDefault();
  } else if (k === 'Enter' || k === ' ') {
    if (scene === 'title') press('start');
    else if (scene === 'result' && resT > 1.5) press('again');
    else if (scene === 'pause') press('resume');
    e.preventDefault();
  } else if (k === 'Escape' && scene === 'board') press('back');
});

function openGroups() {
  if (window.HedssazGroups) window.HedssazGroups.sheet();
  else window.open('https://qm.qq.com/q/bbU5pL1Onu', '_blank');
}
function press(id) {
  if (scene === 'play' && R && R.mode === 'tut') {
    if (id === 'tutSkip') { SFX.play('click'); return tutSkip(); }
    const st = TUT[R.tut.i];
    if (id === 'tutNext' && R.tut.wait && st.btn) { SFX.play('click'); return tutGo(R.tut.i + 1); }
    if (id !== 'menu' && !(R.tut.wait && st.allow && st.allow.includes(id) && !R.tut.acted)) {
      if (FAST.has(id)) { R.tut.nudge = 0.35; SFX.play('fail'); }
      return;
    }
    try { return pressPlay(id); } finally { if (st.done && st.done()) R.tut.acted = true; }
  }
  if (scene === 'play' && R && R.mode === 'replay') {
    const P = R.rp;
    if (id.startsWith('tab')) { const s = +id.slice(3); if (s < R.m.stocks.length) { R.sel = s; P.follow = false; SFX.play('tab'); } return; }
    if (id === 'rpPlay') { SFX.play('click'); if (P.done) { rpSeek(0); P.paused = false; Music.start(0, 1); } else { P.paused = !P.paused; if (P.paused) Music.stop(); else Music.start(R.t, 1); } return; }
    if (id === 'rpRestart') { SFX.play('click'); rpSeek(0); P.paused = false; P.follow = true; Music.start(0, 1); return; }
    if (id === 'rpS1' || id === 'rpS2' || id === 'rpS4') { P.speed = +id.slice(3); SFX.play('click'); return; }
    if (id === 'rpExit' || id === 'menu') { SFX.play('click'); return rpExit(); }
    if (id === 'start') { SFX.play('click'); R = null; return startRound(); }
    return;
  }
  if (scene === 'play') return pressPlay(id);
  pressMenu(id);
}
function pressPlay(id) {
  {
    if (id === 'buy') return doTrade(1);
    if (id === 'sell') return doTrade(-1);
    if (id.startsWith('lev')) { const v = +id.slice(3); if (R.a.sh[R.sel] > 0) return toast(`这只押着的是${LEV_NAME[S.LEVS.indexOf(R.a.lev[R.sel])]}，收手后才能换`, '#ffcf3a'); R.lev = v; toast(LEV_SAY[v], v === 2 ? '#ffb3bf' : '#ffcf3a'); SFX.play(v === 2 ? 'limitup' : 'click'); if (v === 2) buzz(15); return; }
    if (id.startsWith('tab')) { const s = +id.slice(3); if (s !== R.sel && s < R.m.stocks.length) { R.sel = s; SFX.play('tab'); R.selT = 0; } return; }
    if (id.startsWith('frac')) { R.frac = +id.slice(4); SFX.play('click'); return; }
    if (id === 'news' && R.card && R.card.e.target >= 0) { R.sel = R.card.e.target; SFX.play('tab'); R.selT = 0; return; }
    if (id === 'menu') { pauseRound(); SFX.play('click'); return; }
    return;
  }
}
function pressMenu(id) {
  SFX.play('click');
  if (offerOpen() && id !== 'tut' && id !== 'offerPlay' && id !== 'mute') return;
  if (id === 'tut') { save.tut = save.tut || 'started'; persist(); startTutorial(); }
  else if (id === 'offerPlay') { save.tut = 'skipped'; persist(); startRound(); }
  else if (id === 'replay' && R) startReplay({ v: S.VERSION, seeds: R.seeds, acts: R.acts, cash: R.a.cash, nickname: myName() || '你' }, 'result').catch(e => notice(e.message));
  else if (id.startsWith('rp_')) openReplayId(+id.slice(3), 'board');
  else if (id === 'rpLink') copyReplayLink();
  else if (id === 'start' || id === 'again') startRound();
  else if (id === 'resume') resumeRound();
  else if (id === 'nextDay' && scene === 'dayend') nextDay();
  else if (id === 'quit') { leaveLive(); scene = 'title'; Music.start(0, 0); loadPlays(); }
  else if (id === 'mute') SFX.setMuted(!save.muted);
  else if (id === 'name') openName();
  else if (id === 'more') location.href = '/game/';
  else if (id === 'group') openGroups();
  else if (id === 'help') openHelp();
  else if (id === 'share') openShare();
  else if (id === 'board') openBoard(scene);
  else if (id === 'back') { scene = board.from === 'result' ? 'result' : 'title'; }
  else if (id === 'bToday' || id === 'bAll') { board.period = id === 'bToday' ? 'today' : 'all'; board.scroll = 0; loadBoard(); }
  else if (id === 'retryUp') upload();
}

// =====================================================================================================
//  The round
// =====================================================================================================
let scene = 'title', clock = 0, sceneT = 0, resT = 0;
let R = null;          // the round being played (or just finished)
let shake = 0, flash = null;
const INTRO = 1.5;     // 3 · 2 · 1 on the beats before the open

async function startRound() {
  if (!termsAgreed()) return requireTerms(() => startRound());
  if (!nameAsked() && API) { openName(() => startRound()); return; }
  leaveLive();
  const my = ++loadToken;                       // (a replay still loading must not take over this round)
  if (MKT && window.WebSocket) { connectLive(my); return; }
  newRound(localSeed(), PRACTICE);
}
// a local round: the three seeds made here, never ranked (practice, or no market service), and it says so
function newRound(seed, why) {
  beginRound(S.make([seed, localSeed(), localSeed()]), seed);
  R.seeds = R.m.seeds.slice();
  R.offline = why || PRACTICE;
}
function beginRound(m, seed) {
  R = baseRound(m, seed);
  R.ticket = null;
  scene = 'intro';
  sceneT = 0;
  shake = 0;
  flash = null;
  Music.start(-INTRO, 1);
}
// ---------- ranked rounds on the market service ----------
// The page plays the ticks it has been sent (never ahead of them) and books an order at the tick the service booked it,
// right after that tick, as the service and the re-run do. No connection or a refusal: a local practice round, labelled.
const LIVE_LAG = 6;                               // ticks the page may trail what it has been sent before it catches up
// s a ranked round plays behind the ticks coming in: the news, the clock ring, the day's close, the fills, all of it,
// so a tick a little late on the way (or a phone's network hiccup) is still here in time and the market moves every
// 100 ms in step with the music. Played on arrival (11-09 02:20 – v17) it ran into the tick it didn't have yet, most
// ticks: 67 / 133 ms instead of 100 (11-09 lag check)
const LIVE_BUF = 0.15;
// … of which the music, when it plays (musicNudge), already makes MUSIC_LEAD
const liveBuf = () => LIVE_BUF - (SFX.ctx && SFX.ctx.state === 'running' && Music.on ? MUSIC_LEAD : 0);
const LIVE_QUIET = 5000;                          // ms without a word from the service while the market runs: the connection is dead
const LIVE_RETRY = 25000;                         // ms to get a dropped round back (the service keeps it 30 s)
const LIVE_WAIT = 60000;                          // ms the close may wait for the service's answer before it says so
const LOST_UP = { state: 'err', msg: '没等到服务器结算（成绩可能已经记上了，看看排行榜）', retry: false };
let liveOpening = null;                           // the connection being opened for a ranked round, before its 'start'
function connectLive(my) {
  let ws = null, settled = false, timer = 0;
  const stop = () => {
    settled = true;
    clearTimeout(timer);
    if (liveOpening === opening) liveOpening = null;
    try { if (ws) ws.close(); } catch (e) { /* closed */ }
  };
  const opening = liveOpening = { stop };
  const local = why => {
    if (settled) return;
    stop();
    if (my === loadToken) newRound(localSeed(), why);
  };
  timer = setTimeout(() => local('没连上服务器 · 练习局，不上榜'), 4000);
  let hiAt = 0;
  try { ws = new WebSocket(MKT); } catch (e) { local('没连上服务器 · 练习局，不上榜'); return; }
  ws.onopen = () => { hiAt = Date.now(); ws.send(JSON.stringify({ t: 'hi', cv: MKT_CV, name: myName(), bid: BID })); };
  ws.onmessage = ev => {
    if (settled) return;
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'no') { local(m.why === 'refresh' ? '游戏更新了：刷新页面才能打排位局' : '排位局暂时不可用 · 练习局，不上榜'); return; }
    if (m.t !== 'start' || !Array.isArray(m.ids) || !Array.isArray(m.hist)) return;
    settled = true;
    clearTimeout(timer);
    if (liveOpening === opening) liveOpening = null;
    if (my !== loadToken) { try { ws.send(JSON.stringify({ t: 'bye' })); ws.close(); } catch (e) { /* closed */ } return; }
    liveRound(ws, m, hiAt ? (Date.now() - hiAt) / 1000 : 0.1);
  };
  ws.onclose = () => local('没连上服务器 · 练习局，不上榜');
}
function liveRound(ws, st, rtt) {
  const H = S.HIST;
  const stocks = st.ids.map((id, s) => {
    const P = new Array(H + S.TICKS).fill(0);
    for (let k = 0; k < H; k++) P[k] = st.hist[s][k];
    return { id, def: S.DEFS[id], P, L: new Int8Array(S.TICKS) };
  });
  beginRound({ v: S.VERSION, seeds: [], known: 0, stocks, events: [], nights: [], opens: [] }, 0);
  R.seeds = null;                                 // (known at the close, from the service)
  // recv: every tick up to it is here (never a hole); nf: fills received (both told to the service when picked up again)
  // ab: the account as the service books it (R.a is what the page shows: ab, plus the orders sent and not yet booked, pq,
  // played at once on the tap); rtt: s there and back (the open, then each fill); rebase: picked up again at that tick
  R.live = { ws: null, token: st.token, recv: -1, nf: 0, got: {}, n: 0, pend: {}, fills: [], evs: {}, end: null, gone: false, closed: false,
    retry: 0, lostAt: 0, timer: 0, heard: Date.now(), busyAt: 0, ab: R.a, pq: [], rtt: clamp(rtt, 0.02, 0.5), rebase: null, tOpen: 0 };
  // the service's clock started as it sent 'start': the page's (and the music's) starts LIVE_BUF behind it
  // (Music.start(at) puts the music MUSIC_LEAD behind at, and the game follows the music)
  R.t = -INTRO - liveBuf();
  Music.start(R.t, 1);
  hookLive(R, ws);
}
// how far behind the service a day opened by this page's 'next' starts: the buffer, and the way there and back
const liveDelay = L => liveBuf() + Math.min(0.4, L.rtt);
const copyAcct = a => Object.assign({}, a, { dir: a.dir.slice(), lev: a.lev.slice(), sh: a.sh.slice(), basis: a.basis.slice(), margin: a.margin.slice(), paid: a.paid.slice() });
// what the page shows: the booked account, and the orders not yet booked as they were tapped
function liveView(round) {
  const L = round.live;
  if (!L.pq.length) { round.a = L.ab; return; }
  const a = copyAcct(L.ab);
  for (const q of L.pq) S.trade(round.m, a, q.t, q.op);
  round.a = a;
}
function hookLive(round, ws) {
  const L = round.live;
  L.ws = ws;
  ws.onmessage = ev => {
    if (L.ws !== ws || L.closed) return;          // (an old connection, or a round left)
    if (R !== round) { endLive(round); return; }
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    L.heard = Date.now();
    onLive(round, m);
  };
  ws.onclose = () => { if (L.ws === ws && !L.closed && !L.end && !L.gone) liveDropped(round); };
}
// leaving a ranked round (another round, the tutorial, a replay, 回标题): its connection is closed and never opened again,
// one still being opened is given up (11-09 review #4: they were left open and took the address's six connections)
function leaveLive() {
  if (liveOpening) liveOpening.stop();
  if (R && R.live) endLive(R);
}
function endLive(round) {
  const L = round.live;
  if (L.closed) return;
  L.closed = true;
  clearTimeout(L.timer);
  const ws = L.ws;
  L.ws = null;
  try { if (ws && ws.readyState === 1 && !L.end) ws.send(JSON.stringify({ t: 'bye' })); } catch (e) { /* closed */ }
  try { if (ws) ws.close(); } catch (e) { /* closed */ }
  if (round.up && round.up.state === 'busy') round.up = LOST_UP;   // (left while the close was waiting: it won't come now)
}
function liveSend(o) {
  const L = R && R.live;
  if (!L || !L.ws || L.closed || L.ws.readyState !== 1) return false;
  L.ws.send(JSON.stringify(o));
  return true;
}
function onLive(round, m) {
  const L = round.live, mk = round.m, N = mk.stocks.length;
  if (m.t === 'k') {
    if (!Array.isArray(m.p) || !Array.isArray(m.l) || m.l.length !== m.p.length || m.p.length % N || !Number.isInteger(m.k)) return;
    const n = m.p.length / N, had = L.recv;
    // the ticks must follow on from what is here: a hole (something lost on the way) is asked for again, never played
    // over with zero prices (11-09 review #5)
    if (m.k > had + 1 || m.p.some(x => !(x > 0))) { console.warn('market ticks out of order', had, m.k); liveResync(round); return; }
    for (let j = 0; j < n; j++) {
      if (m.k + j <= had) continue;               // (already here)
      for (let s = 0; s < N; s++) { mk.stocks[s].P[S.HIST + m.k + j] = m.p[j * N + s]; mk.stocks[s].L[m.k + j] = m.l[j * N + s]; }
    }
    for (const x of m.e || []) {
      if (!(x.k > had)) continue;
      if (x.ev) {
        if (L.evs[x.i]) continue;
        const e = Object.assign({}, x.ev);
        e.kind = e.type === 1 ? (e.sent > 0 ? K.GOOD : K.BAD) : e.type;
        L.evs[x.i] = e;
        mk.events.push(e);
      } else if (x.shake && L.evs[x.i]) L.evs[x.i].shake = 1;
      else if (x.news2 != null && L.evs[x.i]) L.evs[x.i].news2 = x.news2;
      else if (x.night) mk.nights[x.night.d] = x.night.items;
      else if (x.open) mk.opens[x.open.d] = x.open.items;
    }
    L.recv = Math.max(had, m.k + n - 1);
  } else if (m.t === 'f') {
    const p = L.pend[m.n];
    delete L.pend[m.n];
    if (p) L.rtt = clamp(L.rtt * 0.75 + Math.min(1, (Date.now() - p.at) / 1000) * 0.25, 0.02, 0.5);
    if (m.k < 0) {                                // not booked: what the tap showed is taken back
      if (p) { L.pq = L.pq.filter(q => q.n !== m.n); if (R === round) liveView(round); toast('没成交：现在不能下单', '#ffcf3a'); }
      return;
    }
    if (L.got[m.n]) return;                       // (sent again after a drop: booked once)
    L.got[m.n] = true;
    L.nf++;
    L.fills.push({ k: m.k, op: m.op, n: m.n, tap: p ? p.tap : m.k });
    applyFills();
  } else if (m.t === 'end') {
    L.end = m;
    round.seeds = m.seeds;
    clearTimeout(L.timer);
    try { L.ws.close(); } catch (e) { /* closed */ }
    if (round.up && (round.up.state === 'busy' || round.up === LOST_UP)) liveResult(round);
  } else if (m.t === 'back') {
    L.retry = 0;
    L.again = false;
    L.lostAt = 0;
    clearTimeout(L.timer);
    // the service waits for 'next' at a day's close, or was told to pause: say again what this page did while it was gone
    if (m.state === 'dayend' && round.dayDone[Math.floor(m.tick / S.DAY)]) liveSend({ t: 'next' });
    // its clock stood still while the page was gone, the page's (and the music) ran on: once the ticks it missed are here,
    // the page goes back to LIVE_BUF behind the service (update)
    else if (m.state === 'play' && m.tick >= 0) L.rebase = m.tick;
    liveSend({ t: scene === 'pause' ? 'pause' : 'resume' });
  } else if (m.t === 'no' && L.again) liveLost(round);
}
// orders the service booked: each at its own tick, right after that tick (the page never runs past a booked tick unknowing:
// the service books at a tick it has already sent)
// The tap already showed it (doTrade): here it is booked as the service booked it, quietly, and only a result that
// differs from what the tap showed says so.
function applyFills() {
  const L = R.live;
  while (L.fills.length && L.fills[0].k <= R.tick) {
    const f = L.fills.shift();
    if (f.k < R.tick) console.warn('late fill', f.k, R.tick);
    const i = L.pq.findIndex(q => q.n === f.n), q = i >= 0 ? L.pq.splice(i, 1)[0] : null;
    R.acts.push([f.k, f.op]);
    const r = S.trade(R.m, L.ab, f.k, f.op);
    if (r.ok && !r.open) R.closes.push({ t: f.k, pnl: r.pnl, s: r.s });
    liveView(R);
    if (!q) { if (r.ok) tradeFx(r, f.k, false, f.op, false, false); continue; }   // (a fill the page never showed: shown now)
    if (!r.ok) toast(`没成交：${FAIL_SAY[r.why] || '没押上'}`, '#ffcf3a');
    else if (r.open !== q.r.open) toast(r.open ? '按服务器的时间：变成了押进' : '按服务器的时间：变成了收手', '#ffcf3a');
    else if (f.k - f.tap >= 5) toast('网络有点慢：按服务器的时间成交了', '#ffcf3a');
    else if (Math.abs(r.p - q.r.p) * 50 >= q.r.p) toast(`成交价 ${priceStr(r.p)}（按服务器的时间）`, '#ffcf3a');
  }
}
// the connection is dead or out of step: let it go and pick the round up again on a new one
function liveResync(round) {
  const L = round.live, ws = L.ws;
  L.ws = null;
  try { if (ws) ws.close(); } catch (e) { /* closed */ }
  liveDropped(round);
}
// the connection dropped: pick the round up again (the service keeps it, paused, for 30 s; a finished one's answer for 2
// minutes) from the last tick and fill this page has: the service sends all that came after
function liveDropped(round) {
  const L = round.live;
  if (L.closed || L.end || L.gone) return;
  if (!L.lostAt) L.lostAt = Date.now();
  if (Date.now() - L.lostAt > LIVE_RETRY) { liveLost(round); return; }
  L.retry++;
  L.again = true;
  L.ws = null;
  clearTimeout(L.timer);
  L.timer = setTimeout(() => {
    if (L.closed || L.end || L.gone) return;
    let ws;
    try { ws = new WebSocket(MKT); } catch (e) { liveDropped(round); return; }
    hookLive(round, ws);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hi', cv: MKT_CV, resume: L.token, from: L.recv, nf: L.nf }));
    L.heard = Date.now();
    L.timer = setTimeout(() => { if (L.ws === ws && ws.readyState !== 1) liveResync(round); }, 5000);   // (a connect that hangs)
  }, Math.min(4000, 800 * L.retry));
}
// no way back: a round still running goes on as practice; at the close it says the answer never came (and stops waiting)
function liveLost(round) {
  const L = round.live;
  if (L.gone || L.end || L.closed) return;
  L.gone = true;
  clearTimeout(L.timer);
  try { if (L.ws) L.ws.close(); } catch (e) { /* closed */ }
  L.ws = null;
  if (R !== round) return;
  if (scene === 'play' || scene === 'intro' || scene === 'pause' || scene === 'dayend') newRound(localSeed(), '断网了：换成练习局，不计成绩');
  else if (round.up.state === 'busy') round.up = LOST_UP;
}
// every frame: a market gone quiet while it should be ticking, or a close waiting too long, is a dead connection
function liveWatch(round) {
  const L = round.live, now = Date.now();
  if (L.closed || L.end || L.gone) return;
  if (round.up.state === 'busy' && L.busyAt && now - L.busyAt > LIVE_WAIT) { liveLost(round); return; }
  if (!L.ws || L.ws.readyState !== 1) return;
  if ((scene === 'play' && now - L.heard > LIVE_QUIET) || (round.up.state === 'busy' && now - L.heard > LIVE_WAIT / 2)) { L.heard = now; liveResync(round); }
}
// the close of a ranked round: the service's own answer (the backend's, after its re-run)
function liveResult(round) {
  const L = round.live, e = L.end;
  if (!e) {
    round.up = L.gone ? LOST_UP : { state: 'busy', msg: '等服务器结算…' };
    if (!L.busyAt) { L.busyAt = Date.now(); L.heard = Math.max(L.heard, L.busyAt); }
    return;
  }
  if (e.cash !== round.a.cash) console.warn('market close mismatch', e.cash, round.a.cash);
  const d = e.up || {};
  if (e.wiped || d.off) { round.up = { state: 'off', msg: e.wiped ? '爆仓出局，这局不上榜' : d.off }; return; }
  if (d.error || !d.id) { round.up = { state: 'err', msg: '成绩没传上：' + (d.error || '服务器没回话'), retry: false }; return; }
  round.up = { state: 'done', msg: d.on_board === false ? (d.message || '人工审核后上榜') : `今日第 ${d.rank_today} 名` + (d.rank_all ? ` · 总榜第 ${d.rank_all} 名` : ''), d };
  save.mine = [d.id].concat(save.mine || []).slice(0, 30);
  persist();
  board.cache = {};
}
function pauseRound() {
  if (scene !== 'play' && scene !== 'intro') return;
  R.pausedFrom = scene;
  scene = 'pause';
  Music.stop();
  if (R.live) liveSend({ t: 'pause' });
}
function resumeRound() {
  if (!R || scene !== 'pause') return;
  scene = R.pausedFrom;
  // (ranked: the service stopped and starts again a one-way trip after the page: the buffer is kept as it was, so the
  // music starts where the game is, not MUSIC_LEAD behind it)
  Music.start(R.t + (R.live ? MUSIC_LEAD : 0), R.t > 50 ? 2 : 1);
  if (R.live) liveSend({ t: 'resume' });
}

function curTick() { return clamp(R.live ? Math.max(R.tick, Math.floor(R.t * S.TPS)) : Math.floor(R.t * S.TPS), 0, R.T - 1); }
function stockAt(s, t) { return S.price(R.m, s, t); }
function openPrice(s) { return stockAt(s, 0); }

// side 1 = the 买 button (buy up: open / add a long, or close a short), -1 = the 卖 button (sell: close a long, or open / add a short)
function doTrade(side) {
  if (!R || scene !== 'play') return;
  const t = Math.max(0, R.tick), s = R.sel, a = R.a, held = a.sh[s] > 0, closing = held && a.dir[s] !== side;
  if (R.acts.length + (R.live ? R.live.pq.length : 0) >= S.MAX_ACTS) return toast('手速太快了，歇会儿', '#ffcf3a');
  if (!closing && a.cash < stockAt(s, t) * 1.02) { if (R.tut) R.tut.failed = true; SFX.play('fail'); return toast(held ? '没钱再押了' : '没钱了！先把别的狗收手', '#c7b6e6'); }
  const op = s * 32 + R.lev * 8 + (side > 0 ? R.frac : 3 + R.frac);
  if (R.live) {
    // ranked: the service books it, at its own tick, and the page books it there too (applyFills). What the tap does is
    // shown now, as a local round would: worked out on a copy of what the page shows, at the price on the screen
    if (R.tick < 0) return;
    const L = R.live, a2 = copyAcct(R.a), r = S.trade(R.m, a2, t, op);
    if (!r.ok) { tradeFx(r, t, false, op, held, closing); return; }   // (not sent: the screen says it can't, so it isn't tried)
    const n = ++L.n;
    if (!liveSend({ t: 'op', op, n })) return toast('网断了，没下上单', '#ffcf3a');
    L.pend[n] = { tap: t, at: Date.now() };
    L.pq.push({ n, t, op, r });
    R.a = a2;
    tradeFx(r, t, false, op, held, closing);
    return;
  }
  bookTrade(t, op);
}
const FAIL_SAY = { board: '到头了（封板）：只能收手，押不进新的', halt: '熔断中！全场暂停，等一下', no_cash: '没钱了', cap: '一只狗最多押 10 万金币',
  limit_up: '涨到头了（涨停）', limit_down: '跌到头了（跌停）' };
// an order taking effect at tick t, now (a local round)
function bookTrade(t, op) {
  const s = op >> 5, side = (op & 7) < 3 ? 1 : -1, a = R.a, held = a.sh[s] > 0, closing = held && a.dir[s] !== side;
  R.acts.push([t, op]);
  tradeFx(S.trade(R.m, a, t, op), t, true, op, held, closing);
}
// what a trade looks and sounds like (r: S.trade's answer; held / closing: before it); book: the close goes in the day's list
function tradeFx(r, t, book, op, held, closing) {
  const s = op >> 5, side = (op & 7) < 3 ? 1 : -1, B = btnRect(side > 0);
  if (!r.ok) {
    if (R.tut) R.tut.failed = true;
    SFX.play('fail');
    buzz(30);
    R.btnShake = { buy: side > 0, t: 0 };
    const msg = { limit_up: closing ? '涨到头了（涨停）！押跌的现在收不了手' : '涨到头了（涨停）！押不进',
      limit_down: closing ? '跌到头了（跌停）！押涨的现在收不了手' : '跌到头了（跌停）！押不进' }[r.why] || FAIL_SAY[r.why] || '没押上';
    return toast(msg, r.why === 'limit_up' ? UP : r.why === 'limit_down' ? DOWN : '#ffcf3a');
  }
  const nm = SHORT[R.m.stocks[s].def.code];
  if (r.open) {
    SFX.play('buy');
    buzz(12);
    if (r.dir < 0 && !held) SFX.play('newsbad');
    toast(`${r.dir > 0 ? '押涨' : '押跌'} ${nm} ${money(Math.trunc(r.n * r.p / r.lev))}${r.lev > 1 ? ` · 放大${r.lev}×` : ''}`, r.dir > 0 ? '#ffb3bf' : '#b3f5d6');
    const T = tabRect(s);
    for (let i = 0; i < 7; i++) R.fx.push({ k: 'coin', x: B.x + B.w / 2 + (Math.random() - 0.5) * 80, y: B.y + 30, tx: T.x + T.w / 2, ty: T.y + T.h / 2, t: -i * 0.04, d: 0.45 });
    if (r.lev === 10 && !held) R.fx.push({ k: 'pop', x: B.x + B.w / 2, y: B.y - 30, s: '10 倍！刺激', col: '#fff', t: 0, size: 34, life: 1.1, bg: '#e0112b' });
  } else { if (book) R.closes.push({ t, pnl: r.pnl, s }); sellFx(r, B); }
}
// money coming back from a closed position
function sellFx(r, B) {
  const pct = r.pnl / Math.max(1, r.back - r.pnl);
  if (r.pnl > 0) {
    R.combo++;
    R.comboT = 0;
    const big = pct >= 0.12;
    SFX.play(big ? 'bigsell' : 'sell', R.combo);
    buzz(big ? [20, 40, 20] : 18);
    R.fx.push({ k: 'pop', x: B.x + B.w / 2, y: B.y - 10, s: money(r.pnl, true), col: '#ffe14d', t: 0, size: big ? 70 : 54, life: 1.5 });
    R.fx.push({ k: 'pop', x: B.x + B.w / 2, y: B.y + 50, s: pctStr(pct), col: UP, t: -0.08, size: 34, life: 1.3 });
    const n = Math.min(26, 8 + Math.floor(pct * 60)), H = Lay.hud;
    for (let i = 0; i < n; i++) R.fx.push({ k: 'coin', x: B.x + B.w / 2 + (Math.random() - 0.5) * 120, y: B.y + 40, tx: H.x + 150, ty: H.y + 64, t: -i * 0.025, d: 0.6, vx: (Math.random() - 0.5) * 900, vy: -500 - Math.random() * 500 });
    if (R.combo >= 2) R.fx.push({ k: 'combo', s: `连赚 ×${R.combo}`, t: 0 });
    if (r.onLimit) R.fx.push({ k: 'pop', x: B.x + B.w / 2, y: B.y - 80, s: r.dir > 0 ? '涨到头时收手！' : '跌到头时收手！', col: '#fff', t: -0.1, size: 36, life: 1.4, bg: r.dir > 0 ? UP : '#11a866' });
    if (big) shake = Math.max(shake, 0.35);
  } else {
    R.combo = 0;
    SFX.play('loss');
    buzz(40);
    R.fx.push({ k: 'pop', x: B.x + B.w / 2, y: B.y - 10, s: money(r.pnl, true), col: '#b9f5d4', t: 0, size: 50, life: 1.4, fall: true });
    if (pct < -0.03) { SFX.voice(); R.fx.push({ k: 'meme', t: 0, small: true }); }
  }
}
// 爆仓: the screen cracks, 老谋 swears at you
function liqFx(r) {
  const st = R.m.stocks[r.s], T = tabRect(r.s);
  R.closes.push({ t: R.tick, pnl: r.pnl, s: r.s, liq: true });
  if (R.rp) { R.rp.marks.push({ s: r.s, t: R.tick, type: 'liq', lev: r.lev, p: r.p }); if (R.rp.follow) R.sel = r.s; }
  R.combo = 0;
  shake = 1.5;
  flash = { col: '#ff1030', t: 0, d: 0.45 };
  SFX.play('crash');
  SFX.play('loss');
  SFX.voice(true);
  buzz([80, 40, 160]);
  R.liqT = 0;
  R.crack = makeCrack(T.x + T.w / 2, Lay.chart.y + Lay.chart.h * 0.4);
  R.fx.push({ k: 'meme', t: 0 });
  R.fx.push({ k: 'banner', s: '爆仓！', t: 0, red: true });
  R.fx.push({ k: 'pop', x: WW / 2, y: Lay.chart.y + Lay.chart.h * 0.75, s: `${SHORT[st.def.code]} ${r.lev}× ${money(r.pnl, true)}`, col: '#fff', t: 0.2, size: 44, life: 2, bg: '#7a0010' });
  R.stamps.push({ s: r.s, liq: true, t: 0 });
  R.liqCount = (R.liqCount || 0) + 1;
  explain('liq', '爆仓：放大后亏到了爆仓线，这一单押的钱就没了');
}
// a crack in the screen glass: a few jagged lines from where it hit
function makeCrack(x, y) {
  const lines = [];
  for (let i = 0; i < 11; i++) {
    let a = i / 11 * Math.PI * 2 + Math.random() * 0.4, px = x, py = y;
    const pts = [[px, py]], len = 220 + Math.random() * 520;
    for (let d = 0; d < len; d += 40 + Math.random() * 50) { a += (Math.random() - 0.5) * 0.7; px += Math.cos(a) * 60; py += Math.sin(a) * 60; pts.push([px, py]); }
    lines.push(pts);
  }
  return { x, y, lines };
}
// ❓ 玩法说明 (index.html #help): the same plain words as the tutorial, to read at leisure
const helpEl = document.getElementById('help');
function openHelp() { if (helpEl) { helpEl.hidden = false; const b = document.getElementById('help-body'); if (b) b.scrollTop = 0; } }
if (helpEl) {
  document.getElementById('help-close').addEventListener('click', () => { helpEl.hidden = true; });
  document.getElementById('help-tut').addEventListener('click', () => { helpEl.hidden = true; save.tut = save.tut || 'started'; persist(); startTutorial(); });
}
function toast(s, col) { if (R) R.toast = { s, col: col || '#fff', t: 0 }; }
// 💡 a word the player meets for the first time this round (涨停, 熔断, 爆仓 …), said plainly, in the moment: one line,
// a few seconds, never in replays or the tutorial (which says it in its own steps); one at a time, queued
const TIP_LIFE = 4.2;
function explain(key, s) {
  if (!R || R.rp || R.tut) return;
  R.said = R.said || {};
  if (R.said[key]) return;
  R.said[key] = true;
  (R.tips = R.tips || []).push({ s, t: 0, at: clock });
}

// the news, the 老谋 countdown, the boards and the bell, tick by tick
function onTick(k) {
  const m = R.m, ab = R.live && R.live.ab, A = ab || R.a;
  // (ranked: the 爆仓 is the booked account's, as the service has it; what the page shows is that plus the orders not yet booked)
  for (const r of R.eng.liquidate(m, A, k)) liqFx(r);
  if (ab && R.a !== ab) { liveView(R); R.eng.liquidate(m, R.a, k); }
  // wiped out: nothing left to trade with, the round is over
  if (R.liqCount && !A.sh.some(x => x > 0) && A.cash < stockAt(0, k) * 2 + START * 0.01) { R.wiped = true; R.wipeT = k; }
  for (const e of m.events) {
    if ((e.kind === K.GOOD || e.kind === K.BAD) && e.shake && k === e.at) {
      R.fx.push({ k: 'chartTxt', s: e.target, txt: e.kind === K.GOOD ? '洗盘！先砸一下' : '诱多！先拉一下', col: '#ffe14d', t: 0 });
      explain(e.kind === K.GOOD ? 'wash' : 'lure', e.kind === K.GOOD ? '洗盘：要涨之前先往下砸一下，吓走胆小的' : '诱多：要跌之前先往上拉一下，骗人押涨');
      if (R.a.sh[e.target] > 0 && R.a.lev[e.target] === 10) toast(e.kind === K.GOOD ? '先跌一下再涨（洗盘）：放大10×小心爆仓' : '先涨一下再跌（诱多）：押跌放大10×小心', '#ffcf3a');
    }
    if (e.news === k) showNews(e, false);
    if (e.news2 === k) showNews(e, true);
    if ((e.kind === K.CRASH || e.kind === K.MOON) && k >= e.news && k < e.at && (k - e.news) % S.BEAT === 0) {
      const i = (k - e.news) / S.BEAT;
      R.words = { e, i, t: 0 };
      SFX.play('word', i);
      shake = Math.max(shake, 0.15 + i * 0.08);
      buzz(20);
    }
    if (e.kind === K.CRASH && k === e.at) {
      R.words = null;
      R.halt = { e, t0: k };
      flash = { col: '#ffffff', t: 0, d: 0.5 };
      shake = 1.2;
      SFX.play('crash');
      SFX.voice(true);
      buzz([60, 40, 120]);
      Music.level = 3;
      R.fx.push({ k: 'meme', t: 0 });
      explain('halt', '熔断：全场暂停 2 秒，谁都不能买卖');
    }
    if (e.kind === K.CRASH && k === e.at + S.HALT) {
      R.halt = null;
      Music.level = R.t > 50 ? 2 : 1;
      toast('熔断结束，能买卖了！押跌的可以收手了', '#ffcf3a');
      SFX.play('count', 1);
    }
    if (e.kind === K.MOON && k === e.at) {
      R.words = null;
      SFX.voice(true);
      flash = { col: '#ffcf3a', t: 0, d: 0.4 };
      shake = 0.8;
      for (let i = 0; i < 18; i++) R.fx.push({ k: 'rocket', x: Math.random() * WW, y: WH + Math.random() * 200, t: -Math.random() * 0.6 });
    }
  }
  // 涨停 / 跌停 boards opening and closing
  m.stocks.forEach((st, s) => {
    const L = st.L[k], P = k > 0 ? st.L[k - 1] : 0;
    if (L === P || L === 2 || P === 2) return;
    if (L === 1 || L === -1) {
      R.stamps.push({ s, up: L === 1, t: 0 });
      SFX.play(L === 1 ? 'limitup' : 'limitdown');
      shake = Math.max(shake, s === R.sel ? 0.6 : 0.3);
      buzz(L === 1 ? 25 : [30, 30, 30]);
      R.flashTab[s] = 1;
      if (s !== R.sel) toast(`${SHORT[st.def.code]}${L === 1 ? '涨停了！' : '跌停了！'}`, L === 1 ? UP : DOWN);
      explain(L === 1 ? 'up' : 'down', L === 1 ? '涨停：今天涨到头了，押不进；押涨的想收手，赶紧收' : '跌停：今天跌到头了，押不进；押跌的想收手，赶紧收');
    } else if (P === 1 || P === -1) {
      R.fx.push({ k: 'chartTxt', s, txt: '开板！', col: P === 1 ? '#ffe14d' : '#b9f5d4', t: 0 });
      explain('open', '开板：到头之后又能动了，价格常常往回走');
    }
  });
  // money: a log for the result chart, and the milestones
  const eq = eqOf(m, R.a, k);
  if (k % CANDLE === 0) R.eqLog.push(eq);
  if (eq > R.peak) R.peak = eq;
  for (const [x, label] of [[1.5, '赚了一半！'], [2, '翻倍啦！'], [3, '三倍！'], [5, '五倍！！'], [8, '八倍！！！']]) {
    if (eq >= START * x && !R.milestones[x]) {
      R.milestones[x] = true;
      R.fx.push({ k: 'banner', s: label, t: 0 });
      SFX.play('milestone');
      for (let i = 0; i < 40; i++) R.fx.push({ k: 'conf', x: WW / 2, y: WH * 0.4, vx: (Math.random() - 0.5) * 1400, vy: -300 - Math.random() * 900, c: ['#ffcf3a', UP, '#7ad7ff', '#ff8ad8', '#fff'][i % 5], t: 0, r: Math.random() * 6 });
    }
  }
  // a new day opens: what the night's news did (跳空), told plainly
  if (k > 0 && k % R.day === 0 && R.m.nights) {
    const d = k / R.day, items = (R.m.opens && R.m.opens[d]) || [];
    R.preview = null;
    R.fx.push({ k: 'banner', s: `第 ${d + 1} 天 开盘`, t: 0 });
    const said = items.map(it => {
      const st = R.m.stocks[it.s], gap = stockAt(it.s, k) / stockAt(it.s, k - 1) - 1, right = it.dir === it.sent;
      const judge = [right ? '快讯说中了' : '快讯翻车了', right ? '群聊竟然是真的' : '群聊是假的', right ? '老谋这回蒙对了' : '老谋又反着来了'][it.src];
      R.fx.push({ k: 'chartTxt', s: it.s, txt: `${gap >= 0 ? '高开' : '低开'} ${pctStr(gap)}`, col: gap >= 0 ? '#ffb3bf' : '#b9f5d4', t: 0 });
      R.flashTab[it.s] = 1;
      return `${SHORT[st.def.code]}${gap >= 0 ? '高开' : '低开'}${pctStr(gap, 0)}，${judge}`;
    });
    if (said.length) toast(said.join('；'), '#ffcf3a');
    if (items.length) explain('gap', '跳空：隔了一夜，开盘价直接跳上去或掉下来');
  }
  if (R.m.nights && R.days > 1 && k % R.day === S.PREVIEW && Math.floor(k / R.day) < R.days - 1) {
    const d = Math.floor(k / R.day);
    R.preview = { d, items: R.m.nights[d], t: 0 };
    SFX.play('news');
    explain('preview', '明日预告：明天的新闻。没收手的会留到明天');
  }
  // the end of each day: a soft count; the last one louder
  const left = R.day - 1 - (k % R.day), last = Math.floor(k / R.day) === R.days - 1;
  if (left < (last ? 100 : 50) && left % S.TPS === 0) {
    SFX.play('tick', left < 30);
    if (last && left === 90) { Music.level = 2; toast('最后 10 秒！该收手了', '#ffcf3a'); }
    if (!last && left === 40) toast('快收盘了：没收手的会留到明天（过夜）', '#ffcf3a');
  }
}
// the close of day d (not the last): a summary, tomorrow's news again, what is held overnight
const atDayEnd = () => R.days > 1 && R.tick >= 0 && R.tick % R.day === R.day - 1 && Math.floor(R.tick / R.day) < R.days - 1 && !R.dayDone[Math.floor(R.tick / R.day)];
const LAOMOU_SAYS = [[-0.3, '我丢雷老某，裤衩都快亏没了'], [-0.05, '亏了？我丢雷老某，明天捞回来'], [0.05, '不赚不亏，跟没来一样'], [0.3, '小赚，够买辣条了'], [1, '可以啊，明天接着干'], [99, '我丢雷老某，你是庄家吧？']];
// the close of day d: send the day's trades, get tomorrow's seed (a few tries; the summary is being read meanwhile).
// No answer: the round goes on with seeds made here, unranked, and says so.
const DAY_WAIT = 6.5;                                    // seconds the close may wait for tomorrow's seed
function fetchNextDay(d) {
  const round = R, dayActs = R.acts.filter(a => Math.floor(a[0] / R.day) === d);
  if (!R.ticket) { R.nextSeed = { state: 'ok' }; return; }
  if (JSON.stringify(dayActs).length > 1900) return goOffline('这一天交易太多了，这局不上榜');
  const pending = R.nextSeed = { state: 'busy', at: clock };   // (update gives up on it after DAY_WAIT seconds)
  let tries = 0;
  // one request that may take up to the deadline (a slow server still counts); a quick failure is tried once more in the time left
  const go = () => postJSON('/seed', { game: 'stock', ticket: round.ticket, acts: dayActs }, Math.max(800, (DAY_WAIT - (clock - pending.at)) * 1000 - 150)).then(r => {
    if (R !== round || R.nextSeed !== pending) return;     // gone on without it meanwhile
    if (!Array.isArray(r.seeds) || r.seeds.length !== d + 2 || !r.ticket) throw new Error('数据不对');
    R.seeds = r.seeds;
    R.ticket = r.ticket;
    R.nextSeed = { state: 'ok' };
  }).catch(e => {
    if (R !== round || R.nextSeed !== pending) return;
    if (++tries < 2 && !(e.status >= 400 && e.status < 500) && clock - pending.at < DAY_WAIT - 1.8) setTimeout(go, 600);
    else goOffline('没连上服务器，这局接着玩但不上榜');
  });
  go();
}
function goOffline(why) {
  R.ticket = null;
  R.offline = why;
  while (R.seeds.length < S.DAYS) R.seeds.push(localSeed());
  R.nextSeed = { state: 'ok' };
  toast(why, '#ffcf3a');
}
function dayEnd() {
  const d = Math.floor(R.tick / R.day), k = R.tick, eq = eqOf(R.m, R.a, k);
  const mine = R.closes.filter(c => Math.floor(c.t / R.day) === d);
  const pnl = eq - R.dayEq[d], pct = pnl / R.dayEq[d];
  R.dsum = { d, eq, pnl, pct, trades: mine.length, best: mine.reduce((b, c) => (!b || c.pnl > b.pnl ? c : b), null),
    worst: mine.reduce((b, c) => (!b || c.pnl < b.pnl ? c : b), null), fees: R.a.fees - R.dayFees[d], liqs: mine.filter(c => c.liq).length,
    says: LAOMOU_SAYS.find(x => pct < x[0])[1], items: (R.m.nights || [])[d] || [] };
  R.dayEq[d + 1] = eq;
  R.dayFees[d + 1] = R.a.fees;
  if (R.seeds && !R.rp) fetchNextDay(d);
  scene = 'dayend';
  sceneT = 0;
  Music.stop();
  SFX.play('bell');
  buzz([30, 40, 30]);
}
function nextDay() {
  const d = R.dsum.d;
  if (R.nextSeed && R.nextSeed.state === 'busy') return;
  if (R.seeds && R.seeds.length > R.m.known) { const m = S.make(R.seeds); normEvents(m); R.m = m; }   // tomorrow's prices exist now
  R.dayDone[d] = true;
  R.t = ((d + 1) * R.day) / S.TPS;
  // ranked: the service opens the day when 'next' gets there and its first tick comes back a way there and back later:
  // the page's day (and the music) starts that, and LIVE_BUF, behind (the ring shows the full day meanwhile: tOpen)
  if (R.live) { R.live.tOpen = R.t; R.t -= liveDelay(R.live); }
  const k = (d + 1) * R.day;                    // (what the next frame's update would do: the opening tick, its gaps and 爆仓)
  if (R.live) liveSend({ t: 'next' });           // (ranked: the service opens the day; its first tick comes in a moment)
  while (R.tick < k && R.tick < R.T - 1 && !R.wiped && (!R.live || R.tick < R.live.recv)) { R.tick++; onTick(R.tick); if (R.live) applyFills(); }
  scene = 'play';
  sceneT = 0;
  Music.start(R.t, 1);
}
function showNews(e, debunk) {
  const st = e.target >= 0 ? R.m.stocks[e.target] : null, code = st ? st.def.code : null, d = st ? SHORT[code] : '';
  let list;
  if (debunk) list = [`辟谣！${d}：根本没这回事`, `${d}官方辟谣：假的！`];
  else if (e.kind === K.RUMOR) list = e.sent > 0 ? NEWS.rumorUp : NEWS.rumorDown;
  else if (e.kind === K.DRUNK) list = e.sent > 0 ? NEWS.drunkUp : NEWS.drunkDown;
  else if (e.kind === K.GOOD || e.kind === K.BAD) list = (NEWS[e.kind][code] || []).concat(NEWS[e.kind].all.filter(x => !(code === 'SEAL' && x.includes('海豹'))));
  else list = NEWS[e.kind];
  const head = list[e.v % list.length].replace('{d}', d);
  const tg = debunk ? TAGS.debunk : e.kind === K.RUMOR ? TAGS.rumor : TAGS[e.kind];
  const good = !debunk && (e.kind === K.GOOD || e.kind === K.MOON || e.kind === K.BULL || (e.kind === K.RUMOR && e.sent > 0) || e.kind === K.MEME);
  R.card = { e, debunk, head, tag: tg.tag, bg: tg.bg, hint: tg.hint, t: 0, dog: st ? st.def.dog : null };
  if (debunk) explain('debunk', '辟谣：刚才那条是假消息，价格会往回走');
  else if (e.kind === K.RUMOR) explain('rumor', '群聊小道消息：一半是假的，可能会被辟谣');
  else if (e.kind === K.DRUNK) explain('drunk', '老谋喝多了：他说的常常要反着听');
  R.cards.unshift({ head, tag: tg.tag, bg: tg.bg, k: R.tick });
  if (R.cards.length > 4) R.cards.pop();
  if (e.kind === K.CRASH) { SFX.play('siren'); flash = { col: '#e0112b', t: 0, d: 0.35 }; Music.duck(true); setTimeout(() => Music.duck(false), 2100); }
  else SFX.play(good ? 'news' : 'newsbad');
  if (st && e.target !== R.sel) R.flashTab[e.target] = 1;
}

function endRound() {
  if (R.live && R.live.ab) { R.live.pq = []; R.a = R.live.ab; }   // (ranked: what the service booked; an order still on its way isn't)
  const tail = S.close(R.m, R.a);
  R.closeSells = tail;
  R.eqLog.push(R.a.cash);
  if (R.seeds && R.seeds.length === S.DAYS) {
    const check = S.run(R.seeds, R.acts);
    if (!check.ok || check.cash !== R.a.cash) console.warn('replay mismatch', check, R.a.cash);
  }
  const mult = R.a.cash / START;
  R.mult = mult;
  R.rank = R.wiped || mult < 0.02 ? WIPED : rankOf(mult);
  R.newBest = !R.wiped && mult >= 0.05 && mult > (save.best || 0);
  if (R.newBest) save.best = mult;
  save.plays = (save.plays || 0) + 1;
  persist();
  scene = 'close';
  sceneT = 0;
  Music.stop();
  SFX.play('bell');
  buzz([40, 60, 40]);
  setTimeout(() => upload(), 300);
}

function upload() {
  if (!R || R.up.state === 'busy' || R.up.state === 'done' || R.up === LOST_UP) return;
  if (R.live) { liveResult(R); return; }          // ranked: the service hands the round in; its answer comes with the close
  if (R.wiped) { R.up = { state: 'off', msg: '爆仓出局，这局不上榜' }; return; }
  if (!R.ticket) { R.up = { state: 'off', msg: R.offline || PRACTICE }; return; }
  if (R.acts.length === 0) { R.up = { state: 'off', msg: '一笔没交易，不上榜' }; return; }
  R.up = { state: 'busy', msg: '上传成绩中…' };
  const round = R;
  postJSON('/match', { game: 'stock', nickname: myName(), ticket: R.ticket, replay: { v: S.VERSION, seeds: R.seeds, acts: R.acts, cash: R.a.cash } }, 15000)
    .then(d => {
      // (the server's own ranks, from the board itself: off it, it says why; 11-09 review #8)
      round.up = { state: 'done', msg: d.on_board === false ? (d.message || '人工审核后上榜') : `今日第 ${d.rank_today} 名` + (d.rank_all ? ` · 总榜第 ${d.rank_all} 名` : ''), d };
      if (d.id) { save.mine = [d.id].concat(save.mine || []).slice(0, 30); persist(); }
      board.cache = {};
    })
    .catch(e => { round.up = { state: 'err', msg: '上传失败：' + e.message, retry: !(e.status >= 400 && e.status < 500) }; });
}

// =====================================================================================================
//  Update
// =====================================================================================================
function update(dt, gameDt) {
  if (gameDt === undefined) gameDt = dt;
  clock += dt;
  sceneT += dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 2.2);
  if (flash) { flash.t += dt; if (flash.t > flash.d) flash = null; }
  if (scene === 'result') resT += dt;
  if (!R) return;
  if (R.live) liveWatch(R);
  if (scene === 'play' && R.mode === 'tut') tutUpdate(dt);
  else if (scene === 'play' && R.mode === 'replay') rpUpdate(dt);
  else if (scene === 'intro' || scene === 'play') {
    // Game time runs on the frame clock; the music only nudges it so the news lands on the beat. The audio clock is trusted
    // only while it really moves: some phone webviews report 'running' with a clock that stands still (or stops after an
    // interruption), and following it froze the game — 「倒计时有时候会卡在 3」 (11-08). Far apart: the music is moved to
    // the game, never the game to the music.
    R.t += gameDt + musicNudge(gameDt);
    if (R.live && scene === 'play') {               // never ahead of what the service has sent; caught up when far behind
      const L = R.live;
      // picked up again: once what was missed is here, LIVE_BUF behind the service again (the music with it)
      if (L.rebase != null && L.recv >= L.rebase) { R.t = L.rebase / S.TPS - liveBuf(); L.rebase = null; Music.start(R.t, Music.level); }
      // far behind (a long stall): to LIVE_BUF behind the last tick here (the music follows, musicNudge)
      if (L.recv - R.tick > LIVE_LAG) R.t = Math.max(R.t, L.recv / S.TPS - liveBuf());
      // (R.t may sit a little below the tick shown, at a day's open or picked up again: curTick never goes back)
      R.t = Math.min(R.t, (L.recv + 1) / S.TPS - 1e-3);
    }
    if (scene === 'intro') {
      const beat = Math.floor((R.t + INTRO) / 0.5);
      if (beat !== R.lastBeat && beat < 3) { R.lastBeat = beat; SFX.play('count', 0); }
      if (R.t >= 0) { scene = 'play'; sceneT = 0; SFX.play('count', 1); R.fx.push({ k: 'banner', s: '开盘！', t: 0 }); }
    }
    if (scene === 'play') {
      const k = Math.min(R.T, Math.floor(R.t * S.TPS));
      while (R.tick < k && R.tick < R.T - 1 && !R.wiped && !atDayEnd() && (!R.live || R.tick < R.live.recv)) {
        R.tick++;
        onTick(R.tick);
        if (R.live) applyFills();
      }
      if (atDayEnd() && !R.wiped) dayEnd();
      else if (R.t * S.TPS >= R.T || (R.live && R.tick >= R.T - 1) || (R.wiped && R.liqT > 1.6)) endRound();
    }
  }
  // the next day's seed taking too long (a phone on a bad network): go on without it, unranked
  if (scene === 'dayend' && R && R.nextSeed && R.nextSeed.state === 'busy' && clock - R.nextSeed.at > DAY_WAIT) goOffline('网络太慢，这局接着玩但不上榜');
  if (scene === 'close' && sceneT > 2.2) { scene = 'result'; resT = 0; SFX.play(R.mult >= 1.1 ? 'rank' : 'sad'); if (R.mult < 0.95) setTimeout(() => SFX.voice(true), 700); Music.start(0, 0); }
  // tabs bounce on big moves
  if (scene === 'play') {
    const k = curTick();
    R.m.stocks.forEach((st, s) => {
      const p = stockAt(s, k), prev = stockAt(s, Math.max(0, k - 3));
      if (Math.abs(p - prev) / prev > 0.025) R.bump[s] = 1;
      R.bump[s] = Math.max(0, R.bump[s] - dt * 3);
      R.flashTab[s] = Math.max(0, R.flashTab[s] - dt * 0.6);
    });
    const eq = eqOf(R.m, R.a, k);
    R.eqShown = lerp(R.eqShown, eq, Math.min(1, dt * 10));
    R.selT += dt;
    R.comboT += dt;
    const live = !frozen();
    if (R.card && live) R.card.t += dt;
    const cg = R.card && cardGeom(R.card), occ = cg && R.card.t < cg.life ? cg.h + 18 : 0;
    R.cardOcc = lerp(R.cardOcc || 0, occ, Math.min(1, dt * 12));
    if (R.words && live) R.words.t += dt;
    if (R.toast) { R.toast.t += dt; if (R.toast.t > 1.8) R.toast = null; }
    if (R.tips && R.tips.length && live) {
      R.tips[0].t += dt;
      if (R.tips[0].t > TIP_LIFE) R.tips.shift();
      while (R.tips.length && R.tips[0].t === 0 && clock - R.tips[0].at > 6) R.tips.shift();   // its moment has passed
    }
    if (R.liqT != null) { R.liqT += dt; if (R.liqT > 2.2) { R.liqT = null; R.crack = null; } }
    if (R.btnShake) { R.btnShake.t += dt; if (R.btnShake.t > 0.35) R.btnShake = null; }
  }
  if (R.fx.length) {
    for (const f of R.fx) {
      f.t += dt;
      if (f.k === 'conf') { if (f.t > 0) { f.vy += 1400 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.99; } }
      if (f.k === 'rocket' && f.t > 0) f.y -= dt * (900 + f.x % 400);
    }
    R.fx = R.fx.filter(f => f.t < ({ coin: 0.9, pop: f.life || 1.4, combo: 1.2, banner: 1.4, conf: 2.4, meme: f.small ? 1.1 : 1.2, chartTxt: 1.2, rocket: 2.6 }[f.k] || 1.5));
  }
  for (const st of R.stamps) st.t += dt;
  R.stamps = R.stamps.filter(st => st.t < 1.6);
}

// =====================================================================================================
//  Render
// =====================================================================================================
function render() {
  if (Lay.tut !== !!(R && R.mode === 'tut')) layout();
  buttons = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  drawBackground();
  const sx = shake ? (Math.random() - 0.5) * 26 * shake : 0, sy = shake ? (Math.random() - 0.5) * 26 * shake : 0;
  ctx.setTransform(view.s * DPR, 0, 0, view.s * DPR, (view.ox + sx * view.s) * DPR, (view.oy + sy * view.s) * DPR);
  if (scene === 'title') renderTitle();
  else if (scene === 'board') renderBoard();
  else if (R) {
    renderPlay();
    if (scene === 'intro') renderIntro();
    if (scene === 'pause') renderPause();
    if (scene === 'dayend') renderDayEnd();
    if (scene === 'close') renderClose();
    if (scene === 'result') renderResult();
  }
  drawNotice();
  if (flash) {
    ctx.globalAlpha = Math.max(0, 1 - flash.t / flash.d) * 0.7;
    ctx.fillStyle = flash.col;
    ctx.fillRect(-WW, -WH, WW * 3, WH * 3);
    ctx.globalAlpha = 1;
  }
}

function drawBackground() {
  if (cw < 1) return;
  if (!bgCache) {
    bgCache = document.createElement('canvas');
    bgCache.width = Math.max(1, Math.round(cw * DPR));
    bgCache.height = Math.max(1, Math.round(ch * DPR));
    const b = bgCache.getContext('2d'), w = bgCache.width, h = bgCache.height;
    let g = b.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d0c3a');
    g.addColorStop(0.6, '#2b1150');
    g.addColorStop(1, '#3a1450');
    b.fillStyle = g;
    b.fillRect(0, 0, w, h);
    g = b.createRadialGradient(w / 2, -h * 0.1, 0, w / 2, -h * 0.1, h * 0.8);
    g.addColorStop(0, 'rgba(255,90,140,0.25)');
    g.addColorStop(1, 'rgba(255,90,140,0)');
    b.fillStyle = g;
    b.fillRect(0, 0, w, h);
    // a faint trading-floor grid
    b.strokeStyle = 'rgba(255,255,255,0.04)';
    b.lineWidth = 1;
    const step = 40 * DPR * view.s * 1.6;
    for (let x = 0; x < w; x += step) { b.beginPath(); b.moveTo(x, 0); b.lineTo(x, h); b.stroke(); }
    for (let y = 0; y < h; y += step) { b.beginPath(); b.moveTo(0, y); b.lineTo(w, y); b.stroke(); }
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bgCache, 0, 0);
  ctx.restore();
}

// ---------- the trading screen ----------
function tabRect(s) {
  const T = Lay.tabs, n = R ? R.m.stocks.length : S.N, w = (T.w - (n - 1) * 10) / n;
  return { x: T.x + s * (w + 10), y: T.y, w, h: T.h };
}
function btnRect(buy) {
  const B = Lay.btns;
  if (B.row) { const w = (B.w - 16) / 2; return { x: buy ? B.x : B.x + w + 16, y: B.y, w, h: B.h }; }
  const h = (B.h - 16) / 2;
  return { x: B.x, y: buy ? B.y : B.y + h + 16, w: B.w, h };
}
function renderPlay() {
  const k = R.tick < 0 ? 0 : curTick();
  drawHud(k);
  drawTabs(k);
  drawChart(k);
  drawPosition(k);
  if (R.rp) drawReplay(); else drawControls(k);
  if (!R.tut && !R.rp) {                          // 排位局 / 练习局, at the right of the chart's title row (a news card covers it)
    const C = Lay.chart;
    txt(R.live ? '排位局 · 以服务器成交价为准' : (R.offline || PRACTICE), C.x + C.w - 18, C.y + 30, 17,
      R.live ? 'rgba(255,207,58,0.8)' : 'rgba(255,255,255,0.55)', { align: 'right', weight: 800, max: C.w * 0.48 });
  }
  drawNewsCard();
  drawPreview();
  drawWords();
  drawFx();
  drawTip();
  drawCrack();
  if (R.rp && R.rp.done) drawReplay();          // the end card over everything
  if (R.tut) drawTut();
}
// the cracked screen after a 爆仓
function drawCrack() {
  const c = R.crack;
  if (!c || R.liqT == null) return;
  const a = Math.min(1, (2.2 - R.liqT) * 2), grow = Math.min(1, R.liqT * 8);
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.fillStyle = 'rgba(60,0,10,0.25)';
  ctx.fillRect(-WW, -WH, WW * 3, WH * 3);
  ctx.lineJoin = 'round';
  for (const pts of c.lines) {
    const n = Math.max(2, Math.ceil(pts.length * grow));
    for (const [w, col] of [[7, 'rgba(20,0,10,0.6)'], [3, 'rgba(255,255,255,0.95)']]) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) (i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]));
      ctx.lineWidth = w;
      ctx.strokeStyle = col;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(c.x, c.y, 26, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
  ctx.restore();
}

function drawHud(k) {
  const H = Lay.hud, eq = scene === 'play' ? R.eqShown : (scene === 'intro' ? START : R.a.cash), mult = eq / START;
  // menu
  if (scene === 'play') button(R.rp ? 'rpExit' : 'menu', '', H.x + 16, H.y + 22, 66, 66, { icon: R.rp ? 'close' : 'pause', iconSize: 30, fill: '#3b1a64', size: 30, r: 20, gloss: false });
  const big = PORT ? 52 : 44, my = PORT ? 74 : 64;
  txt('总资产', H.x + 100, H.y + (PORT ? 32 : 26), 24, GOLD, { align: 'left', stroke: '#2a0c22', sw: 5 });
  txt(money(eq), H.x + 100, H.y + my, big, '#fff', { align: 'left', stroke: '#2a0c22', sw: 7, max: 300 });
  ctx.font = font(big);
  const ew = Math.min(300, ctx.measureText(money(eq)).width);
  // the clock: a ring that empties, red in the last 10 s
  const tc = Math.max(0, R.t, R.live ? R.live.tOpen : 0);   // (ranked: the day's open, until the clock gets there)
  const dayNow = Math.min(R.days - 1, Math.floor(tc * S.TPS / R.day)), dayLen = R.day / S.TPS;
  const left = Math.max(0, (dayNow + 1) * dayLen - tc), cx = H.x + H.w - 64, cy = H.y + (PORT ? 60 : 50), r = PORT ? 42 : 38;
  // the multiple in a pill, red up / green down: after the money, or (when that would run into the day pill, on a narrow
  // tall screen) smaller, up beside 总资产
  const mc = colorOf(mult - 1), dayX = R.days > 1 ? cx - r - 112 : cx - r - 8;
  const low = H.x + 112 + ew + 132 > dayX - 8;
  ctx.font = font(24);
  const mx = low ? H.x + 112 + ctx.measureText('总资产').width : H.x + 112 + ew, mw = low ? 108 : 132, mh = low ? 36 : 48;
  const mcy = low ? H.y + (PORT ? 32 : 26) : H.y + my;
  rr(mx, mcy - mh / 2, mw, mh, mh / 2);
  ctx.fillStyle = mult >= 1 ? 'rgba(255,59,85,0.22)' : 'rgba(25,201,122,0.22)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = mc;
  ctx.stroke();
  txt(multStr(mult), mx + mw / 2, mcy + 1, low ? 26 : 32, mc === '#e8dcff' ? '#fff' : mc, { stroke: '#1b0a2e', sw: 5 });
  const hot = left <= (dayNow === R.days - 1 ? 10 : 5) && scene === 'play';
  if (R.days > 1) {                               // which day
    rr(cx - r - 112, cy - 22, 96, 44, 22);
    ctx.fillStyle = '#3b1a64';
    ctx.fill();
    txt(`第${dayNow + 1}/${R.days}天`, cx - r - 64, cy + 1, 22, GOLD);
  }
  const pulse = hot ? 1 + 0.08 * Math.max(0, Math.cos((R.t % 1) * Math.PI * 2)) : 1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#21103b';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left / dayLen);
  ctx.lineWidth = 10;
  ctx.strokeStyle = hot ? UP : GOLD;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
  txt(R.tut ? '教' : String(Math.ceil(left)), 0, 2, R.tut ? 32 : 36, hot ? '#ffd6dc' : '#fff', { stroke: '#2a0c22', sw: 5 });
  ctx.restore();
  // the streak
  if (R.combo >= 2 && scene === 'play') {
    const x = cx - r - 110, y = H.y + 20, k2 = 1 + 0.06 * Math.sin(clock * 12);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k2, k2);
    ctx.rotate(-0.06);
    icon('flame', -44, 0, 26, '#ff7a12');
    txt(`连赚×${R.combo}`, 10, 0, 22, '#ffe14d', { stroke: '#7a1a00', sw: 5 });
    ctx.restore();
  }
}

function drawTabs(k) {
  R.m.stocks.forEach((st, s) => {
    const T = tabRect(s), sel = s === R.sel, p = stockAt(s, k), chg = p / openPrice(s) - 1, L = st.L[k];
    const lift = sel ? -6 : 0, b = R.bump[s] * 6 * Math.sin(clock * 30);
    ctx.save();
    ctx.translate(0, lift + b);
    rr(T.x, T.y + 6, T.w, T.h, 20);
    ctx.fillStyle = 'rgba(10,2,24,0.5)';
    ctx.fill();
    rr(T.x, T.y, T.w, T.h, 20);
    ctx.fillStyle = sel ? '#4a2178' : '#2c1548';
    ctx.fill();
    // a news flash on the tab
    if (R.flashTab[s] > 0 && !sel) {
      ctx.globalAlpha = 0.6 * R.flashTab[s] * (0.5 + 0.5 * Math.sin(clock * 16));
      ctx.fillStyle = GOLD;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = sel ? 5 : 3;
    ctx.strokeStyle = sel ? GOLD : 'rgba(255,255,255,0.18)';
    rr(T.x, T.y, T.w, T.h, 20);
    ctx.stroke();
    const name = TABNAME[st.def.code];
    if (T.w < 220) {                                     // portrait: face and name on top, price under
      const fr = 24, fx = T.x + fr + 10, fy = T.y + fr + 10;
      face(st.def.dog, fx, fy, fr, sel ? GOLD : 'rgba(255,255,255,0.6)');
      const tall = T.h >= 120;                           // (a short tab, on a wide screen held flat: no code line)
      txt(name, fx + fr + 8, tall ? fy - 9 : fy, 24, '#fff', { align: 'left', max: T.x + T.w - fx - fr - 14 });
      if (tall) txt(st.def.code, fx + fr + 8, fy + 15, 16, 'rgba(255,255,255,0.55)', { align: 'left', weight: 800 });
      txt(priceStr(p), T.x + T.w / 2, T.y + T.h - (tall ? 46 : 40), 28, '#fff', { stroke: '#1b0a2e', sw: 4, max: T.w - 16 });
      txt(pctStr(chg), T.x + T.w / 2, T.y + T.h - 18, 24, colorOf(chg), { stroke: '#1b0a2e', sw: 4 });
    } else {                                             // landscape: face left, name under it, price on the right
      const fr = 30, fx = T.x + fr + 12, fy = T.y + 44;
      face(st.def.dog, fx, fy, fr, sel ? GOLD : 'rgba(255,255,255,0.6)');
      txt(name, fx, T.y + T.h - 18, 22, '#fff', { max: 2 * fr + 30 });
      txt(priceStr(p), T.x + T.w - 16, T.y + 40, 32, '#fff', { align: 'right', stroke: '#1b0a2e', sw: 4, max: T.w - 2 * fr - 50 });
      txt(pctStr(chg), T.x + T.w - 16, T.y + 78, 24, colorOf(chg), { align: 'right', stroke: '#1b0a2e', sw: 4 });
    }
    // what you hold of it
    const Ps = posInfo(s, p);
    if (Ps) {                                            // what you hold of it: 押涨 / 押跌 and how it's doing, coloured by that
      if (!sel) { rr(T.x, T.y, T.w, T.h, 20); ctx.lineWidth = 4; ctx.strokeStyle = Ps.pnl >= 0 ? UP : '#19c97a'; ctx.stroke(); }
      const lab = (Ps.dir > 0 ? '涨' : '跌') + (Ps.lev > 1 ? Ps.lev + '×' : '') + ' ' + (Math.abs(Ps.roe) < 0.0005 ? '0%' : pctStr(Ps.roe));
      const bw = Ps.lev > 1 ? 128 : 104;
      rr(T.x + T.w - bw + 6, T.y - 10, bw, 30, 15);
      ctx.fillStyle = Ps.pnl >= 0 ? UP : '#11a866';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = Ps.lev === 10 ? GOLD : '#fff';
      ctx.stroke();
      txt(lab, T.x + T.w - bw / 2 + 6, T.y + 5, 18, '#fff');
    }
    const lq = R.stamps.find(x => x.s === s && x.liq);
    if (lq) {                                            // 爆仓 stamp on the tab
      ctx.save();
      ctx.translate(T.x + T.w / 2, T.y + T.h / 2);
      ctx.rotate(-0.2);
      const k2 = Math.max(1, 2 - lq.t * 6);
      ctx.scale(k2, k2);
      rr(-52, -20, 104, 40, 8);
      ctx.fillStyle = 'rgba(122,0,16,0.92)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ff3b55';
      ctx.stroke();
      txt('爆仓', 0, 1, 26, '#fff');
      ctx.restore();
    }
    if (L === 1 || L === -1) {
      ctx.save();
      ctx.translate(T.w < 220 ? T.x + T.w - 34 : T.x + T.w / 2 + 10, T.w < 220 ? T.y + T.h - 66 : T.y + T.h - 22);
      ctx.rotate(-0.25);
      rr(-30, -14, 60, 28, 6);
      ctx.fillStyle = L === 1 ? UP : '#11a866';
      ctx.fill();
      txt(L === 1 ? '涨停' : '跌停', 0, 1, 18, '#fff');
      ctx.restore();
    }
    ctx.restore();
    buttons.push({ id: 'tab' + s, x: T.x, y: T.y, w: T.w, h: T.h });
  });
}

function candlesOf(s, k) {
  // k = the tick being shown; candles of CANDLE ticks, the last one still forming
  const st = R.m.stocks[s], end = HIST + k, out = [];
  const lastStart = end - (end % CANDLE);
  for (let c = 0; c < SHOW; c++) {
    const a = lastStart - (SHOW - 1 - c) * CANDLE;
    if (a < 0) continue;
    const b = Math.min(a + CANDLE - 1, end);
    let o = st.P[Math.max(0, a - 1)], h = o, l = o, cl = o;
    for (let i = a; i <= b; i++) { const p = st.P[i]; if (p > h) h = p; if (p < l) l = p; cl = p; }
    out.push({ o, h, l, c: cl, i: c, t: a - HIST });
  }
  return out;
}
function drawChart(k) {
  const C = Lay.chart, s = R.sel, st = R.m.stocks[s], L = st.L[k];
  panel(C.x, C.y, C.w, C.h, { fill: 'rgba(16,6,32,0.88)', line: 'rgba(255,207,58,0.3)' });
  const pad = { l: 16, r: 108, t: Math.max(64, (R.cardOcc || 0) + 8), b: 30 }, X0 = C.x + pad.l, X1 = C.x + C.w - pad.r, Y0 = C.y + pad.t, Y1 = C.y + C.h - pad.b;
  const cs = candlesOf(s, k);
  let lo = Infinity, hi = -Infinity;
  for (const c of cs) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
  const P0 = posInfo(s, stockAt(s, k));
  if (P0) {
    lo = Math.min(lo, P0.avg); hi = Math.max(hi, P0.avg);
    // the 爆仓 line is pulled into view when it is close (within 15 %), otherwise it sits on the edge with an arrow
    if (P0.lev > 1 || P0.dir < 0) { const pl = P0.liq, cur = stockAt(s, k); if (Math.abs(pl - cur) < cur * 0.15) { lo = Math.min(lo, pl); hi = Math.max(hi, pl); } }
  }
  const mid = (lo + hi) / 2, span = Math.max(hi - lo, mid * 0.04) * 1.15;
  const tgt = { lo: mid - span / 2, hi: mid + span / 2 };
  const rg = R.ranges[s] || (R.ranges[s] = tgt);
  rg.lo = lerp(rg.lo, tgt.lo, 0.18);
  rg.hi = lerp(rg.hi, tgt.hi, 0.18);
  // keep everything visible even mid-ease
  rg.lo = Math.min(rg.lo, lo - span * 0.03);
  rg.hi = Math.max(rg.hi, hi + span * 0.03);
  const Y = p => Y1 - (p - rg.lo) / (rg.hi - rg.lo) * (Y1 - Y0);
  const cwid = (X1 - X0) / SHOW, X = i => X0 + (i + 0.5) * cwid;
  // grid + price labels
  ctx.save();
  rr(C.x, C.y, C.w, C.h, 22);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (let g = 0; g <= 4; g++) {
    const y = Y0 + (Y1 - Y0) * g / 4;
    ctx.beginPath(); ctx.moveTo(X0, y); ctx.lineTo(X1, y); ctx.stroke();
    txt(priceStr(rg.hi - (rg.hi - rg.lo) * g / 4), X1 + 54, y, 20, 'rgba(255,255,255,0.45)', { weight: 700 });
  }
  // the open line (the round's start price)
  const op = openPrice(s), oy = Y(op);
  if (oy > Y0 && oy < Y1) {
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(X0, oy); ctx.lineTo(X1, oy); ctx.stroke();
    ctx.setLineDash([]);
    txt('开盘价', X1 - 34, oy - 12, 17, 'rgba(255,255,255,0.4)', { weight: 800 });
  }
  // where each day opens (after the night's 跳空)
  for (const c of cs) if (c.t > 0 && c.t % R.day === 0) {
    const x = X(c.i) - cwid / 2;
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255,207,58,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, Y0 - 20); ctx.lineTo(x, Y1); ctx.stroke();
    ctx.setLineDash([]);
    txt(`第${c.t / R.day + 1}天`, x + 34, Y1 - 14, 18, 'rgba(255,207,58,0.8)', { weight: 800 });
  }
  // pre-open shade
  const openC = cs.findIndex(c => c.t >= 0);
  if (openC > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(X0, Y0 - 20, X(openC) - cwid / 2 - X0, Y1 - Y0 + 20);
  }
  // news markers for this stock
  for (const e of R.m.events) {
    if (e.news > k || (e.target !== s && e.target !== -1)) continue;
    const ci = cs.findIndex(c => e.news >= c.t && e.news < c.t + CANDLE);
    if (ci < 0) continue;
    const tg = e.kind === K.RUMOR ? TAGS.rumor : TAGS[e.kind], x = X(ci);
    ctx.strokeStyle = tg.bg;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(x, Y0 - 10); ctx.lineTo(x, Y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    rr(x - 22, Y1 - 4, 44, 26, 10);
    ctx.fillStyle = tg.bg;
    ctx.fill();
    txt(tg.mark, x, Y1 + 9, 18, '#fff');
  }
  // candles
  for (const c of cs) {
    const x = X(c.i), up = c.c >= c.o, col = up ? UP : DOWN;
    const w = Math.max(4, cwid * 0.66);
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
    const yo = Y(c.o), yc = Y(c.c), top = Math.min(yo, yc), hh = Math.max(3, Math.abs(yo - yc));
    ctx.fillStyle = col;
    if (up && c.c !== c.o) { ctx.lineWidth = 3; ctx.strokeRect(x - w / 2, top, w, hh); ctx.globalAlpha = 0.35; ctx.fillRect(x - w / 2, top, w, hh); ctx.globalAlpha = 1; }
    else ctx.fillRect(x - w / 2, top, w, hh);
  }
  drawMarks(cs, X, Y, s, Y0, Y1);
  // your average cost
  if (P0) {
    const y = Y(P0.avg);
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X0, y); ctx.lineTo(X1, y); ctx.stroke();
    ctx.setLineDash([]);
    rr(X0, y - 15, 122, 30, 12);
    ctx.fillStyle = GOLD;
    ctx.fill();
    txt(`我押在这 ${P0.dir > 0 ? '涨' : '跌'}`, X0 + 61, y + 1, 18, '#2a1240');
    if (P0.lev > 1 || P0.dir < 0) {                     // 爆仓线
      const ly = Y(P0.liq), inside = ly > Y0 - 20 && ly < Y1, yy = clamp(ly, Y0 - 16, Y1 - 4);
      const near = Math.abs(P0.liq - stockAt(s, k)) / stockAt(s, k);
      ctx.globalAlpha = inside ? 0.75 + 0.25 * Math.sin(clock * (near < 0.03 ? 16 : 5)) : 0.7;
      ctx.setLineDash(inside ? [14, 8] : [4, 10]);
      ctx.strokeStyle = '#ff2a48';
      ctx.lineWidth = inside ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(X0, yy); ctx.lineTo(X1, yy); ctx.stroke();
      ctx.setLineDash([]);
      const label = `爆仓线 ${priceStr(P0.liq)}` + (inside ? '' : ly < Y0 ? ' ↑' : ' ↓');
      ctx.font = font(18);
      const lw = ctx.measureText(label).width + 20;
      rr(X1 - lw - 6, yy - 15, lw, 30, 12);
      ctx.fillStyle = '#c4001c';
      ctx.fill();
      txt(label, X1 - lw / 2 - 6, yy + 1, 18, '#fff');
      ctx.globalAlpha = 1;
      if (inside && near < 0.03) {                      // about to go: the chart edges pulse red
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(clock * 16);
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#ff2a48';
        rr(C.x + 4, C.y + 4, C.w - 8, C.h - 8, 20);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  // the live price: a line across and a tag on the right
  const p = stockAt(s, k), last = cs[cs.length - 1], py = Y(p), pc = p >= (last ? last.o : p) ? UP : DOWN;
  ctx.strokeStyle = pc;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X0, py); ctx.lineTo(X1, py); ctx.stroke();
  ctx.globalAlpha = 1;
  if (last) {   // a pulse on the live candle
    ctx.beginPath();
    ctx.arc(X(last.i), py, 7 + 4 * Math.abs(Math.sin(clock * 6)), 0, Math.PI * 2);
    ctx.fillStyle = pc;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  rr(X1 + 4, py - 20, pad.r - 10, 40, 10);
  ctx.fillStyle = pc;
  ctx.fill();
  txt(priceStr(p), X1 + 4 + (pad.r - 10) / 2, py + 1, 24, '#fff', { max: pad.r - 16 });
  // the header: name, price, change
  const chg = p / op - 1;
  face(st.def.dog, C.x + 38, C.y + 34, 22, GOLD);
  txt(DOGNAME[st.def.code], C.x + 68, C.y + 26, 28, '#fff', { align: 'left' });
  txt(st.def.code, C.x + 68, C.y + 50, 16, 'rgba(255,255,255,0.5)', { align: 'left', weight: 800 });
  ctx.font = font(28);
  const nw = ctx.measureText(DOGNAME[st.def.code]).width;
  txt(priceStr(p), C.x + 84 + nw, C.y + 30, 34, colorOf(chg), { align: 'left', stroke: '#140626', sw: 5 });
  ctx.font = font(34);
  const pw = ctx.measureText(priceStr(p)).width;
  txt(pctStr(chg), C.x + 96 + nw + pw, C.y + 32, 24, colorOf(chg), { align: 'left' });
  // locks
  if (L === 1 || L === -1) {
    const up = L === 1, ly = py;
    ctx.fillStyle = up ? 'rgba(255,59,85,0.12)' : 'rgba(25,201,122,0.12)';
    if (up) ctx.fillRect(X0, Y0 - 30, X1 - X0, ly - Y0 + 30); else ctx.fillRect(X0, ly, X1 - X0, Y1 - ly);
    const stp = R.stamps.find(x => x.s === s);
    const k2 = stp ? Math.max(1, 2.2 - stp.t * 8) : 1;
    ctx.save();
    ctx.translate(C.x + C.w * 0.46, C.y + C.h * (up ? 0.5 : 0.42));
    ctx.rotate(-0.18);
    ctx.scale(k2, k2);
    ctx.globalAlpha = stp ? Math.min(1, stp.t * 8) : 0.85;
    rr(-120, -46, 240, 92, 16);
    ctx.lineWidth = 8;
    ctx.strokeStyle = up ? UP : DOWN;
    ctx.stroke();
    txt(up ? '涨停' : '跌停', 0, -6, 60, up ? UP : DOWN);
    txt(up ? '涨到头 · 押涨的快收手' : '跌到头 · 押跌的快收手', 0, 32, 20, up ? '#ffb3bf' : '#b3f5d6', { max: 224 });
    ctx.restore();
  }
  if (R.halt) {
    ctx.fillStyle = 'rgba(20,0,10,0.62)';
    ctx.fillRect(C.x, C.y, C.w, C.h);
    const left = Math.max(0, (R.halt.t0 + S.HALT - (R.t * S.TPS)) / S.TPS);
    ctx.save();
    ctx.translate(C.x + C.w / 2, C.y + C.h / 2);
    ctx.rotate(-0.08 + 0.02 * Math.sin(clock * 20));
    bigText('熔断！', 0, -20, 96, '#fff', '#ff3b55');
    ctx.restore();
    txt(`暂停交易 ${left.toFixed(1)}s`, C.x + C.w / 2, C.y + C.h / 2 + 70, 32, '#ffd6dc', { stroke: '#2a0010', sw: 6 });
    txt('一会儿开盘会反弹，准备抄底！', C.x + C.w / 2, C.y + C.h / 2 + 116, 24, '#ffcf3a', { stroke: '#2a0010', sw: 5 });
  }
  for (const f of R.fx) if (f.k === 'chartTxt' && f.s === s) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
    txt(f.txt, C.x + C.w / 2, C.y + C.h * 0.35 - f.t * 40, 44, f.col, { stroke: '#1b0a2e', sw: 8 });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// what is held of stock s at price p: {dir, lev, n, pnl, roe, liq, avg}
function posInfo(s, p) {
  const a = R.a, n = a.sh[s];
  if (n <= 0) return null;
  const pnl = a.dir[s] * (n * p - a.basis[s]) - a.paid[s];
  return { dir: a.dir[s], lev: a.lev[s], n, pnl, roe: pnl / a.margin[s], liq: S.liqPrice(a, s), avg: a.basis[s] / n, margin: a.margin[s] };
}
const posTag = P => `${P.dir > 0 ? '押涨' : '押跌'}${P.lev > 1 ? ' ' + P.lev + '×' : ''}`;
const stakeOf = P => Math.trunc(P.margin);           // what was put in (the money at stake, before the multiplier)
function drawPosition(k) {
  const Pn = Lay.pos, s = R.sel, a = R.a, st = R.m.stocks[s], p = stockAt(s, k), P = posInfo(s, p), lx = Pn.x + 22;
  panel(Pn.x, Pn.y, Pn.w, Pn.h, { fill: 'rgba(42,18,64,0.92)' });
  const other = a.sh.findIndex(x => x > 0);
  // (11-08, plain words) left: the money not in play; right: what is in play on this dog and whether it's winning, big
  const winSay = P ? (P.pnl > 0 ? '现在赚' : P.pnl < 0 ? '现在亏' : '不赚不亏') : '';
  const idle = other >= 0 ? `还押着 ${SHORT[R.m.stocks[other].def.code]}，${PORT ? '点上面' : '点左边'}切过去看`
    : R.first ? '要涨点「押涨」，要跌点「押跌」' : '等新闻再押';
  if (PORT) {
    txt('手上的钱', lx, Pn.y + 28, 22, MUTED, { align: 'left' });
    txt(money(a.cash), lx, Pn.y + 66, 34, '#fff', { align: 'left', max: 210 });
    const mx = Pn.x + 248;
    if (P) {
      dirPill(mx, Pn.y + 14, P);
      txt(`押了 ${money(stakeOf(P))}`, mx + 132, Pn.y + 29, 22, '#fff', { align: 'left', max: 150 });
      txt(`买在 ${priceStr(P.avg)}` + (P.lev > 1 || P.dir < 0 ? ` · 爆仓线 ${priceStr(P.liq)}` : ''), mx, Pn.y + 72, 21, GOLD, { align: 'left', max: 250 });
      txt(winSay, Pn.x + Pn.w - 22, Pn.y + 26, 20, colorOf(P.pnl), { align: 'right', weight: 800 });
      txt(money(P.pnl, true), Pn.x + Pn.w - 22, Pn.y + 64, 36, colorOf(P.pnl), { align: 'right', stroke: '#1b0a2e', sw: 5, max: 190 });
    } else {
      txt(`${SHORT[st.def.code]} · 还没押`, mx, Pn.y + 32, 28, 'rgba(255,255,255,0.75)', { align: 'left', max: Pn.w - 270 });
      txt(idle, mx, Pn.y + 70, 22, other >= 0 ? GOLD : MUTED, { align: 'left', max: Pn.w - 270 });
    }
  } else {
    txt('手上的钱', lx, Pn.y + 26, 22, MUTED, { align: 'left' });
    txt(money(a.cash), lx, Pn.y + 60, 34, '#fff', { align: 'left', max: 220 });
    if (P) {
      dirPill(lx, Pn.y + 84, P);
      txt(`押了 ${money(stakeOf(P))} · 买在 ${priceStr(P.avg)}`, lx + 132, Pn.y + 99, 21, GOLD, { align: 'left', max: Pn.w - 170 });
      if (P.lev > 1 || P.dir < 0) txt(`爆仓线 ${priceStr(P.liq)}：碰到就没了`, lx, Pn.y + 126, 20, '#ff8a9a', { align: 'left', weight: 800 });
      txt(winSay, Pn.x + Pn.w - 22, Pn.y + 24, 20, colorOf(P.pnl), { align: 'right', weight: 800 });
      txt(money(P.pnl, true), Pn.x + Pn.w - 22, Pn.y + 60, 36, colorOf(P.pnl), { align: 'right', stroke: '#1b0a2e', sw: 5, max: 200 });
    } else {
      txt(`${SHORT[st.def.code]} · 还没押`, lx, Pn.y + 98, 24, 'rgba(255,255,255,0.75)', { align: 'left', max: Pn.w - 44 });
      txt(idle, lx, Pn.y + 128, 21, other >= 0 ? GOLD : MUTED, { align: 'left', max: Pn.w - 44 });
    }
  }
}
function dirPill(x, y, P) {
  rr(x, y, 122, 30, 15);
  ctx.fillStyle = P.dir > 0 ? UP : '#11a866';
  ctx.fill();
  if (P.lev === 10) { ctx.lineWidth = 3; ctx.strokeStyle = GOLD; ctx.stroke(); }
  txt(posTag(P), x + 61, y + 16, 20, '#fff');
}

function drawControls(k) {
  const Cp = Lay.chips, Lv = Lay.levs, s = R.sel, st = R.m.stocks[s], L = st.L[k], p = stockAt(s, k), a = R.a, P = posInfo(s, p);
  // amount chips
  const cw2 = (Cp.w - 2 * 12) / 3;
  FRACS.forEach((f, i) => {
    const on = R.frac === i, x = Cp.x + i * (cw2 + 12);
    button('frac' + i, P ? f.h : f.q, x, Cp.y + (on ? 0 : 4), cw2, Cp.h - 4, { fill: on ? goldFill(Cp.y, Cp.h) : '#3b1a64', color: on ? '#2a1240' : '#e7dbff', stroke: on ? 'rgba(255,255,255,0.6)' : '#1b0a2e', size: 28, r: 20, line: on ? '#fff' : 'rgba(255,255,255,0.25)', shadow: on ? 'rgba(10,2,24,0.55)' : 'transparent', gloss: on });
  });
  // leverage: 1× calm, 3× orange, 10× on fire; locked to the position's own while one is held
  const lw = (Lv.w - 2 * 12) / 3, curLev = P ? S.LEVS.indexOf(P.lev) : R.lev;
  const LCOL = [['#8f7ab8', '#5a4380'], ['#ffb347', '#ff7a12'], ['#ff5a6e', '#c4001c']];
  S.LEVS.forEach((lv, i) => {
    const on = curLev === i, x = Lv.x + i * (lw + 12), y = Lv.y + (on ? 0 : 4);
    const label = LEV_NAME[i];
    button('lev' + i, label, x, y, lw, Lv.h - 4, { fill: on ? grad(y, Lv.h, LCOL[i][0], LCOL[i][1]) : '#2c1548', color: '#fff', size: 26, r: 20,
      line: on ? '#fff' : 'rgba(255,255,255,0.2)', shadow: on ? 'rgba(10,2,24,0.55)' : 'transparent', gloss: on, dim: P && !on });
    if (on && i === 2 && !P) {                                 // a flicker of flame around the 10× chip
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(clock * 18);
      rr(x - 4, y - 4, lw + 8, Lv.h + 4, 24);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffcf3a';
      ctx.stroke();
      ctx.restore();
    }
  });
  const halt = L === 2, q = [1, 2, 4][R.frac], lev = P ? P.lev : S.LEVS[R.lev];
  const budget = q === 4 ? a.cash : Math.trunc(a.cash * q / 4), qn = P ? (q === 4 ? P.n : Math.max(1, Math.trunc(P.n * q / 4))) : 0;
  const poor = a.cash < p * 1.02;
  // the 买 button: buy up (open / add a long), or close a short
  const B = btnRect(true), shk = R.btnShake ? Math.sin(R.btnShake.t * 60) * 10 * (1 - R.btnShake.t / 0.35) : 0;
  let bL, bSub, bOk;
  const stakeSay = `${money(budget)}${lev > 1 ? ' ×' + lev : ''}`;
  if (P && P.dir < 0) { bL = '收手'; bSub = `${FRACS[R.frac].s}，把钱拿回来`; bOk = true; }
  else { bL = P ? '再押涨' : '押涨'; bSub = poor ? '没钱了' : P ? `再押 ${stakeSay}` : `涨了就赚 · ${stakeSay}`; bOk = !poor; }
  if (halt) { bSub = '熔断中 · 暂停'; bOk = false; } else if (L === 1) { bSub = P && P.dir < 0 ? '涨到头 · 现在收不了' : '涨到头 · 押不进'; bOk = false; }
  ctx.save();
  if (R.btnShake && R.btnShake.buy) ctx.translate(shk, 0);
  button('buy', bL, B.x, B.y, B.w, B.h, { fill: grad(B.y, B.h, '#ff6a7c', '#e0112b'), size: Math.min(64, B.h * 0.36), sub: bSub, subSize: 25, dim: !bOk, r: 30 });
  if (!P) txt('↑', B.x + 30, B.y + 30, 30, 'rgba(255,255,255,0.7)');
  ctx.restore();
  // the 卖 button: sell (close a long), or buy down (open / add a short)
  const S2 = btnRect(false);
  let sL, sSub, sOk;
  if (P && P.dir > 0) { sL = '收手'; sSub = `${FRACS[R.frac].s}，把钱拿回来`; sOk = true; }
  else { sL = P ? '再押跌' : '押跌'; sSub = poor ? '没钱了' : P ? `再押 ${stakeSay}` : `跌了就赚 · ${stakeSay}`; sOk = !poor; }
  if (halt) { sSub = '熔断中 · 暂停'; sOk = false; } else if (L === -1) { sSub = P && P.dir > 0 ? '跌到头 · 现在收不了' : '跌到头 · 押不进'; sOk = false; }
  ctx.save();
  if (R.btnShake && !R.btnShake.buy) ctx.translate(shk, 0);
  button('sell', sL, S2.x, S2.y, S2.w, S2.h, { fill: grad(S2.y, S2.h, '#3fe39a', '#0f9a5a'), size: Math.min(64, S2.h * 0.36), sub: sSub, subSize: 25, dim: !sOk, r: 30 });
  if (!P) txt('↓', S2.x + 30, S2.y + 30, 30, 'rgba(255,255,255,0.7)');
  ctx.restore();
  // beginner nudges
  const c = R.card, fresh = c && !c.debunk && c.t < 3 && c.e.target === s && !P;
  if (R.first && !R.tut && fresh && (c.e.kind === K.GOOD || c.e.kind === K.MOON) && bOk) hintRing(B, '快押涨！', UP);
  if (R.first && !R.tut && fresh && c.e.kind === K.BAD && sOk) hintRing(S2, '快押跌！', '#0f9a5a');
  if (R.first && !R.tut && P && P.dir > 0 && L === 1) hintRing(S2, '涨到头了，收手！', '#0f9a5a');
  if (R.first && !R.tut && P && P.dir < 0 && L === -1) hintRing(B, '跌到头了，收手！', UP);
  // toast over the bottom of the chart
  if (R.toast) {
    const t = R.toast, a2 = Math.min(1, (1.8 - t.t) * 4), Ch = Lay.chart, y = Ch.y + Ch.h - 70 - Math.min(1, t.t * 10) * 6;
    ctx.globalAlpha = Math.max(0, a2);
    ctx.font = font(26);
    const w = Math.min(Ch.w - 140, ctx.measureText(t.s).width + 40), x = Ch.x + (Ch.w - 108) / 2;
    rr(x - w / 2, y - 22, w, 44, 22);
    ctx.fillStyle = 'rgba(16,6,32,0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = t.col;
    ctx.stroke();
    txt(t.s, x, y + 1, 26, t.col, { max: w - 24 });
    ctx.globalAlpha = 1;
  }
}

// the 💡 line: over the lower part of the chart, above where toasts go
function drawTip() {
  const T = R.tips && R.tips[0];
  if (!T || scene !== 'play') return;
  const C = Lay.chart, a = Math.min(1, T.t * 6, (TIP_LIFE - T.t) * 3), y = C.y + C.h - 150;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.font = font(25);
  const w = Math.min(C.w - 28, ctx.measureText(T.s).width + 92), x = C.x + C.w / 2;
  rr(x - w / 2, y - 30, w, 60, 22);
  ctx.fillStyle = '#fff7e0';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  icon('bulb', x - w / 2 + 34, y + 1, 28, '#ffe14d');
  txt(T.s, x + 22, y + 1, 25, '#2a1240', { max: w - 84 });
  ctx.restore();
}
// the news card sits on top of the chart; the chart makes room under it while it is up
function cardGeom(c) {
  const big = c.e.kind === K.CRASH || c.e.kind === K.MOON, hint = R.first || big;
  return { big, hint, life: big ? 2.4 : 2.8, h: hint ? 150 : 108 };
}
// 明日预告: big for a few seconds, then a strip on the chart's foot until the close
function drawPreview() {
  const P = R.preview;
  if (!P || scene !== 'play') return;
  if (!frozen()) P.t += 1 / 60;
  const C = Lay.chart, big = P.t < 4 && !(R.card && R.card.t < cardGeom(R.card).life);
  const items = P.items;
  if (big) {
    const h = 64 + items.length * 62, x = C.x + 12, w = C.w - 24, y = C.y + C.h - h - 40, k = Math.min(1, P.t * 5);
    ctx.save();
    ctx.globalAlpha = k;
    rr(x, y + 6, w, h, 20); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
    rr(x, y, w, h, 20); ctx.fillStyle = '#1d1036'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = GOLD; ctx.stroke();
    icon('calendar', x + 34, y + 30, 26, '#fff');
    txt('明日预告 · 收盘前想好拿不拿过夜', x + 56, y + 30, 24, GOLD, { align: 'left', max: w - 76 });
    items.forEach((it, i) => {
      const yy = y + 64 + i * 62, src = SRC[it.src];
      rr(x + 16, yy, 140, 40, 12); ctx.fillStyle = src.bg; ctx.fill();
      txt(src.name, x + 86, yy + 21, 21, '#fff');
      txt(nightHead(R.m, it), x + 170, yy + 12, 24, '#fff', { align: 'left', max: w - 190 });
      txt(src.trust, x + 170, yy + 36, 17, MUTED, { align: 'left', weight: 800 });
    });
    ctx.restore();
  } else {
    const it = items[0], h = 40, x = C.x + 12, w = C.w - 132, y = C.y + C.h - h - 34;
    rr(x, y, w, h, 14); ctx.fillStyle = 'rgba(29,16,54,0.92)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,207,58,0.6)'; ctx.stroke();
    icon('calendar', x + 26, y + 21, 20, '#fff');
    txt(`明日：${SRC[it.src].name} · ${nightHead(R.m, it)}${items.length > 1 ? ' …' : ''}`, x + 42, y + 21, 20, GOLD, { align: 'left', max: w - 24, weight: 800 });
  }
}
// a beginner's nudge: the button glows and says what to do
function hintRing(B, label, col) {
  const k = 0.5 + 0.5 * Math.sin(clock * 12);
  ctx.save();
  rr(B.x - 6, B.y - 6, B.w + 12, B.h + 12, 36);
  ctx.lineWidth = 6 + 4 * k;
  ctx.strokeStyle = `rgba(255,236,120,${0.5 + 0.5 * k})`;
  ctx.stroke();
  ctx.font = font(28);
  const w = ctx.measureText(label).width + 36, x = B.x + B.w / 2, y = B.y + 4 - 6 * k;
  rr(x - w / 2, y - 22, w, 44, 22);
  ctx.fillStyle = '#ffec78';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = col;
  ctx.stroke();
  txt(label, x, y + 1, 28, col);
  ctx.restore();
}
function drawNewsCard() {
  const c = R.card;
  if (!c) return;
  const C = Lay.chart, { big, hint, life, h } = cardGeom(c);
  if (c.t > life + 0.4) return;
  const inK = Math.min(1, c.t / 0.22), out = c.t > life ? (c.t - life) / 0.4 : 0;
  const ease = 1 - Math.pow(1 - inK, 3), over = inK < 1 ? 0 : Math.max(0, 0.06 * Math.sin((c.t - 0.22) * 18) * Math.exp(-(c.t - 0.22) * 6));
  const w = C.w - 24, x = C.x + 12, y = C.y + 8 - (1 - ease) * 160 - out * 40;
  ctx.save();
  ctx.globalAlpha = 1 - out;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(-0.012 + over);
  ctx.translate(-w / 2, -h / 2);
  rr(0, 6, w, h, 22);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  rr(0, 0, w, h, 22);
  ctx.fillStyle = '#fff7e0';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = c.bg;
  if (c.e.kind === K.CRASH && Math.floor(clock * 6) % 2) ctx.strokeStyle = '#ffcf3a';
  ctx.stroke();
  // picture: the dog, or 老谋 himself swearing
  if (big && ok(MEME)) {
    ctx.save();
    rr(10, 10, h - 20, h - 20, 14);
    ctx.clip();
    ctx.drawImage(MEME, 10, 10, h - 20, h - 20);
    ctx.restore();
  } else if (c.dog != null) face(c.dog, 14 + (h - 28) / 2, h / 2, (h - 28) / 2 - 4, c.bg);
  else icon('chart', 14 + (h - 28) / 2, h / 2, 56, '#fff');
  const tx = h + 6;
  // the tag
  rr(tx, 14, 76, 36, 10);
  ctx.fillStyle = c.bg;
  ctx.fill();
  txt(c.tag, tx + 38, 33, 24, '#fff');
  const src = c.e.src != null ? SRC[c.e.src] : null;
  if (src) { rr(tx + 86, 16, 220, 32, 10); ctx.fillStyle = src.bg; ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1; txt(`${src.name} · ${src.trust}`, tx + 96, 33, 20, src.bg, { align: 'left', weight: 900, max: w - tx - 110 }); }
  else txt('狗市快讯', tx + 90, 33, 20, '#8a7aa8', { align: 'left', weight: 800 });
  txt(c.head, tx, 76, 36, '#2a1240', { align: 'left', max: w - tx - 18 });
  if (hint) txt(c.hint, tx, 118, 24, c.bg === '#7a6a99' ? '#6a5a89' : c.bg, { align: 'left', max: w - tx - 18, weight: 800 });
  ctx.restore();
  if (c.e.target >= 0) buttons.push({ id: 'news', x, y, w, h });
}

// 老谋's countdown: 我 · 丢 · 雷 · 老某！ one word a beat, the picture growing
function drawWords() {
  const W = R.words;
  if (!W) return;
  const words = ['我', '丢', '雷', '老某！'], k = 1 + 0.35 * Math.max(0, 1 - W.t * 4);
  const C = Lay.chart, cx = C.x + C.w / 2, cy = C.y + C.h * 0.6;
  ctx.save();
  ctx.fillStyle = W.e.kind === K.CRASH ? 'rgba(80,0,20,0.35)' : 'rgba(80,40,0,0.3)';
  ctx.fillRect(-WW, -WH, WW * 3, WH * 3);
  const sz = Math.min(C.w, C.h) * (0.4 + W.i * 0.07);
  if (ok(MEME)) {
    ctx.save();
    ctx.translate(cx, cy - 20);
    ctx.rotate(Math.sin(clock * 30) * 0.04 * (W.i + 1));
    ctx.scale(k, k);
    rr(-sz / 2, -sz / 2, sz, sz, 24);
    ctx.clip();
    ctx.drawImage(MEME, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(cx, cy + sz / 2 + 20);
  ctx.scale(k, k);
  bigText(words.slice(0, W.i + 1).join(' '), 0, 0, 64, '#fff', W.e.kind === K.CRASH ? '#ff3b55' : '#ffb000', -0.04, C.w - 40);
  ctx.restore();
  txt(W.e.kind === K.CRASH ? '要熔断了！押涨的快收手，敢的押跌！' : '老谋币要飞了！快押涨！', cx, C.y + 150, 30, '#fff', { stroke: W.e.kind === K.CRASH ? '#e0112b' : '#ff7a12', sw: 8 });
  ctx.restore();
}

function drawFx() {
  for (const f of R.fx) {
    const u = f.t;
    if (u < 0) continue;
    if (f.k === 'coin') {
      const k = Math.min(1, u / f.d), e = k * k;
      let x = lerp(f.x, f.tx, e), y = lerp(f.y, f.ty, e);
      if (f.vx) { x += f.vx * u * (1 - k) * 0.4; y += (f.vy * u + 900 * u * u) * (1 - k) * 0.5; }
      ctx.globalAlpha = k > 0.9 ? (1 - k) * 10 : 1;
      ctx.beginPath();
      ctx.ellipse(x, y, 14 * Math.abs(Math.cos(u * 14)) + 3, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcf3a';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#b86a00';
      ctx.stroke();
    } else if (f.k === 'pop') {
      const life = f.life || 1.4, a = Math.min(1, (life - u) * 3), sc = Math.min(1, u * 10) * (1 + 0.2 * Math.max(0, 1 - u * 6));
      ctx.globalAlpha = Math.max(0, a);
      ctx.save();
      ctx.translate(f.x, f.y + (f.fall ? u * 60 : -u * 90));
      ctx.scale(sc, sc);
      if (f.bg) { ctx.font = font(f.size); const w = ctx.measureText(f.s).width + 30; rr(-w / 2, -f.size * 0.7, w, f.size * 1.4, f.size * 0.4); ctx.fillStyle = f.bg; ctx.fill(); }
      txt(f.s, 0, 0, f.size, f.col, { stroke: '#2a0c22', sw: f.size / 6 });
      ctx.restore();
    } else if (f.k === 'combo') {
      const a = Math.min(1, (1.2 - u) * 3), sc = 1 + 0.5 * Math.max(0, 1 - u * 5);
      ctx.globalAlpha = Math.max(0, a);
      ctx.save();
      ctx.translate(WW / 2, Lay.chart.y + Lay.chart.h * 0.3 - u * 30);
      ctx.scale(sc, sc);
      bigText(f.s, 0, 0, 64, '#fff7a0', '#ff5a1a', -0.06);
      ctx.restore();
    } else if (f.k === 'banner') {
      const a = Math.min(1, (1.4 - u) * 3), sc = u < 0.15 ? 2 - u / 0.15 : 1;
      ctx.globalAlpha = Math.max(0, a);
      ctx.save();
      ctx.translate(PORT ? WW / 2 : Lay.chart.x + Lay.chart.w / 2, Lay.chart.y + Lay.chart.h * 0.5);
      ctx.scale(sc, sc);
      ctx.fillStyle = f.red ? 'rgba(24,0,8,0.92)' : 'rgba(224,17,43,0.9)';
      ctx.fillRect(-WW, -60, WW * 2, 120);
      ctx.fillStyle = f.red ? '#ff2a48' : GOLD;
      ctx.fillRect(-WW, -60, WW * 2, 6);
      ctx.fillRect(-WW, 54, WW * 2, 6);
      bigText(f.s, 0, 0, f.red ? 96 : 84, f.red ? '#ffffff' : '#fffbe0', f.red ? '#ff2a48' : '#ffb000', -0.03);
      ctx.restore();
    } else if (f.k === 'conf') {
      ctx.globalAlpha = Math.max(0, Math.min(1, (2.4 - u) * 2));
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.r + u * 8);
      ctx.fillStyle = f.c;
      ctx.fillRect(-7, -4, 14, 8);
      ctx.restore();
    } else if (f.k === 'meme') {
      // 老谋 pops up from the bottom corner and swears at you
      const a = f.small ? Math.min(1, (1.1 - u) * 4) : Math.min(1, (1.2 - u) * 4);
      const sz = f.small ? 200 : Math.min(WW, WH) * 0.6, rise = Math.min(1, u * 6);
      ctx.globalAlpha = Math.max(0, a);
      ctx.save();
      if (f.small) ctx.translate(WW - sz * 0.55, WH - sz * 0.5 * rise - 10);
      else ctx.translate(WW / 2, WH * 0.45);
      ctx.rotate(f.small ? -0.12 : Math.sin(u * 40) * 0.05);
      const k = f.small ? 1 : 0.6 + 0.4 * rise;
      ctx.scale(k, k);
      if (ok(MEME)) {
        rr(-sz / 2, -sz / 2, sz, sz, 24);
        ctx.save();
        ctx.clip();
        ctx.drawImage(MEME, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
        rr(-sz / 2, -sz / 2, sz, sz, 24);
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      ctx.restore();
    } else if (f.k === 'rocket') {
      ctx.globalAlpha = 1;
      icon('rocket', f.x, f.y, 44, '#fff');
    }
    ctx.globalAlpha = 1;
  }
}

function renderIntro() {
  const it = Math.max(0, R.t + INTRO), n = Math.max(1, 3 - Math.floor(it / 0.5)), k = (it % 0.5) / 0.5;   // (ranked: R.t starts LIVE_BUF before -INTRO)
  ctx.fillStyle = 'rgba(14,4,28,0.55)';
  ctx.fillRect(-WW, -WH, WW * 3, WH * 3);
  const C = Lay.chart;
  txt('准备开盘', C.x + C.w / 2, C.y + C.h * 0.3, 40, '#fff', { stroke: '#2a0c22', sw: 7 });
  ctx.save();
  ctx.translate(C.x + C.w / 2, C.y + C.h * 0.55);
  const sc = 1.6 - 0.6 * Math.min(1, k * 4);
  ctx.scale(sc, sc);
  bigText(String(n), 0, 0, 150, '#fffbe0', '#ff9a1a');
  ctx.restore();
  txt(R.ticket ? '本局成绩可上排行榜' : API ? '没连上服务器 · 这局不上榜' : '', C.x + C.w / 2, C.y + C.h * 0.82, 24, MUTED, { stroke: '#2a0c22', sw: 4 });
}
function renderDayEnd() {
  const D = R.dsum, k = Math.min(1, sceneT * 3);
  ctx.globalAlpha = k;
  ctx.fillStyle = 'rgba(14,4,28,0.9)';
  ctx.fillRect(-WW, -WH, WW * 3, WH * 3);
  ctx.globalAlpha = 1;
  // portrait: one column; landscape: the day's money and 老谋 on the left, tomorrow and the night on the right
  const w = PORT ? 680 : Math.min(560, (WW - 120) / 2), x = PORT ? (WW - w) / 2 : WW / 2 - w - 20, col = colorOf(D.pnl);
  let y = PORT ? 70 : 40;
  ctx.save();
  ctx.translate(WW / 2, y + 40);
  const sc = sceneT < 0.25 ? 1.8 - sceneT / 0.25 * 0.8 : 1;
  ctx.scale(sc, sc);
  bigText(`第 ${D.d + 1} 天 收盘`, 0, 0, PORT ? 84 : 70, '#fffbe0', '#ff9a1a', -0.04);
  ctx.restore();
  y += PORT ? 110 : 92;
  // the day's money
  panel(x, y, w, PORT ? 200 : 150, { fill: 'rgba(42,18,64,0.95)' });
  txt('今天赚亏', x + 28, y + 34, 24, MUTED, { align: 'left' });
  txt(money(D.pnl, true), x + 28, y + 86, 60, col, { align: 'left', stroke: '#1b0a2e', sw: 7, max: w * 0.55 });
  txt(pctStr(D.pct), x + 28, y + (PORT ? 140 : 126), 30, col, { align: 'left' });
  const rx = x + w - 28, small = PORT ? 24 : 22;
  txt(`总资产 ${money(D.eq)}`, rx, y + 34, small, '#fff', { align: 'right' });
  txt(`收手 ${D.trades} 次 · 手续费 ${money(D.fees)}`, rx, y + 70, small, MUTED, { align: 'right' });
  if (D.best && D.best.pnl > 0) txt(`最赚 ${money(D.best.pnl, true)}`, rx, y + 104, small, UP, { align: 'right' });
  if (D.worst && D.worst.pnl < 0) txt(`${D.worst.liq ? '爆仓' : '最亏'} ${money(D.worst.pnl, true)}`, rx, y + 138, small, DOWN, { align: 'right' });
  y += PORT ? 220 : 166;
  // 老谋 says
  if (ok(MEME)) { ctx.save(); rr(x, y, 96, 96, 16); ctx.clip(); ctx.drawImage(MEME, x, y, 96, 96); ctx.restore(); }
  rr(x + 112, y + 10, w - 112, 76, 24);
  ctx.fillStyle = '#fff7e0';
  ctx.fill();
  txt(`「${D.says}」`, x + 112 + (w - 112) / 2, y + 48, 28, '#2a1240', { max: w - 140 });
  y += 116;
  const x2 = PORT ? x : WW / 2 + 20;                // (landscape: the right column)
  if (!PORT) y = 132;
  { const x = x2;
  // tomorrow
  txt('明日预告', x + 4, y + 18, 28, GOLD, { align: 'left', stroke: '#2a0c22', sw: 5 });
  y += 44;
  if (!D.items.length) { txt('明天没有消息，看临场', x + 4, y + 16, 24, MUTED, { align: 'left' }); y += 40; }
  for (const it of D.items) {
    const src = SRC[it.src];
    rr(x, y, 150, 40, 12);
    ctx.fillStyle = src.bg;
    ctx.fill();
    txt(src.name, x + 75, y + 21, 22, '#fff');
    txt(nightHead(R.m, it), x + 166, y + 14, 25, '#fff', { align: 'left', max: w - 170 });
    txt(src.trust, x + 166, y + 38, 18, MUTED, { align: 'left', weight: 800 });
    y += 60;
  }
  // what goes into the night
  y += 8;
  const held = R.a.sh.map((n, s) => n > 0 && s).filter(s => s !== false);
  txt('押着过夜（没收手的）', x + 4, y + 18, 28, GOLD, { align: 'left', stroke: '#2a0c22', sw: 5 });
  y += 44;
  if (!held.length) { txt('什么都没押：明天开盘怎么跳都跟你无关', x + 4, y + 16, 24, MUTED, { align: 'left' }); y += 40; }
  for (const s of held) {
    const P = posInfo(s, stockAt(s, R.tick));
    dirPill(x, y, P);
    txt(`${TABNAME[R.m.stocks[s].def.code]} 押了 ${money(stakeOf(P))} · ${P.pnl >= 0 ? '现在赚' : '现在亏'} ${money(P.pnl, true)}`, x + 136, y + 16, 24, '#fff', { align: 'left', max: w - 140 });
    if (P.lev === 10) txt('放大10×过夜：明天开盘反着跳，就直接爆仓', x + 136, y + 44, 19, '#ff9aa8', { align: 'left', weight: 800 });
    y += P.lev === 10 ? 64 : 46;
  }
  }
  const by = PORT ? Math.max(y + 16, WH - 200) : WH - 116, bw = 420;
  const pulse = 1 + 0.03 * Math.sin(clock * 6);
  const busy = R.nextSeed && R.nextSeed.state === 'busy';
  button('nextDay', busy ? '拿明天的行情…' : `第 ${D.d + 2} 天 开盘 →`, WW / 2 - bw * pulse / 2, by, bw * pulse, 100 * pulse, { fill: grad(by, 100, '#ff6a7c', '#e0112b'), size: (busy ? 34 : 42) * pulse, r: 34, dim: busy });
  if (R.offline) txt(R.offline, WW / 2, by - 24, 22, '#ffcf3a', { stroke: '#2a0c22', sw: 4 });
  if (R.tut) txt('今天赚了多少、明天的新闻、押着过夜的都在这里', WW / 2, by - 24, 22, '#ffec78', { stroke: '#2a0c22', sw: 4, max: WW - 40 });
}
function renderPause() {
  ctx.fillStyle = 'rgba(14,4,28,0.82)';
  ctx.fillRect(-WW, -WH, WW * 3, WH * 3);
  bigText('暂停', WW / 2, WH * 0.32, 100, '#fffbe0', '#ff9a1a', -0.04);
  txt('狗市等你回来（价格也停着）', WW / 2, WH * 0.32 + 90, 28, MUTED, { stroke: '#2a0c22', sw: 5 });
  button('resume', '继续玩', WW / 2 - 160, WH * 0.5, 320, 100, { fill: goldFill(WH * 0.5, 100), color: '#2a1240', stroke: 'rgba(255,255,255,0.7)', size: 44 });
  button('quit', '不玩这局了', WW / 2 - 140, WH * 0.5 + 140, 280, 76, { fill: '#3b1a64', size: 30 });
}
function renderClose() {
  const k = Math.min(1, sceneT * 2.5);
  ctx.fillStyle = `rgba(14,4,28,${0.7 * k})`;
  ctx.fillRect(-WW, -WH, WW * 3, WH * 3);
  ctx.save();
  ctx.translate(WW / 2, WH * 0.4);
  const sc = sceneT < 0.25 ? 2.4 - sceneT / 0.25 * 1.4 : 1 + 0.03 * Math.sin(sceneT * 20) * Math.exp(-sceneT * 3);
  ctx.scale(sc, sc);
  ctx.rotate(-0.06);
  bigText(R.wiped ? '爆仓出局！' : '收盘！', 0, 0, R.wiped ? 110 : 130, '#fffbe0', R.wiped ? '#ff2040' : '#ff6a1a');
  ctx.restore();
  if (!R.wiped) icon('bell', WW / 2 - 118, WH * 0.4 + 110, 38);
  txt(R.wiped ? '钱全亏光了……老谋在骂你' : '当当当——', WW / 2 + (R.wiped ? 0 : 20), WH * 0.4 + 110, 34, '#fff', { stroke: '#2a0c22', sw: 6 });
  if (R.closeSells && R.closeSells.length) txt(`没收手的按收盘价帮你收了（${R.closeSells.length} 个）`, WW / 2, WH * 0.4 + 160, 26, MUTED, { stroke: '#2a0c22', sw: 5 });
}

// ---------- result ----------
function renderResult() {
  const k = Math.min(1, resT * 3);
  ctx.globalAlpha = k;
  ctx.fillStyle = 'rgba(14,4,28,0.96)';
  ctx.fillRect(-WW, -WH, WW * 3, WH * 3);
  ctx.globalAlpha = 1;
  // rays behind the dog
  const sq = PORT ? clamp((WH - 1180) / 120, 0, 1) : 1;         // 0 on the shortest portrait screens: everything a bit tighter
  const L2 = PORT ? { cx: WW / 2, dogY: 470 - 60 * (1 - sq), top: 0 } : { cx: WW * 0.3, dogY: 520, top: 0 };
  ctx.save();
  ctx.translate(L2.cx, L2.dogY - 150);
  ctx.rotate(clock * 0.2);
  ctx.fillStyle = 'rgba(255,207,58,0.08)';
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 600, i * Math.PI / 6, i * Math.PI / 6 + Math.PI / 12); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const tally = Math.min(1, Math.max(0, (resT - 0.3) / 1.2)), shown = 1 + (R.mult - 1) * (1 - Math.pow(1 - tally, 3));
  if (tally < 1 && Math.floor(resT * 30) !== Math.floor((resT - 1 / 60) * 30)) SFX.play('tally', Math.floor(tally * 20));
  const rk = R.rank, stamp = resT > 1.6 ? Math.min(1, (resT - 1.6) * 6) : 0;
  const col1 = PORT ? WW / 2 : WW * 0.3;
  txt('收盘总资产', col1, 70, 30, GOLD, { stroke: '#2a0c22', sw: 5 });
  txt(money(R.a.cash * (shown / R.mult)), col1, 124, 56, '#fff', { stroke: '#2a0c22', sw: 8 });
  bigText(multStr(shown), col1, 214, 120, R.mult >= 1 ? '#fffbe0' : '#e0fff0', R.mult >= 1 ? '#ff5a1a' : '#19c97a', -0.04);
  drawDog(rk.dog, col1, L2.dogY + 30, 230 - 80 * (1 - sq), { rot: Math.sin(clock * 3) * 0.05 });
  if (stamp > 0) {
    ctx.save();
    ctx.translate(col1, L2.dogY + 70);
    ctx.rotate(-0.08);
    const sc = 2.2 - 1.2 * stamp;
    ctx.scale(sc, sc);
    ctx.globalAlpha = stamp;
    rr(-170, -48, 340, 96, 20);
    ctx.fillStyle = '#e0112b';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    txt(rk.name, 0, 2, 64, '#ffec78', { stroke: '#2a0c22', sw: 8 });
    ctx.restore();
    ctx.globalAlpha = 1;
    txt(`「${rk.quip}」`, col1, L2.dogY + 150, 30, '#fff', { stroke: '#2a0c22', sw: 6 });
  }
  if (R.mode === 'tut') return drawTutEnd();
  const a = R.a, winRate = a.trades ? Math.round(a.wins * 100 / a.trades) : 0;
  const cells = [['交易', `${a.trades} 笔`], ['胜率', a.trades ? winRate + '%' : '—'], ['最赚一笔', a.best > 0 ? money(a.best, true) : '—'],
    a.liqs ? ['爆仓', `${a.liqs} 次`] : ['板上止盈', `${a.limitSells} 次`]];
  if (PORT) {
    const g = v => v - (1 - sq) * v * 0.22;                     // gaps shrink on short screens
    let y = L2.dogY + 196 - 30 * (1 - sq);
    drawEquity(40, y, WW - 80, 110 - 30 * (1 - sq));
    y += g(128) - 30 * (1 - sq);
    statRow(cells, 24, y, WW - 48, 92);
    y += g(108);
    upLine(WW / 2, y + 6);
    y += g(40);
    button('again', '再玩一局', WW / 2 - 180, y, 360, 104 - 8 * (1 - sq), { fill: goldFill(y, 104), color: '#2a1240', stroke: 'rgba(255,255,255,0.7)', size: 46, r: 34 });
    y += g(124);
    button('share', '晒战绩', 24, y, 159, 76, { fill: '#e0112b', size: 28 });
    button('replay', '看回放', 195, y, 159, 76, { fill: '#ff7a12', size: 28, icon: 'play', iconSize: 26 });
    button('board', '排行榜', 366, y, 159, 76, { fill: '#7a3cff', size: 28 });
    button('group', '加群', 537, y, 159, 76, { fill: '#12b7f5', size: 28 });
    y += g(96);
    moreButton(WW / 2, Math.min(y, WH - 84), 420, 74, 30);
  } else {
    const x0 = WW * 0.56, w = WW * 0.42;
    drawEquity(x0, 40, w, 150);
    statRow(cells, x0, 214, w, 92);
    upLine(x0 + w / 2, 336);
    button('again', '再玩一局', x0 + w / 2 - 170, 372, 340, 100, { fill: goldFill(372, 100), color: '#2a1240', stroke: 'rgba(255,255,255,0.7)', size: 44, r: 34 });
    const bw = (w - 36) / 4;
    button('share', '晒战绩', x0, 494, bw, 72, { fill: '#e0112b', size: 26 });
    button('replay', '回放', x0 + bw + 12, 494, bw, 72, { fill: '#ff7a12', size: 26, icon: 'play', iconSize: 24 });
    button('board', '排行榜', x0 + 2 * (bw + 12), 494, bw, 72, { fill: '#7a3cff', size: 26 });
    button('group', '加群', x0 + 3 * (bw + 12), 494, bw, 72, { fill: '#12b7f5', size: 26 });
    moreButton(x0 + w / 2, 592, 400, 70, 28);
  }
  if (R.newBest && resT > 1.8) {
    ctx.save();
    ctx.translate(col1 + 235, 66);
    ctx.rotate(0.18);
    const kk = 1 + 0.06 * Math.sin(clock * 8);
    ctx.scale(kk, kk);
    rr(-80, -26, 160, 52, 14);
    ctx.fillStyle = GOLD;
    ctx.fill();
    txt('新纪录！', 0, 1, 30, '#e0112b');
    ctx.restore();
  }
  playMoneyLine();
}
function upLine(x, y) {
  const u = R.up;
  if (!u.msg) return;
  const col = u.state === 'done' ? '#ffe14d' : u.state === 'err' ? '#ff9aa8' : MUTED;
  if (u.state === 'done') { ctx.font = font(28); icon('trophy', x - Math.min(ctx.measureText(u.msg).width, PORT ? 660 : WW * 0.42) / 2 - 22, y, 28, GOLD); }
  txt(u.msg, x, y, 28, col, { stroke: '#2a0c22', sw: 5, max: PORT ? 660 : WW * 0.42 });
  if (u.state === 'done' && u.d && u.d.id && u.d.on_board) {   // the line is a button: copy the link to this round's replay
    ctx.font = font(28); const w = Math.min(PORT ? 660 : WW * 0.42, ctx.measureText(u.msg).width + 40);
    buttons.push({ id: 'rpLink', x: x - w / 2, y: y - 22, w, h: 44 });
    txt('点这行复制回放链接', x, y + 30, 18, MUTED, { weight: 800 });
  }
  if (u.state === 'err' && u.retry) { ctx.font = font(28); const w = Math.min(PORT ? 660 : WW * 0.42, ctx.measureText(u.msg).width); buttons.push({ id: 'retryUp', x: x - w / 2, y: y - 22, w, h: 44 }); }
}
function statRow(cells, x, y, w, h) {
  panel(x, y, w, h, { fill: 'rgba(42,18,64,0.92)' });
  const cw2 = w / cells.length;
  cells.forEach(([k, v], i) => {
    const cx = x + cw2 * (i + 0.5);
    txt(k, cx, y + 28, 20, MUTED, { weight: 800 });
    txt(v, cx, y + 62, 28, '#fff', { max: cw2 - 12 });
  });
}
// the round's money, second by second
function drawEquity(x, y, w, h) {
  panel(x, y, w, h, { fill: 'rgba(16,6,32,0.9)' });
  const log = R.eqLog;
  if (log.length < 2) return;
  let lo = Math.min(START, ...log), hi = Math.max(START, ...log);
  const pad = (hi - lo) * 0.12 || START * 0.05;
  lo -= pad; hi += pad;
  const X = i => x + 16 + (w - 32) * i / (log.length - 1), Y = v => y + h - 12 - (h - 24) * (v - lo) / (hi - lo);
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 16, Y(START)); ctx.lineTo(x + w - 16, Y(START)); ctx.stroke();
  ctx.setLineDash([]);
  const end = R.a.cash >= START;
  ctx.beginPath();
  log.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
  ctx.lineWidth = 5;
  ctx.strokeStyle = end ? UP : DOWN;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.lineTo(X(log.length - 1), y + h - 12);
  ctx.lineTo(X(0), y + h - 12);
  ctx.closePath();
  ctx.fillStyle = end ? 'rgba(255,59,85,0.15)' : 'rgba(25,201,122,0.15)';
  ctx.fill();
  txt('资产曲线', x + 20, y + 20, 18, MUTED, { align: 'left', weight: 800 });
}
// what the money is, on the title and result screens
const PLAY_MONEY = '纯属娱乐 · 游戏内虚拟金币，不能充值提现 · 不涉及真实资金 · 不构成投资建议';
function playMoneyLine() { txt(PLAY_MONEY, WW / 2, WH - 14, 16, 'rgba(255,255,255,0.62)', { stroke: '#24103d', sw: 3, max: WW - 40 }); }
function moreButton(cx, y, w, h, size) {
  const k = 1 + Math.sin(clock * 7.2) * 0.035, bw = w * k, bh = h * k, by = y + (h - bh) / 2;
  button('more', '更多老谋游戏 →', cx - bw / 2, by, bw, bh, { fill: goldFill(by, bh), size: size * k, color: '#fff' });
}

// ---------- title ----------
// first visit: a tutorial or straight in (asked once, remembered)
const offerOpen = () => scene === 'title' && !save.tut && !save.plays && !deepLink;
function drawOffer() {
  ctx.fillStyle = 'rgba(10,4,24,0.8)';
  ctx.fillRect(-WW, -WH, WW * 3, WH * 3);
  const w = Math.min(660, WW - 40), h = 470, x = (WW - w) / 2, y = (WH - h) / 2;
  rr(x, y + 8, w, h, 30);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  rr(x, y, w, h, 30);
  ctx.fillStyle = '#2a1240';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  if (ok(MEME)) { ctx.save(); rr(x + w / 2 - 60, y - 70, 120, 120, 18); ctx.clip(); ctx.drawImage(MEME, x + w / 2 - 60, y - 70, 120, 120); ctx.restore(); }
  txt('第一次来玩？', x + w / 2, y + 96, 44, '#fff', { stroke: '#2a0c22', sw: 6 });
  txt('30 秒学会：看新闻，押涨押跌，见好就收', x + w / 2, y + 150, 26, MUTED, { max: w - 40 });
  button('tut', '新手教程（30 秒）', x + w / 2 - 230, y + 200, 460, 104, { fill: goldFill(y + 200, 104), color: '#2a1240', stroke: 'rgba(255,255,255,0.7)', size: 40, r: 34 });
  button('offerPlay', '直接开盘', x + w / 2 - 150, y + 330, 300, 80, { fill: '#3b1a64', size: 32 });
  txt('标题页的「教程」随时能再看', x + w / 2, y + 438, 20, 'rgba(255,255,255,0.55)', { weight: 800 });
}
function renderTitle() {
  const port = PORT;
  // portrait: everything in one column, the buttons kept at the bottom; landscape: title and rules left, buttons right
  const cx = port ? WW / 2 : WW * 0.31;
  const extra = port ? Math.max(0, WH - 1280) : 0;          // taller phones: the space goes between the blocks
  // (landscape, 11-09: the dog parade sat on the disclaimer line; now: the rules, the parade, then the disclaimer, each its own band)
  const yTitle = port ? 190 + extra * 0.2 : 128, yRules = port ? 560 + extra * 0.45 : 344, yPar = port ? 460 + extra * 0.32 : WH - 98;
  // a ticker chart running behind
  ctx.save();
  ctx.globalAlpha = 0.3;
  const base = port ? yPar - 40 : 420, amp = port ? 90 : 90;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const x = i * WW / 60, v = Math.sin(i * 0.37 + clock * 1.3) * 0.5 + Math.sin(i * 0.11 - clock * 0.7) * 0.8 + Math.sin(i * 1.3 + clock * 2) * 0.15;
    const y = base - v * amp - i * 2;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.lineWidth = 6;
  ctx.strokeStyle = UP;
  ctx.stroke();
  ctx.restore();
  // the 狗股 parade
  const parade = [0, 1, 2, 4, 5, 3, 6, 7, 8], fr = port ? 34 : 26;
  for (let i = 0; i < parade.length; i++) {
    const d = S.DEFS[parade[i]], ph = ((clock * 0.07 + i / parade.length) % 1);
    const x = -80 + ph * (WW + 160), y = yPar + Math.sin(clock * 3 + i) * 8;
    const chg = Math.sin(clock * 0.9 + i * 1.7) * 0.09;
    face(d.dog, x, y, fr, 'rgba(255,255,255,0.7)');
    txt(pctStr(chg), x, y + fr + 18, port ? 22 : 18, colorOf(chg), { stroke: '#1b0a2e', sw: 4 });
  }
  if (plays) txt(playsLine(), cx, port ? yTitle - 100 : yTitle + 186, port ? 24 : 21, 'rgba(255,255,255,0.9)', { stroke: '#2a0c22', sw: 5, max: port ? 660 : WW * 0.56 });
  bigText('老谋大富翁', cx, yTitle, port ? 132 : 116, '#fffbe0', '#ff9a1a', -0.05);
  const ty = yTitle + (port ? 80 : 72);
  rr(cx - 150, ty - 26, 300, 52, 26);
  ctx.fillStyle = '#e0112b';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.stroke();
  txt('· 老谋游戏 ·', cx, ty + 1, 28, '#ffec78');
  txt('10,000 金币起步，3 天狗狗大富翁，看你能翻几倍', cx, ty + 70, 28, '#fff', { stroke: '#3a0a14', sw: 6, max: port ? 680 : WW * 0.56 });
  // the rules, three cards, and 老谋 swearing beside them
  const rules = [['news', '看新闻：要涨押涨，要跌押跌', '快讯靠谱 · 群聊一半假 · 老谋喝多了常反着来', '#fff'], ['coin', '见好就收：点「收手」拿钱', '玩 3 天，没收手的会留到明天', GOLD], ['flame', '能放大到 10 倍：赚赔都放大', '价格碰到爆仓线，这一单押的钱就没了', '#ff7a12']];
  const rw = port ? 530 : WW * 0.5, rh = port ? 82 : 74, gap = port ? 12 : 10, rx = port ? 24 : 40;
  rules.forEach((r, i) => {
    const y = yRules + i * (rh + gap);
    panel(rx, y, rw, rh, { fill: 'rgba(42,18,64,0.92)', r: 20 });
    icon(r[0], rx + 42, y + rh / 2, 38, r[3]);
    txt(r[1], rx + 84, y + rh * 0.36, 29, '#fff', { align: 'left', max: rw - 96 });
    txt(r[2], rx + 84, y + rh * 0.72, 21, MUTED, { align: 'left', weight: 800, max: rw - 96 });
  });
  if (ok(MEME)) {
    const s = port ? 150 : 140, bx = port ? 630 : rx + rw + 90, by = port ? yRules + 140 : yRules + 120;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(0.12 + Math.sin(clock * 2.4) * 0.05);
    rr(-s / 2, -s / 2, s, s, 18);
    ctx.save(); ctx.clip(); ctx.drawImage(MEME, -s / 2, -s / 2, s, s); ctx.restore();
    rr(-s / 2, -s / 2, s, s, 18);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
  }
  // buttons
  const bx = port ? WW / 2 : WW * 0.8;
  let y = port ? WH - 410 : 170;                   // (portrait: room under the games line for the disclaimer)
  const pulse = 1 + 0.04 * Math.sin(clock * Math.PI * 4);
  const bw = 360 * pulse, bh = 112 * pulse;
  button('start', '开盘！', bx - bw / 2, y + (112 - bh) / 2, bw, bh, { fill: grad(y, bh, '#ff6a7c', '#e0112b'), size: 54 * pulse, r: 36 });
  y += 136;
  if (save.best) { txt(`最好成绩 ${multStr(save.best)} · ${rankOf(save.best).name}`, bx, y, 26, GOLD, { stroke: '#2a0c22', sw: 5 }); }
  y += 30;
  button('board', '排行', bx - 180, y, 84, 70, { fill: '#7a3cff', size: 21, icon: 'trophy', iconColor: GOLD, iconSize: 22 });
  button('tut', '教程', bx - 88, y, 84, 70, { fill: '#ff7a12', size: 21, icon: 'book', iconSize: 22 });
  button('help', '玩法', bx + 4, y, 84, 70, { fill: '#e0112b', size: 21, icon: 'help', iconSize: 22 });
  button('group', '加玩家群', bx + 96, y, 84, 70, { fill: '#12b7f5', size: 21 });
  y += 94;
  moreButton(bx, y, 360, 74, 30);
  txt('格斗 · 滑雪 · 合成 · 消消乐 · 海豹大战老谋', bx, y + 96, 20, 'rgba(255,255,255,0.75)', { stroke: '#24103d', sw: 4 });
  // name and sound, top corners
  const nm = myName();
  button('name', nm ? `昵称：${nm}` : '起个昵称', 16, 16, Math.min(340, 90 + (nm ? nm.length * 22 + 80 : 100)), 54, { fill: '#3b1a64', size: 22, r: 18, gloss: false, icon: 'pencil', iconColor: GOLD, iconSize: 24 });
  button('mute', '', WW - 80, 16, 64, 54, { fill: '#3b1a64', size: 26, r: 18, gloss: false, icon: save.muted ? 'mute' : 'sound', iconSize: 30 });
  playMoneyLine();
  if (offerOpen()) drawOffer();
}

// ---------- the board ----------
const board = { period: 'today', cache: {}, scroll: 0, maxScroll: 0, from: 'title', state: 'idle', msg: '' };
function openBoard(from) {
  board.from = from;
  scene = 'board';
  board.scroll = 0;
  loadBoard();
}
function loadBoard() {
  const key = board.period, c = board.cache[key];
  if (c && Date.now() - c.at < 15000) return;
  if (!API) { board.cache[key] = { at: Date.now(), err: '这个版本没有接排行榜服务' }; return; }
  board.cache[key] = Object.assign({ loading: true }, c || {}, { at: Date.now() });
  apiFetch(`/leaderboard?board=stock&period=${key}`, {}, 8000)
    .then(d => { board.cache[key] = { at: Date.now(), items: d.items || [] }; })
    .catch(e => { board.cache[key] = { at: Date.now() - 12000, err: '排行榜加载失败：' + e.message }; });
}
function renderBoard() {
  const port = PORT, w = port ? WW - 48 : Math.min(900, WW - 80), x = (WW - w) / 2;
  bigText('排行榜', WW / 2, port ? 90 : 66, port ? 96 : 80, '#fffbe0', '#ff9a1a', -0.04);
  button('back', '← 返回', 16, 16, 140, 60, { fill: '#3b1a64', size: 26, r: 18, gloss: false });
  const ty = port ? 160 : 118;
  button('bToday', '今日', WW / 2 - 170, ty, 160, 62, { fill: board.period === 'today' ? goldFill(ty, 62) : '#3b1a64', color: board.period === 'today' ? '#2a1240' : '#fff', size: 28, stroke: board.period === 'today' ? 'rgba(255,255,255,0.6)' : '#2a0c22' });
  button('bAll', '总榜', WW / 2 + 10, ty, 160, 62, { fill: board.period === 'all' ? goldFill(ty, 62) : '#3b1a64', color: board.period === 'all' ? '#2a1240' : '#fff', size: 28, stroke: board.period === 'all' ? 'rgba(255,255,255,0.6)' : '#2a0c22' });
  const top = ty + 86, bottom = WH - (port ? 40 : 20), rowH = 76;
  panel(x, top, w, bottom - top, { fill: 'rgba(16,6,32,0.88)' });
  const c = board.cache[board.period] || {};
  if (c.err) { txt(c.err, WW / 2, top + 80, 28, MUTED, { max: w - 40 }); return; }
  if (!c.items) { txt('加载中…', WW / 2, top + 80, 30, MUTED); return; }
  if (!c.items.length) { txt(board.period === 'today' ? '今天还没人上榜，第一就是你的！' : '还没有人上榜', WW / 2, top + 80, 28, MUTED, { max: w - 40 }); return; }
  board.maxScroll = Math.max(0, c.items.length * rowH + 20 - (bottom - top));
  ctx.save();
  rr(x, top, w, bottom - top, 22);
  ctx.clip();
  const mine = new Set(save.mine || []);
  c.items.forEach((it, i) => {
    const y = top + 10 + i * rowH - board.scroll;
    if (y < top - rowH || y > bottom) return;
    if (mine.has(it.id)) { rr(x + 8, y, w - 16, rowH - 8, 16); ctx.fillStyle = 'rgba(255,207,58,0.18)'; ctx.fill(); }
    if (i < 3) icon('medal' + (i + 1), x + 44, y + 34, 38); else txt(String(i + 1), x + 44, y + 34, 28, MUTED);
    const m = it.cash / START, rk = rankOf(m);
    face(RANKS.indexOf(rk) >= 0 ? +rk.dog : 23, x + 104, y + 34, 26, 'rgba(255,255,255,0.5)');
    txt(it.nickname || '匿名狗狗', x + 142, y + 24, 28, '#fff', { align: 'left', max: w - 460 });
    txt(rk.name + (mine.has(it.id) ? ' · 我' : ''), x + 142, y + 54, 20, MUTED, { align: 'left', weight: 800 });
    txt(multStr(m), x + w - 96, y + 24, 36, m >= 1 ? '#ffe14d' : DOWN, { align: 'right', stroke: '#1b0a2e', sw: 5 });
    txt(money(it.cash), x + w - 96, y + 56, 20, MUTED, { align: 'right', weight: 800 });
    if (y > top - 10 && y < bottom - rowH + 10) button('rp_' + it.id, '', x + w - 80, y + 6, 62, 56, { fill: '#ff7a12', size: 28, r: 18, icon: 'play', iconSize: 30 });
  });
  ctx.restore();
}

// ---------- the share card (1080 x 1350, like 老谋格斗's) ----------
function drawCard(W, H) {
  const cx = W / 2, rk = R.rank, a = R.a;
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b0f4a');
  g.addColorStop(0.55, '#5a1a6a');
  g.addColorStop(1, '#c4506a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(cx, 640);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1500, i * Math.PI / 8, i * Math.PI / 8 + Math.PI / 16); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  bigText('老谋大富翁', cx, 118, 136, '#fff36a', '#ff7b00', -0.04);
  ctx.fillStyle = '#e0112b';
  rr(cx - 150, 196, 300, 62, 18);
  ctx.fill();
  txt('· 60 秒狗市 ·', cx, 228, 36, '#fff');
  txt(myName() || '匿名狗狗', cx, 320, 48, '#fff36a', { stroke: '#24103d', sw: 11, max: 900 });
  bigText(multStr(R.mult), cx, 430, 170, R.mult >= 1 ? '#ffffff' : '#e0fff0', R.mult >= 1 ? '#ffd23a' : '#19c97a', -0.03);
  txt(`10,000 → ${money(a.cash)}`, cx, 540, 44, '#fff', { stroke: '#24103d', sw: 10 });
  ctx.save();
  ctx.translate(cx, 780);
  ctx.fillStyle = 'rgba(255,240,120,0.25)';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) { const r = i % 2 ? 190 : 330, an = i * Math.PI / 12; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(an) * r, Math.sin(an) * r); }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  drawDog(rk.dog, cx - 170, 930, 330);
  ctx.save();
  ctx.translate(cx + 190, 760);
  ctx.rotate(-0.08);
  rr(-190, -62, 380, 124, 24);
  ctx.fillStyle = '#e0112b';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  txt(rk.name, 0, 2, 84, '#ffec78', { stroke: '#2a0c22', sw: 10 });
  ctx.restore();
  txt(`「${rk.quip}」`, cx + 190, 880, 36, '#fff', { stroke: '#24103d', sw: 8, max: 480 });
  ctx.fillStyle = 'rgba(20,8,40,0.74)';
  rr(56, 990, W - 112, 226, 30);
  ctx.fill();
  const d = new Date(), date = `${d.getMonth() + 1}月${d.getDate()}日`;
  const cells = [['交易', `${a.trades} 笔`], ['胜率', a.trades ? Math.round(a.wins * 100 / a.trades) + '%' : '—'], ['最赚一笔', a.best > 0 ? money(a.best, true) : '—'],
    a.liqs ? ['爆仓', `${a.liqs} 次`] : ['板上止盈', `${a.limitSells} 次`], ['排名', R.up.d && R.up.d.rank_today ? `今日第${R.up.d.rank_today}` : '—'], ['日期', date]];
  cells.forEach(([k, v], i) => {
    const x = 56 + (W - 112) / 6 * (2 * (i % 3) + 1), y = 1046 + Math.floor(i / 3) * 104;
    txt(k, x, y, 28, 'rgba(255,255,255,0.7)', { weight: 700 });
    txt(v, x, y + 44, v.length > 7 ? 34 : 44, '#ffffff', { max: (W - 112) / 3 - 20 });
  });
  ctx.save();
  rr(56, 1232, W - 112, 106, 26);
  g = ctx.createLinearGradient(0, 1232, 0, 1338);
  g.addColorStop(0, '#fff36a');
  g.addColorStop(1, '#ffb800');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#24103d';
  ctx.stroke();
  const qr = ok(QR);
  if (qr) {
    ctx.fillStyle = '#fff';
    rr(68, 1238, 94, 94, 10);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(QR, 71, 1241, 88, 88);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.restore();
  const tx = qr ? 182 : cx, al = qr ? { align: 'left' } : {};
  txt('不服来比 · 打开链接就能玩', tx, 1258, 26, '#2a1240', Object.assign({ weight: 800 }, al));
  txt(CONFIG.SHARE_SITE, tx, 1296, 44, '#2a1240', Object.assign({ weight: 900 }, al));
  const rid = R.up && R.up.d && R.up.d.on_board && R.up.d.id;
  txt((qr ? 'QQ/微信长按识别二维码' : '浏览器打开') + (rid ? ` · 看回放 ${CONFIG.SHARE_SITE}/?r=${rid}` : ''), tx, 1326, 19, 'rgba(42,18,64,0.85)', Object.assign({ weight: 700, max: W - 112 - (qr ? 140 : 40) }, al));
}
function makeCard() {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1350;
  const saved = ctx;
  ctx = c.getContext('2d');
  try { drawCard(c.width, c.height); } finally { ctx = saved; }
  return c;
}
let shareURL = null;
function openShare() {
  let canvas;
  try { canvas = makeCard(); } catch (e) { return; }
  const box = document.getElementById('share'), im = document.getElementById('share-img');
  const dl = document.getElementById('share-dl'), nat = document.getElementById('share-native');
  im.src = canvas.toDataURL('image/png');
  dl.href = im.src;
  nat.hidden = true;
  nat.onclick = null;
  try {
    canvas.toBlob(blob => {
      if (!blob) return;
      if (shareURL) URL.revokeObjectURL(shareURL);
      shareURL = URL.createObjectURL(blob);
      dl.href = shareURL;
      try {
        const file = new File([blob], '老谋大富翁战绩.png', { type: 'image/png' });
        if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
          nat.hidden = false;
          nat.onclick = () => { navigator.share({ files: [file], title: '老谋大富翁战绩' }).catch(() => {}); };
        }
      } catch (e) { /* no file sharing here */ }
    }, 'image/png');
  } catch (e) { /* the data URL is enough */ }
  ptr.down = false;
  box.hidden = false;
}
document.getElementById('share-close').addEventListener('click', () => { document.getElementById('share').hidden = true; });

// =====================================================================================================
//  Driven rounds: the tutorial and replays. Neither uploads, counts as a play nor touches the board or the best score.
//  The tutorial's market is built here in the shape sim.js makes (stocks[s].P / .L, events) and traded with sim.js's own
//  trade / liquidate, so the lessons behave exactly like the real thing; it has no seed and no ticket, so it can never be a
//  ranked round. A replay re-runs a recorded seed + trades with the rules it was played on (v1: sim_v1.js, loaded lazily).
// =====================================================================================================
const engOf = x => ({ v: x.VERSION, make: x.make, account: x.account, trade: x.trade, liquidate: x.liquidate, close: x.close });
const ENG = engOf(S);                           // the current rules (v4)
// the rules a round was played on, for replays: sim_v1.js / sim_v2.js / sim_v3.js are loaded only when an old round is watched
// (v3: today's rules on 32-bit seeds; v4 gave each day a 128-bit seed)
const OLD = {};
let V1 = null;
function loadOld(v) {
  return new Promise((ok, no) => {
    if (OLD[v]) return ok(OLD[v]);
    const keep = window.StockSim, sc = document.createElement('script');   // the file sets window.StockSim: put ours back
    sc.src = `sim_v${v}.js?v=${v === 3 ? 4 : 1}`;
    sc.onload = () => { const x = window.StockSim; window.StockSim = keep; if (x && x.VERSION === v) { OLD[v] = x; ok(x); } else no(new Error('旧版规则不对')); };
    sc.onerror = () => { window.StockSim = keep; no(new Error('旧版规则没加载出来')); };
    document.head.appendChild(sc);
  });
}
// rules v1 (long only, no leverage) behind the v2 account the screen draws: positions are 1× longs whose margin is the cost
function engineV1() {
  const sync = a => {
    const b = a.v1;
    a.cash = b.cash;
    for (let s = 0; s < b.sh.length; s++) {
      const n = b.sh[s];
      a.sh[s] = n; a.dir[s] = n > 0 ? 1 : 0; a.lev[s] = n > 0 ? 1 : 0; a.basis[s] = n > 0 ? b.cost[s] : 0; a.margin[s] = a.basis[s]; a.paid[s] = 0;
    }
    for (const k of ['trades', 'wins', 'best', 'worst', 'limitSells', 'fails']) a[k] = b[k];
  };
  const conv = r => (!r.ok ? r : r.buy ? { ok: true, open: true, dir: 1, lev: 1, s: r.s, n: r.n, p: r.p }
    : { ok: true, open: false, dir: 1, lev: 1, s: r.s, n: r.n, p: r.p, pnl: r.pnl, back: r.amt - r.fee, onLimit: r.onLimit });
  return {
    v: 1, make: V1.make,
    account() { const b = V1.account(), a = blankAccount(b.sh.length); a.v1 = b; return a; },
    trade(m, a, t, op) { const r = V1.trade(m, a.v1, t, op); sync(a); return conv(r); },
    liquidate() { return []; },
    close(m, a) { const out = V1.close(m, a.v1).map(conv); sync(a); return out; },
  };
}
// v3 rounds (and the tutorial) are three days; v1 / v2 one 60 s session
function normEvents(m) {
  for (const e of m.events) e.kind = m.v >= 3 || m.tutorial ? (e.type === 1 ? (e.sent > 0 ? K.GOOD : K.BAD) : e.type) : e.type;
}
function blankAccount(n) {
  const z = () => new Array(n).fill(0);
  return { cash: START, dir: z(), lev: z(), sh: z(), basis: z(), margin: z(), paid: z(), trades: 0, wins: 0, best: 0, worst: 0, limitSells: 0, fails: 0, liqs: 0, shorts: 0, fees: 0 };
}
function baseRound(m, seed) {
  normEvents(m);
  const v3 = m.v >= 3 || m.tutorial;
  return {
    T: v3 ? S.TICKS : 600, day: v3 ? S.DAY : 600, days: v3 ? S.DAYS : 1, dayEq: [START], dayFees: [0], dayDone: [], closes: [], preview: null,
    seed, ticket: null, m, eng: ENG, a: S.account(), acts: [], t: -INTRO, tick: -1, sel: 0, selT: 0, frac: 2, lev: 0, card: null, cards: [],
    fx: [], stamps: [], combo: 0, comboT: 0, toast: null, eqLog: [START], eqShown: START, milestones: {}, words: null,
    halt: null, ranges: m.stocks.map(() => null), bump: m.stocks.map(() => 0), last: m.stocks.map(() => 0),
    flashTab: m.stocks.map(() => 0), lastBeat: -1, buys: 0, peak: START, stats: null, up: { state: 'idle', msg: '' },
    first: save.plays < 3,
  };
}
// the clock stands still while the tutorial waits for the player, or a replay is paused / over
const frozen = () => !!R && ((R.tut && R.tut.wait) || (R.rp && (R.rp.paused || R.rp.done)));

// ---------- the tutorial ----------
// 老谋币 (stock 0) follows a script through day 1 and the start of day 2: a 快讯 利好 to 涨停, a 快讯 利空 to 跌停, a slide
// that 爆仓s a 10× long, then tonight's 明日预告 (快讯: 老谋币 up) and day 2 opening on a 一字涨停. The other two wander.
function tutMarket() {
  const ids = [0, 1, 2], r = S.rng(20261108), H = HIST;
  const stocks = ids.map((id, s) => {
    const d = S.DEFS[id], P = new Array(HIST + TICKS), L = new Int8Array(TICKS);
    let p = s === 0 ? 10 * PU : Math.round((d.lo + d.hi) / 2 * PU);
    for (let k = 0; k < HIST + TICKS; k++) { p += Math.trunc(p * r.noise(Math.max(6, d.vol >> 2)) / 10000); P[k] = p; }
    return { id, def: d, P, L };
  });
  const P = stocks[0].P, L = stocks[0].L, y = v => Math.round(v * PU);
  const jit = v => v + Math.trunc(v * r.noise(5) / 10000);
  const line = (a, b, va, vb, noisy) => { for (let t = a; t <= b; t++) { const v = va + (vb - va) * (t - a) / Math.max(1, b - a); P[H + t] = noisy ? jit(y(v)) : y(v); } };
  const ramp = (a, n, va, vb) => { for (let i = 0; i < n; i++) P[H + a + i] = y(va + (vb - va) * (1 - Math.pow(1 - (i + 1) / n, 2))); };
  const shift = 10 * PU / P[H - 1];
  for (let k = 0; k < H; k++) P[k] = Math.round(P[k] * shift);
  line(0, 54, 10.0, 10.3, true);                     // calm; a 快讯 利好 at 4 s, the move at 5.5 s
  ramp(55, 10, 10.3, 12.36);
  for (let t = 65; t <= 89; t++) { P[H + t] = y(12.36); L[t] = 1; }   // 涨停板
  line(90, 129, 12.36, 11.5, true);                  // 开板; a 快讯 利空 at 11.5 s, the move at 13 s
  ramp(130, 10, 11.5, 9.43);
  for (let t = 140; t <= 164; t++) { P[H + t] = y(9.43); L[t] = -1; }   // 跌停板
  line(165, 196, 9.43, 10.05, true);
  line(197, 220, 10.05, 9.0, false);                 // the slide a 10× long doesn't survive
  line(221, 399, 9.0, 9.2, true);
  for (let t = 400; t < 425; t++) { P[H + t] = y(10.58); L[t] = 1; }   // day 2 opens +15 % on the board
  line(425, TICKS - 1, 10.58, 10.2, true);
  for (let s = 1; s < 3; s++) {                      // the others: a small gap at the day 2 open
    const Q = stocks[s].P, g = 1 + (s === 1 ? -0.006 : 0.004);
    for (let t = 400; t < TICKS; t++) Q[H + t] = Math.round(Q[H + t] * g);
  }
  const events = [{ type: 1, sent: 1, src: 0, news: 40, at: 55, end: 110, target: 0, v: 0 },
    { type: 1, sent: -1, src: 0, news: 115, at: 130, end: 185, target: 0, v: 0 }];
  const nights = [[{ s: 0, src: 0, sent: 1, v: 0 }], []];
  const opens = [null, [{ s: 0, src: 0, sent: 1, v: 0, dir: 1, g: 1500, lock: 25 }]];
  return { v: 0, seeds: [], known: 3, stocks, events, nights, opens, tutorial: true };
}
const held0 = () => R.a.sh[0] > 0;
// one idea a step, by doing it; a step either waits for the player (allow: what they may press, done: when it's done; or
// btn) or runs the clock. Four ideas (11-08, for people who never traded): 1 news says up → 押涨; 2 it went up → 收手 takes
// the money; 3 news says down → 押跌, and 收手 again; 4 放大 multiplies win and loss, and the 爆仓 line takes the stake.
const TUT_N = 4;
const TUT = [
  { c: 1, text: ['看新闻，押涨还是押跌', '猜对了就赚，30 秒学会'], btn: '开始' },
  { run: { to: 42, speed: 1.5 } },
  { c: 1, spot: 'buy', text: ['新闻说：老谋币要涨！', '点「押涨」：涨了你就赚'], allow: ['buy'], done: () => held0(), enter: () => { R.frac = 2; R.lev = 0; } },
  { run: { to: 80, speed: 1 } },
  { c: 2, spot: 'sell', text: ['涨上去了，你赚了！', '点「收手」，把钱拿回来'], allow: ['sell'], done: () => !held0(), enter: () => { R.frac = 2; } },
  { run: { to: 117, speed: 2 } },
  { c: 3, spot: 'sell', text: ['新闻说：老谋币要跌！', '点「押跌」：跌了你也能赚'], allow: ['sell'], done: () => held0() },
  { run: { to: 150, speed: 1 } },
  { c: 3, spot: 'buy', text: ['跌下去了，又赚了！', '点「收手」拿钱'], allow: ['buy'], done: () => !held0() },
  { run: { to: 186, speed: 2.5 } },
  { c: 4, spot: 'levs', text: ['「放大」：赚的、亏的都翻几倍', '点「放大10×」试试'], allow: ['lev2'], done: () => R.lev === 2, enter: () => { R.frac = 0; } },
  { c: 4, spot: 'buy', text: ['押涨，放大 10 倍'], allow: ['buy'], done: () => held0() },
  { c: 4, spot: 'chart', text: ['红色虚线是「爆仓线」', '价格碰到它，这一单押的钱就没了'], btn: '看看会怎样', enter: () => { R.toast = null; } },
  { run: { to: 222, speed: 0.8, stop: () => !held0() } },
  { c: 4, delay: 1.3, text: ['爆仓了！放大越多越容易爆', '刚开始用「不放大」最稳'], btn: '去玩一局', enter: () => { R.lev = 0; R.frac = 2; } },
];
function startTutorial() {
  if (!termsAgreed()) return requireTerms(startTutorial);
  leaveLive();
  loadToken++;
  const m = tutMarket();
  R = baseRound(m, 0);
  R.mode = 'tut';
  R.first = true;
  R.t = 0;
  R.tut = { i: -1, t: 0, wait: false, failed: false, doneT: 0, nudge: 0 };
  scene = 'play';
  sceneT = 0;
  shake = 0;
  flash = null;
  R.tick = 0;
  onTick(0);
  Music.start(0, 1);
  tutGo(0);
}
function tutGo(i) {
  const T = R.tut;
  if (i >= TUT.length) return tutFinish();
  const st = TUT[i];
  Object.assign(T, { i, t: 0, doneT: 0, failed: false, acted: false, wait: !st.run });
  if (st.enter) st.enter();
}
function tutUpdate(dt) {
  const T = R.tut, st = TUT[T.i];
  T.t += dt;
  if (T.nudge > 0) T.nudge = Math.max(0, T.nudge - dt);
  if (st.run) {
    R.t += dt * (st.run.speed || 1);
    const k = Math.min(st.run.to, Math.floor(R.t * S.TPS));
    let stop = false;
    while (R.tick < k && !stop) { R.tick++; onTick(R.tick); stop = st.run.stop && st.run.stop(); }
    if (R.tick >= st.run.to || stop) { R.t = R.tick / S.TPS + 0.001; tutGo(T.i + 1); }
  } else if (st.done && st.done()) {
    T.doneT += dt;
    if (T.doneT > 0.6) tutGo(T.i + 1);
  }
}
function tutFinish() {
  R.closeSells = R.eng.close(R.m, R.a);
  R.eqLog.push(R.a.cash);
  R.mult = R.a.cash / START;
  R.rank = rankOf(R.mult);
  R.tut.end = true;
  save.tut = 'done';
  persist();
  scene = 'close';
  sceneT = 0;
  Music.stop();
  SFX.play('bell');
}
function tutSkip() {
  save.tut = save.tut === 'done' ? 'done' : 'skipped';
  persist();
  R = null;
  scene = 'title';
  Music.start(0, 0);
}
function spotRect(name) {
  if (name === 'chart') return Lay.chart;
  if (name === 'buy') return btnRect(true);
  if (name === 'sell') return btnRect(false);
  if (name === 'levs') return Lay.levs;
  return null;
}
// the spotlight: everything dark but the part to look at, a big instruction, a hand pointing
function drawTut() {
  const T = R.tut, st = TUT[T.i], K2 = Lay.skip;
  // (drawn last, over the spotlight's shade, so it is never dimmed)
  const skip = () => button('tutSkip', '跳过教程', K2.x, K2.y, K2.w, K2.h, { fill: '#3b1a64', size: 22, r: K2.h / 2, gloss: false });
  if (!st || st.run || !T.wait || T.t < (st.delay || 0)) {
    if (st && st.run) txt('看…', WW / 2, Lay.chart.y + 30, 24, 'rgba(255,255,255,0.6)');
    return skip();
  }
  const sp = spotRect(st.spot), pad = 10, k = Math.min(1, (T.t - (st.delay || 0)) * 5);
  if (st.dayend) return skip();
  ctx.save();
  ctx.globalAlpha = k;
  ctx.beginPath();
  ctx.rect(-WW, -WH, WW * 3, WH * 3);
  if (sp) rrSub(sp.x - pad, sp.y - pad, sp.w + pad * 2, sp.h + pad * 2, 26);
  ctx.fillStyle = sp ? 'rgba(10,4,24,0.74)' : 'rgba(10,4,24,0.4)';
  ctx.fill('evenodd');
  if (sp) {
    const pulse = 0.5 + 0.5 * Math.sin(clock * 8);
    rr(sp.x - pad, sp.y - pad, sp.w + pad * 2, sp.h + pad * 2, 26);
    ctx.lineWidth = 5 + 3 * pulse;
    ctx.strokeStyle = `rgba(255,236,120,${0.6 + 0.4 * pulse})`;
    ctx.stroke();
  }
  // the instruction: above the spot when the spot is low, under it otherwise (on a wide screen beside the chart)
  const lines = st.text, bw = PORT ? 680 : Math.min(640, sp ? Math.max(420, (sp === Lay.chart ? WW - Lay.chart.w - 40 : Lay.chart.w - 40)) : 640);
  const bh = 46 + lines.length * 52 + (st.btn ? 92 : 0);
  let bx, by;
  const low = Lay.skip.y - 14 - bh;                          // never over 「跳过教程」
  if (PORT) {
    bx = (WW - bw) / 2;
    by = st.panel ? Lay.chart.y + 310 : !sp ? WH * 0.32 : sp === Lay.chart ? sp.y + sp.h + 24 : sp.y - bh - 40;
    if (sp === Lay.chart) by = Math.min(by, low);
  } else if (sp === Lay.chart) { bx = Lay.pos.x + 4; by = 120; }
  else { bx = Lay.chart.x + (Lay.chart.w - bw) / 2; by = st.panel ? 330 : sp ? clamp(sp.y + sp.h / 2 - bh / 2, 110, low) : WH * 0.3; }
  const nud = T.nudge > 0 ? Math.sin(T.nudge * 60) * 10 : 0;
  ctx.translate(nud, 0);
  rr(bx, by + 6, bw, bh, 26);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  rr(bx, by, bw, bh, 26);
  ctx.fillStyle = '#fff7e0';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  // which of the seven it is
  rr(bx + 18, by - 18, 132, 36, 18);
  ctx.fillStyle = '#e0112b';
  ctx.fill();
  txt(`教程 ${st.c} / ${TUT_N}`, bx + 84, by, 22, '#fff');
  lines.forEach((l, i) => txt(l, bx + bw / 2, by + 50 + i * 52, i === 0 ? 38 : 30, i === 0 ? '#2a1240' : '#6a4a8a', { max: bw - 40 }));
  ctx.translate(-nud, 0);
  ctx.restore();
  if (st.panel === 'sources') {                             // who says it, how far to trust them
    const pw = Math.min(660, WW - 40), px = (WW - pw) / 2, py = PORT ? Lay.chart.y + 40 : 60;
    rr(px, py, pw, 250, 24); ctx.fillStyle = '#1d1036'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = GOLD; ctx.stroke();
    SRC.forEach((src, i) => {
      const yy = py + 26 + i * 74;
      rr(px + 20, yy, 170, 48, 14); ctx.fillStyle = src.bg; ctx.fill();
      txt(src.name, px + 105, yy + 25, 24, '#fff');
      txt(['靠谱，跟着做', '一半是假的，小心', '常常反着来，反着听'][i], px + 210, yy + 25, 28, '#fff', { align: 'left', max: pw - 230 });
    });
  }
  if (st.btn) button('tutNext', st.btn, bx + bw / 2 - 150, by + bh - 86, 300, 70, { fill: goldFill(by + bh - 86, 70), color: '#2a1240', stroke: 'rgba(255,255,255,0.7)', size: 32 });
  if (sp && sp !== Lay.chart) {                              // a hand bobbing at it
    const bob = Math.sin(clock * 9) * 10;
    icon('up', st.spot === 'levs' ? sp.x + sp.w * 5 / 6 + 20 : sp.x + sp.w / 2 + 30, sp.y + sp.h - 10 + bob, 48, '#fff');
  }
  skip();
}
// the tutorial's last step, on the result screen: the multiple is the score
function drawTutEnd() {
  const col1 = PORT ? WW / 2 : WW * 0.3, sp = { x: col1 - 250, y: 30, w: 500, h: 250 };
  ctx.save();
  ctx.beginPath();
  ctx.rect(-WW, -WH, WW * 3, WH * 3);
  rrSub(sp.x, sp.y, sp.w, sp.h, 30);
  ctx.fillStyle = 'rgba(10,4,24,0.6)';
  ctx.fill('evenodd');
  rr(sp.x, sp.y, sp.w, sp.h, 30);
  ctx.lineWidth = 6;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.restore();
  const bw = PORT ? 680 : WW * 0.42, bx = PORT ? (WW - bw) / 2 : WW * 0.55, by = PORT ? WH - 470 : 160;
  rr(bx, by, bw, 340, 26);
  ctx.fillStyle = '#fff7e0';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  rr(bx + 18, by - 18, 132, 36, 18);
  ctx.fillStyle = '#e0112b';
  ctx.fill();
  txt('学会啦', bx + 84, by, 22, '#fff');
  txt('最后钱翻了几倍，就是你的成绩', bx + bw / 2, by + 56, 36, '#2a1240', { max: bw - 40 });
  txt('正式一局玩 3 天，成绩进排行榜', bx + bw / 2, by + 106, 30, '#6a4a8a', { max: bw - 40 });
  button('start', '开始正式一局！', bx + bw / 2 - 210, by + 150, 420, 96, { fill: grad(by + 150, 96, '#ff6a7c', '#e0112b'), size: 42, r: 32 });
  button('quit', '回标题', bx + bw / 2 - 110, by + 262, 220, 60, { fill: '#3b1a64', size: 26 });
}

// ---------- replays ----------
// data: {v, seed, acts, cash?, nickname?, id?}; from: the scene to go back to
let loadToken = 0;                              // bumped whenever the player moves on: a replay still loading then gives up
async function startReplay(data, from, token) {
  const my = token || ++loadToken;
  let eng = ENG, mod = S;
  if (data.v === 1) { V1 = mod = await loadOld(1); eng = engineV1(); }
  else if (data.v === 2 || data.v === 3) { mod = await loadOld(data.v); eng = engOf(mod); }
  else if (data.v !== S.VERSION) throw new Error('这份回放的规则版本太新了，刷新页面再看');
  const bad = mod.checkActs(data.acts);
  if (bad || (data.v >= 3 ? !mod.goodSeeds(data.seeds) || data.seeds.length !== mod.DAYS : !Number.isInteger(data.seed))) throw new Error('回放数据不对');
  if (my !== loadToken) return;                 // left meanwhile
  leaveLive();
  const prev = R;
  const m = data.v >= 3 ? mod.make(data.seeds) : eng.make(data.seed >>> 0);
  R = baseRound(m, data.seed);
  R.mode = 'replay';
  R.eng = eng;
  R.a = eng.account();
  R.first = false;
  R.rp = { data, from, prev, ai: 0, speed: 1, paused: false, done: false, follow: true, marks: [], expect: Number.isInteger(data.cash) ? data.cash : null };
  R.t = 0;
  R.tick = -1;
  scene = 'play';
  sceneT = 0;
  shake = 0;
  flash = null;
  Music.start(0, 1);
}
function rpApply(t, fx) {
  const P = R.rp, acts = P.data.acts;
  while (P.ai < acts.length && acts[P.ai][0] === t) {
    const op = acts[P.ai++][1], r = R.eng.trade(R.m, R.a, t, op);
    if (!r.ok) continue;
    const type = r.open ? (r.dir > 0 ? 'long' : 'short') : (r.dir > 0 ? 'sell' : 'cover');
    P.marks.push({ s: r.s, t, type, lev: r.lev, p: r.p });
    if (!fx) continue;
    if (P.follow && R.sel !== r.s) { R.sel = r.s; R.selT = 0; }
    const C = Lay.chart, x = C.x + C.w * 0.62, y = C.y + C.h * 0.55;
    if (r.open) { SFX.play('buy'); R.fx.push({ k: 'pop', x, y, s: `${r.dir > 0 ? '押涨' : '押跌'}${r.lev > 1 ? ' ' + r.lev + '×' : ''}`, col: '#fff', t: 0, size: 38, life: 1.1, bg: r.dir > 0 ? UP : '#11a866' }); }
    else {
      SFX.play(r.pnl > 0 ? 'sell' : 'loss', 0);
      R.fx.push({ k: 'pop', x, y, s: money(r.pnl, true), col: r.pnl > 0 ? '#ffe14d' : '#b9f5d4', t: 0, size: 48, life: 1.3, fall: r.pnl <= 0 });
      if (r.onLimit) R.fx.push({ k: 'pop', x, y: y - 64, s: r.dir > 0 ? '涨到头时收手！' : '跌到头时收手！', col: '#fff', t: -0.1, size: 30, life: 1.3, bg: r.dir > 0 ? UP : '#11a866' });
    }
  }
}
function rpUpdate(dt) {
  const P = R.rp;
  if (P.paused || P.done) return;
  R.t += dt * P.speed;
  const k = Math.min(R.T - 1, Math.floor(R.t * S.TPS));
  while (R.tick < k) { R.tick++; onTick(R.tick); rpApply(R.tick, true); }
  if (R.tick >= R.T - 1) rpFinish();
}
function rpFinish(quiet) {
  const P = R.rp;
  R.closeSells = R.eng.close(R.m, R.a);
  R.eqLog.push(R.a.cash);
  P.done = true;
  P.final = R.a.cash;
  P.match = P.expect == null ? null : P.expect === R.a.cash;
  Music.stop();
  if (!quiet) SFX.play('bell');
}
// jump anywhere: the round is re-run silently from the open to tick T (the sim is cheap)
function rpSeek(T) {
  const P = R.rp, wasDone = P.done;
  T = clamp(Math.round(T), 0, R.T - 1);
  R.a = R.eng.account();
  R.eqLog = [START];
  P.marks = [];
  P.ai = 0;
  P.done = false;
  for (let t = 0; t <= T; t++) {
    for (const r of R.eng.liquidate(R.m, R.a, t)) P.marks.push({ s: r.s, t, type: 'liq', lev: r.lev, p: r.p });
    rpApply(t, false);
    if (t % CANDLE === 0) R.eqLog.push(eqOf(R.m, R.a, t));
  }
  R.preview = null;
  R.tick = T;
  R.t = T / S.TPS + 0.001;
  R.card = null; R.words = null; R.fx = []; R.stamps = []; R.liqT = null; R.crack = null; R.toast = null;
  const cr = R.m.events.find(e => e.kind === K.CRASH && T >= e.at && T < e.at + S.HALT);
  R.halt = cr ? { e: cr, t0: cr.at } : null;
  R.eqShown = eqOf(R.m, R.a, T);
  // (dragging along the end re-ran this on every move, and each rang the bell, loud and on and on: 11-09)
  if (T >= R.T - 1) rpFinish(P.scrubbing || wasDone);
}
function rpExit() {
  const P = R.rp;
  loadToken++;
  Music.stop();
  R = P.prev;
  scene = P.from === 'result' && R ? 'result' : P.from === 'board' ? 'board' : 'title';
  if (scene !== 'result') Music.start(0, 0);
}
async function openReplayId(id, from) {
  if (!termsAgreed()) return requireTerms(() => openReplayId(id, from));   // a replay link opened directly too
  const my = ++loadToken, at = scene;
  notice('回放加载中…');
  try {
    const d = await apiFetch(`/replay?game=stock&id=${id}`, {}, 8000);
    if (my !== loadToken || scene !== at) return;              // the player went elsewhere meanwhile
    await startReplay(d, from, my);
    notice('');
  } catch (e) { if (my === loadToken) notice('回放打不开：' + e.message); }
}
function scrubTo(x) {
  const A = replayArea(), x0 = A.x + 28, w = A.w - 56;
  rpSeek((clamp(x, x0, x0 + w) - x0) / w * (R.T - 1));
}
const replayURL = id => `${location.origin}${location.pathname}?r=${id}`;
function copyReplayLink() {
  const u = R && R.up, id = u && u.d && u.d.id;
  if (!id) return;
  const link = replayURL(id), done = () => { u.msg = '已复制回放链接，发给朋友看'; };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => window.prompt('回放链接', link));
  else window.prompt('回放链接', link);
}
// /game/dafuweng/?r=<id> (and old /game/stock/?r= links, redirected) opens that round's replay
const deepLink = (/[?&]r=(\d{1,12})(?:&|$)/.exec(location.search) || [])[1] || null;
let noticeMsg = null;
function notice(s) { noticeMsg = s ? { s, t: 0 } : null; }
function drawNotice() {
  if (!noticeMsg) return;
  noticeMsg.t += 1 / 60;
  if (noticeMsg.t > 4) { noticeMsg = null; return; }
  ctx.font = font(26);
  const w = ctx.measureText(noticeMsg.s).width + 44;
  rr(WW / 2 - w / 2, WH - 120, w, 52, 26);
  ctx.fillStyle = 'rgba(16,6,32,0.94)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  txt(noticeMsg.s, WW / 2, WH - 93, 26, '#fff');
}
// the replay's own controls where the trading buttons were: who, the money line, a scrub bar with the news and the
// trades on it, play / pause / speed, and 我也来一局
function replayArea() {
  const top = Lay.chips.y, bot = Lay.btns.y + Lay.btns.h;
  return { x: Lay.chips.x, y: top, w: Lay.chips.w, h: bot - top };
}
function drawReplay() {
  const P = R.rp, A = replayArea();
  panel(A.x, A.y, A.w, A.h, { fill: 'rgba(30,12,52,0.95)' });
  const name = P.data.nickname || (P.data.id ? '匿名狗狗' : '你');
  icon('play', A.x + 32, A.y + 26, 24, GOLD);
  txt(`${name} 的回放`, A.x + 52, A.y + 26, 26, GOLD, { align: 'left', max: A.w - 232 });
  txt(P.data.v < 3 ? `老规则 v${P.data.v}` : `${(eqOf(R.m, R.a, Math.max(0, R.tick)) / START).toFixed(2)} 倍`, A.x + A.w - 20, A.y + 26, 24, '#fff', { align: 'right' });
  // the money, second by second, with the end shown faint
  const eq = { x: A.x + 16, y: A.y + 50, w: A.w - 32, h: Math.max(60, A.h * 0.26) };
  rr(eq.x, eq.y, eq.w, eq.h, 14);
  ctx.fillStyle = 'rgba(10,4,22,0.8)';
  ctx.fill();
  const log = R.eqLog, n = R.T / CANDLE + 1;
  let lo = START, hi = START;
  for (const v of log) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = (hi - lo) || START * 0.1;
  lo -= span * 0.12; hi += span * 0.12;
  const X = i => eq.x + 8 + (eq.w - 16) * i / (n - 1), Y = v => eq.y + eq.h - 8 - (eq.h - 16) * (v - lo) / (hi - lo);
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(eq.x + 8, Y(START)); ctx.lineTo(eq.x + eq.w - 8, Y(START)); ctx.stroke();
  ctx.setLineDash([]);
  if (log.length > 1) {
    ctx.beginPath();
    log.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.lineWidth = 4;
    ctx.strokeStyle = log[log.length - 1] >= START ? UP : DOWN;
    ctx.stroke();
  }
  txt('资产', eq.x + 12, eq.y + 16, 16, MUTED, { align: 'left', weight: 800 });
  // the scrub bar
  const sb = { x: A.x + 28, y: eq.y + eq.h + 26, w: A.w - 56, h: 14 }, tx = t => sb.x + sb.w * t / (R.T - 1);
  rr(sb.x, sb.y, sb.w, sb.h, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();
  rr(sb.x, sb.y, Math.max(14, tx(Math.max(0, R.tick)) - sb.x), sb.h, 7);
  ctx.fillStyle = GOLD;
  ctx.fill();
  for (const e of R.m.events) {                             // the news above the bar
    const tg = e.kind === K.RUMOR ? TAGS.rumor : TAGS[e.kind];
    rr(tx(e.news) - 4, sb.y - 18, 8, 14, 3);
    ctx.fillStyle = tg.bg;
    ctx.fill();
  }
  const MC = { long: UP, short: '#11c97a', sell: '#ffe14d', cover: '#ffe14d', liq: '#000' };
  for (const mk of P.marks) {                               // the trades under it
    ctx.beginPath();
    ctx.arc(tx(mk.t), sb.y + sb.h + 10, mk.type === 'liq' ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = MC[mk.type];
    ctx.fill();
    if (mk.type === 'liq') { ctx.lineWidth = 2; ctx.strokeStyle = '#ff2a48'; ctx.stroke(); }
  }
  ctx.beginPath();
  ctx.arc(tx(Math.max(0, R.tick)), sb.y + sb.h / 2, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  buttons.push({ id: 'scrub', x: sb.x - 20, y: sb.y - 26, w: sb.w + 40, h: 62 });
  // controls
  const narrow = A.w < 600, ch2 = 74, cy = A.y + A.h - (narrow ? 172 : 86);   // a narrow side panel: 我也来一局 gets its own row
  let x = A.x + 16;
  button('rpRestart', '', x, cy, 74, ch2, { fill: '#3b1a64', size: 30, r: 20, icon: 'replay', iconSize: 36 }); x += 86;
  button('rpPlay', '', x, cy, 96, ch2, { fill: goldFill(cy, ch2), color: '#2a1240', stroke: 'rgba(255,255,255,0.6)', size: 34, r: 20,
    icon: P.paused || P.done ? 'play' : 'pause', iconSize: 38 }); x += 108;
  [1, 2, 4].forEach(sp => { const on = P.speed === sp; button('rpS' + sp, sp + '×', x, cy + (on ? 0 : 4), 66, ch2 - 4, { fill: on ? '#ff7a12' : '#2c1548', size: 26, r: 18, gloss: on }); x += 74; });
  if (narrow) button('start', '我也来一局', A.x + 16, cy + 86, A.w - 32, ch2, { fill: grad(cy + 86, ch2, '#ff6a7c', '#e0112b'), size: 30, r: 22 });
  else button('start', '我也来一局', x + 4, cy, A.x + A.w - 16 - x - 4, ch2, { fill: grad(cy, ch2, '#ff6a7c', '#e0112b'), size: 28, r: 22 });
  // the end: the result, whether it matches what was uploaded, and the way in
  if (P.done) {
    const C = Lay.chart;
    ctx.fillStyle = 'rgba(14,4,28,0.82)';
    rr(C.x, C.y, C.w, C.h, 22);
    ctx.fill();
    bigText(multStr(P.final / START), C.x + C.w / 2, C.y + C.h * 0.28, 110, P.final >= START ? '#fffbe0' : '#e0fff0', P.final >= START ? '#ff5a1a' : '#19c97a', -0.04);
    txt(`${name} · ${rankOf(P.final / START).name} · ${money(P.final)}`, C.x + C.w / 2, C.y + C.h * 0.28 + 86, 28, '#fff', { stroke: '#2a0c22', sw: 5, max: C.w - 40 });
    if (P.match != null) txt(P.match ? (P.data.id ? '重算结果和排行榜记录一模一样' : '重算结果和你这局一模一样') : '重算结果和记录对不上', C.x + C.w / 2, C.y + C.h * 0.28 + 130, 24, P.match ? '#9dffb0' : '#ff9aa8', { stroke: '#2a0c22', sw: 4 });
    const k = 1 + 0.05 * Math.sin(clock * 7);
    button('start', '我也来一局！', C.x + C.w / 2 - 190 * k, C.y + C.h * 0.62, 380 * k, 100 * k, { fill: goldFill(C.y + C.h * 0.62, 100), color: '#2a1240', stroke: 'rgba(255,255,255,0.7)', size: 44 * k, r: 34 });
    button('rpRestart', '再看一遍', C.x + C.w / 2 - 110, C.y + C.h * 0.62 + 124, 220, 62, { fill: '#3b1a64', size: 26 });
  }
}
// the trades on the chart: ▲ 多 3× under the candle, ▼ 空 10× over it, ● 卖 / 平, 💥 爆
function drawMarks(cs, X, Y, s, Y0, Y1) {
  if (!R.rp) return;
  for (const mk of R.rp.marks) {
    if (mk.s !== s) continue;
    const ci = cs.findIndex(c => mk.t >= c.t && mk.t < c.t + CANDLE);
    if (ci < 0) continue;
    const x = X(ci), y = clamp(Y(mk.p), Y0, Y1);
    const lab = { long: `涨${mk.lev > 1 ? mk.lev + '×' : ''}`, short: `跌${mk.lev > 1 ? mk.lev + '×' : ''}`, sell: '收', cover: '收', liq: '爆仓' }[mk.type];
    const col = { long: UP, short: '#11a866', sell: '#e8a000', cover: '#e8a000', liq: '#7a0010' }[mk.type];
    const up = mk.type === 'long' || mk.type === 'cover', ay = up ? y + 22 : y - 22;
    ctx.beginPath();
    if (up) { ctx.moveTo(x, y + 8); ctx.lineTo(x - 10, y + 24); ctx.lineTo(x + 10, y + 24); }
    else { ctx.moveTo(x, y - 8); ctx.lineTo(x - 10, y - 24); ctx.lineTo(x + 10, y - 24); }
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.font = font(17);
    const w = ctx.measureText(lab).width + 14, ly = up ? ay + 20 : ay - 20;
    rr(x - w / 2, ly - 12, w, 24, 10);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    txt(lab, x, ly + 1, 17, '#fff');
  }
}

// ---------- loop ----------
let last = performance.now();
// #6 (11-09 review): the market follows real time in the foreground: a slow phone drops frames, not seconds (the dt of
// effects and animation stays clamped at 50 ms; the market catches up in whole ticks, at most GAME_DT_MAX at once, so a
// stall or a tab switch doesn't jump ahead; replays and the server go by ticks and are unaffected)
const GAME_DT_MAX = 0.25;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.max(0, (now - last) / 1000);
  last = now;
  update(Math.min(0.05, real), Math.min(GAME_DT_MAX, real));
  render();
}
resize();
requestAnimationFrame(frame);
if (deepLink) openReplayId(+deepLink, 'title');
document.addEventListener('pointerdown', () => { if (scene === 'title' && !Music.on && SFX.ctx) Music.start(0, 0); }, true);

// hooks for the headless checks (only with ?test=1): start a given seed, jump the clock, read the state
if (TEST) {
  window.STOCK_TEST = {
    start(seed) { newRound(typeof seed === 'string' ? seed : localSeed(), null); },
    jump(sec) { if (!R) return; if (scene === 'intro') { scene = 'play'; R.t = 0; } const k = Math.floor(sec * S.TPS); while (R.tick < k && R.tick < TICKS - 1 && !R.wiped) { R.tick++; onTick(R.tick); } R.t = sec; },
    press(id) { press(id); },
    lev(i) { if (R) R.lev = i; },
    pos() { return R && R.a.sh.map((n, s) => n > 0 && { s, dir: R.a.dir[s], lev: R.a.lev[s], liq: S.liqPrice(R.a, s) }); },
    sim() { return R && { seed: R.seed, seeds: R.seeds, acts: R.acts }; },
    night() { return R && R.m.nights && R.m.nights[Math.floor(Math.max(0, R.tick) / R.day)]; },
    nextBusy() { return !!(R && R.nextSeed && R.nextSeed.state === 'busy'); },
    up() { return R && R.up && { state: R.up.state, msg: R.up.msg, ranked: !!R.live, offline: R.offline || null }; },
    live() { const L = R && R.live; return L && { recv: L.recv, nf: L.nf, retry: L.retry, closed: L.closed, gone: L.gone, open: !!(L.ws && L.ws.readyState === 1), pq: L.pq.length, rtt: L.rtt, t: R.t, booked: L.ab.cash,
      end: L.end && { cash: L.end.cash, acts: L.end.acts }, cash: R.a.cash, acts: R.acts, tick: R.tick, zero: R.m.stocks.some(st => st.P.slice(S.HIST, S.HIST + R.tick + 1).some(x => !(x > 0))) }; },
    state() { return R && { scene, t: R.t, tick: R.tick, cash: R.a.cash, sh: R.a.sh.slice(), acts: R.acts.length, mult: R.mult, card: R.card && R.card.head }; },
    events() { return R && R.m.events.map(e => ({ type: e.type, kind: e.kind, sent: e.sent, src: e.src, news: e.news, at: e.at, end: e.end, target: e.target, shake: e.shake })); },
    scene() { return scene; },
    result(mult) { if (!R) return; scene = 'play'; while (R.tick < R.T - 1) { R.tick++; onTick(R.tick); if (scene !== 'play') scene = 'play'; } R.t = R.T / S.TPS; endRound(); sceneT = 3; update(0.01); resT = 3; },
    board(items) { board.cache.today = { at: Date.now() + 1e9, items }; openBoard('title'); },
    tut() { return R && R.tut && { i: R.tut.i, wait: R.tut.wait, c: (TUT[R.tut.i] || {}).c, allow: (TUT[R.tut.i] || {}).allow || null, btn: (TUT[R.tut.i] || {}).btn || null, dayend: !!(TUT[R.tut.i] || {}).dayend, text: ((TUT[R.tut.i] || {}).text || [''])[0], tick: R.tick, end: !!R.tut.end }; },
    replay(data) { return startReplay(data, 'title'); },
    rpFast() { let n = 0; R.rp.speed = 4; while (!R.rp.done && n++ < 5000) rpUpdate(0.25); return { final: R.rp.final, match: R.rp.match, marks: R.rp.marks.length }; },
    rpSeek(t) { rpSeek(t); },
    rp() { return R && R.rp && { tick: R.tick, done: R.rp.done, final: R.rp.final, match: R.rp.match, speed: R.rp.speed, paused: R.rp.paused }; },
  };
}
