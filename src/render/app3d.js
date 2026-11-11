'use strict';
import { Engine } from '../engine/engine.js';
import { Theme, ENV_CUSTOM } from '../ui/theme.js';
import { ENV_ASSETS } from '../env/envassets.js';
import { canControlSq, curStatus, game, gameOver, lastMove, onTileClick, selected, selectedMoves } from '../ui/appui.js';
/* ============================================================
   ESCENA 3D (Three.js): dos taulells, peces, càmera orbital,
   selecció amb raycaster, marcadors i animacions.
   Tots els materials viuen al registre MATS i els actualitza
   apply3DTheme() (cridada pel sistema de temes).
   ============================================================ */

const SQ_SIZE = 1.0;
let LEVEL_H = 2.5;

let scene, camera, renderer;
let tilesGroup, piecesGroup, markersGroup, fxGroup, coordsGroup;
const tileMeshes = [];
let meshBySq = new Map();
const tweens = [];
let animLock = 0;

const E3D = { WHITE: 1, BLACK: -1 };

function adur(ms) {
  const sp = (Theme.cur && Theme.cur.animSpeed) || 1;
  return Math.max(60, Math.round(ms / sp));
}

function sqXZ(sq) {
  const row = (sq >> 4) & 7, col = sq & 15;
  return { x: (col - 3.5) * SQ_SIZE, z: (row - 3.5) * SQ_SIZE };
}
function sqY(sq) { return (sq >> 7) === 1 ? LEVEL_H : 0; }
function sqPos(sq, yOff = 0) {
  const p = sqXZ(sq);
  return new THREE.Vector3(p.x, sqY(sq) + yOff, p.z);
}

/* ---------- Registre de materials ---------- */
const std = (o) => new THREE.MeshStandardMaterial(o);
// pla de retall (en coordenades de món) dels caps de fantasma: es manté
// la part de dalt del peça (cap/corona), que duu el color de qui l'ha capturada
const HEAD_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(2.5 + 0.42));
const MATS = {
  eLight: std({ color: 0xd8c49c, roughness: 0.55, envMapIntensity: 0.35 }),
  eDark: std({ color: 0x77533a, roughness: 0.6, envMapIntensity: 0.35 }),
  eRim: std({ color: 0x46311f, roughness: 0.5, envMapIntensity: 0.5 }),
  post: std({ color: 0x46311f, roughness: 0.35, metalness: 0.6, envMapIntensity: 0.85 }),
  sLightGlass: std({ color: 0xbcd9ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, roughness: 0.15, metalness: 0.1, envMapIntensity: 0.9 }),
  sDarkGlass: std({ color: 0x6f9fd8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, roughness: 0.15, metalness: 0.1, envMapIntensity: 0.9 }),
  sRim: std({ color: 0x6fb6e8, transparent: true, opacity: 0.35, roughness: 0.3, envMapIntensity: 0.7 }),
  sGrid: new THREE.LineBasicMaterial({ color: 0x6fb6e8, transparent: true, opacity: 0.33 }),
  dot: new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.75, depthWrite: false }),
  ringCap: new THREE.MeshBasicMaterial({ color: 0xff7043, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  ringVert: new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
  sel: new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.4, depthWrite: false }),
  last: new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.3, depthWrite: false }),
  check: new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.45, depthWrite: false }),
  vertLine: new THREE.LineDashedMaterial({ color: 0x4fc3f7, dashSize: 0.14, gapSize: 0.09, transparent: true, opacity: 0.85 }),
  // feix d'ascensió/descensió: columna de llum del color dels moviments verticals
  beam: new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  beamCore: new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  // víctima de la captura al pas (es genera una instància per pulsar-la)
  w: std({ color: 0xefe6d2, roughness: 0.35, metalness: 0.15, envMapIntensity: 0.55 }),
  b: std({ color: 0x333d4b, roughness: 0.38, metalness: 0.2, envMapIntensity: 0.55 }),
  gw: std({ color: 0xefe6d2, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.8, emissive: 0xefe6d2, emissiveIntensity: 0.22, envMapIntensity: 0.5 }),
  gb: std({ color: 0x333d4b, roughness: 0.38, metalness: 0.2, transparent: true, opacity: 0.8, emissive: 0x333d4b, emissiveIntensity: 0.3, envMapIntensity: 0.5 }),
  // caps de fantasma (retallats amb HEAD_PLANE): color del bàndol capturador
  ghHeadW: std({ color: 0xefe6d2, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.95, emissive: 0xefe6d2, emissiveIntensity: 0.3, clippingPlanes: [HEAD_PLANE], envMapIntensity: 0.55 }),
  ghHeadB: std({ color: 0x333d4b, roughness: 0.38, metalness: 0.2, transparent: true, opacity: 0.95, emissive: 0x333d4b, emissiveIntensity: 0.4, clippingPlanes: [HEAD_PLANE], envMapIntensity: 0.55 }),
  auraW: new THREE.MeshBasicMaterial({ color: 0xefe6d2, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  auraB: new THREE.MeshBasicMaterial({ color: 0x333d4b, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
};
const GHOST_MATS = { w: MATS.gw, b: MATS.gb };
const LIGHTS = {};
let appliedEnv = '__init__', envTextures = {};
let PMREM = null;
const envPMREM = {};

/* ---------- Inicialització ---------- */
function init3D() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 900);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  document.getElementById('scene').appendChild(renderer.domElement);

  // PMREM: pren la panoràmica equirectangular i en fa un entorn PBR
  // (reflexos + llum ambiental coherent) per als materials Standard
  PMREM = new THREE.PMREMGenerator(renderer);
  PMREM.compileEquirectangularShader();

  // Paisatge d'entorn: s'assigna com a scene.background EQUIRECTANGULAR
  // (no com a cúpula geomètrica). Així cada píxel es tria per DIRECCIÓ de
  // la càmera: l'horitzó del mar/muntanyes (a lat -24° de la textura)
  // surt RECTE i a la mateixa alçada a qualsevol zoom, sense efecte
  // «planetoide» ni parallax.
  LIGHTS.amb = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(LIGHTS.amb);
  LIGHTS.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a2f25, 0.35);
  scene.add(LIGHTS.hemi);
  LIGHTS.dir = new THREE.DirectionalLight(0xfff4e0, 1.05);
  LIGHTS.dir.position.set(6, 13, 7);
  LIGHTS.dir.castShadow = true;
  LIGHTS.dir.shadow.mapSize.set(2048, 2048);
  LIGHTS.dir.shadow.camera.left = -7; LIGHTS.dir.shadow.camera.right = 7;
  LIGHTS.dir.shadow.camera.top = 7; LIGHTS.dir.shadow.camera.bottom = -7;
  LIGHTS.dir.shadow.camera.near = 2; LIGHTS.dir.shadow.camera.far = 40;
  scene.add(LIGHTS.dir);
  LIGHTS.dir2 = new THREE.DirectionalLight(0x8fb8ff, 0.35);
  LIGHTS.dir2.position.set(-7, 6, -6);
  scene.add(LIGHTS.dir2);

  tilesGroup = new THREE.Group();
  piecesGroup = new THREE.Group();
  markersGroup = new THREE.Group();
  fxGroup = new THREE.Group();
  coordsGroup = new THREE.Group();
  scene.add(tilesGroup, piecesGroup, markersGroup, fxGroup, coordsGroup);

  applyBoardTextures();
  buildBoards();
  buildCameraControls();
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  requestAnimationFrame(tick3d);
}

