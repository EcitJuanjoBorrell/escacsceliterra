// Arrencada: l'ordre dels imports determina l'ordre d'execució
// (equivalent al pipeline del demo únic: envassets -> theme -> app3d -> appui)
import './style.css';
import './ui/appui.js';

// Comprovar si hi ha sessió activa
const currentUser = localStorage.getItem('currentUser');
if (!currentUser) {
  window.location.href = 'login.html';
}

// Si aquest mòdul corre, l'entorn carrega bé: fora l'avís "això és el codi font"
// (es veu quan l'index.html s'obré per file:// o des d'un previsualitzador)
document.getElementById('src-notice')?.remove();

// Afegir botó de sortir al menú
const logoutBtn = document.createElement('button');
logoutBtn.textContent = '🚪 Sortir';
logoutBtn.style.cssText = 'position:fixed;top:10px;right:10px;padding:8px 16px;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer;z-index:1000;';
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
});
document.body.appendChild(logoutBtn);
