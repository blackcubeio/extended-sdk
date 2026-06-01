# Extended (ex-X10) — cartographie API (référence d'implémentation)

Perp (+ spot) DEX sur **Starknet/StarkEx**. Sources : api.docs.extended.exchange, SDK Python officiel
`x10xchange/python_sdk` (branche Starknet/SNIP-12, lue dans le source), signer WASM officiel
`x10xchange/stark-crypto-wrapper-js`.

## Base URLs (lues dans `x10/config.py`)
| | Mainnet | Testnet (Sepolia) |
|---|---|---|
| REST | `https://api.starknet.extended.exchange/api/v1` | `https://api.starknet.sepolia.extended.exchange/api/v1` |
| WS | `wss://api.starknet.extended.exchange/stream.extended.exchange/v1` | `…sepolia…/stream.extended.exchange/v1` |
| Onboarding | `https://api.starknet.extended.exchange` | `https://api.starknet.sepolia.extended.exchange` |

Collateral USD, `collateral_decimals=6`, `collateral_asset_id="0x1"`.

## Auth / signature (SNIP-12 Stark)
- **Lecture + auth** : header `X-Api-Key`. **`User-Agent` obligatoire** sur REST ET WS.
- **Écriture** (ordres/transferts/retraits) : `X-Api-Key` **+ signature Stark** sur la donnée de settlement.
- Domaine SNIP-12 (config.py) : mainnet `name="Perpetuals"`,`version="v0"`,`chain_id="SN_MAIN"`,`revision="1"`,
  signing_domain=`extended.exchange` ; testnet `chain_id="SN_SEPOLIA"`, signing_domain=`starknet.sepolia.extended.exchange`.
- **Onboarding** : signature **EIP-712** `AccountRegistration{accountIndex,wallet,tosAccepted,time,action,host}` →
  `generate_keypair_from_eth_signature` (grind sur l'ordre Stark) → keypair L2 Stark.
- **Hash d'ordre** (`order_object_settlement.py`, `get_order_msg_hash` — **PAS un SNIP-12 typed data standard**,
  hash StarkEx perpetual de champs ordonnés) : `position_id`, `base_asset_id`(=synthetic settlement_external_id),
  `base_amount`(entier scalé, <0 si SELL), `quote_asset_id`(collateral), `quote_amount`(=size*price scalé, <0 si BUY),
  `fee_amount`(scalé), `fee_asset_id`(collateral), `expiration`(expireTime + **14j buffer**), `salt`(=nonce),
  `user_public_key`, + 4 champs domaine. Signé → `(r,s)`. `settlement={signature{r,s},starkKey,collateralPosition(=vault id)}`.
  Variante `get_limit_order_msg_hash` (source/receive position).
- **Signer** : Rust `fast_stark_crypto` ; wrapper JS officiel `stark-crypto-wrapper-js` (**WASM**, ~55µs/sig).
  JS pur possible via `@scure/starknet` (pedersen+sign) mais **le hash exact doit être reproduit fidèlement**
  depuis le SDK Python/Rust → **valider rigoureusement sur testnet**. Modèle **Lighter** (signer WASM lazy par réseau)
  applicable si le JS pur ne reproduit pas le hash au bit près.

## Lecture marché (public, `X-Api-Key` + User-Agent), base `/api/v1`
| Donnée | path | params | réponse |
|---|---|---|---|
| Marchés | `GET /info/markets` | `market?`[] | name,type,assetPrecision,active,status,marketStats,tradingConfig{minOrderSize,maxLeverage,…}, **l2Config{collateralId,collateralResolution,syntheticId,syntheticResolution}** (scaling/signature) |
| Stats | `GET /info/markets/{m}/stats` | — | markPrice,indexPrice,lastPrice,bid,ask,fundingRate,nextFundingRate,OI,daily… |
| Orderbook | `GET /info/markets/{m}/orderbook` | `depth` | data.bid[]/ask[] {qty,price} |
| Trades | `GET /info/markets/{m}/trades` | — | i,m,S(side),tT(type),T(ts),p,q |
| Candles | `GET /info/candles/{m}/{candleType}` | candleType∈trades\|mark-prices\|index-prices ; `interval`*(PT1M,PT5M,PT15M,PT30M,PT1H,PT2H,PT4H,P1D),`limit`*,`endTime?` | data[] o,h,l,c,v,T |
| Funding | `GET /info/{m}/funding` | `startTime`*,`endTime`*(ms),`cursor?`,`limit?` | data[] m,T,f |
| Assets | `GET /info/assets`, `/info/assets/{a}/price` | | |