/* ---------- Textures procedurals dels taulells ---------- */
// fusta/vora pintada en tons clars: el color del tema s'hi MULTIPLICA
// a sobre, així la personalització segueix funcionant amb textura
function woodCanvas(base, streak, alpha, lines) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < lines; i++) {
    const y = Math.random() * 256;
    g.strokeStyle = i % 2 ? streak : base;
    g.globalAlpha = alpha * (0.5 + Math.random() * 0.8);
    g.lineWidth = 0.5 + Math.random() * 1.6;
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) {
      const yy = y + Math.sin(x * 0.02 + i * 2.7) * 3.5 + Math.sin(x * 0.09 + i * 13.1) * 1.4;
      if (x) g.lineTo(x, yy); else g.moveTo(x, yy);
    }
    g.stroke();
  }
  g.globalAlpha = 0.05;
  for (let i = 0; i < 800; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  g.globalAlpha = 1;
  return cv;
}
let boardTexApplied = false;
function applyBoardTextures() {
  if (boardTexApplied || !renderer) return;
  boardTexApplied = true;
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;
  const mk = (base, streak, alpha, lines) => {
    const tex = new THREE.CanvasTexture(woodCanvas(base, streak, alpha, lines));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAniso;
    return tex;
  };
  MATS.eLight.map = mk('#e7ddc8', '#c9b795', 0.16, 46);
  MATS.eDark.map = mk('#d9c9ae', '#a8896a', 0.24, 60);
  MATS.eRim.map = mk('#c9b896', '#8a6f52', 0.30, 70);
  MATS.eRim.map.repeat.set(3, 1);
  MATS.post.map = mk('#d8d8d8', '#a8a8a8', 0.22, 120);
  MATS.post.map.repeat.set(2, 3);
  for (const k of ['eLight', 'eDark', 'eRim', 'post']) MATS[k].needsUpdate = true;
}

