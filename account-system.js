
/*
 * Case Evidence Package — Account / Save / Load module
 * Save format v5
 * Preserves page order, full page markup, unique page/field IDs, and form values.
 * Uploaded image contents are not saved.
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

  const normalizedUsername = username =>
    cleanUsername(username).toLowerCase();

  // ------------------------------------------------------------
  // FIREBASE INITIALIZATION
  // ------------------------------------------------------------

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

    await auth.setPersistence(
      window.firebase.auth.Auth.Persistence.LOCAL
    );
  }

  // ------------------------------------------------------------
  // STATUS AND UI
  // ------------------------------------------------------------

  function status(message, isError = false) {
    const element = byId('cep-account-status');

    if (element) {
      element.textContent = message || '';
      element.style.color = isError
        ? '#b91c1c'
        : 'var(--cep-muted)';
    }
  }

  function setBusy(value) {
    busy = value;

    document
      .querySelectorAll('#cep-account-panel button')
      .forEach(button => {
        button.disabled = value;
        button.style.opacity = value ? '.65' : '1';
        button.style.cursor = value ? 'wait' : 'pointer';
      });
  }

  function friendlyError(error) {
    const messages = {
      'auth/invalid-email':
        'That username cannot be used. Check it and try again.',
      'auth/email-already-in-use':
        'That username may already be registered. Try logging in.',
      'auth/weak-password':
        'Choose a password with at least 6 characters.',
      'auth/invalid-credential':
        'Incorrect username or password.',
      'auth/user-not-found':
        'Incorrect username or password.',
      'auth/wrong-password':
        'Incorrect username or password.',
      'auth/too-many-requests':
        'Too many attempts. Wait a little and try again.',
      'auth/network-request-failed':
        'Network request failed. Check your internet connection.',
      'PERMISSION_DENIED':
        'Firebase denied this action. Check your Realtime Database rules.',
      'cep/username-taken':
        'That username is already taken. Choose another.'
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
      #cep-account-toolbar {
        position: fixed;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 100050;
        display: flex;
        flex-direction: column;
        gap: 9px;
        font-family: Arial, sans-serif;
      }

      #cep-account-toolbar button {
        width: 88px;
        min-height: 44px;
        border: 1px solid #777;
        border-radius: 10px;
        padding: 8px 6px;
        background: #222;
        color: #fff;
        box-shadow: 0 3px 12px #0002;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }

      #cep-account-toolbar button:hover {
        filter: brightness(1.15);
      }

      #cep-account-overlay {
        position: fixed;
        inset: 0;
        z-index: 100060;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: #0008;
        font-family: Arial, sans-serif;
      }

      #cep-account-panel {
        width: min(420px, 100%);
        box-sizing: border-box;
        max-height: calc(100vh - 32px);
        overflow: auto;
        background: #fff;
        color: #1f2937;
        border-radius: 16px;
        padding: 22px;
        box-shadow: 0 18px 60px #0004;
      }

      #cep-account-panel h2 {
        margin: 0 0 8px;
        font-size: 22px;
      }

      #cep-account-panel p {
        font-size: 13px;
        line-height: 1.45;
      }

      #cep-account-panel label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        margin: 14px 0 6px;
      }

      #cep-account-panel input {
        display: block;
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 11px;
        font: 15px Arial, sans-serif;
        background: #fff;
        color: #111827;
      }

      #cep-account-panel .cep-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
      }

      #cep-account-panel button {
        border: 0;
        border-radius: 8px;
        padding: 10px 13px;
        background: #1f2937;
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }

      #cep-account-panel button.cep-secondary {
        background: #e5e7eb;
        color: #111827;
      }

      #cep-account-close {
        float: right;
        background: transparent !important;
        color: #374151 !important;
        font-size: 22px;
        padding: 0 5px !important;
      }

      #cep-account-status {
        min-height: 18px;
        margin: 12px 0 0;
        font-size: 13px;
      }

      @media print {
        #cep-account-toolbar,
        #cep-account-overlay {
          display: none !important;
        }
      }

      @media (max-width: 600px) {
        #cep-account-toolbar {
          right: 5px;
          gap: 6px;
        }

        #cep-account-toolbar button {
          width: 72px;
          min-height: 40px;
          font-size: 12px;
        }
      }

      body.dark-mode #cep-account-panel {
        background: #24272b;
        color: #e5e7eb;
      }

      body.dark-mode #cep-account-panel input {
        background: #17191c;
        color: #f9fafb;
        border-color: #62676e;
      }

      body.dark-mode #cep-account-panel button.cep-secondary {
        background: #454a52;
        color: #fff;
      }

      body.dark-mode #cep-account-close {
        color: #e5e7eb !important;
      }
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
      <section
        id="cep-account-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cep-account-heading"
      >
        <button type="button" id="cep-account-close" aria-label="Close">×</button>

        <h2 id="cep-account-heading">Case Evidence Package</h2>

        <p id="cep-account-description">
          Sign in or create an account to save your work online.
        </p>

        <div id="cep-account-form">
          <label for="cep-username">Username</label>
          <input
            id="cep-username"
            name="username"
            autocomplete="username"
            maxlength="24"
            spellcheck="false"
          >

          <label for="cep-password">Password</label>
          <input
            id="cep-password"
            name="password"
            type="password"
            autocomplete="current-password"
            minlength="6"
          >

          <p style="color:#6b7280;margin-bottom:0">
            Usernames: 3–24 letters, numbers, underscores, or hyphens.
            Passwords must be at least 6 characters.
          </p>

          <div class="cep-actions">
            <button type="button" id="cep-login">Log in</button>
            <button type="button" id="cep-signup" class="cep-secondary">
              Sign up
            </button>
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

    status(
      currentUser
        ? `You are signed in as ${currentUsername || 'your account'}.`
        : ''
    );

    if (!currentUser) byId('cep-username').focus();
  }

  function updateAuthUI() {
    const signedIn = Boolean(currentUser);

    byId('cep-account-form').hidden = signedIn;
    byId('cep-signed-in').hidden = !signedIn;

    byId('cep-account-open').textContent = signedIn
      ? `👤 ${currentUsername || 'Account'}`
      : '👤 Account';

    byId('cep-signed-in-label').textContent = signedIn
      ? `Signed in as ${currentUsername}. Your saved work is stored under this account.`
      : '';
  }

  // ------------------------------------------------------------
  // ACCOUNT MANAGEMENT
  // ------------------------------------------------------------

  async function signup() {
    if (busy) return;

    const username = cleanUsername(byId('cep-username').value);
    const password = byId('cep-password').value;

    if (!USERNAME_PATTERN.test(username)) {
      return status(
        'Use 3–24 letters, numbers, underscores, or hyphens for your username.',
        true
      );
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

      const reservation = await database
        .ref('usernames/' + normalized)
        .transaction(existing =>
          existing === null ? credential.user.uid : undefined
        );

      if (!reservation.committed) {
        try {
          await credential.user.delete();
        } catch (_) {}

        await auth.signOut();

        throw Object.assign(
          new Error('That username is already taken.'),
          { code: 'cep/username-taken' }
        );
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
          try {
            await database.ref('usernames/' + normalized).remove();
          } catch (_) {}
        }

        try {
          await credential.user.delete();
        } catch (_) {}

        try {
          await auth.signOut();
        } catch (_) {}
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

    if (!USERNAME_PATTERN.test(username)) {
      return status('Enter a valid username.', true);
    }

    if (!password) {
      return status('Enter your password.', true);
    }

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

  // ------------------------------------------------------------
  // STABLE PAGE AND FIELD IDENTIFIERS
  // ------------------------------------------------------------

  function controlsFor(page) {
    return Array.from(
      page.querySelectorAll('input, textarea, select')
    ).filter(element =>
      !element.matches(EXCLUDED_CONTROLS) &&
      !element.disabled
    );
  }

  function makeId(prefix) {
    const random =
      window.crypto &&
      typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

    return `${prefix}-${random}`;
  }

  function ensurePageId(page, usedIds) {
    let id = String(page.dataset.cepSaveId || '').trim();

    // Cloned pages can inherit an existing save ID. Never allow duplicates.
    if (!id || usedIds.has(id)) {
      id = makeId('cep-page');
      page.dataset.cepSaveId = id;
    }

    usedIds.add(id);
    return id;
  }

  function ensureFieldId(element, usedIds) {
    let id = String(element.dataset.cepFieldId || '').trim();

    // Duplicated controls can inherit IDs too. Correct them before saving.
    if (!id || usedIds.has(id)) {
      id = makeId('cep-field');
      element.dataset.cepFieldId = id;
    }

    usedIds.add(id);
    return id;
  }

  function typeOfControl(element) {
    return String(element.type || element.tagName || '').toLowerCase();
  }

  // ------------------------------------------------------------
  // TEMPLATE IDENTIFICATION
  // ------------------------------------------------------------

  function structureSignature(root) {
    if (!root) return '';

    const transientClasses = new Set([
      'is-selected',
      'hidden',
      'active'
    ]);

    return [root, ...root.querySelectorAll('*')]
      .map(element => {
        const classes = Array.from(element.classList || [])
          .filter(name => !transientClasses.has(name))
          .sort()
          .join('.');

        const tag = element.tagName.toLowerCase();
        const type = element.getAttribute('type') || '';
        const name = element.getAttribute('name') || '';
        const id = element.id || '';
        const label = element.getAttribute('data-page-label') || '';

        return `${tag}#${id}.${classes}[${type}][${name}][${label}]`;
      })
      .join('|');
  }

  function findTemplateIdForPage(page) {
    const declared = page.dataset.cepTemplateId;

    if (
      declared &&
      document.getElementById(declared)?.tagName === 'TEMPLATE'
    ) {
      return declared;
    }

    const signature = structureSignature(page);
    if (!signature) return null;

    for (const template of document.querySelectorAll('template[id]')) {
      const templatePage = template.content.querySelector('.page');

      if (
        templatePage &&
        structureSignature(templatePage) === signature
      ) {
        page.dataset.cepTemplateId = template.id;
        return template.id;
      }
    }

    return null;
  }

  // ------------------------------------------------------------
  // SAVING PAGE STRUCTURE AND FIELD VALUES
  // ------------------------------------------------------------

  function clonePageForSave(page) {
    const clone = page.cloneNode(true);

    clone.classList.remove('is-selected');
    clone.dataset.selected = 'false';
    clone.style.outline = 'none';
    clone.style.boxShadow = '';

    // Do not embed uploaded image bytes in the saved markup.
    clone.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';

      if (/^data:image\//i.test(src)) {
        img.removeAttribute('src');
        img.style.display = 'none';
      }
    });

    // Browser file selections cannot be restored from a save.
    clone.querySelectorAll('input[type="file"]').forEach(input => {
      input.removeAttribute('value');
    });

    return clone;
  }

  function readControlValue(element) {
    const type = typeOfControl(element);

    if (type === 'checkbox' || type === 'radio') {
      return Boolean(element.checked);
    }

    if (element.tagName === 'SELECT' && element.multiple) {
      return Array.from(element.options)
        .filter(option => option.selected)
        .map(option => option.value);
    }

    return element.value;
  }

  function captureForm() {
    const pages = Array.from(document.querySelectorAll('.page'));

    if (!pages.length) {
      throw new Error('No document pages were found to save.');
    }

    if (pages.length > 200) {
      throw new Error(
        'The packet has too many pages to save safely (maximum 200).'
      );
    }

    const pageHTML = [];
    const fields = [];
    const usedPageIds = new Set();

    let selectedPageId = null;

    pages.forEach((page, pageIndex) => {
      const pageId = ensurePageId(page, usedPageIds);

      if (
        page.classList.contains('is-selected') ||
        page.dataset.selected === 'true'
      ) {
        selectedPageId = pageId;
      }

      const usedFieldIds = new Set();
      const controls = controlsFor(page);

      controls.forEach(element => {
        ensureFieldId(element, usedFieldIds);
      });

      const templateId = findTemplateIdForPage(page);
      const savedPage = clonePageForSave(page);

      pageHTML.push({
        id: pageId,
        templateId,
        html: savedPage.outerHTML
      });

      controls.forEach((element, fieldIndex) => {
        fields.push({
          pageId,
          fieldId: element.dataset.cepFieldId,
          page: pageIndex,
          index: fieldIndex,
          type: typeOfControl(element),
          value: readControlValue(element)
        });
      });
    });

    return {
      version: 5,
      savedAt: Date.now(),
      selectedPageId,
      pageHTML,
      fields
    };
  }

  // ------------------------------------------------------------
  // SAFE PAGE MARKUP PARSING
  // ------------------------------------------------------------

  function sanitizePageElement(page) {
    page
      .querySelectorAll('script, iframe, object, embed, base')
      .forEach(node => node.remove());

    [page, ...page.querySelectorAll('*')].forEach(element => {
      Array.from(element.attributes || []).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = String(attribute.value || '').trim().toLowerCase();

        if (name.startsWith('on')) {
          element.removeAttribute(attribute.name);
        }

        if (
          (name === 'href' || name === 'src' || name === 'xlink:href') &&
          value.startsWith('javascript:')
        ) {
          element.removeAttribute(attribute.name);
        }
      });
    });

    return page;
  }

  function parseSavedPageHTML(html, index) {
    if (typeof html !== 'string' || html.length > 2_000_000) {
      throw new Error(
        `Saved page ${index + 1} is invalid or too large.`
      );
    }

    const holder = document.createElement('template');
    holder.innerHTML = html.trim();

    const page = holder.content.firstElementChild;

    if (
      !page ||
      !page.classList ||
      !page.classList.contains('page')
    ) {
      throw new Error(
        `Saved page ${index + 1} does not contain a valid .page element.`
      );
    }

    return sanitizePageElement(page);
  }

  // ------------------------------------------------------------
  // PAGE NAVIGATOR
  // ------------------------------------------------------------

  function refreshPageNavigator(pages) {
    const grids = [
      document.getElementById('page-nav-grid')
    ];

    // The page navigator is inside a shadow root in source.html.
    document.querySelectorAll('*').forEach(element => {
      if (element.shadowRoot) {
        const shadowGrid =
          element.shadowRoot.getElementById('page-nav-grid');

        if (shadowGrid) grids.push(shadowGrid);
      }
    });

    const uniqueGrids = Array.from(
      new Set(grids.filter(Boolean))
    );

    uniqueGrids.forEach(grid => {
      grid.innerHTML = '';

      pages.forEach((page, index) => {
        const button = document.createElement('button');

        button.type = 'button';
        button.className =
          'dt-page-btn' +
          (index < 33 ? ' page-original' : ' page-extra');

        button.dataset.page = String(index + 1);

        const text = (page.textContent || '').toLowerCase();

        const labels = [
          [/crime scene entry log/, 'entry'],
          [/evidence recovery log/, 'recovery'],
          [/triangulation method/, 'triangulation'],
          [/measurement record/, 'measurement'],
          [/chain of custody|custody report/, 'custody'],
          [/rough sketch/, 'sketch'],
          [/case narrative/, 'narrative'],
          [/crime scene photograph|photo description/, 'photo'],
          [/briefing from/, 'briefing'],
          [/scene description/, 'scene'],
          [/team preparation|health & safety hazards/, 'prep'],
          [/additional notes|supplemental field/, 'notes']
        ];

        const label =
          (labels.find(([pattern]) => pattern.test(text)) || [null, 'case'])[1];

        button.title =
          index < 33 ? 'Original packet page' : 'Added page';

        button.innerHTML = `
          <span class="dt-page-number">${index + 1}</span>
          <small class="dt-page-label">${label}</small>
        `;

        grid.appendChild(button);
      });
    });

    const heading = document.querySelector(
      '#tab-pages .dt-section-title'
    );

    if (heading) {
      heading.textContent = `Case Pages (Total: ${pages.length})`;
    }
  }

  function attachRestoredPageSelection(pages) {
    pages.forEach(page => {
      if (page.__cepRestoreSelectionBound) return;

      page.__cepRestoreSelectionBound = true;

      page.addEventListener('click', () => {
        Array.from(document.querySelectorAll('.page')).forEach(other => {
          other.style.outline = 'none';
          other.style.boxShadow = '';
          other.dataset.selected = 'false';
          other.classList.remove('is-selected');
        });

        page.style.outline = '2px solid #00bcd4';
        page.style.boxShadow = '0 0 0 4px rgba(0,188,212,0.15)';
        page.dataset.selected = 'true';
        page.classList.add('is-selected');
      });
    });
  }

  // ------------------------------------------------------------
  // RESTORE THE COMPLETE SAVED PAGE ORDER
  // ------------------------------------------------------------

  function restorePageStructure(saved) {
    if (!Array.isArray(saved.pageHTML)) {
      return Array.from(document.querySelectorAll('.page'));
    }

    if (
      saved.pageHTML.length < 1 ||
      saved.pageHTML.length > 200
    ) {
      throw new Error('The saved page list is invalid.');
    }

    const oldPages = Array.from(document.querySelectorAll('.page'));

    if (!oldPages.length) {
      throw new Error('The current document has no pages to replace.');
    }

    const firstOld = oldPages[0];
    const parent = firstOld.parentNode;

    if (!parent) {
      throw new Error('Could not locate the document page container.');
    }

    // Parse every saved page before changing the live document.
    const usedSavedPageIds = new Set();

    const prepared = saved.pageHTML.map((item, index) => {
      const html = typeof item === 'string'
        ? item
        : item && item.html;

      if (typeof html !== 'string') {
        throw new Error(
          `Saved page ${index + 1} has no page markup.`
        );
      }

      const id =
        typeof item === 'object' && item
          ? item.id
          : null;

      let templateId =
        typeof item === 'object' && item
          ? item.templateId
          : null;

      const page = parseSavedPageHTML(html, index);

      if (
        !templateId ||
        document.getElementById(templateId)?.tagName !== 'TEMPLATE'
      ) {
        templateId = findTemplateIdForPage(page);
      }

      let uniqueId = id
        ? String(id)
        : `legacy-${index}`;

      // Repair duplicate IDs in older saves.
      if (usedSavedPageIds.has(uniqueId)) {
        uniqueId = makeId('cep-page');
      }

      usedSavedPageIds.add(uniqueId);

      return {
        page,
        id: uniqueId,
        originalId: id ? String(id) : null,
        templateId
      };
    });

    // Retain template-level styles, but replace the template page itself with
    // the saved markup. This keeps customized page content and layout.
    const fragments = prepared.map(({ page, templateId, id }) => {
      page.dataset.cepSaveId = id;

      if (templateId) {
        page.dataset.cepTemplateId = templateId;
      }

      let fragment = document.createDocumentFragment();

      if (templateId) {
        const template = document.getElementById(templateId);
        const templateFragment = template.content.cloneNode(true);
        const templatePage = templateFragment.querySelector('.page');

        if (templatePage) {
          templatePage.replaceWith(page);
          fragment = templateFragment;
        } else {
          fragment.appendChild(page);
        }
      } else {
        fragment.appendChild(page);
      }

      return { fragment, page, id };
    });

    // Inserting before the same anchor preserves saved order.
    fragments.forEach(({ fragment }) => {
      parent.insertBefore(fragment, firstOld);
    });

    oldPages.forEach(page => page.remove());

    const restoredPages = fragments.map(item => item.page);

    restoredPages.forEach((page, index) => {
      page.dataset.cepSaveId = prepared[index].id;
      page.classList.remove('is-selected');
      page.dataset.selected = 'false';
      page.style.outline = 'none';
      page.style.boxShadow = '';
    });

    attachRestoredPageSelection(restoredPages);
    renumberRestoredPages(restoredPages);
    refreshPageNavigator(restoredPages);

    document.dispatchEvent(
      new CustomEvent('cep:pages-restored', {
        detail: {
          pageCount: restoredPages.length
        }
      })
    );

    return restoredPages;
  }

  function renumberRestoredPages(pages) {
    pages.forEach((page, index) => {
      const number = String(index + 1);

      const footer = page.querySelector('.page-footer');

      if (footer) {
        footer.textContent = number;
      }

      page.querySelectorAll('.dynamic-page-num').forEach(element => {
        element.textContent = number;
      });
    });
  }

  function selectRestoredPage(pages, savedPageId) {
    const page =
      pages.find(item =>
        item.dataset.cepSaveId === String(savedPageId || '')
      ) || pages[0];

    if (!page) return;

    pages.forEach(item => {
      item.classList.remove('is-selected');
      item.dataset.selected = 'false';
      item.style.outline = 'none';
      item.style.boxShadow = '';
    });

    page.classList.add('is-selected');
    page.dataset.selected = 'true';
    page.style.outline = '2px solid #00bcd4';
    page.style.boxShadow = '0 0 0 4px rgba(0,188,212,0.15)';
  }

  // ------------------------------------------------------------
  // RESTORE FORM VALUES
  // ------------------------------------------------------------

  function applyForm(saved) {
    if (!saved || !Array.isArray(saved.fields)) {
      throw new Error('This saved record has an invalid format.');
    }

    let pages = Array.from(document.querySelectorAll('.page'));

    if (Array.isArray(saved.pageHTML)) {
      pages = restorePageStructure(saved);
    }

    if (!pages.length) {
      throw new Error('No pages were available to restore.');
    }

    const pageById = new Map();
    const savedIdCounts = new Map();

    if (Array.isArray(saved.pageHTML)) {
      saved.pageHTML.forEach(item => {
        const id =
          typeof item === 'object' && item
            ? item.id
            : null;

        if (id) {
          savedIdCounts.set(
            String(id),
            (savedIdCounts.get(String(id)) || 0) + 1
          );
        }
      });
    }

    pages.forEach((page, index) => {
      const id = page.dataset.cepSaveId || `legacy-${index}`;

      if (!pageById.has(id)) {
        pageById.set(id, page);
      }
    });

    let restored = 0;
    let skipped = 0;

    saved.fields.forEach(field => {
      if (!field || typeof field !== 'object') {
        skipped++;
        return;
      }

      const duplicatedLegacyPageId =
        field.pageId &&
        (savedIdCounts.get(String(field.pageId)) || 0) > 1;

      let page =
        !duplicatedLegacyPageId && field.pageId
          ? pageById.get(String(field.pageId))
          : null;

      // Positional fallback supports older saves and repairs records whose
      // page IDs were duplicated by page cloning in previous versions.
      if (
        !page &&
        Number.isInteger(field.page) &&
        field.page >= 0
      ) {
        page = pages[field.page];
      }

      if (!page) {
        skipped++;
        return;
      }

      const controls = controlsFor(page);
      let element = null;

      if (field.fieldId) {
        element = controls.find(control =>
          control.dataset.cepFieldId === String(field.fieldId)
        ) || null;
      }

      // Backward compatibility for V1–V4 positional records.
      if (
        !element &&
        Number.isInteger(field.index) &&
        field.index >= 0
      ) {
        const candidate = controls[field.index];

        if (
          candidate &&
          (
            !field.type ||
            typeOfControl(candidate) === String(field.type).toLowerCase()
          )
        ) {
          element = candidate;
        }
      }

      if (
        !element ||
        (
          field.type &&
          typeOfControl(element) !== String(field.type).toLowerCase()
        )
      ) {
        skipped++;
        return;
      }

      if (
        field.type === 'checkbox' ||
        field.type === 'radio' ||
        element.type === 'checkbox' ||
        element.type === 'radio'
      ) {
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
        element.value =
          field.value == null
            ? ''
            : String(field.value);
      }

      element.dispatchEvent(
        new Event('input', { bubbles: true })
      );

      element.dispatchEvent(
        new Event('change', { bubbles: true })
      );

      restored++;
    });

    renumberRestoredPages(pages);
    selectRestoredPage(pages, saved.selectedPageId);
    refreshPageNavigator(pages);

    document.dispatchEvent(
      new CustomEvent('cep:pages-restored', {
        detail: {
          pageCount: pages.length,
          restoredFields: restored,
          skippedFields: skipped
        }
      })
    );

    return {
      restored,
      skipped,
      pages: pages.length
    };
  }

  // ------------------------------------------------------------
  // SAVE AND LOAD
  // ------------------------------------------------------------

  async function saveWork() {
    if (busy || !(await requireSignedIn())) return;

    setBusy(true);

    try {
      const ref = database.ref(
        `users/${currentUser.uid}/data`
      );

      const existing = await ref.once('value');

      if (
        existing.exists() &&
        !window.confirm(
          'You already have saved work. Overwrite that save with the current document?'
        )
      ) {
        status('Save canceled. Your previous save was not changed.');
        return;
      }

      const payload = captureForm();

      await ref.set(payload);

      alert(
        `Saved ${payload.fields.length} fields across ` +
        `${payload.pageHTML.length} pages (format v5). ` +
        'Uploaded images are not included.'
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
        'Load your saved work? This replaces the current pages and form values. ' +
        'Unsaved changes will be lost. Uploaded images are not restored.'
      )
    ) {
      status('Load canceled. The current document was not changed.');
      return;
    }

    setBusy(true);

    try {
      const snapshot = await database
        .ref(`users/${currentUser.uid}/data`)
        .once('value');

      if (!snapshot.exists()) {
        alert('There is no saved work for this account yet.');
        return;
      }

      const result = applyForm(snapshot.val());

      alert(
        `Loaded ${result.restored} fields across ${result.pages} pages.` +
        (
          result.skipped
            ? ` ${result.skipped} fields could not be matched.`
            : ''
        ) +
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

  // ------------------------------------------------------------
  // STARTUP
  // ------------------------------------------------------------

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

            currentUsername =
              profile.val() ||
              (user.email ? user.email.split('@')[0] : 'Account');
          } catch (_) {
            currentUsername =
              user.email ? user.email.split('@')[0] : 'Account';
          }
        }

        updateAuthUI();

        status(
          user
            ? `Signed in as ${currentUsername}.`
            : 'Not signed in.'
        );
      });
    } catch (error) {
      status(
        error.message || 'Could not initialize Firebase.',
        true
      );

      console.error('[CEP Account System]', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {
      once: true
    });
  } else {
    start();
  }
})();
