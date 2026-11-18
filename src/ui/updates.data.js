'use strict';
/* ============================================================
   CONTINGUT — escriu aquí les novetats, en llenguatge pla.
   Per afegir una entrada nova, copia un bloc i posa'l AL PRINCIPI
   de la llista UPDATES. L'id ha de ser únic i no s'ha de canviar
   mai un cop publicat (és la clau de les marques del tester).
   kind: 'feature' | 'fix' | 'design' | 'internal'
   items[].m: 'new' | 'up' | 'fix' | 'off'
   ============================================================ */
export const UPDATES = [
  {
    id: '2026-11-14-motor-tests',
    date: '2026-11-14',
    kind: 'internal',
    title: 'Més proves internes del motor (res visible)',
    lead: 'Hem afegit 114 comprovacions automàtiques que vigilen que les regles no es trenquin quan toquem el codi. El joc s\'ha de comportar exactament igual que ahir.',
    items: [
      { m: 'up', text: 'Cada regla delicada (fantasmes, enroc entre nivells, escac vertical, peons que es queden bloquejats al Cel) ara té una prova que avisa si es trenca.' },
      { m: 'up', text: 'El mode clàssic s\'ha comparat amb un motor d\'escacs de referència en 38.687 posicions: cap diferència.' },
      { m: 'up', text: 'S\'han congelat els recomptes de jugades de les sis variants internes, per detectar canvis involuntaris.' }
    ],
    test: [
      'Juga una partida sencera i comprova que tot segueix igual: captures que pugen al Cel, pujades i baixades, enroc internivell, promoció baixant.'
    ]
  },
  {
    id: '2026-11-14-login-fix',
    date: '2026-11-14',
    kind: 'fix',
    title: 'Entrar i sortir del compte ja funciona',
    lead: 'Hi havia un formulari antic amagat a la pantalla d\'entrada que interceptava la contrasenya i recarregava la pàgina. Ja no hi és.',
    items: [
      { m: 'fix', text: 'Escriure la contrasenya i prémer Enter ja no recarrega la pàgina ni et deixa encallat.' },
      { m: 'fix', text: 'Sortir i tornar a entrar funciona: abans de vegades et tornava a demanar les dades sense avançar.' },
      { m: 'fix', text: 'La pantalla d\'entrada ja no deixa veure el joc una fracció de segon abans de mostrar-se.' },
      { m: 'off', text: 'Ha desaparegut qualsevol camp de correu o contrasenya de la nostra pantalla: ara tot es fa a la finestra del proveïdor de comptes.' }
    ],
    test: [
      'Entra, juga una estona, surt amb «Sortir» i torna a entrar.',
      'Prova-ho també en un altre navegador o al mòbil amb el mateix compte.',
      'Si en algun moment et quedes a «Comprovant la sessió» més de dos o tres segons, marca-ho com a problema.'
    ]
  },
  {
    id: '2026-11-13-compte',
    date: '2026-11-13',
    kind: 'feature',
    title: 'Un compte per entrar des de qualsevol lloc',
    lead: 'El joc ara fa servir un sistema de comptes de veritat. Et registres una vegada i pots entrar des de l\'ordinador, el mòbil o un altre navegador.',
    items: [
      { m: 'new', text: 'Registre amb correu i contrasenya, amb verificació per correu.' },
      { m: 'new', text: 'Botons «Entrar» i «Crear compte» a la pantalla d\'inici.' },
      { m: 'up', text: 'La sessió es recorda: no cal tornar a escriure la contrasenya cada dia.' },
      { m: 'off', text: 'Ha desaparegut «Continuar sense compte · només aquest navegador». Ara cal un compte per jugar.' }
    ],
    test: [
      'Crea un compte amb el teu correu i confirma\'l.',
      'Obre el joc en un altre navegador i entra amb el mateix compte: has de poder jugar igual.',
      'Comprova que a dalt a l\'esquerra hi surt el teu correu i la marca «en línia».'
    ]
  },
  {
    id: '2026-11-13-pantalla',
    date: '2026-11-13',
    kind: 'design',
    title: 'Pantalla d\'entrada nova',
    lead: 'La pantalla per entrar ara mostra els dos taulells amb un feix de llum blau entre ells i un fons que es mou lentament.',
    items: [
      { m: 'new', text: 'Emblema del Cel i la Terra amb el feix blau que respira.' },
      { m: 'new', text: 'Títol amb el degradat de colors del joc.' },
      { m: 'up', text: 'Botons més grans i més clars, un damunt de l\'altre.' },
      { m: 'off', text: 'Fora el text petit de sota els botons: queda més net.' }
    ],
    test: [
      'Mira la pantalla d\'entrada al mòbil i a l\'ordinador.',
      'Comprova que els dos botons es veuen sencers i es poden clicar sense encertar-hi massa.'
    ]
  }
];


export const KNOWN = [
  {
    id: 'known-ia-cel',
    sev: 'high',
    title: 'La màquina no persegueix el rei que es refugia al Cel',
    text: 'Si jugues a dificultat Fàcil i el teu rei puja al Cel, de vegades la màquina es distreu pujant peces sense sentit en lloc d\'anar a per ell. És el problema principal que estem arreglant ara.',
    repro: 'Posa dificultat Fàcil, juga ràpid i puja el rei al Cel. Mira si les blanques s\'hi acosten o si van fent jugades intranscendents.'
  },
  {
    id: 'known-partida-llarga',
    sev: 'high',
    title: 'Hi ha partides que no s\'acaben mai',
    text: 'Encara no hi ha regla de repetició de posició. Si les peces van tornant als mateixos llocs, la partida es pot allargar moltíssim fins que salta el límit de 50 jugades.',
    repro: 'Quan quedin poques peces, mou el rei o la torre endavant i endarrere. Fixa\'t si la partida es declara taules en algun moment.'
  },
  {
    id: 'known-horitzo',
    sev: 'mid',
    title: 'L\'horitzó de la foto de fons queda massa amunt',
    text: 'Si puges una foto de paisatge com a fons, quan gires la càmera per veure bé els taulells l\'horitzó marxa cap amunt i deixes de veure el paisatge.',
    repro: 'Personalitza → posa una foto teva de paisatge. Després gira i inclina la càmera per mirar els dos taulells de costat.'
  },
  {
    id: 'known-costura',
    sev: 'mid',
    title: 'Es veu una línia vertical a la foto de fons',
    text: 'Allà on la foto es tanca sobre ella mateixa (el costat esquerre tocant el dret) apareix una línia de tall gens natural.',
    repro: 'Amb una foto de fons posada, gira la càmera lentament fins a trobar la línia. Sol ser darrere del punt de partida.'
  },
  {
    id: 'known-correu-tallat',
    sev: 'low',
    title: 'El correu de dalt pot quedar tallat',
    text: 'A la barra de dalt, si el teu correu és llarg, el text del torn («Blanques (tu)») pot quedar tapat o sobresortir per sota.',
    repro: 'Entra amb un correu llarg i mira la cantonada de dalt. Redueix l\'amplada de la finestra i torna a mirar.'
  },
  {
    id: 'known-dev',
    sev: 'low',
    title: 'Avís de «development keys» a la consola',
    text: 'El sistema de comptes encara està en mode de proves. Si obres la consola del navegador veuràs un avís en anglès. No afecta el joc ni les teves dades.',
    repro: 'No cal fer res. Si veus algun ALTRE error en vermell a la consola, copia\'l i envia\'l.'
  }
];