/* ---------- Taulells ---------- */
function buildBoards() {
  const tileGeo = new THREE.BoxGeometry(0.98, 0.14, 0.98);
  const glassGeo = new THREE.PlaneGeometry(0.98, 0.98);

  for (let lvl = 0; lvl < 2; lvl++) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = lvl * 128 + row * 16 + col;
        const p = sqXZ(sq);
        let mesh;
        if (lvl === 0) {
          mesh = new THREE.Mesh(tileGeo, (row + col) % 2 === 0 ? MATS.eLight : MATS.eDark);
          mesh.position.set(p.x, -0.07, p.z);
          mesh.receiveShadow = true;
        } else {
          mesh = new THREE.Mesh(glassGeo, (row + col) % 2 === 0 ? MATS.sLightGlass : MATS.sDarkGlass);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(p.x, LEVEL_H, p.z);
          mesh.renderOrder = 2;
        }
        mesh.userData.sq = sq;
        tilesGroup.add(mesh);
        tileMeshes.push(mesh);
      }
    }
  }

  // línies de graella del nivell superior
  const linePts = [];
  for (let i = 0; i <= 8; i++) {
    const t = (i - 4) * SQ_SIZE;
    linePts.push(new THREE.Vector3(t, LEVEL_H + 0.005, -4), new THREE.Vector3(t, LEVEL_H + 0.005, 4));
    linePts.push(new THREE.Vector3(-4, LEVEL_H + 0.005, t), new THREE.Vector3(4, LEVEL_H + 0.005, t));
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
  tilesGroup.add(new THREE.LineSegments(lineGeo, MATS.sGrid));

  // marcs
  const rimLen = 9.0, rimW = 0.35, rimH = 0.18;
  const rims0 = new THREE.Group(), rims1 = new THREE.Group();
  const offs = [[0, -4.2], [0, 4.2], [-4.2, 0], [4.2, 0]];
  for (const [ox, oz] of offs) {
    const r0 = new THREE.Mesh(new THREE.BoxGeometry(ox === 0 ? rimLen : rimW, rimH, oz === 0 ? rimLen : rimW), MATS.eRim);
    r0.position.set(ox, -0.09, oz); r0.castShadow = true; rims0.add(r0);
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(ox === 0 ? rimLen : rimW, 0.06, oz === 0 ? rimLen : rimW), MATS.sRim);
    r1.position.set(ox, LEVEL_H, oz); rims1.add(r1);
  }
  tilesGroup.add(rims0, rims1);

  // pilars de les cantonades
  for (const sx of [-4.2, 4.2]) for (const sz of [-4.2, 4.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, LEVEL_H + 0.1, 16), MATS.post);
    post.position.set(sx, LEVEL_H / 2, sz);
    post.castShadow = true;
    tilesGroup.add(post);
  }

  refreshLevelSprites();
}

/* ---------- Etiquetes i coordenades ---------- */
function makeTextSprite(text, cssColor, pos, scale = [2.2, 1.1], font = 'bold 72px Segoe UI, Arial') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = cssColor;
  ctx.globalAlpha = 0.9;
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(scale[0], scale[1], 1);
  spr.position.copy(pos);
  return spr;
}
let levelSprites = [];
function refreshLevelSprites() {
  for (const s of levelSprites) tilesGroup.remove(s);
  levelSprites = [];
  if (!(Theme.cur && Theme.cur.levelLabels)) return;
  levelSprites.push(makeTextSprite('CEL \u2191', Theme.cur.sRim, new THREE.Vector3(-5.4, LEVEL_H + 0.55, -4.2)));
  levelSprites.push(makeTextSprite('TERRA', Theme.cur.eLight, new THREE.Vector3(-5.4, 0.55, -4.2)));
  levelSprites.forEach(s => tilesGroup.add(s));
}
let coordsAccent = '';
function rebuildCoords() {
  while (coordsGroup.children.length) {
    const c = coordsGroup.children[0];
    coordsGroup.remove(c);
    if (c.material && c.material.map) c.material.map.dispose();
  }
  coordsAccent = Theme.cur ? Theme.cur.accent : '#4fc3f7';
  const scale = [0.62, 0.31];
  const font = 'bold 90px Segoe UI, Arial';
  for (let lvl = 0; lvl < 2; lvl++) {
    const y = (lvl === 1 ? LEVEL_H : 0) + 0.06;
    for (let col = 0; col < 8; col++) {
      const spr = makeTextSprite('abcdefgh'[col], coordsAccent,
        new THREE.Vector3(col - 3.5, y, 4.5), scale, font);
      spr.material.opacity = 0.8;
      coordsGroup.add(spr);
    }
    for (let row = 0; row < 8; row++) {
      const spr = makeTextSprite(String(8 - row), coordsAccent,
        new THREE.Vector3(-4.5, y, 3.5 - row), scale, font);
      spr.material.opacity = 0.8;
      coordsGroup.add(spr);
    }
  }
  coordsGroup.visible = !!(Theme.cur && Theme.cur.coords);
}

function rebuildBoards() {
  while (tilesGroup.children.length) {
    const c = tilesGroup.children[0];
    tilesGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
  }
  tileMeshes.length = 0;
  buildBoards();
}

/* ---------- Entorn / paisatge de fons ---------- */
function applyTexColorSpace(tex) {
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  else if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
}
function envTextureFor(id, onLoad) {
  const data = id === 'custom' ? (typeof ENV_CUSTOM !== 'undefined' ? ENV_CUSTOM : null)
    : ((typeof ENV_ASSETS !== 'undefined' && ENV_ASSETS[id]) || null);
  if (!data) return null;
  if (envTextures[id]) {
    if (onLoad) {
      if (envTextures[id].image && envTextures[id].image.width) onLoad(envTextures[id]);
      else (envTextures[id].userData.onLoad = envTextures[id].userData.onLoad || []).push(onLoad);
    }
    return envTextures[id];
  }
  const tex = new THREE.TextureLoader().load(data, () => {
    const cbs = tex.userData.onLoad || [];
    tex.userData.onLoad = [];
    cbs.forEach(fn => fn(tex));
  });
  tex.userData.onLoad = onLoad ? [onLoad] : [];
  applyTexColorSpace(tex);
  // anisotropia màxima: les panoràmiques es miren en rasant (mar, muntanyes)
  // i sense això es veuen borroses
  if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  envTextures[id] = tex;
  return tex;
}
function applyEnvironment(t) {
  const id = t.env || 'cap';
  if (appliedEnv === id) return;
  appliedEnv = id;
  const setup = (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    if (scene.background !== tex) scene.background = tex;
    if (!envPMREM[id]) envPMREM[id] = PMREM.fromEquirectangular(tex).texture;
    scene.environment = envPMREM[id];
  };
  const tex = id === 'cap' ? null : envTextureFor(id, setup);
  if (!tex) {
    if (scene.background !== null) scene.background = null;
    scene.environment = null;
  } else if (tex.image && tex.image.width) {
    setup(tex);
  }
  // si la textura encara no està carregada, setup arriba per onLoad
}

