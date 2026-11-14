# Perft baselines — V0–V5 (xarxa de seguretat F0a)

> **⚠️ NATURA D'AQUESTS NÚMEROS: BASELINE DE REGRESSIÓ, NO ORACLE VERIFICAT.**
> Tots els comptatges surten del motor actual (`src/core/rules.js` del ZIP
> `escacsceliterra-main 13-11-26.zip`, **sense cap modificació**). Congelen el
> comportament present perquè qualsevol canvi futur es detecti; **no demostren
> que el motor sigui correcte**. Si el motor canvia voluntàriament, actualitza
> la taula `BASELINE` de `tests/f0a-perft-baselines.test.js` amb revisió humana
> de cada diferència. Els únics oracles verificats a mà d'aquesta fase són les
> micro-posicions de `tests/f0a-oracles.test.js`.

Generats amb una sonda que importa el motor tal com és i crida `E.perft(E.cloneState(st), d)`
(perft amb filtre legal complet: make/unmake + `inCheck` per node).
Congelats a `tests/f0a-perft-baselines.test.js` (constant `BASELINE`).

## Configuració per variant (CFG complet, `variantConfig`)

| Variant | celestial | conversion | capBlock | heavenDeath | ilCastling | promoDescent | promoCel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V0 | true | **false** | block | remove | false | false | **true** |
| V1 | true | true | block | remove | true | false | false |
| V2 | true | true | block | remove | true | true | false |
| V3 | true | true | **displace** | remove | true | true | false |
| V4 | true | true | block | **convert** | true | true | false |
| V5 | true | true | block | remove | **false** | true | false |

Aquests 7 camps són l'estat complet de `CFG` durant el càlcul (`setConfig(variantConfig(v))`).
Altres camps de l'estat que afecten el perft i són iguals a totes les posicions: `ep: -1`,
`half: 0`, `ply: 0`.

## Posicions (les mateixes peces per a totes les variants)

Notació: `terra-e1` = nivell 0, fila 7, col 4 (`idxOf(0,7,4)`); `cel-e1¹` = nivell 1, mateixa
coordenada (`idxOf(1,7,4)`). `R/D/T/C/P` = rei/dama/torre/cavall/peó; `b/n` = blanc/negre.
En totes, torn = **blanc**.

### P0-inicial

La posició inicial estàndard: els dos exèrcits complets a Terra (`initialState()`),
drets d'enroc complets (els 8 booleans a true), `ep=-1, half=0, ply=0`, torn blanc.

### P1-migjoc-fantasmes (12 peces)

| Casella | Peça | Notes |
| --- | --- | --- |
| terra-e1 | R blanca | rei blanc |
| terra-a1 | T blanca | `gid=1` (GID_WQ) |
| terra-h1 | T blanca | `gid=2` (GID_WK) |
| terra-f2 | P blanca | |
| terra-g2 | P blanca | |
| terra-e8 | R negra | rei negre |
| terra-a7 | P negra | |
| terra-b7 | P negra | |
| cel-d4¹ | D blanca | viatgera (no fantasma) |
| cel-f5¹ | C blanc | viatger (no fantasma) |
| cel-e4¹ | T negra | **FANTASMA** (`gh=1`) |
| cel-c6¹ | C negre | **FANTASMA** (`gh=1`) |

`castling: { wk: true, wq: true, ilw_h: true, ilw_q: true }` (la resta false).
Nota: cap torre no està apilada amb el rei, de manera que els drets IL estan actius
però no generen cap jugada IL a l'arrel.

### P2-final-reis-plans-diferents (5 peces)

| Casella | Peça | Notes |
| --- | --- | --- |
| cel-e5¹ | R blanca | rei blanc AL CEL |
| terra-h1 | T blanca | `gid=2` (GID_WK) |
| terra-f2 | P blanca | |
| terra-d4 | R negra | rei negre A TERRA |
| terra-a5 | P negra | |

`castling: {}` (tots false). El rei blanc té la baixada disponible (terra-e5 lliure).

### P3-enroc-internivell (5 peces)

