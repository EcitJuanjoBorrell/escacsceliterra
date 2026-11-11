// Arrencada: l'ordre dels imports determina l'ordre d'execució
// (equivalent al pipeline del demo únic: envassets -> theme -> app3d -> appui)
import './style.css';
import './ui/appui.js';

function initAuthGate() {
  let currentUser = null;
  try {
    currentUser = localStorage.getItem('currentUser');
  } catch {
    currentUser = null;
  }

  const gate = document.getElementById('auth-gate');
  gate.style.display = currentUser ? 'none' : 'flex';
  return currentUser || null;
}

// Si aquest mòdul corre, l'entorn carrega bé: fora l'avís "això és el codi font"
// (es veu quan l'index.html s'obré per file:// o des d'un previsualitzador)
document.getElementById('src-notice')?.remove();

const authGate = document.getElementById('auth-gate');
const authError = document.getElementById('auth-error');

function showAuthError(message) {
  authError.textContent = message;
  authError.style.display = 'block';
}

function clearAuthErrors() {
  authError.textContent = '';
  authError.style.display = 'none';
  document.querySelectorAll('.auth-form [role="alert"]').forEach((error) => {
    error.textContent = '';
    error.style.display = 'none';
  });
}

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    clearAuthErrors();
    document.querySelectorAll('.auth-tab').forEach((otherTab) => {
      const active = otherTab === tab;
      otherTab.classList.toggle('active', active);
      otherTab.style.color = active ? '#fff' : '#888';
      otherTab.style.borderBottomColor = active ? '#fff' : '#1a1a1a';
    });
    document.querySelectorAll('.auth-form').forEach((form) => {
      form.style.display = form.id === `${tab.dataset.form}-form` ? 'block' : 'none';
    });
  });
});

document.getElementById('login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  clearAuthErrors();

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const error = document.getElementById('login-error');

  try {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    if (!users[email]) {
      error.textContent = 'Usuari no registrat';
      error.style.display = 'block';
      return;
    }
    if (users[email].password !== password) {
      error.textContent = 'Contrasenya incorrecta';
      error.style.display = 'block';
      return;
    }

    localStorage.setItem('currentUser', email);
    authGate.style.display = 'none';
  } catch {
    showAuthError('No s’ha pogut accedir a les dades desades del navegador.');
  }
});

document.getElementById('signup-form').addEventListener('submit', (event) => {
  event.preventDefault();
  clearAuthErrors();

  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const password2 = document.getElementById('signup-password2').value;
  const error = document.getElementById('signup-error');

  if (password !== password2) {
    error.textContent = 'Les contrasenyes no coincideixen';
    error.style.display = 'block';
    return;
  }

  try {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    if (users[email]) {
      error.textContent = 'Aquest correu ja està registrat';
      error.style.display = 'block';
      return;
    }

    users[email] = { password, created: new Date().toISOString() };
    localStorage.setItem('users', JSON.stringify(users));
    localStorage.setItem('currentUser', email);
    authGate.style.display = 'none';
  } catch {
    showAuthError('No s’ha pogut desar el compte al navegador.');
  }
});

// Afegir botó de sortir al menú
const logoutBtn = document.createElement('button');
logoutBtn.textContent = '🚪 Sortir';
logoutBtn.style.cssText = 'position:fixed;top:10px;right:10px;padding:8px 16px;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer;z-index:1000;';
logoutBtn.addEventListener('click', () => {
  try {
    localStorage.removeItem('currentUser');
    clearAuthErrors();
  } catch {
    showAuthError('No s’ha pogut tancar la sessió al navegador.');
  }
  authGate.style.display = 'flex';
});
document.body.appendChild(logoutBtn);

initAuthGate();
