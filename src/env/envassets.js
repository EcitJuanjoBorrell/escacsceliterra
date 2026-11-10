'use strict';
// paisatges com a fitxers a public/assets/env/
/* ============================================================
   PAISATGES D'ENTORN — panorames EQUIRECTANGULARS renderitzats
   amb scripts/app2/env_render.py (projecció esfèrica real,
   horitzó a lat -24°) i incrustats en base64 perquè l'app
   segueixi sent un únic fitxer. Regenerables amb:
   python3 scripts/app2/env_render.py && python3 scripts/app2/make_env_assets.py
   ============================================================ */

const ENV_ASSETS = {
  galaxia: './assets/env/galaxia.jpg',
  mar: './assets/env/mar.jpg',
  muntanyes: './assets/env/muntanyes.jpg',
  estrellat: './assets/env/estrellat.jpg',
};

const ENV_LIST = [
  { id: 'galaxia', nom: 'Galàxia' },
  { id: 'mar', nom: 'Mar' },
  { id: 'muntanyes', nom: 'Muntanyes' },
  { id: 'estrellat', nom: 'Estrellat' },
];

export { ENV_ASSETS, ENV_LIST };