/* ---------- Aplicació del tema a l'escena ---------- */
let appliedGap = null;
function apply3DTheme(t) {
  MATS.eLight.color.set(t.eLight);
  MATS.eDark.color.set(t.eDark);
  MATS.eRim.color.set(t.eRim);
  MATS.post.color.set(t.eRim);
  MATS.sLightGlass.color.set(t.sLight); MATS.sLightGlass.opacity = t.sOpacity;
  MATS.sDarkGlass.color.set(t.sDark); MATS.sDarkGlass.opacity = t.sOpacity;
  MATS.sRim.color.set(t.sRim);
  MATS.sGrid.color.set(t.sRim); MATS.sGrid.opacity = t.sGrid;
  MATS.dot.color.set(t.mMove);
  MATS.ringCap.color.set(t.mCap);
  MATS.ringVert.color.set(t.mVert);
  MATS.sel.color.set(t.mSel);
  MATS.last.color.set(t.mLast);
  MATS.check.color.set(t.mCheck);
  MATS.vertLine.color.set(t.mVert);
  MATS.beam.color.set(t.mVert);
  MATS.beamCore.color.set(t.mVert);
  MATS.w.color.set(t.pWhite); MATS.w.roughness = t.pRough; MATS.w.metalness = t.pMetal;
  MATS.b.color.set(t.pBlack); MATS.b.roughness = Math.min(1, t.pRough + 0.03); MATS.b.metalness = Math.min(1, t.pMetal + 0.05);
  for (const [gm, base] of [[MATS.gw, t.pWhite], [MATS.gb, t.pBlack]]) {
    gm.color.set(base); gm.emissive.set(base);
    gm.opacity = t.gOpacity; gm.transparent = t.gOpacity < 0.99;
    gm.roughness = t.pRough; gm.metalness = t.pMetal;
  }
  for (const [hm, base] of [[MATS.ghHeadW, t.pWhite], [MATS.ghHeadB, t.pBlack]]) {
    hm.color.set(base); hm.emissive.set(base);
    hm.opacity = Math.min(1, t.gOpacity + 0.15); hm.transparent = hm.opacity < 0.99;
    hm.roughness = t.pRough; hm.metalness = t.pMetal;
  }
  MATS.auraW.color.set(t.pWhite);
  MATS.auraB.color.set(t.pBlack);
  LIGHTS.dir.intensity = t.lDir;
  LIGHTS.amb.intensity = t.lAmb;
  LIGHTS.hemi.intensity = 0.2 + t.lAmb * 0.3;
  if (renderer.shadowMap.enabled !== t.shadows) {
    renderer.shadowMap.enabled = t.shadows;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
  if (appliedGap !== null && appliedGap !== t.gap) {
    LEVEL_H = t.gap;
    rebuildBoards();
    rebuildCoords();
    if (typeof syncAllPieces === 'function' && typeof game !== 'undefined') {
      syncAllPieces();
      if (typeof refreshOverlays === 'function') refreshOverlays();
    }
  }
  appliedGap = t.gap;
  HEAD_PLANE.constant = -(LEVEL_H + 0.42);
  applyEnvironment(t);
  refreshLevelSprites();
  if (!coordsGroup.children.length || coordsAccent !== t.accent) rebuildCoords();
  coordsGroup.visible = t.coords;
}
Theme.apply3D = apply3DTheme;
// invalida la caché d'entorn: en pujar un paisatge personalitzat nou, el
// fons i el PMREM es regeneren sense canviar de tema ni tocar res més
Theme.refreshEnvironment = () => {
  appliedEnv = null;
  delete envTextures.custom;
  delete envPMREM.custom;
};

/* ---------- Peces (geometria amb primitives) ---------- */
const PIECE_PROTO = {};
function buildProtos() {
  for (const ck of ['w', 'b']) {
    PIECE_PROTO[ck] = {};
    for (let type = 1; type <= 6; type++) PIECE_PROTO[ck][type] = buildPieceProto(type, MATS[ck]);
  }
}
function buildPieceProto(type, mat) {
  const g = new THREE.Group();
  const add = (geo, y, opts = {}) => {
    const mesh = new THREE.Mesh(geo, opts.mat || mat);
    mesh.position.set(opts.x || 0, y, opts.z || 0);
    if (opts.rx) mesh.rotation.x = opts.rx;
    if (opts.ry) mesh.rotation.y = opts.ry;
    if (opts.rz) mesh.rotation.z = opts.rz;
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  // perfil de tornejat: llista de [radi, alçada] -> LatheGeometry
  const P = (arr) => arr.map(p => new THREE.Vector2(p[0], p[1]));
  const arc = (cy, r, a0, a1, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      pts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * r), cy + Math.sin(a) * r));
    }
    return pts;
  };
  const lathe = (pts) => {
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mat);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // base tornejada comuna amb motllura
  const BASE = [[0.001, 0], [0.36, 0], [0.365, 0.025], [0.355, 0.05], [0.325, 0.075], [0.305, 0.10], [0.30, 0.13]];

  if (type === 1) { // peó
    lathe(P(BASE.concat([[0.20, 0.17], [0.16, 0.24], [0.145, 0.31], [0.14, 0.35], [0.165, 0.375], [0.165, 0.39], [0.125, 0.405]])));
    lathe(arc(0.475, 0.088, -1.2, Math.PI / 2, 12));
  } else if (type === 2) { // cavall
    lathe(P(BASE.concat([[0.245, 0.17], [0.24, 0.20]])));
    lathe(P([[0.24, 0.20], [0.24, 0.21], [0.001, 0.21]]));
    add(knightHeadGeo(), 0.21, { ry: -Math.PI / 2 });
  } else if (type === 3) { // alfil
    lathe(P(BASE.concat([[0.185, 0.18], [0.13, 0.28], [0.115, 0.36], [0.15, 0.40], [0.15, 0.42], [0.115, 0.44], [0.13, 0.48], [0.145, 0.53], [0.10, 0.58], [0.05, 0.615]])));
    lathe(arc(0.635, 0.042, -1.1, Math.PI / 2, 10));
  } else if (type === 4) { // torre
    lathe(P(BASE.concat([[0.21, 0.18], [0.185, 0.34], [0.18, 0.47], [0.23, 0.54], [0.24, 0.57], [0.24, 0.59], [0.155, 0.59], [0.155, 0.64], [0.001, 0.64]])));
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      add(new THREE.BoxGeometry(0.085, 0.075, 0.085), 0.615, { x: Math.cos(a) * 0.195, z: Math.sin(a) * 0.195, ry: -a });
    }
  } else if (type === 5) { // dama
    lathe(P(BASE.concat([[0.19, 0.18], [0.135, 0.30], [0.115, 0.44], [0.11, 0.50], [0.145, 0.53], [0.145, 0.545], [0.115, 0.56], [0.17, 0.63], [0.155, 0.67], [0.09, 0.685], [0.075, 0.70]])));
    lathe(arc(0.735, 0.05, -0.9, Math.PI / 2, 10));
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      add(new THREE.SphereGeometry(0.027, 10, 8), 0.71, { x: Math.cos(a) * 0.115, z: Math.sin(a) * 0.115 });
    }
  } else { // rei
    lathe(P(BASE.concat([[0.20, 0.18], [0.14, 0.32], [0.125, 0.48], [0.12, 0.545], [0.15, 0.575], [0.15, 0.59], [0.18, 0.66], [0.165, 0.70], [0.085, 0.715], [0.001, 0.72]])));
    add(new THREE.BoxGeometry(0.05, 0.17, 0.05), 0.80);
    add(new THREE.BoxGeometry(0.14, 0.05, 0.05), 0.82);
  }
  return g;
}

