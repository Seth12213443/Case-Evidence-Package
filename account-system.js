/*
 * Case Evidence Package — Account / Save / Load module
 * Save format v4
 * Firebase Authentication + Realtime Database.
 * Preserves template identity, page order, page structure, and field values.
 * Uploaded image/file contents are not saved.
 */
(() => {
  'use strict';

  if (window.CEPAccountSystemLoaded) return;
  window.CEPAccountSystemLoaded = true;

  const firebaseConfig = {
    apiKey: 'AIzaSyCkI-NXOJgSJ3pKRmEN01jZmGs5JT0J0JM',
    authDomain: 'ghspackage.firebaseapp.com',
    databaseURL: 'https://ghspackage-default-rtdb.firebaseio.com',
    projectId: 'ghspackage',
    appId: '1:968709734238:web:7efa5ca1dfbc3fd33219cf'
  };

  const USERNAME_DOMAIN = 'ghspackage-login.com';
  const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,24}$/;
  const SDK_VERSION = '10.12.2';
  const EXCLUDED_CONTROLS =
    '[type="file"], [type="button"], [type="submit"], [type="reset"], [type="password"], [type="hidden"]';

  let auth = null;
  let database = null;
  let currentUser = null;
  let currentUsername = null;
  let busy = false;

  const byId = id => document.getElementById(id);
  const usernameEmail = username =>
    `${String(username).trim().toLowerCase()}@${USERNAME_DOMAIN}`;
  const cleanUsername = username => String(username || '').trim();
  const normalizedUsername = username => cleanUsername(username).toLowerCase();

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () =>
        reject(new Error('Could not load Firebase library. Check your internet connection.'));
      document.head.appendChild(script);
    });
  }

  async function initializeFirebase() {
    if (!window.firebase) {
      await loadScript(
        `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-compat.js`
      );
      await loadScript(
        `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth-compat.js`
      );
      await loadScript(
        `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-database-compat.js`
      );
    }

    const app = window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(firebaseConfig);

    auth = app.auth();
    database = app.database();

    await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
  }

  function status(message, isError = false) {
    const el = byId('cep-account-status');
    if (el) {
      el.textContent = message || '';
      el.style.color = isError ? '#b91c1c' : 'var(--cep-muted)';
    }
  }

  function setBusy(value) {
    busy = value;

    document.querySelectorAll('#cep-account-panel button').forEach(button => {
      button.disabled = value;
      button.style.opacity = value ? '.65' : '1';
      button.style.cursor = value ? 'wait' : 'pointer';
    });
  }

  function friendlyError(error) {
    const messages = {
      'auth/invalid-email': 'That username cannot be used. Check it and try again.',
      'auth/email-already-in-use': 'That username may already be registered. Try logging in.',
      'auth/weak-password': 'Choose a password with at least 6 characters.',
      'auth/invalid-credential': 'Incorrect username or password.',
      'auth/user-not-found': 'Incorrect username or password.',
      'auth/wrong-password': 'Incorrect username or password.',
      'auth/too-many-requests': 'Too many attempts. Wait a little and try again.',
      'auth/network-request-failed': 'Network request failed. Check your internet connection.',
      'PERMISSION_DENIED': 'Firebase denied this action. Check your Realtime Database rules.',
      'cep/username-taken': 'That username is already taken. Choose another.'
    };

    return messages[error && error.code] ||
      (error && error.message) ||
      'Something went wrong. Please try again.';
  }

  function createUI() {
    if (byId('cep-account-toolbar')) return;

    const style = document.createElement('style');
    style.id = 'cep-account-styles';
    style.textContent = `
      #cep-account-toolbar{position:fixed;right:12px;top:50%;transform:translateY(-50%);z-index:100050;display:flex;flex-direction:column;gap:9px;font-family:Arial,sans-serif}
      #cep-account-toolbar button{width:88px;min-height:44px;border:1px solid #777;border-radius:10px;padding:8px 6px;background:#222;color:#fff;box-shadow:0 3px 12px #0002;font-size:13px;font-weight:600;cursor:pointer}
      #cep-account-toolbar button:hover{filter:brightness(1.15)}
      #cep-account-overlay{position:fixed;inset:0;z-index:100060;display:none;align-items:center;justify-content:center;padding:16px;background:#0008;font-family:Arial,sans-serif}
      #cep-account-panel{width:min(420px,100%);box-sizing:border-box;max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#1f2937;border-radius:16px;padding:22px;box-shadow:0 18px 60px #0004}
      #cep-account-panel h2{margin:0 0 8px;font-size:22px}
      #cep-account-panel p{font-size:13px;line-height:1.45}
      #cep-account-panel label{display:block;font-size:13px;font-weight:600;margin:14px 0 6px}
      #cep-account-panel input{display:block;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:11px;font:15px Arial,sans-serif;background:#fff;color:#111827}
      #cep-account-panel .cep-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
      #cep-account-panel button{border:0;border-radius:8px;padding:10px 13px;background:#1f2937;color:#fff;font-weight:600;cursor:pointer}
      #cep-account-panel button.cep-secondary{background:#e5e7eb;color:#111827}
      #cep-account-close{float:right;background:transparent!important;color:#374151!important;font-size:22px;padding:0 5px!important}
      #cep-account-status{min-height:18px;margin:12px 0 0;font-size:13px}
      @media print{#cep-account-toolbar,#cep-account-overlay{display:none!important}}
      @media(max-width:600px){#cep-account-toolbar{right:5px;gap:6px}#cep-account-toolbar button{width:72px;min-height:40px;font-size:12px}}
      body.dark-mode #cep-account-panel{background:#24272b;color:#e5e7eb}
      body.dark-mode #cep-account-panel input{background:#17191c;color:#f9fafb;border-color:#62676e}
      body.dark-mode #cep-account-panel button.cep-secondary{background:#454a52;color:#fff}
      body.dark-mode #cep-account-close{color:#e5e7eb!important}
    `;

    document.head.appendChild(style);

    const toolbar = document.createElement('nav');
    toolbar.id = 'cep-account-toolbar';
    toolbar.setAttribute('aria-label', 'Account and saved work');
    toolbar.innerHTML = `
      <button type="button" id="cep-account-open">👤 Account</button>
      <button type="button" id="cep-save-open">💾 Save</button>
      <button type="button" id="cep-load-open">📂 Load</button>
    `;
    document.body.appendChild(toolbar);

    const overlay = document.createElement('div');
    overlay.id = 'cep-account-overlay';
    overlay.innerHTML = `
      <section id="cep-account-panel" role="dialog" aria-modal="true" aria-labelledby="cep-account-heading">
        <button type="button" id="cep-account-close" aria-label="Close">×</button>
        <h2 id="cep-account-heading">Case Evidence Package</h2>
        <p id="cep-account-description">Sign in or create an account to save your work online.</p>
        <div id="cep-account-form">
          <label for="cep-username">Username</label>
          <input id="cep-username" name="username" autocomplete="username" maxlength="24" spellcheck="false">
          <label for="cep-password">Password</label>
          <input id="cep-password" name="password" type="password" autocomplete="current-password" minlength="6">
          <p style="color:#6b7280;margin-bottom:0">Usernames: 3–24 letters, numbers, underscores, or hyphens. Passwords must be at least 6 characters.</p>
          <div class="cep-actions">
            <button type="button" id="cep-login">Log in</button>
            <button type="button" id="cep-signup" class="cep-secondary">Sign up</button>
          </div>
        </div>
        <div id="cep-signed-in" hidden>
          <p id="cep-signed-in-label"></p>
          <div class="cep-actions">
            <button type="button" id="cep-logout">Log out</button>
          </div>
        </div>
        <p id="cep-account-status" role="status" aria-live="polite"></p>
      </section>
    `;
    document.body.appendChild(overlay);

    byId('cep-account-open').addEventListener('click', openAccountPanel);
    byId('cep-save-open').addEventListener('click', saveWork);
    byId('cep-load-open').addEventListener('click', loadWork);
    byId('cep-account-close').addEventListener('click', closePanel);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closePanel();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closePanel();
    });
    byId('cep-login').addEventListener('click', login);
    byId('cep-signup').addEventListener('click', signup);
    byId('cep-logout').addEventListener('click', logout);
  }

  function openPanel() {
    byId('cep-account-overlay').style.display = 'flex';
  }

  function closePanel() {
    byId('cep-account-overlay').style.display = 'none';
  }

  function openAccountPanel() {
    openPanel();
    status(currentUser ? `You are signed in as ${currentUsername || 'your account'}.` : '');
    if (!currentUser) byId('cep-username').focus();
  }

  function updateAuthUI() {
    const signedIn = Boolean(currentUser);
    byId('cep-account-form').hidden = signedIn;
    byId('cep-signed-in').hidden = !signedIn;
    byId('cep-account-open').textContent =
      signedIn ? `👤 ${currentUsername || 'Account'}` : '👤 Account';
    byId('cep-signed-in-label').textContent = signedIn
      ? `Signed in as ${currentUsername}. Your saved work is stored under this account.`
      : '';
  }

  async function signup() {
    if (busy) return;

    const username = cleanUsername(byId('cep-username').value);
    const password = byId('cep-password').value;

    if (!USERNAME_PATTERN.test(username)) {
      return status('Use 3–24 letters, numbers, underscores, or hyphens for your username.', true);
    }
    if (password.length < 6) {
      return status('Password must be at least 6 characters.', true);
    }

    setBusy(true);
    status('Creating account…');

    let credential = null;
    let reserved = false;
    const normalized = normalizedUsername(username);

    try {
      credential = await auth.createUserWithEmailAndPassword(
        usernameEmail(username),
        password
      );

      const reservation = await database.ref('usernames/' + normalized).transaction(
        existing => existing === null ? credential.user.uid : undefined
      );

      if (!reservation.committed) {
        try { await credential.user.delete(); } catch (_) {}
        await auth.signOut();
        throw Object.assign(new Error('That username is already taken.'), {
          code: 'cep/username-taken'
        });
      }

      reserved = true;
      await database.ref('users/' + credential.user.uid).set({
        username,
        createdAt: Date.now()
      });

      currentUser = credential.user;
      currentUsername = username;
      byId('cep-password').value = '';
      updateAuthUI();
      status('Account created and signed in.');
    } catch (error) {
      if (credential && credential.user && error.code !== 'cep/username-taken') {
        if (reserved) {
          try { await database.ref('usernames/' + normalized).remove(); } catch (_) {}
        }
        try { await credential.user.delete(); } catch (_) {}
        try { await auth.signOut(); } catch (_) {}
      }
      status(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    if (busy) return;

    const username = cleanUsername(byId('cep-username').value);
    const password = byId('cep-password').value;

    if (!USERNAME_PATTERN.test(username)) return status('Enter a valid username.', true);
    if (!password) return status('Enter your password.', true);

    setBusy(true);
    status('Signing in…');

    try {
      const credential = await auth.signInWithEmailAndPassword(
        usernameEmail(username),
        password
      );
      currentUser = credential.user;

      const profile = await database
        .ref('users/' + credential.user.uid + '/username')
        .once('value');

      currentUsername = profile.val() || username;
      byId('cep-password').value = '';
      updateAuthUI();
      status('Signed in successfully.');
    } catch (error) {
      status(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;

    setBusy(true);

    try {
      await auth.signOut();
      currentUser = null;
      currentUsername = null;
      updateAuthUI();
      status('You have been signed out.');
    } catch (error) {
      status(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function requireSignedIn() {
    if (currentUser) return true;
    openAccountPanel();
    status('Please log in before saving or loading your work.', true);
    return false;
  }

  function controlsFor(page) {
    return Array.from(page.querySelectorAll('input, textarea, select'))
      .filter(element => !element.matches(EXCLUDED_CONTROLS) && !element.disabled);
  }

  function ensurePageId(page, index) {
    if (!page.dataset.cepSaveId) {
      const id = window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `cep-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 10)}`;
      page.dataset.cepSaveId = id;
    }
    return page.dataset.cepSaveId;
  }

  function getTemplateId(page) {
    if (!page) return null;

    const explicit = page.dataset.templateId || page.dataset.template || page.dataset.pageType;
    if (explicit && document.getElementById(explicit)?.tagName === 'TEMPLATE') {
      return explicit;
    }

    const pageText = (page.innerText || page.textContent || '').toLowerCase();

    const candidates = [
      ['measurement-template', /measurement/],
      ['chain-of-custody-template', /chain of custody/],
      ['sketch-template', /sketch/],
      ['notes-template', /additional notes|supplemental field|notes/],
      ['narrative-page-template', /case narrative|narrative/],
      ['photo-template', /crime scene photograph|photo description|photograph/],
      ['briefing-template', /briefing from/],
      ['scene-template', /scene description/],
      ['prep-template', /team preparation|health & safety hazards/]
    ];

    for (const [id, pattern] of candidates) {
      if (document.getElementById(id) && pattern.test(pageText)) return id;
    }

    return null;
  }

  function captureForm() {
    const pages = Array.from(document.querySelectorAll('.page'));
    if (!pages.length) throw new Error('No document pages were found to save.');

    const pageHTML = [];
    const fields = [];

    pages.forEach((page, pageIndex) => {
      const pageId = ensurePageId(page, pageIndex);
      const templateId = getTemplateId(page);

      pageHTML.push({
        id: pageId,
        templateId,
        html: page.outerHTML
      });

      controlsFor(page).forEach((element, fieldIndex) => {
        const type = (element.type || element.tagName).toLowerCase();
        let value;

        if (type === 'checkbox' || type === 'radio') {
          value = Boolean(element.checked);
        } else if (element.tagName === 'SELECT' && element.multiple) {
          value = Array.from(element.options)
            .filter(option => option.selected)
            .map(option => option.value);
        } else {
          value = element.value;
        }

        fields.push({
          pageId,
          page: pageIndex,
          index: fieldIndex,
          type,
          value
        });
      });
    });

    return {
      version: 4,
      savedAt: Date.now(),
      pageHTML,
      fields
    };
  }

  function sanitizePageElement(page) {
    page.querySelectorAll('script, iframe, object, embed, base').forEach(node => node.remove());

    [page, ...page.querySelectorAll('*')].forEach(element => {
      Array.from(element.attributes || []).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = String(attribute.value || '').trim().toLowerCase();

        if (name.startsWith('on')) element.removeAttribute(attribute.name);

        if (
          ['href', 'src', 'xlink:href'].includes(name) &&
          value.startsWith('javascript:')
        ) {
          element.removeAttribute(attribute.name);
        }
      });
    });

    return page;
  }

  function parseSavedPage(item, index) {
    const html = typeof item === 'string' ? item : item && item.html;

    if (typeof html !== 'string' || html.length > 2_000_000) {
      throw new Error(`Saved page ${index + 1} is invalid or too large.`);
    }

    const wrapper = document.createElement('template');
    wrapper.innerHTML = html.trim();

    let page = wrapper.content.firstElementChild;

    if (!page || !page.classList || !page.classList.contains('page')) {
      throw new Error(`Saved page ${index + 1} does not contain a valid page.`);
    }

    page = sanitizePageElement(page);

    const id = typeof item === 'object' && item
      ? item.id
      : page.dataset.cepSaveId;

    page.dataset.cepSaveId = id ? String(id) : `legacy-${index}`;

    return {
      page,
      id: page.dataset.cepSaveId,
      templateId: typeof item === 'object' && item ? item.templateId : null
    };
  }

  function createPageFromTemplate(templateId, fallbackPage) {
    const template = templateId ? document.getElementById(templateId) : null;

    if (template && template.tagName === 'TEMPLATE') {
      const clone = template.content.cloneNode(true);
      const page = clone.querySelector('.page');

      if (page) return page;
    }

    return fallbackPage;
  }

  function restorePageStructure(saved) {
    if (!Array.isArray(saved.pageHTML) || !saved.pageHTML.length) {
      return Array.from(document.querySelectorAll('.page'));
    }

    if (saved.pageHTML.length > 200) {
      throw new Error('The saved document contains too many pages.');
    }

    const parsed = saved.pageHTML.map(parseSavedPage);
    const oldPages = Array.from(document.querySelectorAll('.page'));

    if (!oldPages.length) throw new Error('Could not locate the document pages.');

    const parent = oldPages[0].parentElement;

    if (!parent || oldPages.some(page => page.parentElement !== parent)) {
      throw new Error('The document pages do not share the expected container.');
    }

    const currentById = new Map();
    oldPages.forEach(page => {
      const id = page.dataset.cepSaveId;
      if (id) currentById.set(id, page);
    });

    const restoredPages = parsed.map(({ page: snapshot, id, templateId }, index) => {
      let page = currentById.get(id);

      if (!page) {
        page = createPageFromTemplate(templateId, snapshot.cloneNode(true));
      } else {
        // Reuse the existing root element where possible so direct root listeners survive.
        const fresh = snapshot.cloneNode(true);
        Array.from(page.attributes).forEach(attribute => page.removeAttribute(attribute.name));
        Array.from(fresh.attributes).forEach(attribute =>
          page.setAttribute(attribute.name, attribute.value)
        );
        page.replaceChildren(...Array.from(fresh.childNodes).map(node => node.cloneNode(true)));
      }

      page.dataset.cepSaveId = id;
      if (templateId) page.dataset.templateId = templateId;

      return page;
    });

    // Replace the page list in saved order.
    oldPages.forEach(page => page.remove());
    restoredPages.forEach(page => parent.appendChild(page));

    document.dispatchEvent(new CustomEvent('cep:pages-restored', {
      detail: { pageCount: restoredPages.length }
    }));

    return restoredPages;
  }

  function applyForm(saved) {
    if (!saved || !Array.isArray(saved.fields)) {
      throw new Error('This saved record has an invalid format.');
    }

    const pages = Array.isArray(saved.pageHTML)
      ? restorePageStructure(saved)
      : Array.from(document.querySelectorAll('.page'));

    const pageById = new Map();

    pages.forEach((page, index) => {
      const id = page.dataset.cepSaveId || `legacy-${index}`;
      pageById.set(id, page);
    });

    let restored = 0;
    let skipped = 0;

    saved.fields.forEach(field => {
      if (!field || !Number.isInteger(field.index) || field.index < 0) {
        skipped++;
        return;
      }

      let page = field.pageId ? pageById.get(String(field.pageId)) : null;

      // Older saves used page indexes instead of stable page IDs.
      if (!page && Number.isInteger(field.page) && field.page >= 0) {
        page = pages[field.page];
      }

      if (!page) {
        skipped++;
        return;
      }

      const controls = controlsFor(page);
      const element = controls[field.index];

      if (!element || (element.type || element.tagName).toLowerCase() !== field.type) {
        skipped++;
        return;
      }

      if (field.type === 'checkbox' || field.type === 'radio') {
        element.checked = Boolean(field.value);
      } else if (
        element.tagName === 'SELECT' &&
        element.multiple &&
        Array.isArray(field.value)
      ) {
        Array.from(element.options).forEach(option => {
          option.selected = field.value.includes(option.value);
        });
      } else {
        element.value = field.value == null ? '' : String(field.value);
      }

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      restored++;
    });

    document.dispatchEvent(new CustomEvent('cep:pages-restored', {
      detail: {
        pageCount: pages.length,
        restoredFields: restored,
        skippedFields: skipped
      }
    }));

    return { restored, skipped, pages: pages.length };
  }

  async function saveWork() {
    if (busy || !(await requireSignedIn())) return;

    setBusy(true);

    try {
      const ref = database.ref(`users/${currentUser.uid}/data`);
      const existing = await ref.once('value');

      if (
        existing.exists() &&
        !window.confirm('You already have saved work. Overwrite that save with the current document?')
      ) {
        status('Save canceled. Your previous save was not changed.');
        return;
      }

      const payload = captureForm();
      await ref.set(payload);

      alert(
        `Saved ${payload.fields.length} fields across ${payload.pageHTML.length} pages. Uploaded images are not included.`
      );
      status('Save completed.');
    } catch (error) {
      alert('Save failed: ' + friendlyError(error));
      status(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function loadWork() {
    if (busy || !(await requireSignedIn())) return;

    if (
      !window.confirm(
        'Load your saved work? This replaces the current pages and form values. Unsaved changes will be lost. Uploaded images are not restored.'
      )
    ) {
      status('Load canceled. The current document was not changed.');
      return;
    }

    setBusy(true);

    try {
      const snapshot = await database.ref(`users/${currentUser.uid}/data`).once('value');

      if (!snapshot.exists()) {
        alert('There is no saved work for this account yet.');
        return;
      }

      const result = applyForm(snapshot.val());

      alert(
        `Loaded ${result.restored} fields across ${result.pages} pages.` +
        (result.skipped ? ` ${result.skipped} fields could not be matched.` : '') +
        ' Uploaded images are not included.'
      );

      status('Load completed.');
    } catch (error) {
      alert('Load failed: ' + friendlyError(error));
      status(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    createUI();
    updateAuthUI();
    status('Connecting to Firebase…');

    try {
      await initializeFirebase();

      auth.onAuthStateChanged(async user => {
        currentUser = user;
        currentUsername = null;

        if (user) {
          try {
            const profile = await database
              .ref(`users/${user.uid}/username`)
              .once('value');

            currentUsername = profile.val() ||
              (user.email ? user.email.split('@')[0] : 'Account');
          } catch (_) {
            currentUsername = user.email ? user.email.split('@')[0] : 'Account';
          }
        }

        updateAuthUI();
        status(user ? `Signed in as ${currentUsername}.` : 'Not signed in.');
      });
    } catch (error) {
      status(error.message || 'Could not initialize Firebase.', true);
      console.error('[CEP Account System]', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
