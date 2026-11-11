# Escacs Cel i Terra

Joc d'escacs sobre **dos nivells alineats** — la Terra (N0) i el Cel (N1) —
amb conversions en fantasmes bicolor, foc vertical, enroc internivell i
promoció de descens. Reglament v1.1 complet, bot de 5 nivells, Entrenador
estratègic integrat, personalització de temes i paisatges, i vista 3D amb
peces Staunton, textures de fusta procedurals i il·luminació PBR.

Aquest repositori és el resultat de la **Fase 1** (refactorització
multi-fitxer amb Vite) i la **Fase 2** (gràfics): llest per desenvolupar,
provar i desplegar (per exemple a Cloudflare Pages).

## Arrencar

```bash
npm install
npm run dev        # servidor de desenvolupament (ESM natiu)
npm test           # suite variant, perft clàssic i diferencial amb chess.js
npm run build      # build de producció a dist/ (~104 kB de codi)
npm run preview    # servir dist/ en local
npm run check      # comprovació de tipus (tsc en mode JSDoc, 0 errors)
```

## Estructura

```
index.html                  pàgina (carrega three.js vendor + src/main.js)
src/
  core/rules.js             motor pur: regles, estat, cerca i API del motor
  engine/engine.js          punt d'entrada compatible per a la UI
  engine/engine-v0.cjs      motor v0 de referència per als tests perft
  env/envassets.js          mapa de paisatges -> fitxers a public/assets/env/
  render/app3d.js           escena 3D: peces Staunton (LatheGeometry),
                            textures de taulell procedurals, PMREM,
                            animacions, marques i efectes
  ui/theme.js               temes i personalització
  ui/appui.js               flux de partida, IA asíncrona, Entrenador, 2D
  main.js                   arrencada (l'ordre d'imports = ordre del pipeline)
  style.css
  types.d.ts                globals de scripts clàssics (THREE vendoritzat)
public/
  vendor/three.min.js       three.js r152 vendoritzat
  assets/env/*.jpg          paisatges equirectangulars (abans en base64)
tests/engine.test.js        regressions del motor
tests/rules.test.js         API pura, variant, perft 1..5 i oracle chess.js
```

Notes d'arquitectura:

- `core/rules.js` no depèn del DOM ni de three.js. La UI importa l'entrada
  `engine/engine.js`; la IA del worker carrega la mateixa font amb `?raw`, i
  els tests poden importar directament `legalMoves`, `applyMove`, `isCheck`,
  `gameStatus` i `zobrist` des del motor.
- Els cicles de mòduls `app3d <-> appui` són segurs: només comparteixen
  funcions declarades i bindings vius (`game`, `curStatus`, `cam`...), i el
  servidor de dev (ESM natiu) hi passa les proves d'interacció.
- Les peces són **procedurals** (LatheGeometry amb perfils Staunton + cap de
  cavall extrudit): zero fitxers externs, recolorables pels temes al moment i
  compatibles amb el retall del cap dels fantasmes. La via "glTF lliure"
  queda apuntada per a una 2b (no hi ha cap font CC0 de descàrrega directa
  fiable; caldria GLTFLoader r152 empaquetat amb esbuild).
- La il·luminació PBR ve de `scene.environment` via PMREMGenerator des de la
  mateixa panoràmica que fa de fons (amb `envMapIntensity` fi per material);
  en canviar de paisatge (o pujar-ne un de personalitzat) l'entorn es
  regenera amb `Theme.refreshEnvironment()`.
- Les textures dels taulells es pinten en tons clars perquè el color del
  tema s'hi multipliqui: la personalització segueix funcionant.
- El tipatge és TypeScript en mode JSDoc (`checkJs`): `npm run check` verd.
- `vite.config.js` fa servir `base: './'`: el build funciona en qualsevol
  servidor estàtic i en subcarpetes. Per file:// els navegadors bloquegen els
  mòduls ES; per obrir-lo sense servidor fes servir la versió d'un sol HTML.

## Desplegar a Cloudflare Pages

