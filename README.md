# 老谋大富翁

一个纯属娱乐的网页小游戏：看狗狗新闻，点押涨 / 押跌，3 天里把 10,000 虚拟金币翻几倍。新闻踩着音乐的拍子弹出，老谋骂人时整个狗市熔断。画面是 canvas，音效现场合成，再配上老谋的原声。

> 游戏里只有虚拟金币：不能充值、不能提现、不涉及任何真实货币。游戏内容全部虚构，不构成任何投资建议。

## 目录

- `web/`：游戏本体，纯静态文件（`game.js` 画面和玩法，`sim.js` 行情模拟，`sim_v1~v3.js` 是旧规则、给旧回放用）
- `server/stock_market.mjs`：排位局行情服务（Node，无依赖）
- `server/dogfight/stock_sim*.js`：服务端用的行情模拟，和 `web/sim*.js` 逐字节相同
- `server/dogfight/stock_verify.js`：按种子和操作重放一局、算出结果（stdin 读 JSON）
- `server/testdata/`：机器人打的示例回放（合成数据）

## 本地运行

### 练习局（只要静态页面）

```sh
cd web
python3 -m http.server 8000
```

打开 <http://127.0.0.1:8000/>。没有配置服务器时，开局自动是「练习局：不上榜」。

### 排位局（行情服务）

需要 Node 18 以上。

```sh
STOCK_MARKET_KEY=$(openssl rand -hex 32) node server/stock_market.mjs
```

然后打开 <http://127.0.0.1:8000/?mkt=ws://127.0.0.1:8794/stock>（`?mkt=` 只在 localhost / 127.0.0.1 上生效），开局就由服务器一跳一跳地推行情。

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `STOCK_MARKET_KEY` | 无 | 必填。给成绩签名的 HMAC 密钥；不设时服务器拒绝开排位局，页面自动改成练习局 |
| `STOCK_MARKET_PORT` | `8794` | 监听端口（只监听 127.0.0.1，WebSocket 路径 `/stock` 或 `/dogfight/stock`） |
| `DOGFIGHT_API_PORT` | `8779` | 收盘时把签名后的成绩 POST 到 `127.0.0.1:端口/stock_round` 的后端（排行榜后端不在本仓库里；没有它，排位局照常玩完，结算时提示成绩没传上） |
| `STOCK_MARKET_SPEED` | `1` | 只给测试用：时钟加速倍数 |

公网部署时放在反向代理后面；代理可以用 `X-Hedssaz-Verified-IP` 头传玩家真实 IP（按 IP 限连接数用）。

### 部署配置

`web/game.js` 开头的 `CONFIG`：

- `API_BASE`：排行榜、回放、游玩人数的后端地址，默认空（不请求任何后端）
- `MARKET_WS`：排位局行情服务的 WebSocket 地址，默认空（只玩练习局）；以 `/` 开头表示同源
- `SHARE_SITE`：分享图上印的网址，要和 `web/assets/qr.png` 的二维码一致，自己部署时两个一起换

## 测试

```sh
node --test server/test_stock_market.mjs
node server/dogfight/stock_verify.js < server/testdata/stock_replay_v4.json
```

## 许可

[MIT](LICENSE)。代码和素材（狗狗图片、老谋语音等）一起开源。

老谋游戏 by hedssaz
