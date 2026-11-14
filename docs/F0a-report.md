# F0a — Informe: xarxa de seguretat de tests (abans de tocar el motor)

Data: 2026-11-14 · Font de veritat: `escacsceliterra-main 13-11-26.zip` ·
Contracte: `docs/SPEC-engine-audit.md` (v2) · **Cap canvi de semàntica de
regles. Cap decisió de reglament. Cap fitxer del motor modificat.**

## 1. Resum executiu

| Tasca | Resultat |
| --- | --- |
| T1 · Baselines perft V0–V5 (4 posicions × 3 profunditats) | 72 comptatges congelats a `tests/f0a-perft-baselines.test.js` i documentats a `docs/perft-baselines.md` amb especificació completa de cada posició (peces + pla + `gh`/`gid` + castling + torn + CFG dels 7 camps). **Etiquetats "baseline de regressió", mai "oracle verificat".** |
| T2 · Micro-posicions oracle (≤ 5 peces, raonament manual) | 7 posicions (M1–M7), 21 assercions, totes verdes al final. Cobren: rei sol al Cel amb Terra lliura, torre apilada sota rei del Cel (escac vertical), fantasma al Cel, rei al Cel amb Terra ocupada, peó fantasma zombi, reis apilats (robustesa), acoblament F_VCAP⇔conversion (V0 vs V2). |
| T3 · Test pendent `freeCelSq` amb víctima ja al Cel (V4) | Resolt: la víctima del Cel **es reconverteix sempre**; vegeu §3. 13 assercions (S0–S3). |
| Extra · Diferencial chess.js CI-friendly | `tests/f0a-chessjs-differential.test.js` (nou): la mateixa lògica del test de 10.000 partides del repo amb 200 partides → **38.687 posicions, 0 divergències, 70 s, PASSAT**. Raó: el test de 10k no és executable en aquest sandbox (vegeu Apèndix). |
| Suite | 114 assercions `ok()` noves + 1 test vitest de diferencial, **0 fail**. Suite existent `tests/engine.test.js`: **verd** (exit=0). Suite existent `tests/rules.test.js`: **22/23 tests verds**; l'únic no executat és el diferencial de 10.000 partides (límit de rendiment de l'entorn, vegeu Apèndix). |

Fitxers nous (els únics canvis): `tests/f0a-perft-baselines.test.js`,
`tests/f0a-oracles.test.js`, `tests/f0a-freecelsq.test.js`,
`tests/f0a-chessjs-differential.test.js`, `docs/perft-baselines.md`,
`docs/F0a-report.md`. Patch complet: `docs/F0a-diffs.patch`.

## 2. Taula resum dels comptatges perft

Format perft(1) / perft(2) / perft(3). Les especificacions completes (peces,
pla, torn, CFG) són a `docs/perft-baselines.md`.

| Variant | P0-inicial | P1-migjoc-fantasmes | P2-final-reis-plans-diferents | P3-enroc-internivell |
| --- | --- | --- | --- | --- |
| V0 | 36 / 1.296 / 52.294 | 65 / 2.013 / 127.644 | 25 / 196 / 4.961 | 28 / 509 / 14.515 |
| V1 | 36 / 1.296 / 52.294 | 65 / 2.013 / 127.567 | 25 / 196 / 4.961 | 29 / 527 / 15.169 |
| V2 | 36 / 1.296 / 52.294 | 65 / 2.013 / 127.567 | 25 / 196 / 4.961 | 29 / 527 / 15.169 |
| V3 | 36 / 1.296 / 52.294 | 65 / 2.013 / 127.656 | 25 / 196 / 4.961 | 29 / 528 / 15.174 |
| V4 | 36 / 1.296 / 52.294 | 65 / 2.013 / 127.713 | 25 / 196 / 4.961 | 29 / 527 / 15.169 |
| V5 | 36 / 1.296 / 52.294 | 65 / 2.013 / 127.567 | 25 / 196 / 4.961 | 28 / 508 / 14.554 |

Senyals de saneig interns (coherència de la baseline amb el contracte, no prova
de correcció): P0 i P2 idèntiques a totes les variants fins a prof. 3 (no hi ha
captures que activin conversió/capBlock); P3 distingeix exactament les variants
amb `ilCastling` (+1 jugada a perft(1) a V1–V4); P1 és la discriminant de la
família de conversió a perft(3). Detalls a `docs/perft-baselines.md`.

## 3. Resultat del test pendent: `freeCelSq` amb víctima ja al Cel (V4)

**L'afirmació del comentari de codi (`rules.js:198-202`) queda CONFIRMADA; la
lectura ingènua de §1.1 queda REFUTADA per a víctimes del Cel.** Les dues
afirmacions de l'SPEC **no xoquen**: s'apliquen a casos de pla diferent.