1. Puja el repo a GitHub.
2. A Cloudflare Pages: «Connect to Git» -> build command `npm run build`,
   output directory `dist`.
3. (O bé, sense Git: `npm run build` i arrossega la carpeta `dist/` al
   panell de «Direct Upload».)

## Full de ruta

- **Feta — Fase 1**: reposició multi-fitxer (aquest repo), Entrenador fases
  A+B (avisos en viu + explicació de jugades), varietat d'obertura del bot,
  arranjament del foc vertical dels fantasmes (no colpegen cap avall).
- **Feta — correcció v1.1**: els fantasmes no perden mai la condició de
  fantasma en moure's (abans, el flag `gh` s'esborrava al primer moviment:
  un peó fantasma podia "dessar-se", baixar a la Terra i acabar coronant
  dama — el cas reportat per l'usuari). Reglament v1.1: el peó fantasma
  arribat a l'última fila del Cel hi queda com a peó zombi (bloqueja la
  casella), i el peó viatger de l'última fila només en surt baixant a
  coronar damunt la Terra. Suite: +8 comprovacions (T15).
- **Feta — v1.2 (revisió del codi)**: la cerca de la IA arriba a la mateixa
  profunditat en ~55 % del temps, amb exactament les mateixes puntuacions
  (quiescència que només genera captures, PVS, jugades «assassines» i
  historial). Correcció de `unmake` amb la reconversió al Cel (V4): el
  fantasma podia caure a la casella d'origen de la captora i esborrar-la en
  desfer; `freeCelSq` ara busca lloc també sense `displace` per a les
  segones morts reconvertides. Interfície: `localStorage` tractat amb
  try/catch (en iframes amb sandbox o finestres privades l'app no arrencava),
  dreceres de teclat ignorades amb Ctrl/Cmd/Alt o en camps de text, fitxers de
  partida validats jugada a jugada abans de reproduir-los, la configuració de
  regles viatja al worker de la IA, i «mat en contra» a la targeta de la IA.
  Suite: 87 comprovacions.
- **Feta — v1.2b (final de partida)**: el quadre de final ofereix ara
  «Analitzar la partida» i «Desa la partida» a més de «Revanxa» i «Canviar
  mode», i apareix 1,3 s després de l'última jugada perquè es vegi el mat.
  «Analitzar» el tanca i mostra una barra de final (⏮ ◀ ▶ ⏭ o les fletxes,
  Inici/Fi) per recórrer la partida acabada en només lectura (no es pot jugar
  ni desfer), amb Desa / Nova partida / Menú sempre a mà; Esc sobre el quadre
  també analitza. Desar durant l'anàlisi desa sempre la partida sencera, i el
  fitxer inclou ara el resultat també en cas de rendició. El fitxer només es
  pot reproduir, no continuar jugant-hi.
- **Feta — Fase 2**: peces Staunton tornejades (amb cavall extrudit),
  textures de fusta procedurals als taulells i il·luminació PBR amb entorn
  PMREM des del panorama; refresc d'entorn personalitzat en viu.
- **Fase 2b (opcional)**: carregador glTF per a sets de peces externs.
- **Fase 3 — plataforma**: autenticació (Clerk), partides al núvola
  (Supabase), pagaments (Stripe) i Workers. El front ja està preparat.
- **Entrenador C+D**: «per què no aquesta jugada?» i missions guiades.
- **Foto -> fons 3D**: gratis al navegador (paral·laxi per profunditat) i
  panoràmica 360 generada al servidor com a característica premium.
- **i18n**: els texts encara són inline en català; el següent pas és
  centralitzar-los en un mòdul de cadenes per afegir castellà/anglès.

## Relació amb el demo d'un sol fitxer

La versió d'un sol HTML autònom (generada amb `scripts/app2/build2.py`) es
manté com a demo portable: mateix motor, mateixes regles, mateixos gràfics.
Els canvis de codi es fan primer aquí i es porten allà; a mitjà termini aquest
repo és la font canònica.