// cap del cavall: silueta 2D extrudida (amb bisell suau), orientada
// amb el musell cap a +z com la resta del joc
function knightHeadGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.11, 0.00);
  s.quadraticCurveTo(-0.155, 0.14, -0.125, 0.27);   // clatella
  s.quadraticCurveTo(-0.10, 0.38, -0.05, 0.44);     // crani
  s.lineTo(0.01, 0.52);                             // orella posterior
  s.lineTo(0.045, 0.455);
  s.lineTo(0.085, 0.50);                            // orella frontal
  s.lineTo(0.11, 0.43);                             // front
  s.quadraticCurveTo(0.20, 0.40, 0.265, 0.345);     // morro superior
  s.quadraticCurveTo(0.29, 0.315, 0.27, 0.29);      // trufa
  s.quadraticCurveTo(0.20, 0.27, 0.15, 0.255);      // mandíbula
  s.quadraticCurveTo(0.10, 0.22, 0.095, 0.17);      // gola
  s.lineTo(0.12, 0.00);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.15, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 10
  });
  geo.translate(0, 0, -(0.15 / 2 + 0.02));
  return geo;
}

const AURA_GEO = new THREE.RingGeometry(0.42, 0.58, 36);
function styleGhostGroup(g, colorKey) {
  // Fantasma bicolor: el COS conserva el color d'ORIGEN (translúcid) i el
  // CAP (retallat amb HEAD_PLANE) i l'anella duen el color del bàndol que
  // l'ha capturada.
  const originKey = colorKey === 'w' ? 'b' : 'w';
  g.traverse(o => {
    if (o.isMesh) { o.material = GHOST_MATS[originKey]; o.castShadow = false; }
  });
  const head = g.clone(true);
  head.traverse(o => {
    if (o.isMesh) { o.material = colorKey === 'w' ? MATS.ghHeadW : MATS.ghHeadB; o.castShadow = false; }
  });
  head.name = 'ghostHead';
  g.add(head);
  const aura = new THREE.Mesh(AURA_GEO, MATS[colorKey === 'w' ? 'auraW' : 'auraB']);
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.03;
  aura.name = 'aura';
  g.add(aura);
}

