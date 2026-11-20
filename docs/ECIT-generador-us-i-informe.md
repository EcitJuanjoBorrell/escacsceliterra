# Generador d'autopartides ECIT headless — ús i informe d'execució

## Què és

`scripts/generate.mjs` fa jugar el motor real (`src/core/rules.js`) contra ell
mateix en Node, sense navegador ni adapter, i escriu un txt compatible amb
`parseGames` d'experiència.js. Implementa exactament les tres correccions del
diagnòstic del 19-11: mode per llavors (no exploració uniforme), adjudicació
per material al límit de plies, i capçaleres de traçabilitat per partida.

Contingut lliurat (copia-ho a l'arrel del repo, mateixa estructura):

| Fitxer | On va al repo |
|---|---|
| `repo-additions/scripts/generate.mjs` | `scripts/generate.mjs` |
| `repo-additions/.github/workflows/generate.yml` | `.github/workflows/generate.yml` |
| `examples/ecit-corpus-exemple.txt` | exemple de sortida (900 partides) |

## Com funciona

1. **Política materialista d'1 pas de vista**: per cada jugada legal clona
   l'estat (`E.cloneState`, la funció pròpia del motor), fa `make()`, avalua el
   material recorrent `b[256]` amb `PIECE_VALUE` del propi motor i suma
   +100.000 si fa mat / −100.000 si el regala. Softmax amb temperatura sobre
   les puntuacions (0 = determinista).
2. **Mode per llavors**: per defecte les 36 jugades legals de la posició
   inicial (via `genMoves` del motor); amb `--seed-depth 2`, jugada+resposta
   (≈1.260 llavors); amb `--seed-moves "seq1, seq2"` les que vulguis. N
   partides per llavor amb temperatura — així les posicions de l'obertura
   acumulen observacions (el vell corpus en tenia 120 úniques i zero agregació).
3. **Adjudicació**: partida al límit de plies → |mat| ≥ 250 → victòria del
   bàndol que domina (`endreason: adjudicada`); sinó taula real
   (`endreason: taula`). Amb `--no-adjudicate` queda `censura` per comparar.
4. **Dedup amb append**: amb `--append`, llegeix el fitxer existent, indexa les
   seqüències de jugades+resultat i no escriu duplicats (re-tirant la llavor
   de la partida fins a `--dedupe-attempts` cops). La numeració de labels
   continua on acabava el fitxer.

## CLI

```
node scripts/generate.mjs [--games 300] [--per-seed N] [--seed-depth 1|2]
     [--seed-moves "0d2>1d2 0e8>1e8, ..."] [--max-plies 120]
     [--temperature 0.35] [--seed N] [--out ecit-corpus.txt] [--append]
     [--no-adjudicate] [--adjudicate-threshold 250] [--no-dedupe] [--quiet]
```

`--games` es reparteix entre llavors; si dones `--per-seed`, aquest mana
(total = per-seed × llavors). Si no dones `--seed`, es genera d'aleatòria i
es mostra per reproduir l'execució. Cada partida porta la seva llavor derivada
a la capçalera `# seed`.

## Execució d'exemple (900 partides, 36 segons)

```
node scripts/generate.mjs --per-seed 25 --seed 20261119 \
     --out corpus/ecit-corpus.txt
```

```
== GENERACIÓ ==
llavors: 36 (profunditat 1) × per-llavor 25 = 900 partides
llavor base: 20261119 | temperatura: 0.35 | maxPlies: 120 | adjudicació: ±250 | dedup: on
== INFORME ==
partides generades: 900 · 36.3 s (0.04 s/partida)
resultats: 1-0 401 | 0-1 421 | 1/2 78        ← 92,2% decisives (vell corpus: 5,8%)
motius de final: {"adjudicada":732,"taula":76,"mate":90,"ofegat":2}
cobertura:
  ply 1: obs 900 · pos 1 · om 36 · n≥3 36 · n≥5 36 · n≥10 36
  ply 2: obs 900 · pos 36 · om 654 · n≥3 43 · n≥5 0
  ply 3: obs 900 · pos 654 · om 863 · n≥3 7
  ply 4: obs 900 · pos 859 · om 877 · n≥3 3
fitxer: corpus/ecit-corpus.txt (982.183 B, ~1.091 B/partida)
== VALIDACIÓ ==
motor real: 900/900 partides reprodueixen sense errors (enrocs <>: 6)
parseGames: ok · 900 partides importades · errors: 0
```

Validació creuada independent (diagnostic sobre el mateix corpus):
900/900 legals; repetició de posicions 0,1% (58 partides, màx 2 visites — la
temperatura trencà els bucles); els 808 finals al límit declarats correctament
(les 2 "taules" amb |mat| ≥ 2,5 peons són ofegats reals: mat impossible);
**22 entrades sòlides amb el teu propi criteri (n≥3 + wilson≥0,35) — el vell
corpus en tenia 0 de 13.659**.

## Compatibilitat amb parseGames: confirmada, amb un bug trobat

- Les capçaleres addicionals (`endreason`, `policy`, `level`, `seed`,
  `variant`, `build`) **no trenquen la importació** — `parseGames` les ignora
  i les jugades es llegeixen intactes (test amb el mòdul real carregat en Node).
- **Bug trobat a `experience.js:230`**: el filtre
  `!/^\s*#(?!\s*result)/` només deixa passar línies que comencen amb `# result`,
  de manera que `# source:`, `# label:` i `# date:` es perden a l'importar
  (label queda «Partida N», source «manual», data avui). Afecta TOTS els
  corpus importats fins ara. Correcció d'una línia:

  ```js
  // abans
  const lines = block.split('\n').filter(l => l.trim() && !/^\s*#(?!\s*result)/.test(l));
  // després
  const lines = block.split('\n').filter(l => l.trim()
    && !/^\s*#(?!\s*(?:result|resultat|source|font|label|etiqueta|date|data))/.test(l));
  ```

  El generador emet totes les capçaleres igualment: l'arxiu queda
  autodocumentat i quan apliquis el pedaç, labels/data entraran sols.
- El format `<>` d'enroc internivell el processa bé tant `parseGames` com el
  replay d'experiència (swap entre nivells); 6 partides de l'exemple en porten.

## Recepta per al llibre viu

1. **Diari (local o Actions)**: `--per-seed 25 --append` → +900 partides/dia
   amb 36 s de còmput. En ~11 dies: 10.000 partides (~11 MB).
2. **Concentrar plies 3-4**: la resposta negra encara s'escampa (temperatura).
   Quan plies 1-2 et sobrin, passa a `--seed-depth 2 --per-seed 5`
   (1.260 llavors × 5) o amplia `--per-seed` a 50-75 amb profunditat 1.
3. **Llindar d'adjudicació**: ±250 peons-cent es calibra bé amb la política
   materialista; si més endavant jugues amb la cerca real, adjudica amb
   l'avaluació de la cerca al mateix llindar en peons.
4. **Capçaleres**: no treguis `policy/seed/build`: són les que permetran
   reclassificar el corpus quan canviiis de política o de llindars.

## GitHub Actions

`generate.yml`: manual (workflow_dispatch) + diari (cron 02:30 UTC). Executa
el generador amb llavor derivada de la data (única per dia), escriu a
`corpus/ecit-corpus-AAAA-MM-DD.txt` amb `--append` i puja el corpus com a
artifact (90 dies). El bloc per cometre el corpus al repo queda comentat:
descomenta'l quan vulguis acumular al repo. Cost: 0 € (repo públic, ~36 s per
900 partides).
