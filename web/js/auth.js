/* The password derives the decryption key; no password or unlocked flag is stored. */
(function () {
  'use strict';
  var form = document.getElementById('login-form');
  var field = document.getElementById('password');
  var error = document.getElementById('login-error');
  var submit = document.getElementById('login-submit');
  function bytes(value) { return Uint8Array.from(atob(value), function (c) { return c.charCodeAt(0); }); }
  document.getElementById('password-toggle').addEventListener('click', function () {
    var show = field.type === 'password';
    field.type = show ? 'text' : 'password';
    this.textContent = show ? 'Ocultar' : 'Mostrar';
    this.setAttribute('aria-pressed', String(show));
  });
  document.getElementById('btn-logout').addEventListener('click', function () { location.reload(); });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    error.textContent = '';
    field.removeAttribute('aria-invalid');
    if (!window.crypto || !window.crypto.subtle) {
      error.textContent = 'Abra o painel por HTTPS ou pelo endereço localhost para acessar com segurança.';
      return;
    }
    if (!window.PROTECTED_DATA) { error.textContent = 'Não foi possível carregar os dados. Recarregue a página.'; return; }
    submit.disabled = true;
    submit.textContent = 'Entrando…';
    var dataset;
    try {
      var payload = window.PROTECTED_DATA;
      var material = await crypto.subtle.importKey('raw', new TextEncoder().encode(field.value), 'PBKDF2', false, ['deriveKey']);
      var key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(payload.salt), iterations: payload.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      var clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(payload.iv) }, key, bytes(payload.data));
      dataset = JSON.parse(new TextDecoder().decode(clear));
    } catch (_) {
      error.textContent = 'Senha incorreta. Confira e tente novamente.';
      field.setAttribute('aria-invalid', 'true');
      field.focus();
      field.select();
    }
    if (dataset) {
      field.value = '';
      window.SCHOOL_DATA = dataset;
      document.getElementById('auth-wall').hidden = true;
      document.getElementById('app').hidden = false;
      document.dispatchEvent(new Event('profe:unlocked'));
      document.getElementById('view').focus({ preventScroll: true });
    }
    submit.disabled = false;
    submit.textContent = 'Entrar';
  });
})();