function syncAllPieces() {
  while (piecesGroup.children.length) piecesGroup.remove(piecesGroup.children[0]);
  meshBySq.clear();
  for (let sq = 0; sq < 256; sq++) {
    const p = game.b[sq];
    if (!p) continue;
    const lvl = sq >> 7, row = (sq >> 4) & 7, col = sq & 15;
    if (row > 7 || col > 7) continue;
    const type = Math.abs(p), color = p > 0 ? E3D.WHITE : E3D.BLACK;
    const key = color === E3D.WHITE ? 'w' : 'b';
    const g = PIECE_PROTO[key][type].clone();
    if (game.gh[sq] === 1) styleGhostGroup(g, key);
    g.position.copy(sqPos(sq));
    g.userData = { sq, type, color, ghost: game.gh[sq] === 1 };
    piecesGroup.add(g);
    meshBySq.set(sq, g);
  }
}
// apareix un fantasma nou (peça capturada a Terra que ascendeix)
function spawnGhost(sq, type, color, delay = 0) {
  const key = color === E3D.WHITE ? 'w' : 'b';
  const g = PIECE_PROTO[key][type].clone();
  styleGhostGroup(g, key);
  g.position.copy(sqPos(sq));
  g.userData = { sq, type, color, ghost: true };
  g.scale.set(0.01, 0.01, 0.01);
  piecesGroup.add(g);
  meshBySq.set(sq, g);
  animLock++;
  tweens.push({
    t0: performance.now() + delay, dur: adur(360),
    update: k => { const s = 0.01 + 0.99 * easeInOut(k); g.scale.set(s, s, s); },
    done: () => { g.scale.set(1, 1, 1); animLock--; }
  });
}

/* ---------- Càmera orbital ---------- */
// phi 1.05 (~30° d'elevació): prou vertical per llegir els dos nivells i
// prou horitzontal perquè el paisatge (horitzó del mar, cel) sigui visible
const cam = {
  theta: 0, phi: 1.05, radius: 13.5,
  goal: { theta: 0, phi: 1.05, radius: 13.5 },
  target: new THREE.Vector3(0, 1.1, 0)
};
const CAM_PRESETS = {
  1: { phi: 0.09, radius: 16.5 },           // des de dalt
  2: { phi: 1.42, radius: 15 },             // de costat
  3: { phi: 1.05, radius: 13.5 }            // isomètrica
};
function setCameraPreset(n) {
  const p = CAM_PRESETS[n];
  if (!p) return;
  cam.goal.phi = p.phi; cam.goal.radius = p.radius;
}
function updateCamera() {
  cam.theta += (cam.goal.theta - cam.theta) * 0.15;
  cam.phi += (cam.goal.phi - cam.phi) * 0.15;
  cam.radius += (cam.goal.radius - cam.radius) * 0.15;
  const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
  camera.position.set(
    cam.target.x + cam.radius * sp * Math.sin(cam.theta),
    cam.target.y + cam.radius * cp,
    cam.target.z + cam.radius * sp * Math.cos(cam.theta)
  );
  camera.lookAt(cam.target);
}

function buildCameraControls() {
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  const pointers = new Map();
  let downInfo = null, pinchD0 = 0, radius0 = 0, last = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downInfo = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false, button: e.button };
      last = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchD0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      radius0 = cam.radius;
    }
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && downInfo) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (d > 10) cam.radius = cam.goal.radius = clamp(radius0 * pinchD0 / d, 6.5, 30);
      return;
    }
    if (pointers.size === 1 && downInfo && last) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) > 5) downInfo.moved = true;
      if (downInfo.moved) {
        if (downInfo.button === 2 || downInfo.button === 1) {
          // panoràmica
          const k = 0.0016 * cam.radius;
          cam.target.x += (-dx * Math.cos(cam.theta) + dy * Math.sin(cam.theta)) * k;
          cam.target.z += (-dx * Math.sin(cam.theta) - dy * Math.cos(cam.theta)) * k;
          cam.target.x = clamp(cam.target.x, -5, 5);
          cam.target.z = clamp(cam.target.z, -5, 5);
        } else {
          cam.theta -= dx * 0.0055;
          cam.phi = clamp(cam.phi - dy * 0.0045, 0.06, 1.5);
        }
        cam.goal.theta = cam.theta; cam.goal.phi = cam.phi; cam.goal.radius = cam.radius;
      }
    } else if (!downInfo) {
      // cursor sobre peça pròpia
      const sq = pickTile(e.clientX, e.clientY);
      el.style.cursor = sq >= 0 && canControlSq(sq) ? 'pointer' : 'default';
    }
  });
  const up = e => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && downInfo) {
      if (!downInfo.moved && Date.now() - downInfo.t < 600 && downInfo.button === 0) {
        const sq = pickTile(e.clientX, e.clientY);
        if (sq >= 0) onTileClick(sq);
      }
      downInfo = null; last = null;
    }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => {
    e.preventDefault();
    cam.radius = cam.goal.radius = clamp(cam.radius * (1 + e.deltaY * 0.0011), 6.5, 30);
  }, { passive: false });
}