## Compte (signé `X-Api-Key`)
`GET /user/balance`, `/user/positions`(market,side), `/user/positions/history`, `/user/orders`(open),
`/user/orders/history`, `/user/orders/{id}`, `/user/orders/external/{extId}`, `/user/trades`(fills),
`/user/funding/history`, `/user/fees`, `/user/account/info`, `/user/accounts`, `/user/account/equity-history`,
`/user/account/pnl-history`, `/user/assetOperations`, `/user/vault/performance|summary`.

## Trading (signé)
- `POST /user/order` (place ET edit) : market, side(BUY/SELL), type(LIMIT|MARKET|CONDITIONAL|TPSL|TWAP),
  qty, price(MARKET=pire prix), timeInForce(GTT|IOC), expireTime(ms), postOnly, reduceOnly, leverage,
  externalId(=clientId), id, nonce, fee, settlement{signature,starkKey,collateralPosition},
  trigger{triggerPrice,triggerPriceType LAST|MARK|INDEX,direction}, takeProfit/stopLoss{…}, tpSlType(ORDER|POSITION),
  builderFee/builderId. MARKET ⇒ timeInForce=IOC, pas postOnly.
- `DELETE /user/order/{id}`, `DELETE /user/order?externalId=`, `POST /user/order/massCancel`
  {orderIds,externalOrderIds,markets,cancelAll}.
- **Dead-man-switch** : `POST /user/orders/auto-cancel` (renouvellement périodique) → IDeadManSwitch.
- Levier : `GET /user/leverage?market=`, `PATCH /user/leverage` {market,leverage}. (Pas de margin mode cross/iso explicite.)
- Transferts/retraits : `POST /user/transfer`, `POST /user/withdraw`, `/user/bridge/*` (signés Stark).
- **Asynchrone** : `POST /user/order` renvoie un id ; statut final via WS account.

## WebSocket (souscription par PATH, 1 channel = 1 connexion), base `…/stream.extended.exchange/v1`
- `/orderbooks/{m}?depth=` (SNAPSHOT puis DELTA, 100ms), `/publicTrades/{m}`, `/funding/{m}`,
  `/candles/{m}/{candleType}?interval=`, `/mark-prices/{m}`, `/index-prices/{m}`.
- Privé : `/account` (auth header `X-Api-Key` à la connexion) — balances/positions/ordres/fills (+ spot).
- **Heartbeat** : serveur ping 15s, pong attendu < 10s. `User-Agent` requis aussi sur WS.

## Spécificités
- Marchés symbole hyphené `BTC-USD`. Pas d'id entier public ; ids L2 (`l2Config.syntheticId/collateralId`) pour la signature.
- **Scaling** : REST en strings human-readable, mais **signature en entiers scalés** via syntheticResolution/
  collateralResolution (de `/info/markets` l2Config). DEFAULT_TAKER_FEE=0.0005.
- **Vault = position id** entier (`collateralPosition`/`source_position_id`), fourni par l'API management.
- Sous-comptes (action SNIP `CREATE_SUB_ACCOUNT`, `GET /user/accounts`), API keys (`create_account_api_key`).
- Vault de rendement (`/user/vault/*`), builder codes, marchés spot (`/user/spot/balances`).
- Comptes legacy (app.x10.exchange) : domaine de signature legacy distinct.

## À confirmer testnet
- Noms exacts des sous-champs REST (doc JS-rendered).
- Reproduction au bit près de `get_order_msg_hash` en JS pur (sinon signer WASM).
- Statut des packages npm TS tiers (non officiels) — ignorer ; seul artefact JS officiel = signer WASM.
