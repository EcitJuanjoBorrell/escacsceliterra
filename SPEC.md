# Escacs Cel i Terra — especificació formal

> **Font i abast.** El ZIP i el document de reglament esmentats no són presents
> als fitxers accessibles en aquesta sessió. Aquesta especificació formalitza el
> comportament v1.1 descrit al README i implementat al motor existent. Les
> decisions següents resolen provisionalment les ambigüitats; cal contrastar-les
> amb el reglament original abans de considerar-les normatives.

## 1. Tauler i estat

- Hi ha dos taulers de 8×8 alineats: Terra (nivell 0) i Cel (nivell 1).
- Una casella es representa per `(nivell, fila, columna)`, amb files `0..7`
  de la vuitena a la primera i columnes `0..7` d'a a h.
- Cada casella conté com a màxim una peça. Els reis no es poden capturar.
- L'estat inclou peces i colors, el marcador de fantasma, drets d'enroc
  (terrestres i internivell), torn, captura al pas, comptador de mig moviments
  i posició dels dos reis.
- `CLASSICAL_MODE` desactiva el Cel i totes les regles pròpies de la variant;
  la posició inicial i les jugades legals resultants segueixen els escacs
  estàndard.

## 2. Moviment

- Totes les peces es mouen d'acord amb les regles dels escacs dins del nivell
  on són. No travessen peces del mateix nivell quan llisquen.
- Una peça no fantasma pot moure's voluntàriament a la casella alineada de
  l'altre nivell, si és buida. Això és un moviment, no una captura.
- Un fantasma no pot canviar de nivell. Conserva el marcador en tots els seus
  moviments, inclosos salts i moviments de peó.
- Les jugades que deixen el rei propi en escac són il·legals.
- Els reis poden moure's verticalment a la casella alineada buida, però no
  capturen una peça verticalment.

## 3. Atac i escac vertical

- Els atacs horitzontals/del mateix nivell són els usuals dels escacs; els
  fantasmes ataquen normalment dins del Cel.
- Torres, dames i reis exerceixen control sobre la casella alineada de l'altre
  nivell. Aquest control no es bloqueja: només hi ha dues capes.
- Un fantasma del Cel no exerceix control cap avall sobre la casella de Terra
  que té just a sota. Una peça no fantasma del Cel (viatger) sí que ho fa.
- Un atac vertical contra el rei és escac. No hi ha cap moviment d'interposició
  que el resolgui. La resposta legal és moure el rei fora d'escac o capturar
  l'atacant amb una peça que pugui arribar a la casella de l'atacant. Si hi ha
  més d'un atacant, la jugada ha de neutralitzar-los tots.

## 4. Captures i fantasmes

- Capturar una peça a Terra elimina la víctima del seu bàndol i, si la casella
  homòloga del Cel és buida, hi crea un fantasma del color de qui captura.
- Si aquella casella del Cel és ocupada, la captura a Terra continua sent
  legal i la víctima es perd definitivament.
- Capturar una peça al Cel elimina la víctima definitivament.
- Un fantasma és viu mentre ocupa una casella i participa en el joc del Cel;
  no pot baixar a Terra ni deixa de ser fantasma en moure's.

## 5. Peons i promoció

- Els peons avancen i capturen dins del seu nivell, i només poden fer el doble
  pas inicial des de Terra. La captura al pas és possible només quan el dret
  s'ha creat per l'últim doble pas i caduca després de la jugada següent.
- Un peó que arriba a l'última fila de Terra promociona a dama, torre, alfil o
  cavall, inclòs quan hi arriba baixant voluntàriament del Cel.
- Els peons que arriben a l'última fila del Cel no promocionen. Un fantasma
  continua essent un peó i queda bloquejat allà si no té cap moviment legal.

## 6. Enrocs

- L'enroc ordinari segueix les regles estàndard: drets vigents, caselles buides
  requerides i el rei no pot estar, passar ni acabar en escac.
- L'enroc internivell intercanvia la posició del rei i d'una torre original
  pròpia apilada amb ell (mateixa fila i columna, nivell oposat). El rei no pot
  estar en escac ni acabar en una casella atacada.
- Un enroc internivell consumeix tots els drets d'enroc del jugador; només es
  pot fer una vegada per jugador. Una torre capturada o convertida deixa de
  ser disponible. El motor conserva la identitat d'una torre original quan es
  mou; si torna a quedar apilada amb el rei, manté el dret internivell. Un
  fantasma no és pròpia.

## 7. Fi de partida i comptadors

- Escac mat i ofegat es determinen amb el conjunt de jugades legals.
- El comptador de 50 jugades s'emmagatzema en mig moviments i es reinicia amb
  qualsevol moviment de peó o captura. Per tant, una captura a Terra que genera
  un fantasma el reinicia, igual que una captura en què la víctima es perd.
- El material insuficient es declara només amb reis sols o amb reis i una única
  peça menor (alfil o cavall) al tauler. Els fantasmes vius compten com a
  material i no s'ignoren per declarar taules.
- No s'aplica en aquesta especificació cap regla de repetició de posició.

## 8. API del motor

El mòdul sense dependències de DOM ni Three.js és `src/core/rules.js`:

- `legalMoves(state)` retorna les jugades legals del bàndol al torn.
- `applyMove(state, move)` valida que la jugada sigui legal i aplica-la.
- `isCheck(state, side)` indica si el rei del bàndol indicat està en escac.
- `gameStatus(state)` retorna l'estat de final de partida i les jugades legals.
- `zobrist(state)` retorna una clau Zobrist de 64 bits, incloent-hi drets
  d'enroc, captura al pas, fantasmes, torres originals i configuració de regles.

L'estat és mutable per eficiència. `applyMove` el modifica i retorna el mateix
objecte; `make`/`unmake` són la interfície interna per aplicar i desfer jugades
durant cerca i perft. Qui necessiti preservar una posició ha de clonar-la amb
`cloneState` abans de modificar-la.

## Decisions per revisar

1. **DECISIÓ (a) — rei vertical:** el rei controla verticalment, però la seva
   jugada vertical només és legal cap a una casella buida. No pot capturar en
   vertical. Dos reis a la mateixa coordenada (un a cada nivell) són
   il·legals, ja que cadascun controla l'altre.
2. **DECISIÓ (b) — fantasma i enroc:** un fantasma no pot participar en
   l'enroc internivell, encara que conservi la identitat d'una torre original.
   El canvi de bàndol invalida l'estatus de torre pròpia original.
3. **DECISIÓ (c) — resposta a escac vertical:** només es permet moure el rei o
   capturar l'atacant des del seu nivell. Les interposicions no són mai una
   resposta.
4. **DECISIÓ (d) — comptador de 50 jugades:** una captura a Terra reinicia el
   comptador encara que generi un fantasma; també el reinicia si la víctima es
   perd perquè la casella del Cel és ocupada.
5. **DECISIÓ (e) — material insuficient:** els fantasmes que continuen al Cel
   són material viu. Només reis sols o una única peça menor total es consideren
   insuficients; les peces majors i els peons sempre eviten aquesta declaració.