const _raycaster = new THREE.Raycaster();
const _pointerV = new THREE.Vector2();
function pickTileRaw(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  _pointerV.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _pointerV.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_pointerV, camera);
  const hits = _raycaster.intersectObjects(tileMeshes, false);
  return hits.length ? hits[0].object.userData.sq : -1;
}
// Selecció contextual: el vidre de N1 no ha d'impedir clicar peces o
// destins legals de N0 que queden per sota. Prova totes les interseccions
// d'ordenades per distància i es queda amb la primera "interessant".
function pickTile(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  _pointerV.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _pointerV.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_pointerV, camera);
  const hits = _raycaster.intersectObjects(tileMeshes, false);
  if (!hits.length) return -1;
  const interesting = sq => {
    if (typeof selectedMoves !== 'undefined' && selected >= 0 &&
        selectedMoves.some(m => m.to === sq)) return true;
    if (typeof canControlSq === 'function' && canControlSq(sq)) return true;
    return false;
  };
  for (const h of hits) {
    if (interesting(h.object.userData.sq)) return h.object.userData.sq;
  }
  return hits[0].object.userData.sq;
}

/* ---------- Marcadors ---------- */
function flatQuad(sq, size, material, yOff = 0.015) {
  const geo = size === 'ring' ? new THREE.RingGeometry(0.26, 0.42, 32)
    : size === 'ring2' ? new THREE.RingGeometry(0.2, 0.34, 32)
    : size === 'dot' ? new THREE.CircleGeometry(0.14, 24)
    : new THREE.PlaneGeometry(0.94, 0.94);
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = -Math.PI / 2;
  m.position.copy(sqPos(sq, (sq >> 7) === 1 ? 0.02 : 0.015 + yOff));
  return m;
}
function clearMarkers() {
  while (markersGroup.children.length) {
    const c = markersGroup.children[0];
    markersGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
      else c.material.dispose();
    }
  }
  vertLine = null;
  epMarkers = [];
  beams = [];
}
let vertLine = null;
let epMarkers = [];   // anells pulsants sobre la víctima de la captura al pas
let beams = [];       // feixos verticals de la peça seleccionada
function addVertLine(fromSq, toSq) {
  const a = sqPos(fromSq, 0.45), b = sqPos(toSq, 0.1);
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, MATS.vertLine);
  line.computeLineDistances();
  markersGroup.add(line);
  vertLine = line;
}
// columna de llum (feix) entre els dos nivells per marcar l'ascensió o el descens
function addBeam(sq, isUp) {
  const p = sqXZ(sq);
  const y0 = isUp ? 0.42 : LEVEL_H + 0.02;
  const y1 = isUp ? LEVEL_H + 0.02 : 0.42;
  const h = Math.abs(y1 - y0);
  const geo = new THREE.CylinderGeometry(0.13, 0.19, h, 20, 1, true);
  const beam = new THREE.Mesh(geo, MATS.beam);
  beam.position.set(p.x, (y0 + y1) / 2, p.z);
  const geoCore = new THREE.CylinderGeometry(0.055, 0.075, h, 12, 1, true);
  const core = new THREE.Mesh(geoCore, MATS.beamCore);
  core.position.copy(beam.position);
  markersGroup.add(beam, core);
  beams.push(beam, core);
}
function showSelection3D(sq, moves) {
  clearMarkers();
  markersGroup.add(flatQuad(sq, 'plane', MATS.sel));
  const seen = new Set();
  for (const m of moves) {
    if (seen.has(m.to)) continue;
    seen.add(m.to);
    if (m.flag === Engine.F_VERT || m.flag === Engine.F_VCAP) {
      const capture = m.flag === Engine.F_VCAP;
      markersGroup.add(flatQuad(m.to, capture ? 'ring' : 'ring2',
        capture ? MATS.ringCap : MATS.ringVert));
      addVertLine(sq, m.to);
      addBeam(sq, (m.to >> 7) === 1);   // feix cap amunt (ascensió) o cap avall
    } else if (game.b[m.to] !== 0 || m.flag === 2) {
      markersGroup.add(flatQuad(m.to, 'ring', MATS.ringCap));
      if (m.flag === 2) {
        // captura al pas: la víctima no és a la casella de destí sinó al
        // costat; la marquem amb un anell vermell pulsant perquè es vegi
        // QUI és el capturat (el peó que acaba de fer el doble pas)
        const moverSign = game.b[m.from] > 0 ? 1 : -1;
        const victimSq = m.to + (moverSign === 1 ? 16 : -16);
        if (victimSq >= 0 && victimSq < 256 && game.b[victimSq] !== 0) {
          const mat = MATS.ringCap.clone();
          const ring = flatQuad(victimSq, 'ring', mat, 0.03);
          markersGroup.add(ring);
          epMarkers.push(ring);
        }
      }
    } else {
      markersGroup.add(flatQuad(m.to, 'dot', MATS.dot));
    }
  }
}
let checkMarker = null, lastMoveMarkers = [];
function setCheckSq(sq) {
  if (checkMarker) { markersGroup.remove(checkMarker); checkMarker = null; }
  if (sq >= 0) { checkMarker = flatQuad(sq, 'plane', MATS.check, 0.005); markersGroup.add(checkMarker); }
}
function setLastMove3D(from, to) {
  for (const m of lastMoveMarkers) markersGroup.remove(m);
  lastMoveMarkers = [];
  if (from >= 0) {
    for (const sq of [from, to]) {
      const q = flatQuad(sq, 'plane', MATS.last, 0.004);
      lastMoveMarkers.push(q);
      markersGroup.add(q);
    }
  }
}
function clearAllOverlays() { clearMarkers(); checkMarker = null; lastMoveMarkers = []; }
function refreshOverlays() {
  if (typeof selected !== 'undefined' && selected >= 0) showSelection3D(selected, selectedMoves);
  else clearMarkers();
  if (typeof curStatus !== 'undefined' && curStatus && curStatus.check && !gameOver) {
    setCheckSq(game.k[game.turn]);
  } else setCheckSq(-1);
  if (typeof lastMove !== 'undefined' && lastMove) setLastMove3D(lastMove.from, lastMove.to);
}

