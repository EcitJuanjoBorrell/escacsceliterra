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
    id: '2026-11-21-opening-book-v0-9',
    date: '2026-11-21',
    kind: 'feature',
    title: '📖 El bot ara té un llibre d\'obertures',
    lead: 'v0.9 · La IA consulta un llibre d\'obertures abans de pensar. Quan vegis la marca «📖 Llibre» al costat d\'una jugada, el bot ha respost a l\'instant (0 ms): la jugada ja la sabia.',
    items: [
      { m: 'new', text: 'Cobreix les sis primeres jugades de cada partida (tres per bàndol).' },
      { m: 'new', text: 'Ofereix varietat real: fins a 8 obertures diferents amb estadística fiable a la primera jugada, i 64 a la segona. El bot no comença sempre igual.' },
      { m: 'new', text: 'Inclou 4 línies d\'enroc internivell com a opcions exòtiques.' },
      { m: 'up', text: '⚡ El panell Experiència ja no es congela' },
      { m: 'fix', text: 'S\'obre a l\'instant, fins i tot amb desenes de milers de partides.' },
      { m: 'fix', text: 'La llista es navega per pàgines de 50 amb botons Anterior/Següent.' },
      { m: 'fix', text: 'Les estadístiques es calculen només quan les demanes, en blocs petits amb barra de progrés i botó «Atura».' },
      { m: 'fix', text: 'El botó Neteja ara esborra tot de veritat (amb confirmació) i actualitza els comptadors a zero.' },
      { m: 'up', text: '🔧 Correccions internes' },
      { m: 'fix', text: 'El panell Autopartides s\'ha eliminat. La generació de partides es fa des de la terminal, no des de la interfície.' },
      { m: 'fix', text: 'El generador ja no es queda sense memòria amb fitxers grans.' },
      { m: 'up', text: 'El llibre es construeix offline i s\'envia com a fitxer de 600 KB. Cap jugador ha d\'importar res: arriba automàticament.' },
      { m: 'up', text: '📊 Qualitat validada per auditoria independent' },
      { m: 'new', text: 'Error mitjà: 3,8 centèsimes de peó (invisible per a qualsevol jugador).' },
      { m: 'new', text: 'La meitat de les jugades són exactament les que un àrbitre més profund triaria.' },
      { m: 'new', text: '1 única pifa de 150 mostres (0,67%).' },
      { m: 'new', text: '200 de 200 partides simulades arriben a la sisena jugada de llibre sense cap camí mort.' },
      { m: 'up', text: 'Què vindrà' },
      { m: 'new', text: 'Extensió del llibre a 8 jugades.' },
      { m: 'new', text: 'Filtre de pífies tàctiques (poda en dues fases).' },
      { m: 'new', text: 'Més varietat a les primeres jugades.' }
    ]
  },
  {
    id: '2026-11-18-auth-headless',
    date: '2026-11-18',
    kind: 'feature',
    title: 'Comptes propis: entrar i registrar-se sense finestres emergents',
    lead: 'El formulari de comptes ara viu dins del joc, sense popups ni redireccions. Registre amb codi de 6 dígits, confirmació de contrasenya, i entrada directa.',
    items: [
      { m: 'new', text: 'Login i registre headless amb Clerk: formulari dins del joc, cap finestra emergent.' },
      { m: 'new', text: 'Verificació del correu amb codi de 6 dígits, enganxat automàtic als sis camps.' },
      { m: 'new', text: 'El registre tanca la sessió tot sol quan Clerk crea el compte: ja no cal tornar a entrar.' },
      { m: 'new', text: 'Camp "Repeteix la contrasenya" amb un sol ull que controla tots dos camps.' },
      { m: 'fix', text: 'Missatges d\'error concrets en lloc del genèric "verificació addicional".' },
      { m: 'fix', text: 'S\'ha tret l\'indicador de torn duplicat de la barra superior: la informació ja viu al panell lateral.' }
    ],
    test: [
      'Registra\'t amb un correu nou: hauries de rebre un codi de 6 dígits i entrar directament al joc.',
      'Surt i torna a entrar amb el mateix correu i contrasenya: hauria d\'entrar directe.',
      'Prova "He oblidat la contrasenya": hauries de rebre un codi i poder triar contrasenya nova.'
    ]
  },
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
      'Registra\'t amb un correu nou.',
      'Surt i torna a entrar des d\'un altre navegador o dispositiu.',
      'Comprova que la sessió es manté entre dies.'
    ]
  }
];

export const KNOWN = [
  {
    id: 'known-prod-keys',
    title: 'Passar Clerk a claus de producció',
    detail: 'La consola avisa que Clerk corre amb claus de desenvolupament, que tenen límits estrictes d\'ús. Cal crear la instància de producció i replicar-hi la configuració verificada.'
  },
  {
    id: 'known-reset-flow',
    title: 'Provar la recuperació de contrasenya de punta a punta',
    detail: 'El flux "He oblidat la contrasenya" → codi per correu → contrasenya nova → entrada automàtica encara no s\'ha validat amb un compte real.'
  },
  {
    id: 'known-email-state',
    title: 'Separar el camp d\'identificador entre login i registre',
    detail: 'Si escrius un nom d\'usuari al login i saltes al registre, el valor arrossegat falla la validació de correu. Calen dues variables independents.'
  },
  {
    id: 'known-dup-error',
    title: 'Evitar que el mateix error es mostri dues vegades',
    detail: 'El bàner superior i la nota sota el camp imprimeixen el mateix text quan l\'error té camp assignat. Cal deixar-ne un de sol.'
  },
  {
    id: 'known-reset-confirm',
    title: 'Confirmació de contrasenya també al pas de nova contrasenya',
    detail: 'El registre ja demana repetir la contrasenya; el pas de recuperació encara té un sol camp.'
  },
  {
    id: 'known-css-home',
    title: 'Moure la regla del joc fora del CSS d\'autenticació',
    detail: 'La regla que amaga l\'indicador duplicat funciona, però pertany al CSS del joc, no al d\'autenticació.'
  },
  {
    id: 'known-probe-noise',
    title: 'Documentar el soroll de xarxa dels sondejos de Clerk',
    detail: 'Els sondejos a client.protect.clerk.com pels ports 992, 2082, 8443 i 18443 caduquen en xarxes que bloquegen ports no estàndard. No afecten el flux.'
  }
];
