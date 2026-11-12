// Arrencada: l'ordre dels imports determina l'ordre d'execució
// (equivalent al pipeline del demo únic: envassets -> theme -> app3d -> appui)
import './auth/authGate.js';
import './style.css';
import './ui/appui.js';

// Si aquest mòdul corre, l'entorn carrega bé: fora l'avís "això és el codi font"
// (es veu quan l'index.html s'obré per file:// o des d'un previsualitzador)
document.getElementById('src-notice')?.remove();