/* ---------- Animacions ---------- */
const easeInOut = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

function animatePieceMove(fromSq, toSq, vertical, dur, onDone) {
  const mesh = meshBySq.get(fromSq);
  if (!mesh) { if (onDone) onDone(); return; }
  meshBySq.delete(fromSq);
  meshBySq.set(toSq, mesh);
  mesh.userData.sq = toSq;
  const from = mesh.position.clone(), to = sqPos(toSq);
  animLock++;
  tweens.push({
    t0: performance.now(), dur,
    update: k => {
      const e = easeInOut(k);
      mesh.position.lerpVectors(from, to, e);
      if (!vertical) mesh.position.y = from.y + Math.sin(Math.PI * e) * 0.16;
    },
    done: () => { mesh.position.copy(to); animLock--; if (onDone) onDone(); }
  });
}
// enroc internivell: rei i torre intercanvien les caselles
function animateSwap(sqA, sqB, dur, onDone) {
  const ma = meshBySq.get(sqA), mb = meshBySq.get(sqB);
  if (!ma || !mb) { syncAllPieces(); if (onDone) onDone(); return; }
  meshBySq.delete(sqA); meshBySq.delete(sqB);
  meshBySq.set(sqB, ma); meshBySq.set(sqA, mb);
  ma.userData.sq = sqB; mb.userData.sq = sqA;
  const pa = ma.position.clone(), pb = mb.position.clone();
  animLock++;
  tweens.push({
    t0: performance.now(), dur,
    update: k => {
      const e = easeInOut(k);
      ma.position.lerpVectors(pa, pb, e);
      ma.position.y = pa.y + Math.sin(Math.PI * e) * 0.55;
      mb.position.lerpVectors(pb, pa, e);
      mb.position.y = pb.y + Math.sin(Math.PI * e) * 0.55;
    },
    done: () => { ma.position.copy(pb); mb.position.copy(pa); animLock--; if (onDone) onDone(); }
  });
}
function animateCapture(sq, delay = 0) {
  const mesh = meshBySq.get(sq);
  if (!mesh) return;
  meshBySq.delete(sq);
  animLock++;
  const t0 = performance.now() + delay;
  tweens.push({
    t0, dur: adur(240),
    update: k => { const s = Math.max(0.01, 1 - easeInOut(k)); mesh.scale.set(s, s, s); },
    done: () => { piecesGroup.remove(mesh); animLock--; }
  });
}
function replacePiece(sq, newType) {
  const old = meshBySq.get(sq);
  if (!old) return;
  const color = old.userData.color;
  piecesGroup.remove(old);
  const g = PIECE_PROTO[color === E3D.WHITE ? 'w' : 'b'][newType].clone();
  g.position.copy(sqPos(sq));
  g.userData = { sq, type: newType, color, ghost: false };
  piecesGroup.add(g);
  meshBySq.set(sq, g);
}

/* ---------- Bucle de render ---------- */
function tick3d(now) {
  requestAnimationFrame(tick3d);
  if (Theme.cur && Theme.cur.autoRotate && animLock === 0) cam.goal.theta += 0.0011;
  updateCamera();
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    let k = (now - tw.t0) / tw.dur;
    if (k < 0) continue;
    if (k >= 1) { tw.update(1); tweens.splice(i, 1); if (tw.done) tw.done(); }
    else tw.update(k);
  }
  if (checkMarker) checkMarker.material.opacity = 0.32 + 0.18 * Math.sin(now * 0.007);
  for (const em of epMarkers) em.material.opacity = 0.55 + 0.35 * Math.sin(now * 0.008);
  const bo = 0.16 + 0.09 * Math.sin(now * 0.004);
  MATS.beam.opacity = bo;
  MATS.beamCore.opacity = bo * 2.1;
  renderer.render(scene, camera);
}

export { adur, animLock, animateCapture, animatePieceMove, animateSwap, buildProtos, cam, checkMarker, clearAllOverlays, clearMarkers, init3D, replacePiece, setCameraPreset, setCheckSq, setLastMove3D, showSelection3D, spawnGhost, syncAllPieces };