| Casella | Peça | Notes |
| --- | --- | --- |
| terra-e1 | R blanca | rei blanc |
| terra-a1 | T blanca | `gid=1` (GID_WQ) → O-O-O ordinari disponible |
| cel-e1¹ | T blanca | `gid=2` (GID_WK), APILADA amb el rei → IL disponible |
| terra-h8 | R negra | rei negre |
| terra-a5 | T negra | |

`castling: { wk: true, wq: true, ilw_h: true, ilw_q: false }` (la resta false).

## Comptatges perft(1..3)

| Variant | P0-inicial | P1-migjoc-fantasmes | P2-final-reis-plans-diferents | P3-enroc-internivell |
| --- | --- | --- | --- | --- |
| V0 | 36 / 1.296 / 52.294 | 65 / 2.013 / **127.644** | 25 / 196 / 4.961 | 28 / 509 / 14.515 |
| V1 | 36 / 1.296 / 52.294 | 65 / 2.013 / **127.567** | 25 / 196 / 4.961 | 29 / 527 / 15.169 |
| V2 | 36 / 1.296 / 52.294 | 65 / 2.013 / **127.567** | 25 / 196 / 4.961 | 29 / 527 / 15.169 |
| V3 | 36 / 1.296 / 52.294 | 65 / 2.013 / **127.656** | 25 / 196 / 4.961 | 29 / 528 / 15.174 |
| V4 | 36 / 1.296 / 52.294 | 65 / 2.013 / **127.713** | 25 / 196 / 4.961 | 29 / 527 / 15.169 |
| V5 | 36 / 1.296 / 52.294 | 65 / 2.013 / **127.567** | 25 / 196 / 4.961 | 28 / 508 / 14.554 |

Format: perft(1) / perft(2) / perft(3).

### Lectura dels números (saneig intern, no prova de correcció)

- **P0 és idèntica a totes les variants fins a profunditat 3**: no hi ha cap captura
  abans de la 4a ply des de la posició inicial, i les conversions/capBlock/promoCel
  només canvien el comportament a partir de captures. (Una divergència futura aquí
  seria una senyal d'alarma forta.)
- **P2 és idèntica a totes les variants**: en 3 plies no hi ha cap captura, cap peó
  al Cel ni cap promoció; el mateix arbre de moviments és exactament el clàssic
  ampliat amb verticals.
- **P3 distingeix exactament les variants amb ilCastling**: perft(1) = 28 a V0 i V5
  (sense enroc internivell) i 29 a V1–V4 (l'única diferència és l'1 jugada IL
  `Re1↔Te1¹`); a perft(2)/perft(3) la diferència s'amplifica (509→527, 14.515→15.169).
- **P1 és la posició discriminant de la família de conversió**: fins a perft(2) totes
  coincideixen (2.013) i a perft(3) es separen per capBlock/heavenDeath/promoDescent:
  V4 (convert, reconversió al Cel) màxima (127.713), V3 (displace) 127.656, V0 (sense
  conversió, sense fantasmes) 127.644, V1/V2/V5 (block/remove) 127.567.
- Comptatge de flags a l'arrel (V2, mesurat amb `genMoves(st, true)`):
  P0: 12 NORM + 8 DBL + 16 VERT = 36 · P1: 55 NORM + 2 DBL + 6 VERT + 1 CK + 1 CQ = 65 ·
  P2: 22 NORM + 1 DBL + 2 VERT = 25 · P3: 26 NORM + 1 VERT + 1 CQ + 1 IL = 29.

## Com reproduir-los

1. Extreure el ZIP i instal·lar dev-deps de test (`npm i --no-save vitest chess.js`).
2. `npx vitest run tests/f0a-perft-baselines.test.js` → comprova els 72 comptatges
   contra la constant `BASELINE` + 8 assercions estructurals (IL disponible només a
   V1–V4, O-O-O a P3, captura de fantasma in-level a P1, 20+16 jugades a P0).
3. Per regenerar la taula des de zero: sonda externa (`f0a_perft_probe.mjs`) que
   importa `src/core/rules.js` i escriu el JSON de comptatges (script fora del repo;
   l'especificació completa d'aquest document és suficient per reconstruir-lo).