| Escenari | Què passa realment en V4 (`capBlock: 'block'`, `heavenDeath: 'convert'`) |
| --- | --- |
| S1 · Captura `F_NORM` al Cel, anell 1 + c8¹ + c7¹ + a6¹ ocupats | La víctima es **reconverteix a b6¹ — l'origen del captor**, com a peó blanc fantasma (`gh=1`); `u.conv` el registra; l'`unmake` restaura exactament. (Coincideix amb el test existent `engine.test.js:421-442`.) |
| S2 · Només l'anell 1 ocupat | Reconversió a **c8¹**, la casella lliure més propera per l'ordre d'anells Chebyshev de `freeCelSq`, amb `gh=1`. |
| S3 · Cel PLE (63 caselles ocupades a part de la víctima i l'origen) | La reconversió **encara té èxit**: cau a l'origen del captor. Vegeu la troballa de sota. |
| S0 · Contrast: víctima a **Terra** amb la casella del Cel de sota ocupada | La captura `Te1xe4` **no es genera ni tan sols com a pseudo-legal**: el filtre de blocatge viu dins de `genPseudo` (`rules.js:404-416`), no a `genMoves`. |

**Troballa nova (conseqüència del test S3):** per a una captura `F_NORM` dins
del Cel en V4, la reconversió **mai no pot fallar**. La captura allibera sempre
l'origen del captor (`b[m.from] = 0` abans de `placeConverted`), l'origen és
sempre a distància Chebyshev ≤ 7 de la víctima (és un moviment dins del mateix
nivell), i la recerca d'anells de `freeCelSq` cobreix tot el tauler (d = 1..7).
Per tant `freeCelSq → -1` és **inassolible** per a víctimes del Cel via
`F_NORM`: «la víctima es perd» (§1.1, `capBlock: 'block'`/`'lose'`) només és
alcançable per a **víctimes de Terra** amb la casella del Cel de sota tapada.
Amb `F_VCAP` cap al Cel no hi ha reconversió directa (SPEC v2, inv. 9
corregida), cosa que el codi confirma (`rules.js:488-489`).

**Implicació per a l'SPEC:** cap correcció necessària; l'SPEC v2 ja descriu els
dos camins correctament. Suggeriment menor de precisió per a una futura v3:
afegir a §1.1 que amb víctimes del Cel el `-1` és inassolible per captura
in-level (l'origen del captor sempre és candidat).

## 4. Divergències detectades entre raonament manual i motor (T2)

Per instrucció explícita, el raonament inicial **no es va ajustar per fer-lo
quadrar**: es va reportar, es va re-derivar des del contracte (SPEC v2) i es va
documentar dins del mateix test. El motor va estar **consistent amb el
contracte en els 4 casos**; els errors eren del meu raonament inicial:

| # | Raonament inicial | Motor real | Causa arrel | Resolució |
| --- | --- | --- | --- | --- |
| 1 | M2 = 18 (la torre blanca podia «capturar cap avall per la seva columna») | 8 | `F_VCAP` només captura la peça **apilada a la mateixa coordenada** (SPEC §1.2); des d'una casella diferent del Cel no es pot tocar l'atacant de Terra | Oracle corregit a 8 amb nota de divergència dins del test; el motor CONFIRMA el contracte |
| 2 | M3 = 11, M5 = 3 (oblideu l'ascens del rei de Terra) | 12, 4 | El rei a Terra amb el Cel lliure a sobre sempre té l'ascens `F_VERT` (contracte: destí buit + no fantasma) | Oracles corregits a 12/4 amb l'ascens explícit al raonament i asserció de què és l'única vertical |
| 3 | M7 V0 = 17, V2 = 18 | 18, 19 | Mateixa causa que #2 (+1 ascens del rei a les dues variants) | Corregits a 18/19; la diferència d'exactament 1 jugada entre V0 i V2 segueix sent l'`F_VCAP` acoblat a `conversion` (correcció 9 de la verificació, ara provada empíricament) |
| 4 | S3: «Cel ple → víctima perduda (-1)» | Reconversió amb èxit a l'origen | Vegeu §3: l'origen del captor s'allibera sempre i és sempre candidat | Escenari reconvertit en troballa documentada |

Cap d'aquestes divergències és un bug del motor; cap va requerir tocar codi.

## 5. Estat de l'SPEC v2 després de F0a

Afirmacions de l'SPEC v2 tocades per aquests tests i el seu veredicte:

- §1.2 `F_VCAP` («captura la peça apilada de l'altre nivell») — **confirmada** (M2, M7).
- Correcció 9 de la verificació (V0 = foc vertical sense conversió mai genera
  `F_VCAP`) — **confirmada empíricament** (M7: diferència exacta d'1 jugada V2−V0).
- §1.1 `freeCelSq` + comentari `rules.js:198-202` — **confirmada** (S1, S2, S3); el
  `-1` per a víctimes del Cel és inassolible via `F_NORM` (troballa §3).
- §1.1 filtre `capBlock: 'block'` — **confirmada**, i precisada: viu dins de
  `genPseudo` (`rules.js:404-416`), no a `genMoves`.
- Invariants 1/2/10/11 (fantasma sense verticals, zombi que bloqueja) —
  **confirmades** (M3, M5).
- Invariant 6 (escapatòries entre plans) i 24 (reis mai apilats) — comportament
  determinista comprovat en posicions construïdes (M1, M4, M6).

**Cap divergència entre l'SPEC v2 i el comportament real del motor.**

## 6. Suite de tests

| Suite | Estat |
| --- | --- |
| `tests/f0a-perft-baselines.test.js` (nou) | **Verd**: 80 assercions (72 perft + 8 estructurals) |
| `tests/f0a-oracles.test.js` (nou) | **Verd**: 21 assercions |
| `tests/f0a-freecelsq.test.js` (nou) | **Verd**: 13 assercions |
| `tests/f0a-chessjs-differential.test.js` (nou) | **Verd**: diferencial chess.js amb 200 partides (38.687 posicions, 0 divergències, 70 s) |
| `tests/engine.test.js` (existent, 549 línies) | **Verd** (vitest v3.2.7, exit=0; inclou el fuzz make/unmake de 6 variants i el diferencial de cerca vs alfa-beta de referència) |
| `tests/rules.test.js` (existent, 341 línies) | **22 de 23 tests PASSAT** (1,5 s; inclou perft clàssic 1–5 = [20, 400, 8902, 197281, 4865609] exacte). L'únic no executat és el diferencial chess.js de 10.000 partides: no és executable en aquest sandbox (Apèndix). |

Nota d'entorn: les dev-deps de test (`vitest@3`, `chess.js@1.4`) s'han instal·lat
amb `npm install --no-save` per poder executar la suite; `package.json` i
`package-lock.json` del repo no queden modificats (verificat al patch de §7).

## 7. Confirmació explícita: cap fitxer del motor s'ha modificat

Mètode: extracte net del ZIP (`/tmp/pristine`) i diff recursiu contra la còpia
de treball, més checksums MD5 fitxer a fitxer. El patch (`docs/F0a-diffs.patch`)
conté **només fitxers nous** (mode de creació, cap hunk de modificació):

- `tests/f0a-perft-baselines.test.js` · `tests/f0a-oracles.test.js` ·
  `tests/f0a-freecelsq.test.js` · `tests/f0a-chessjs-differential.test.js` ·
  `docs/perft-baselines.md` · `docs/F0a-report.md`

Verificació per checksum (tots IDÈNTICS a l'extracte net): `src/core/rules.js`,
`src/engine/engine-v0.cjs`, `src/engine/engine.js`, `index.html`,
`package.json`, `package-lock.json`, `tsconfig.json`, `SPEC.md` (reglament,
124 línies); `diff -rq` sobre `src/` complet: **idèntic**. No s'ha executat
`build` ni `git`. Les úniques comandes de verificació han estat
`npm install --no-save` (dev-deps de test, fora del manifest) i `vitest run`.

## Apèndix — resultat de `tests/rules.test.js` i del diferencial chess.js

Executat amb vitest v3.2.7 en worker únic (`--pool=forks
--poolOptions.forks.singleFork`):

- **Els 22 tests lleugers: PASSAT** (1,5 s), executats excloent el diferencial
  pesat (`-t "^(?!.*chess\.js)"`). Inclou el perft clàssic 1–5 des de la posició
  inicial = [20, 400, 8902, 197281, 4865609], exacte.
- **El diferencial chess.js de 10.000 partides NO és executable en aquest
  sandbox**: s'ha mesurat amb una sonda externa que replica la mateixa lògica
  (mateixa llavor `0x6d2b79f5`, mateixa comparació de jugades, sense límit de
  plies): 300 partides → 102.428 posicions comparades, **0 divergències**, a
  **551 ms/partida** ⇒ ~5.500 s (~1,5 h) per a les 10.000, molt fora del seu
  propi timeout de 600 s. És un límit de **rendiment de l'entorn**, no una
  fallada semàntica. En una màquina de desenvolupament: `npx vitest run tests/rules.test.js`.
- **Cobertura alternativa executada i verda**: `tests/f0a-chessjs-differential.test.js`
  (nou fitxer d'aquesta fase) — mateixa lògica amb 200 partides: **38.687 posicions
  comparades, 0 divergències** (70 s).
- Nota d'infraestructura benigna: durant el diferencial de 200 partides, vitest
  registra 1 `Unhandled Error: Timeout calling "onTaskUpdate"` — el bucle
  síncron de 70 s bloqueja l'event loop del worker singleFork i el heartbeat
  RPC expira. L'aserció s'ha executat i el resultat és determinista; no afecta
  el veredicte.

Sondes externes usades (fora del repo, desades a `scripts/`):
`f0a_perft_probe.mjs` (generació de baselines) i `f0a_chessjs_speed_probe.mjs`
(mesura de velocitat del diferencial).
