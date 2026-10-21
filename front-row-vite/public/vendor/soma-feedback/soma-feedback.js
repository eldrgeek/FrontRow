/*!
 * soma-feedback.js — SOMA App Standard §8
 * v3 — 2026-07-05: single Submit, clarity/clarify loop, build-by-intent
 * server classification, and silent Google One Tap admin-token detection.
 * v3.1 — 2026-07-05: also send window.__somaAdminToken (Yeshie-injected,
 * no-login admin identity) as adminToken alongside googleIdToken.
 * v3.2 — 2026-07-10: capture a bounded, sanitized visible-page-content
 * snapshot (pageText) alongside url/title so the intake AI has real page
 * context, not just a URL. Additive — backends that ignore the field are
 * unaffected. See feedback item 6dfa6acc.
 * v3.3 — 2026-07-15 (soma-feedback chip v3): opening the chip now offers two
 * registers — "Request a change" (unchanged, existing clarify/build-intent
 * flow below) and "Leave a review / say thanks" (new). Review submissions
 * post with kind:"review", a freeform text + optional 1-5 star signal, and
 * NEVER enter the clarify loop or the build-by-intent path — they are
 * recognition surfaced to the team, not build-queue work items. Mike, viewing
 * the soma-briefings partnership page (2026-07-15): "I'd like to say 'Thank
 * you' there, not here."
 * v4.1 — 2026-08-07: introduce-once. First time a visitor opens the panel, a
 * one-line intro shows above the composer; it's marked seen immediately and
 * never shown again from this browser. Mirrors the pattern already built for
 * Bill on Legends (soma-guide.js's `<namespace>:<id>:introduced` localStorage
 * gate) — Mike: "recover that flow and do something like it for all SOMA
 * affordances." The gate itself (`affordanceIntroduced`/
 * `markAffordanceIntroduced` below) is written as a small, self-contained,
 * copy-once snippet — not an import — because this widget is explicitly
 * zero-dependency/single-file by design (see distribution note below), same
 * as soma-guide.js; an ES-module extraction would break that model. See
 * SOMA/standards/SOMA-AFFORDANCE-INTRO-ONCE.md for the documented pattern so
 * the next affordance copies this instead of hand-rolling it (as Quinn's
 * admin-changelog.html did for Legends).
 * v4.2 — 2026-09-16: the tab can be dragged anywhere, and each site remembers
 * where it was put, per browser (Mike: "letting the feedback chip be draggable
 * as a SOMA standard and remember location per instance"; per site, per
 * browser, ruled the same day). Found because the tab sat exactly on Live
 * Edit's "Edit copy" button. A tap still opens the panel: a drag only starts
 * after 5px of movement. Arrow keys move the focused tab (Shift for bigger
 * steps) and Home puts it back in the default corner. The panel and the toast
 * open toward the middle of the screen from wherever the tab is. Position is
 * kept as offsets from the nearest corner, so a resize keeps the tab where it
 * was and clamps it back into view. Also carries the opt-in fresh-build
 * checker (SOMA 4f63b3c), which shipped without a version line.
 * v4.3 — 2026-09-16: the pageText snapshot also strips every element marked
 * `data-feedback-skip` (and everything inside it), so a page can keep
 * sensitive rendered data — prices, identity labels, detail JSON — out of
 * feedback submissions. Asked for by Locke's security review of fleet-views
 * (2026-09-16, finding 7). No other behavior change; page-text-check.mjs.
 * v4.4 — 2026-10-09: compact until hovered (Mike: "make it small unless
 * hovered"). At rest the tab is a 32px speech-bubble icon; hover or keyboard
 * focus grows it to the labelled pill. Hover never opens the panel: opening
 * stays a click, tap or Enter. Touch devices stay compact. Also an opt-in
 * "Show me" mode (soma-feedback-showme.js, loaded on demand): point at the
 * page, talk, a fast model repeats back, a smarter one proposes the fix. It
 * appears only when the script tag carries a data-showme endpoint.
 *
 * A single embeddable, framework-free feedback widget: a bottom-left tab
 * opens a compact panel where a participant can say what should change.
 * The server may ask clarifying questions; the widget resends the full
 * conversation each turn because the backend is stateless.
 *
 * Zero dependencies. Copy this file + soma-feedback.css into any static
 * site, then add:
 *
 *   <link rel="stylesheet" href="/vendor/soma-feedback/soma-feedback.css">
 *   <script src="/vendor/soma-feedback/soma-feedback.js"
 *           data-site="my-site-name"
 *           data-endpoint="https://vpsmikewolf.duckdns.org/feedback-svc/feedback"
 *           defer></script>
 *
 * Config via data-* attributes on the script tag:
 *   data-endpoint          optional; defaults to the SOMA VPS feedback svc.
 *   data-site              optional; short app/site identifier.
 *   data-label             optional; tab label, default "Feedback".
 *   data-area              optional; coarse origin label.
 *   data-google-client-id  optional; Google Identity Services client ID.
 *
 * Optional fresh-build checking: declare <meta name="soma-build" content="SHA">
 * and serve /version.json as {"build":"SHA"}. Sites with drafts/saves expose
 * window.SOMA_HAS_UNSAVED = function () { return dirty || saving; }.
 * See SOMA-STD-fresh-build.md for the complete opt-in contract.
 *
 * Optional page-level global:
 *   window.somaFeedbackIdentity — function returning { name, email } or a
 *   Promise of it. Values populate blank fields when the panel opens, but
 *   never overwrite fields a user has actively edited this session.
 */
(function () {
  'use strict';

  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  var DEFAULT_ENDPOINT = 'https://vpsmikewolf.duckdns.org/feedback-svc/feedback';
  var DEFAULT_GOOGLE_CLIENT_ID = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';

  // After a successful submission, the panel shows "Accepted ✓" for this long
  // before re-arming itself for a second item (long enough to register as a
  // confirmation, short enough not to feel stuck).
  var ACCEPTED_REARM_DELAY_MS = 1400;
  // Once re-armed, if the reporter hasn't typed anything by this point the
  // panel auto-closes on its own (Mike's ask: "if nothing happens after a
  // little bit ... it closes"). Any keystroke in the textarea cancels this.
  var INACTIVITY_AUTOCLOSE_MS = 8000;

  // Bound on the visible-page-content snapshot sent alongside url/title (2026-
  // 07-10 feedback #6dfa6acc: "does the feedback form capture ... the page's
  // contents ... so the intake AI has clear context"). Kept small on purpose —
  // this rides along with every submission, not just ones that need it.
  var PAGE_TEXT_MAX_CHARS = 2000;

  function currentScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (/soma-feedback\.js/.test(scripts[i].src)) return scripts[i];
    }
    return null;
  }

  var script = currentScript();
  var endpoint = (script && script.getAttribute('data-endpoint')) || DEFAULT_ENDPOINT;
  var site = (script && script.getAttribute('data-site')) || document.title || 'unknown-site';
  var label = (script && script.getAttribute('data-label')) || 'Feedback';
  var scriptArea = (script && script.getAttribute('data-area')) || '';
  // data-no-google opts a site out of Google Sign-In entirely (e.g. PlayMaker,
  // which verifies admin status via its own Supabase session instead —
  // see window.somaFeedbackAuthHeader below). Without this, EVERY site got a
  // silent GIS One Tap prompt against DEFAULT_GOOGLE_CLIENT_ID whether or not
  // it set data-google-client-id, which 401s ("no registered origin") on any
  // domain not in that shared OAuth client's authorized-origins list.
  var noGoogle = script && script.hasAttribute('data-no-google');
  var googleClientId = noGoogle ? '' : ((script && script.getAttribute('data-google-client-id')) || DEFAULT_GOOGLE_CLIENT_ID);

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') e.textContent = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function svgEl(tag, attrs, children) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }

  function loadRemembered(field) {
    try { return window.localStorage.getItem('soma-feedback:' + field) || ''; }
    catch (_) { return ''; }
  }
  function remember(field, value) {
    try { window.localStorage.setItem('soma-feedback:' + field, value); }
    catch (_) { /* localStorage may be unavailable; non-fatal. */ }
  }

  // ── Introduce-once (v4.1) ──────────────────────────────────────────────
  // A generalizable, copy-once primitive for "this SOMA affordance should
  // greet a visitor the first time it's used, and never again." Namespaced
  // as `soma-affordance:<namespace>:<id>:introduced` so it can never collide
  // with soma-guide.js's own `soma-guide:<persona.id>:introduced` keys, even
  // on a page running both widgets. `namespace` identifies the KIND of
  // affordance (e.g. 'soma-feedback'); `id` identifies WHICH instance (here,
  // the site). Documented as the canonical copy-source in
  // SOMA/standards/SOMA-AFFORDANCE-INTRO-ONCE.md.
  function affordanceIntroduced(namespace, id) {
    try { return window.localStorage.getItem('soma-affordance:' + namespace + ':' + id + ':introduced') === '1'; }
    catch (_) { return false; } // no localStorage — fail open (never withhold the intro) rather than fail closed (nag forever)
  }
  function markAffordanceIntroduced(namespace, id) {
    try { window.localStorage.setItem('soma-affordance:' + namespace + ':' + id + ':introduced', '1'); }
    catch (_) { /* localStorage may be unavailable; non-fatal — worst case, greets again next time. */ }
  }

  // Optional per-site auth-header hook: window.somaFeedbackAuthHeader, sync or
  // async, returning a full "Bearer ..." string or null. Additive — a site
  // without this (14 of 15 today) just sends no Authorization header, same as
  // before. PlayMaker wires this to its own Supabase session (see
  // src/lib/somaFeedbackAuth.ts) so its own backend can verify admin status
  // server-side instead of via this widget's Google Sign-In.
  function resolveAuthHeader(cb) {
    var hook = window.somaFeedbackAuthHeader;
    if (typeof hook !== 'function') { cb(null); return; }
    try {
      var result = hook();
      if (result && typeof result.then === 'function') {
        result.then(function (v) { cb(v || null); }, function () { cb(null); });
      } else {
        cb(result || null);
      }
    } catch (err) {
      console.warn('[soma-feedback] somaFeedbackAuthHeader threw, ignoring:', err);
      cb(null);
    }
  }

  function resolveIdentity(cb) {
    var hook = window.somaFeedbackIdentity;
    if (typeof hook !== 'function') { cb(null); return; }
    try {
      var result = hook();
      if (result && typeof result.then === 'function') {
        result.then(function (v) { cb(v || null); }, function () { cb(null); });
      } else {
        cb(result || null);
      }
    } catch (err) {
      console.warn('[soma-feedback] somaFeedbackIdentity threw, ignoring:', err);
      cb(null);
    }
  }

  var mount = el('div', { class: 'soma-feedback-root' });

  var tabIcon = svgEl('svg', {
    class: 'soma-feedback-tab-icon',
    viewBox: '0 0 24 24',
    width: '16',
    height: '16',
    'aria-hidden': 'true',
    focusable: 'false',
  }, [
    svgEl('path', {
      d: 'M5 4.75h14a2.25 2.25 0 0 1 2.25 2.25v8A2.25 2.25 0 0 1 19 17.25h-7.1L7.2 20.6v-3.35H5A2.25 2.25 0 0 1 2.75 15V7A2.25 2.25 0 0 1 5 4.75Z',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
      'stroke-linejoin': 'round',
    }),
  ]);
  // The visible word stays "Feedback" (as before this change); the site's
  // longer data-label remains the accessible name.
  var tabLabel = el('span', { class: 'soma-feedback-tab-label', text: 'Feedback' });
  var tab = el('button', {
    class: 'soma-feedback-tab',
    type: 'button',
    'aria-expanded': 'false',
    'aria-label': label + ' — under construction, tell us what to change',
  }, [tabIcon, tabLabel]);

  var panel = el('div', { class: 'soma-feedback-panel', hidden: 'hidden' });

  var heading = el('div', { class: 'soma-feedback-heading' }, [
    el('strong', { text: label }),
    el('span', { class: 'soma-feedback-microcopy', text: 'Under construction — tell us what to change.' }),
  ]);
  var closeBtn = el('button', { class: 'soma-feedback-close', type: 'button', 'aria-label': 'Close' }, [document.createTextNode('×')]);
  heading.appendChild(closeBtn);

  // v4.1 introduce-once: a single line shown ONLY the first time this
  // browser ever opens the panel. Content lives here (not in CSS) so it can
  // change without touching layout rules.
  var introLine = el('div', {
    class: 'soma-feedback-intro',
    hidden: 'hidden',
    text: 'Hi — I’m here whenever you want to leave feedback.',
  });

  // v3.3 mode chooser — first thing shown when the panel opens (unless mid a
  // request-flow clarify loop, see openPanel). Two registers, kept genuinely
  // separate: a review never touches the clarify/build-intent machinery below.
  var chooseRequestBtn = el('button', { class: 'soma-feedback-mode-choice', type: 'button' }, [
    el('strong', { text: 'Request a change' }),
    el('span', { class: 'soma-feedback-mode-choice-sub', text: 'Something to fix or build.' }),
  ]);
  var chooseReviewBtn = el('button', { class: 'soma-feedback-mode-choice', type: 'button' }, [
    el('strong', { text: 'Leave a review / say thanks' }),
    el('span', { class: 'soma-feedback-mode-choice-sub', text: 'Appreciation, in context — not a build request.' }),
  ]);
  var modeChooser = el('div', { class: 'soma-feedback-mode-chooser' }, [chooseRequestBtn, chooseReviewBtn]);
  var modeSwitch = el('button', { class: 'soma-feedback-mode-switch', type: 'button', hidden: 'hidden' }, [
    document.createTextNode('‹ choose a different type'),
  ]);

  // Visible confirmation of what context is being attached — otherwise a
  // reporter has no way to tell whether the app/page/area is actually
  // captured, since it's collected silently into the payload. Recomputed
  // every time the panel opens (currentArea() re-reads the live DOM, so a
  // single-page-app route change while the tab was closed is picked up).
  var contextLine = el('div', { class: 'soma-feedback-context' });

  var textarea = el('textarea', {
    class: 'soma-feedback-textarea',
    placeholder: 'What should we change? Be as specific as you can.',
    rows: '5',
  });

  var nameInput = el('input', { class: 'soma-feedback-input', type: 'text', placeholder: 'Your name', value: loadRemembered('name') });
  var emailInput = el('input', { class: 'soma-feedback-input', type: 'email', placeholder: 'Your email (optional)', value: loadRemembered('email') });
  var honeypot = el('input', { class: 'soma-feedback-hp', type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });

  var submitBtn = el('button', { class: 'soma-feedback-submit', type: 'button' }, [document.createTextNode('Submit')]);
  // "Show me" is opt-in per site: data-showme="<converse endpoint>" on this
  // script tag turns it on. Sites without it never see the button, because
  // the conversation needs a server endpoint the site provides.
  var showMeEndpoint = (script && script.getAttribute('data-showme')) || '';
  var showMeBtn = showMeEndpoint
    ? el('button', { class: 'soma-feedback-showme-launch', type: 'button' }, [document.createTextNode('Show me')])
    : null;
  var actions = el('div', { class: 'soma-feedback-actions' }, showMeBtn ? [showMeBtn, submitBtn] : [submitBtn]);
  var statusLine = el('div', { class: 'soma-feedback-status', 'aria-live': 'polite' });
  // v4: the one-tap lane correction, shown only in the acknowledgment and only
  // when the lane was inferred rather than stated by a human.
  var kindCorrection = el('div', { class: 'soma-feedback-kind-correction', hidden: 'hidden' });

  var thread = el('div', { class: 'soma-feedback-thread', hidden: 'hidden', 'aria-live': 'polite' });
  var clarifyReply = el('textarea', {
    class: 'soma-feedback-clarify-input',
    placeholder: 'Reply with the missing detail.',
    rows: '3',
  });
  var clarifySend = el('button', { class: 'soma-feedback-clarify-send', type: 'button' }, [document.createTextNode('Send')]);
  var clarifyControls = el('div', { class: 'soma-feedback-clarify-controls', hidden: 'hidden' }, [clarifyReply, clarifySend]);

  var retryBtn = el('button', { class: 'soma-feedback-retry', type: 'button', hidden: 'hidden' }, [document.createTextNode('Retry')]);

  var footer = el('div', { class: 'soma-feedback-footer' }, [
    el('span', { class: 'soma-feedback-footer-text', text: 'Build requests are detected by intent.' }),
  ]);
  var adminLink = el('button', {
    class: 'soma-feedback-admin-link',
    type: 'button',
    'aria-label': 'Sign in as an admin with Google',
  }, [document.createTextNode('admin')]);
  if (noGoogle) adminLink.hidden = true; // no Google flow to trigger — the site verifies admin via its own session instead
  else footer.appendChild(adminLink);

  // v3.3: the entire existing request flow, unchanged in behavior, now lives
  // in its own section that's shown only after "Request a change" is chosen.
  var requestSection = el('div', { class: 'soma-feedback-request-section', hidden: 'hidden' });
  requestSection.appendChild(textarea);
  requestSection.appendChild(actions);
  requestSection.appendChild(statusLine);
  requestSection.appendChild(kindCorrection);
  requestSection.appendChild(thread);
  requestSection.appendChild(clarifyControls);
  requestSection.appendChild(retryBtn);
  requestSection.appendChild(footer);

  // v3.3 review section — freeform text + optional 1-5 star signal. No
  // clarify loop, no build-intent detection, no admin gate: a review always
  // posts with kind:"review" and the backend never routes it into the build
  // queue (see feedback-svc handleFeedback: kind==='review' short-circuits
  // before the clarity/build-intent path entirely).
  var reviewTextarea = el('textarea', {
    class: 'soma-feedback-textarea',
    placeholder: 'Say thanks, or tell the team what landed well.',
    rows: '5',
  });
  var starButtons = [1, 2, 3, 4, 5].map(function (n) {
    return el('button', {
      class: 'soma-feedback-star',
      type: 'button',
      'data-value': String(n),
      'aria-label': 'Rate ' + n + ' of 5 (optional)',
      'aria-pressed': 'false',
    }, [document.createTextNode('★')]);
  });
  var starRow = el('div', { class: 'soma-feedback-star-row' }, starButtons);
  var reviewSubmitBtn = el('button', { class: 'soma-feedback-submit', type: 'button' }, [document.createTextNode('Send')]);
  var reviewActions = el('div', { class: 'soma-feedback-actions' }, [reviewSubmitBtn]);
  var reviewStatusLine = el('div', { class: 'soma-feedback-status', 'aria-live': 'polite' });
  var reviewFooter = el('div', { class: 'soma-feedback-footer' }, [
    el('span', { class: 'soma-feedback-footer-text', text: 'Shared with the team as recognition — never becomes a build item.' }),
  ]);
  var reviewSection = el('div', { class: 'soma-feedback-review-section', hidden: 'hidden' });
  reviewSection.appendChild(reviewTextarea);
  reviewSection.appendChild(starRow);
  reviewSection.appendChild(reviewActions);
  reviewSection.appendChild(reviewStatusLine);
  reviewSection.appendChild(reviewFooter);

  panel.appendChild(heading);
  panel.appendChild(introLine);
  panel.appendChild(contextLine);
  // v4 (2026-08-02, Mike: "feedback should not require the extra click to say
  // whether it is a request or a compliment"). The chooser and the mode switch
  // are BUILT but never mounted — the elements stay so the review section, the
  // stars, and every handler below keep working unchanged for the correction
  // flow, while the fork that used to greet you is simply gone. One box, one
  // Send; the server infers the lane from the content and the acknowledgment
  // says which one it picked, with one tap to move it.
  //
  // Deliberately not deleted outright: the review path is still reachable, and
  // ripping the DOM out would mean rewriting reviewSection's whole state
  // machine in the same pass that changes what 18 live sites do.
  void modeSwitch;
  void modeChooser;
  panel.appendChild(nameInput);
  panel.appendChild(emailInput);
  panel.appendChild(honeypot);
  panel.appendChild(requestSection);
  panel.appendChild(reviewSection);
  mount.appendChild(panel);
  mount.appendChild(tab);

  // A larger, higher-contrast confirmation toast that sits BESIDE the widget
  // (not inside the dialog) so an accepted submission is unmistakable — Mike's
  // ask, 2026-07-07 feedback #5 ("a toast that uses a little bit more real
  // estate, not necessarily in the dialog box itself, but beside it") and #3
  // ("accepted-into-build-queue items should notify the reporter"). Appended to
  // the widget root so it inherits the fixed bottom-left anchor; CSS lifts it
  // above the tab.
  var toast = el('div', {
    class: 'soma-feedback-toast',
    role: 'status',
    'aria-live': 'assertive',
    hidden: 'hidden',
  });
  mount.appendChild(toast);
  var toastTimer = null;
  function showToast(msg) {
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = null; }
    toast.textContent = msg;
    toast.hidden = false;
    // Force reflow so the enter transition runs even on a rapid re-show.
    // eslint-disable-next-line no-unused-expressions
    toast.offsetHeight;
    toast.classList.add('soma-feedback-toast--show');
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('soma-feedback-toast--show');
      toastTimer = window.setTimeout(function () { toast.hidden = true; }, 300);
    }, 6000);
  }

  // ── Draggable, remembered position (v4.2) ──────────────────────────────
  // Stored per site in this browser, as offsets from the nearest corner:
  // {ax:'left'|'right', ox, ay:'top'|'bottom', oy}. No saved position means the
  // CSS default corner, untouched, so a chip nobody moved looks exactly as before.
  var POSITION_KEY = 'position:' + ((script && script.getAttribute('data-site')) || window.location.host || 'site');
  var DRAG_THRESHOLD_PX = 5;
  var EDGE_MARGIN_PX = 8;
  var ignoreNextClick = false;   // the click a browser fires at the end of a drag
  var drag = null;
  tab.setAttribute('title', 'Drag to move. Arrow keys move it; Home puts it back.');
  tab.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Home');

  function viewport() {
    return { w: document.documentElement.clientWidth || window.innerWidth, h: window.innerHeight };
  }
  function readPosition() {
    try {
      var p = JSON.parse(loadRemembered(POSITION_KEY) || 'null');
      var ok = p && (p.ax === 'left' || p.ax === 'right') && (p.ay === 'top' || p.ay === 'bottom')
        && isFinite(p.ox) && isFinite(p.oy);
      return ok ? p : null;
    } catch (_) { return null; }
  }
  // Top-left corner (x, y) of a w×h tab -> a corner-anchored position, clamped
  // so the whole tab stays on screen.
  function positionFromBox(x, y, w, h) {
    var v = viewport();
    x = Math.round(Math.min(Math.max(x, EDGE_MARGIN_PX), Math.max(EDGE_MARGIN_PX, v.w - w - EDGE_MARGIN_PX)));
    y = Math.round(Math.min(Math.max(y, EDGE_MARGIN_PX), Math.max(EDGE_MARGIN_PX, v.h - h - EDGE_MARGIN_PX)));
    var ax = (x + w / 2) < v.w / 2 ? 'left' : 'right';
    var ay = (y + h / 2) < v.h / 2 ? 'top' : 'bottom';
    return {
      ax: ax, ox: Math.round(ax === 'left' ? x : v.w - x - w),
      ay: ay, oy: Math.round(ay === 'top' ? y : v.h - y - h),
    };
  }
  function setPositionStyles(p) {
    var s = mount.style;
    if (!p) {
      s.left = s.right = s.top = s.bottom = '';
      mount.classList.remove('soma-feedback-root--moved');
      return;
    }
    s.left = p.ax === 'left' ? p.ox + 'px' : 'auto';
    s.right = p.ax === 'right' ? p.ox + 'px' : 'auto';
    s.top = p.ay === 'top' ? p.oy + 'px' : 'auto';
    s.bottom = p.ay === 'bottom' ? p.oy + 'px' : 'auto';
    mount.classList.add('soma-feedback-root--moved');
  }
  // The panel and the toast open toward the middle of the screen, and the
  // panel is shifted sideways and height-capped so it never leaves the screen.
  function placePanel() {
    var moved = mount.classList.contains('soma-feedback-root--moved');
    var r = tab.getBoundingClientRect();
    var v = viewport();
    var alignRight = moved && (r.left + r.width / 2) > v.w / 2;
    var openDown = moved && (r.top + r.height / 2) < v.h / 2;
    mount.classList.toggle('soma-feedback-root--align-right', alignRight);
    mount.classList.toggle('soma-feedback-root--open-down', openDown);
    if (!moved) {
      panel.style.left = panel.style.right = panel.style.maxHeight = '';
      return;
    }
    var room = openDown ? v.h - r.bottom - 8 - EDGE_MARGIN_PX : r.top - 8 - EDGE_MARGIN_PX;
    panel.style.maxHeight = Math.max(160, room) + 'px';
    if (panel.hidden) return;
    var pw = panel.offsetWidth;
    if (alignRight) {
      panel.style.left = 'auto';
      panel.style.right = Math.min(0, r.right - pw - EDGE_MARGIN_PX) + 'px';
    } else {
      panel.style.right = 'auto';
      panel.style.left = Math.min(0, v.w - EDGE_MARGIN_PX - (r.left + pw)) + 'px';
    }
  }
  // Re-apply the saved position, clamped to the current viewport (not saved:
  // a narrow window must not overwrite where the tab lives on a wide one).
  function applyPosition() {
    var p = readPosition();
    setPositionStyles(p);
    if (p) {
      var r = tab.getBoundingClientRect();
      setPositionStyles(positionFromBox(r.left, r.top, r.width, r.height));
    }
    placePanel();
  }
  function savePosition(p) {
    remember(POSITION_KEY, JSON.stringify(p));
    setPositionStyles(p);
    placePanel();
  }
  function resetPosition() {
    try { window.localStorage.removeItem('soma-feedback:' + POSITION_KEY); } catch (_) { /* non-fatal */ }
    setPositionStyles(null);
    placePanel();
  }

  tab.addEventListener('pointerdown', function (e) {
    ignoreNextClick = false;
    if (e.button !== 0) return;
    var r = tab.getBoundingClientRect();
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, moved: false };
    // Capture now, not when the drag starts: a fast pointer is already off the
    // 44px tab by its first move event, and those events would go to the page.
    // A tap still ends in a click on the tab.
    try { tab.setPointerCapture(e.pointerId); } catch (_) { /* no capture: moves are seen while over the tab */ }
  });
  tab.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.sx) < DRAG_THRESHOLD_PX && Math.abs(e.clientY - drag.sy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      mount.classList.add('soma-feedback-root--dragging');
    }
    e.preventDefault();
    setPositionStyles(positionFromBox(e.clientX - drag.dx, e.clientY - drag.dy, drag.w, drag.h));
    placePanel();
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      mount.classList.remove('soma-feedback-root--dragging');
      var r = tab.getBoundingClientRect();
      savePosition(positionFromBox(r.left, r.top, r.width, r.height));
      ignoreNextClick = true;
    }
    drag = null;
  }
  tab.addEventListener('pointerup', endDrag);
  tab.addEventListener('pointercancel', endDrag);
  // The click that follows a drag is not a tap. Capture phase, so it runs
  // before the open/close handler registered below.
  tab.addEventListener('click', function (e) {
    // Only that one click. A new press or keypress clears it, so a browser that
    // fires no click after a captured drag cannot eat the next real tap.
    if (ignoreNextClick) { ignoreNextClick = false; e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  tab.addEventListener('keydown', function (e) {
    ignoreNextClick = false;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var step = e.shiftKey ? 64 : 16;
    var r = tab.getBoundingClientRect();
    var x = r.left;
    var y = r.top;
    if (e.key === 'ArrowLeft') x -= step;
    else if (e.key === 'ArrowRight') x += step;
    else if (e.key === 'ArrowUp') y -= step;
    else if (e.key === 'ArrowDown') y += step;
    else if (e.key === 'Home') { e.preventDefault(); resetPosition(); return; }
    else return;
    e.preventDefault();
    savePosition(positionFromBox(x, y, r.width, r.height));
  });
  var resizeFrame = 0;
  window.addEventListener('resize', function () {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(function () { resizeFrame = 0; applyPosition(); });
  });

  // Fresh build: opt-in, copy-once, zero dependencies. Mike Wolf + Codex,
  // 2026-09-11. See SOMA-STD-fresh-build.md for the host contract.
  function startFreshBuild() {
    var meta = document.querySelector('meta[name="soma-build"]');
    var loaded = meta && meta.content.trim();
    if (!loaded || typeof window.fetch !== 'function') return;
    var pending = '';
    var active = false;
    var fetching = false;
    var humanOnly = false;
    var attempted = false;
    var lastActivity = Date.now();
    var banner;
    var storageKey = 'soma-feedback:fresh-build:guard';

    function unsaved() {
      try {
        return (typeof window.SOMA_HAS_UNSAVED === 'function' && window.SOMA_HAS_UNSAVED()) ||
          requestInFlight || reviewInFlight || textarea.value.trim() ||
          reviewTextarea.value.trim() || clarifyReply.value.trim() || pendingQuestion;
      } catch (_) { return true; }
    }
    function showBanner() {
      if (banner) return;
      var button = el('button', { type: 'button', text: 'Reload' });
      banner = el('div', { class: 'soma-feedback-fresh-build', role: 'status' }, [
        document.createTextNode('A newer version is ready — '), button,
      ]);
      button.addEventListener('click', function () {
        // This generic widget cannot flush a site's saves. Keep drafts intact.
        if (unsaved()) {
          button.textContent = 'Save your work, then Reload';
          return;
        }
        window.location.reload();
      });
      document.body.appendChild(banner);
    }
    function reserveReload() {
      try {
        var raw = window.sessionStorage.getItem(storageKey);
        var guard = raw ? JSON.parse(raw) : { builds: [], times: [] };
        if (!guard || !Array.isArray(guard.builds) || !Array.isArray(guard.times) ||
            !guard.builds.every(function (b) { return typeof b === 'string'; }) ||
            !guard.times.every(function (t) { return typeof t === 'number' && isFinite(t); })) return false;
        var now = Date.now();
        guard.times = guard.times.filter(function (t) { return now - t < 600000; });
        // Latch the loaded build, so stale HTML cannot loop even if deployments change.
        if (guard.builds.indexOf(loaded) !== -1 || guard.times.length >= 2) return false;
        guard.builds.push(loaded);
        guard.times.push(now);
        var encoded = JSON.stringify(guard);
        window.sessionStorage.setItem(storageKey, encoded);
        return window.sessionStorage.getItem(storageKey) === encoded;
      } catch (_) { return false; } // Fail closed when durability is unavailable.
    }
    function reconsider() {
      if (!pending || attempted) return;
      if (unsaved()) humanOnly = true;
      if (humanOnly) { showBanner(); return; }
      var focused = document.activeElement;
      while (focused && focused.shadowRoot && focused.shadowRoot.activeElement) {
        focused = focused.shadowRoot.activeElement;
      }
      var editing = focused && (focused.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName));
      var dialog = Array.prototype.some.call(
        document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"]'),
        function (node) { return !node.hidden && window.getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length > 0; }
      );
      if (document.visibilityState !== 'visible' || editing || dialog ||
          !panel.hidden || Date.now() - lastActivity < 30000) { showBanner(); return; }
      if (!reserveReload()) { humanOnly = true; showBanner(); return; }
      attempted = true;
      window.location.reload();
    }
    function check() {
      if (fetching || attempted) return;
      fetching = true;
      Promise.resolve().then(function () {
        return window.fetch('/version.json', { cache: 'no-store' });
      }).then(function (response) {
        if (!response.ok) throw new Error('unavailable');
        return response.json();
      }).then(function (data) {
        if (!data || typeof data.build !== 'string' || !data.build.trim()) return;
        if (!active) {
          active = true;
          window.setInterval(check, 300000);
          window.setInterval(reconsider, 1000);
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') check();
          });
        }
        pending = data.build.trim() !== loaded ? data.build.trim() : '';
        if (!pending && banner) { banner.remove(); banner = null; }
        reconsider();
      }).catch(function () { /* Missing file, SPA HTML, offline: silent. */ })
        .then(function () {
          fetching = false;
          if (!active) activityEvents.forEach(function (event) {
            document.removeEventListener(event, recordActivity, true);
          });
        });
    }
    // Observe activity during the initial probe too; never infer idle from fetch time.
    function recordActivity() { lastActivity = Date.now(); }
    var activityEvents = ['keydown', 'input', 'pointerdown', 'pointermove', 'touchstart', 'scroll', 'focusin'];
    activityEvents.forEach(function (event) {
      document.addEventListener(event, recordActivity, { capture: true, passive: true });
    });
    check(); // No polling or visibility retries until this probe validates the contract.
  }

  function ready() {
    document.body.appendChild(mount);
    applyPosition();
    startFreshBuild();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }

  var nameTouched = false;
  var emailTouched = false;
  var requestInFlight = false;
  var phase = 'idle';
  var conversation = [];
  var pendingQuestion = '';
  var currentRetry = null;
  var googleIdToken = '';
  var gisLoading = false;
  var gisLoaded = false;
  var gisInitialized = false;
  var silentGoogleAttempted = false;
  var lastElementHint = '';
  var lastArea = '';
  var acceptedRearmTimer = null;
  var inactivityCloseTimer = null;
  // Set true after the backend returns a 'refine' response (feedback #11): the
  // NEXT submit is the human confirming the clarified restatement, so it carries
  // confirmedRefine:true and the backend files it directly instead of looping.
  var pendingRefineConfirm = false;

  // v4: opens straight into the composer. Was `null` (show the chooser first);
  // the chooser is no longer mounted, so there is nothing to choose and the
  // panel is a single box from the moment it opens. 'review' is still reachable
  // — only now by correcting the inference after the fact, not by predicting it
  // before typing.
  var mode = 'request';
  // The text of the submission the acknowledgment is currently describing, so
  // the one-tap correction can re-file the same words in the other lane.
  var lastSubmittedText = '';
  var reviewInFlight = false;
  var reviewPhase = 'idle'; // idle | processing | accepted | error
  var reviewRating = 0;
  var reviewAcceptedRearmTimer = null;

  function closestArea(node) {
    while (node && node !== document) {
      if (node.getAttribute && node.getAttribute('data-area')) return node.getAttribute('data-area');
      node = node.parentElement;
    }
    return '';
  }

  function currentArea() {
    return scriptArea ||
      (script && closestArea(script)) ||
      lastArea ||
      closestArea(document.activeElement) ||
      (document.body && document.body.getAttribute('data-area')) ||
      '';
  }

  function describeElement(node) {
    if (!node || node === document.body || node === document.documentElement) return '';
    var tag = node.tagName ? node.tagName.toLowerCase() : '';
    var text = (node.textContent || '').trim().slice(0, 80);
    var id = node.id ? '#' + node.id : '';
    var cls = node.className && typeof node.className === 'string'
      ? '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    return [tag + id + cls, text].filter(Boolean).join(' — ');
  }

  function captureOrigin(target) {
    lastArea = closestArea(target) || lastArea;
    lastElementHint = describeElement(target) || lastElementHint;
  }

  document.addEventListener('contextmenu', function (e) { captureOrigin(e.target); }, true);
  document.addEventListener('click', function (e) {
    if (!mount.contains(e.target)) captureOrigin(e.target);
  }, true);
  document.addEventListener('focusin', function (e) {
    if (!mount.contains(e.target)) lastArea = closestArea(e.target) || lastArea;
  }, true);
  document.addEventListener('mouseup', function () {
    var sel = window.getSelection && window.getSelection();
    if (sel && String(sel).trim().length > 0) {
      lastElementHint = 'selected text: "' + String(sel).trim().slice(0, 120) + '"';
      lastArea = closestArea(sel.anchorNode && sel.anchorNode.parentElement) || lastArea;
    }
  });

  function applyIdentity(identity) {
    if (!identity) return;
    if (identity.name && !nameTouched && !nameInput.value.trim()) nameInput.value = identity.name;
    if (identity.email && !emailTouched && !emailInput.value.trim()) emailInput.value = identity.email;
  }

  nameInput.addEventListener('input', function () { nameTouched = true; });
  emailInput.addEventListener('input', function () { emailTouched = true; });

  function setStatus(msg, kind) {
    statusLine.textContent = msg || '';
    statusLine.className = 'soma-feedback-status' + (kind ? ' soma-feedback-status--' + kind : '');
  }

  function setTabResult(kind) {
    tab.classList.remove('soma-feedback-tab--result-success', 'soma-feedback-tab--result-error');
    if (kind) tab.classList.add('soma-feedback-tab--result-' + kind);
  }
  function clearTabResult() { setTabResult(null); }

  function focusableInPanel() {
    var candidates = panel.querySelectorAll(
      'button:not([disabled]):not([tabindex="-1"]), ' +
      'input:not([disabled]):not([tabindex="-1"]), ' +
      'textarea:not([disabled]):not([tabindex="-1"]), ' +
      '[tabindex]:not([tabindex="-1"])'
    );
    return Array.prototype.filter.call(candidates, function (node) {
      return !node.hidden && node.offsetParent !== null;
    });
  }

  function trapTabKey(e) {
    if (e.key !== 'Tab' || panel.hidden) return;
    var items = focusableInPanel();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function clearAcceptedRearmTimer() {
    if (acceptedRearmTimer) {
      window.clearTimeout(acceptedRearmTimer);
      acceptedRearmTimer = null;
    }
  }

  function clearInactivityCloseTimer() {
    if (inactivityCloseTimer) {
      window.clearTimeout(inactivityCloseTimer);
      inactivityCloseTimer = null;
    }
  }

  // Arms (or re-arms) the auto-close-on-inactivity countdown. Only relevant
  // right after a re-arm following acceptance — any typing, submitting, or
  // explicit close cancels it (see textarea 'input' listener, postCurrent,
  // and closePanel below).
  function armInactivityAutoClose() {
    clearInactivityCloseTimer();
    inactivityCloseTimer = window.setTimeout(function () {
      inactivityCloseTimer = null;
      closePanel(true);
    }, INACTIVITY_AUTOCLOSE_MS);
  }

  function resetFlow(preserveText) {
    phase = 'idle';
    conversation = [];
    pendingQuestion = '';
    currentRetry = null;
    thread.hidden = true;
    clarifyControls.hidden = true;
    clarifyReply.value = '';
    retryBtn.hidden = true;
    // NOTE: the lane correction is deliberately NOT cleared here. resetFlow runs
    // from rearmAfterAccept 1400ms after the acknowledgment — clearing it there
    // gave the correction a 1.4-second lifetime, which is no affordance at all.
    // It belongs to the submission just acknowledged, so it is cleared when the
    // NEXT one starts (beginSubmit) or the panel closes, not when the composer
    // rearms. Found by clicking it in a browser and having it already be gone.
    if (!preserveText) textarea.value = '';
    // A refine-confirm only applies to the exact clarified text we put in the
    // box; a full reset (new/cleared item) drops it.
    if (!preserveText) pendingRefineConfirm = false;
    updateControls();
  }

  function updateControls() {
    var lockedForClarify = !thread.hidden && phase !== 'idle';
    var locked = requestInFlight || lockedForClarify || phase === 'accepted' ||
      reviewInFlight || reviewPhase === 'accepted';
    textarea.disabled = requestInFlight || lockedForClarify || phase === 'accepted';
    nameInput.disabled = locked;
    emailInput.disabled = locked;
    submitBtn.disabled = requestInFlight || phase === 'accepted' || !thread.hidden;
    retryBtn.disabled = requestInFlight;
    clarifyReply.disabled = requestInFlight || phase !== 'clarify' || !pendingQuestion;
    clarifySend.disabled = requestInFlight || phase !== 'clarify' || !pendingQuestion;

    var reviewLocked = reviewInFlight || reviewPhase === 'accepted';
    reviewTextarea.disabled = reviewLocked;
    reviewSubmitBtn.disabled = reviewLocked;
    starButtons.forEach(function (b) { b.disabled = reviewLocked; });
  }

  // Shows the chooser, or the section for whichever mode is active. Called on
  // open and every time mode changes.
  function renderMode() {
    modeChooser.hidden = mode !== null;
    modeSwitch.hidden = mode === null;
    requestSection.hidden = mode !== 'request';
    reviewSection.hidden = mode !== 'review';
    nameInput.hidden = mode === null;
    emailInput.hidden = mode === null;
  }

  function resetReviewFlow() {
    reviewPhase = 'idle';
    reviewInFlight = false;
    reviewTextarea.value = '';
    reviewRating = 0;
    starButtons.forEach(function (b) {
      b.classList.remove('soma-feedback-star--selected');
      b.setAttribute('aria-pressed', 'false');
    });
    reviewStatusLine.textContent = '';
    reviewStatusLine.className = 'soma-feedback-status';
  }

  chooseRequestBtn.addEventListener('click', function () {
    mode = 'request';
    renderMode();
    updateControls();
    textarea.focus();
  });
  chooseReviewBtn.addEventListener('click', function () {
    mode = 'review';
    renderMode();
    updateControls();
    reviewTextarea.focus();
  });
  modeSwitch.addEventListener('click', function () {
    mode = null;
    renderMode();
  });
  starButtons.forEach(function (btn, idx) {
    btn.addEventListener('click', function () {
      var val = idx + 1;
      reviewRating = reviewRating === val ? 0 : val; // click the same star again to clear
      starButtons.forEach(function (b, i) {
        var selected = i < reviewRating;
        b.classList.toggle('soma-feedback-star--selected', selected);
        b.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    });
  });

  function openPanel() {
    // v4.1 introduce-once: check BEFORE marking, so this open is the one
    // that shows it. Every open after this one — including a reload, a new
    // tab, or a fresh session — reads the same localStorage key and finds
    // it already set, so the line never shows again from this browser.
    if (!affordanceIntroduced('soma-feedback', site)) {
      introLine.hidden = false;
      markAffordanceIntroduced('soma-feedback', site);
    } else {
      introLine.hidden = true;
    }
    if (phase === 'accepted') resetFlow(false);
    if (reviewPhase === 'accepted') resetReviewFlow();
    // v4: reopen at the composer. This used to reset to `null`, meaning "show
    // the chooser" — with no chooser mounted that reset hid the entire panel
    // body, leaving a header and nothing to type into. Caught in a browser; no
    // unit test would have seen it, because every individual element was
    // correct and only the mode they were switched by was gone.
    if (mode !== 'review') mode = 'request';
    renderMode();
    panel.hidden = false;
    placePanel();   // v4.2: open toward the middle of the screen from wherever the tab is
    tab.setAttribute('aria-expanded', 'true');
    clearTabResult();
    var area = currentArea();
    contextLine.textContent = 'Reporting from: ' + site + (area ? ' — ' + area : '') + ' (page content included)';
    resolveIdentity(applyIdentity);
    attemptSilentGoogleCredential();
    updateControls();
    if (mode === null) chooseRequestBtn.focus();
    else if (phase === 'clarify') clarifyReply.focus();
    else if (mode === 'review') reviewTextarea.focus();
    else textarea.focus();
  }

  function closePanel(force) {
    if (panel.hidden) return;
    if ((requestInFlight || reviewInFlight) && !force) return;
    var focusWasInPanel = panel.contains(document.activeElement);
    clearAcceptedRearmTimer();
    clearInactivityCloseTimer();
    // The correction is scoped to the acknowledgment on screen; closing ends it.
    clearKindCorrection();
    if (reviewAcceptedRearmTimer) { window.clearTimeout(reviewAcceptedRearmTimer); reviewAcceptedRearmTimer = null; }
    if (phase === 'clarify' || phase === 'error') resetFlow(true);
    panel.hidden = true;
    tab.setAttribute('aria-expanded', 'false');
    if (focusWasInPanel) tab.focus();
  }

  tab.addEventListener('click', function () {
    if (panel.hidden) openPanel(); else closePanel();
  });
  closeBtn.addEventListener('click', function () { closePanel(); });
  panel.addEventListener('keydown', trapTabKey);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });

  function stampTime(ts) {
    var stamp = ts ? new Date(ts) : new Date();
    if (Number.isNaN(stamp.getTime())) stamp = new Date();
    return String(stamp.getHours()).padStart(2, '0') + ':' + String(stamp.getMinutes()).padStart(2, '0');
  }

  // A bounded, sanitized snapshot of the visible page content, sent alongside
  // url/title so the intake AI (and whoever reviews the item) has real page
  // context, not just a URL. Deliberately conservative about what it reads:
  //   - scripts/styles are stripped (their text isn't "content" and script
  //     source is a real leak risk);
  //   - every input/textarea/select/[type=password] is stripped BEFORE
  //     reading text, so no typed value (including this widget's own text
  //     box, name/email fields, or a password field on the host page) can
  //     ever end up in the snapshot;
  //   - any element marked [data-feedback-skip] is stripped with all of its
  //     descendants, so a host page can keep sensitive rendered data
  //     (prices, identity labels, detail JSON) out of the snapshot (v4.3);
  //   - this widget's own DOM (.soma-feedback-root) is stripped, so a
  //     reporter's own feedback text and the clarify thread never get
  //     captured as "page content";
  //   - the result is whitespace-collapsed and capped to
  //     PAGE_TEXT_MAX_CHARS. Optional field — additive, ignored by any
  //     backend that doesn't ask for it.
  function capturePageText() {
    try {
      var root = document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        document.body;
      if (!root) return '';
      var clone = root.cloneNode(true);
      var strip = clone.querySelectorAll(
        'script, style, noscript, input, textarea, select, ' +
        '[type="password"], [data-feedback-skip], .soma-feedback-root'
      );
      Array.prototype.forEach.call(strip, function (node) {
        if (node.parentNode) node.parentNode.removeChild(node);
      });
      // textContent (not innerText) — the clone is detached from the
      // document, so it has no layout box, and innerText is layout-dependent
      // and returns '' for detached nodes in most engines.
      var text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
      return text.slice(0, PAGE_TEXT_MAX_CHARS);
    } catch (err) {
      console.warn('[soma-feedback] page content capture failed:', err);
      return '';
    }
  }

  function makePayload() {
    var payload = {
      site: site,
      page: document.title || '',
      url: window.location.href,
      area: currentArea(),
      text: textarea.value.trim(),
      name: nameInput.value.trim() || 'anonymous',
      email: emailInput.value.trim(),
      elementHint: lastElementHint,
      pageText: capturePageText(),
      hp: honeypot.value,
      conversation: conversation.slice(),
    };
    if (googleIdToken) payload.googleIdToken = googleIdToken;
    // Yeshie admin identity: no-login path. If the Yeshie extension has
    // injected window.__somaAdminToken (see yeshie/packages/extension
    // content script), send it as adminToken. The VPS feedback-svc
    // compares it (constant-time) against SOMA_ADMIN_TOKEN and, on match,
    // sets isAdmin=true — additive to the Google-token path, not a
    // replacement. Only meaningful in Mike's own Chrome; harmless no-op
    // (undefined, omitted) everywhere else.
    if (window.__somaAdminToken) payload.adminToken = window.__somaAdminToken;
    // The reporter has reviewed the clarified restatement and is submitting it
    // (feedback #11) — tell the backend to file it directly, not re-clarify.
    if (pendingRefineConfirm) payload.confirmedRefine = true;
    return payload;
  }

  // Small public bridge for the lazily-loaded Show me companion. Keep the
  // companion independent from this widget's private state machine while
  // reusing the same verified auth and intake path.
  window.somaFeedbackWidget = {
    converseEndpoint: showMeEndpoint,
    resolveAuthHeader: function () {
      return new Promise(function (resolve) { resolveAuthHeader(resolve); });
    },
    closePanel: function () { closePanel(true); },
    submitShowMe: function (text, fullConversation) {
      return new Promise(function (resolve, reject) {
        resolveAuthHeader(function (authHeader) {
          var payload = makePayload();
          payload.text = String(text || '').trim();
          payload.conversation = [];
          (Array.isArray(fullConversation) ? fullConversation : []).forEach(function (turn) {
            var content = String(turn && turn.content || '');
            for (var offset = 0; offset < content.length; offset += 3900) {
              payload.conversation.push({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: content.slice(offset, offset + 3900) });
            }
          });
          payload.confirmedRefine = true;
          var headers = { 'Content-Type': 'application/json' };
          if (authHeader) headers.Authorization = authHeader;
          fetch(endpoint, {
            method: 'POST', headers: headers, body: JSON.stringify(payload),
          }).then(function (response) {
            if (!response.ok) throw new Error('status ' + response.status);
            return response.json();
          }).then(resolve, reject);
        });
      });
    },
  };

  var showMeLoading = false;
  if (showMeBtn) showMeBtn.addEventListener('click', function () {
    closePanel(true);
    if (window.somaFeedbackShowMe && typeof window.somaFeedbackShowMe.open === 'function') {
      window.somaFeedbackShowMe.open(window.somaFeedbackWidget);
      return;
    }
    if (showMeLoading) return;
    showMeLoading = true;
    var base = script && script.src ? script.src.replace(/soma-feedback\.js(?:\?.*)?$/, '') : '/vendor/soma-feedback/';
    var stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = base + 'soma-feedback-showme.css';
    document.head.appendChild(stylesheet);
    var companion = document.createElement('script');
    companion.src = base + 'soma-feedback-showme.js';
    companion.onload = function () {
      showMeLoading = false;
      if (window.somaFeedbackShowMe) window.somaFeedbackShowMe.open(window.somaFeedbackWidget);
    };
    companion.onerror = function () { showMeLoading = false; showToast('Could not open Show me just now.'); };
    document.head.appendChild(companion);
  });

  function renderThread() {
    thread.textContent = '';
    var visibleTurns = 0;
    conversation.forEach(function (turn, index) {
      if (index === 0 && turn.role === 'user') return;
      visibleTurns += 1;
      thread.appendChild(el('div', {
        class: 'soma-feedback-bubble soma-feedback-bubble--' + turn.role,
        text: turn.content,
      }));
    });
    if (pendingQuestion) {
      thread.appendChild(el('div', {
        class: 'soma-feedback-bubble soma-feedback-bubble--assistant',
        text: pendingQuestion,
      }));
    }
    thread.hidden = visibleTurns === 0 && !pendingQuestion;
  }

  function handleClarify(question) {
    phase = 'clarify';
    pendingQuestion = String(question || 'What detail would help us file this correctly?');
    setStatus('One quick clarification needed.');
    retryBtn.hidden = true;
    clarifyControls.hidden = false;
    clarifyReply.value = '';
    renderThread();
    updateControls();
    clarifyReply.focus();
  }

  // Re-arms the panel after an "Accepted ✓" confirmation: back to a fresh,
  // empty, ready-to-type idle state so a second item can be filed without
  // closing/reopening. Guarded on phase still being 'accepted' — if the
  // reporter already closed the panel (closePanel clears this timer) or
  // reopened it (which also resets the flow) before this fires, this is a
  // no-op rather than clobbering whatever state they're now in.
  function rearmAfterAccept() {
    acceptedRearmTimer = null;
    if (phase !== 'accepted') return;
    resetFlow(false);
    // Keep the acknowledgment on screen while a lane correction is still being
    // offered. Clearing it left "Meant it as a change request?" floating with no
    // statement of what was actually filed — an offer to fix something the
    // person can no longer see.
    if (kindCorrection.hidden) setStatus('');
    clearTabResult();
    if (!panel.hidden) {
      textarea.focus();
      armInactivityAutoClose();
    }
  }

  /**
   * Lane correction (v4): "we filed it as X; one tap if it was really Y."
   * (Not written as "v4 —": soma-chip-check.py reads the last line of that
   * shape as the chip's version, and this one made every build read as v4.)
   *
   * Only rendered when the server says the lane was INFERRED. If a human already
   * told us (i.e. this IS the correction), we do not ask again — being asked to
   * confirm your own correction is worse than the guess was.
   */
  function clearKindCorrection() {
    kindCorrection.hidden = true;
    kindCorrection.innerHTML = '';
    lastSubmittedText = '';
  }

  function renderKindCorrection(wasInferred, kind) {
    kindCorrection.innerHTML = '';
    if (!wasInferred) {
      kindCorrection.hidden = true;
      return;
    }
    var other = kind === 'review' ? 'request' : 'review';
    var prompt = kind === 'review'
      ? 'Meant it as a change request?'
      : 'Just saying thanks?';
    var action = kind === 'review' ? 'File it as a request' : 'Send it as a thank-you';
    var label = el('span', { class: 'soma-feedback-kind-correction-text', text: prompt + ' ' });
    var btn = el('button', {
      class: 'soma-feedback-kind-correction-btn',
      type: 'button',
      text: action,
    });
    btn.addEventListener('click', function () {
      correctKind(other, btn);
    });
    kindCorrection.appendChild(label);
    kindCorrection.appendChild(btn);
    kindCorrection.hidden = false;
  }

  /**
   * Re-file the same words in the other lane, with `kind` set explicitly so the
   * server records it as a human judgment rather than re-inferring and getting
   * the same answer.
   *
   * This files a SECOND card rather than moving the first: both lanes are
   * already-sent emails to the board, and there is nothing to retract. The
   * estate's existing answer to that shape is to supersede and say so, not to
   * pretend the first never happened.
   */
  function correctKind(kind, btn) {
    if (!lastSubmittedText) return;
    btn.disabled = true;
    btn.textContent = 'Moving…';
    var payload = makePayload();
    payload.text = lastSubmittedText;
    payload.kind = kind;
    payload.conversation = [];
    resolveAuthHeader(function (authHeader) {
      var headers = { 'Content-Type': 'application/json' };
      if (authHeader) headers['Authorization'] = authHeader;
      fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(payload) })
        .then(function (resp) {
          if (!resp.ok) throw new Error('status ' + resp.status);
          return resp.json();
        })
        .then(function () {
          kindCorrection.hidden = true;
          var moved = kind === 'review'
            ? 'Moved ✓ — filed as a thank-you instead.'
            : 'Moved ✓ — filed as a change request instead.';
          setStatus(moved, 'success');
          showToast('✓ ' + moved);
        })
        .catch(function (err) {
          console.error('[soma-feedback] kind correction failed:', err);
          btn.disabled = false;
          btn.textContent = 'Try again';
        });
    });
  }

  function handleAccepted(data) {
    var build = !!(data && data.build);
    var queueCount = data && typeof data.queueCount === 'number' ? data.queueCount : null;
    var kind = data && data.kind === 'review' ? 'review' : 'request';
    phase = 'accepted';
    retryBtn.hidden = true;
    thread.hidden = true;
    clarifyControls.hidden = true;
    var msg;
    if (kind === 'review') {
      msg = 'Sent as a thank-you ✓ — the team will see it (' + stampTime(data && data.filedAt) + ')';
    } else if (build && queueCount !== null) {
      msg = 'Accepted ✓ — ' + queueCount + ' item' + (queueCount === 1 ? '' : 's') + ' in queue (' + stampTime(data && data.filedAt) + ')';
    } else if (build) {
      msg = 'Accepted ✓ — queued to build (' + stampTime(data && data.filedAt) + ')';
    } else {
      msg = 'Filed ✓ — the team has it (' + stampTime(data && data.filedAt) + ')';
    }
    // v4: name the lane we picked and offer exactly one tap to move it. This is
    // the whole reason the up-front chooser could go away — the cost of a wrong
    // guess is one click AFTER the fact, paid only when we are wrong, instead of
    // one click BEFORE the fact, paid by everyone every time. The correction is
    // also the only ground truth the classifier ever gets, so it is logged.
    renderKindCorrection(data && data.kindInferred, kind);
    setStatus(msg, 'success');
    setTabResult('success');
    // The prominent, beside-the-dialog confirmation (feedback #3/#5). The
    // in-panel status above still shows too, but this is the one that reads as
    // "yes, it landed" even out of the corner of your eye.
    showToast(build ? '✓ ' + msg.replace(/^Accepted ✓ — /, 'Accepted into the build queue — ') : '✓ ' + msg);
    // This submission is settled — the next one starts clean.
    pendingRefineConfirm = false;
    textarea.value = '';
    lastElementHint = '';
    updateControls();
    clearAcceptedRearmTimer();
    acceptedRearmTimer = window.setTimeout(rearmAfterAccept, ACCEPTED_REARM_DELAY_MS);
  }

  // The backend clarified a poorly-qualified request and wants the human to
  // review it before it's filed (feedback #11). Put the clarified text back in
  // the input box so both the intake agent and the reporter see and agree on
  // the same words; the reporter edits if needed, then Submit files it.
  function handleRefine(clarified) {
    phase = 'idle';
    conversation = [];
    pendingQuestion = '';
    thread.hidden = true;
    clarifyControls.hidden = true;
    clarifyReply.value = '';
    retryBtn.hidden = true;
    textarea.value = String(clarified || textarea.value);
    pendingRefineConfirm = true;
    setStatus('Here’s the clarified request — review it, edit if needed, then Submit to file it.', '');
    updateControls();
    textarea.focus();
    // Put the caret at the end so a quick tweak is easy.
    try { textarea.setSelectionRange(textarea.value.length, textarea.value.length); } catch (_) { /* non-fatal */ }
  }

  function postCurrent() {
    clearAcceptedRearmTimer();
    clearInactivityCloseTimer();
    requestInFlight = true;
    phase = 'processing';
    retryBtn.hidden = true;
    setStatus('Processing…');
    updateControls();

    resolveAuthHeader(function (authHeader) {
      var headers = { 'Content-Type': 'application/json' };
      if (authHeader) headers['Authorization'] = authHeader;
      fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(makePayload()),
      })
        .then(function (resp) {
          if (!resp.ok) throw new Error('status ' + resp.status);
          return resp.json();
        })
        .then(function (data) {
          if (data && data.status === 'clarify') {
            handleClarify(data.question);
            return;
          }
          if (data && data.status === 'refine') {
            handleRefine(data.clarified);
            return;
          }
          if (data && data.status === 'accepted') {
            handleAccepted(data);
            return;
          }
          throw new Error('unexpected response');
        })
        .catch(function (err) {
          console.error('[soma-feedback] submit failed:', err);
          phase = thread.hidden ? 'error' : 'clarify';
          setStatus('Could not send just now — your text is still here.', 'error');
          setTabResult('error');
          retryBtn.hidden = false;
          updateControls();
        })
        .then(function () {
          requestInFlight = false;
          updateControls();
        });
    });
  }

  function beginSubmit() {
    var text = textarea.value.trim();
    if (!text) {
      setStatus('Type something first.', 'error');
      textarea.focus();
      return;
    }
    remember('name', nameInput.value.trim());
    remember('email', emailInput.value.trim());
    // A new submission supersedes the last acknowledgment, so its correction
    // goes with it — otherwise the button would re-file the PREVIOUS message.
    clearKindCorrection();
    // Held for the one-tap lane correction, which re-files these exact words.
    lastSubmittedText = text;
    conversation = [{ role: 'user', content: text }];
    pendingQuestion = '';
    currentRetry = postCurrent;
    renderThread();
    postCurrent();
  }

  // v3.3 review submit — a single fetch, no clarify loop, no build-intent
  // detection, no admin gate. kind:"review" tells feedback-svc to skip the
  // clarity/build-intent path entirely and file this as recognition, not a
  // work item (see server.js handleFeedback).
  function makeReviewPayload() {
    return {
      site: site,
      page: document.title || '',
      url: window.location.href,
      area: currentArea(),
      kind: 'review',
      text: reviewTextarea.value.trim(),
      rating: reviewRating > 0 ? reviewRating : null,
      name: nameInput.value.trim() || 'anonymous',
      email: emailInput.value.trim(),
      pageText: capturePageText(),
      hp: honeypot.value,
    };
  }

  function submitReview() {
    var text = reviewTextarea.value.trim();
    if (!text) {
      reviewStatusLine.textContent = 'Type something first.';
      reviewStatusLine.className = 'soma-feedback-status soma-feedback-status--error';
      reviewTextarea.focus();
      return;
    }
    remember('name', nameInput.value.trim());
    remember('email', emailInput.value.trim());
    reviewInFlight = true;
    reviewPhase = 'processing';
    reviewStatusLine.textContent = 'Sending…';
    reviewStatusLine.className = 'soma-feedback-status';
    updateControls();

    resolveAuthHeader(function (authHeader) {
      var headers = { 'Content-Type': 'application/json' };
      if (authHeader) headers['Authorization'] = authHeader;
      fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(makeReviewPayload()),
      })
        .then(function (resp) {
          if (!resp.ok) throw new Error('status ' + resp.status);
          return resp.json();
        })
        .then(function (data) {
          reviewPhase = 'accepted';
          reviewStatusLine.textContent = 'Thank you sent — the team will see it. ✓';
          reviewStatusLine.className = 'soma-feedback-status soma-feedback-status--success';
          setTabResult('success');
          showToast('✓ Thanks sent — the team will see it.');
          reviewTextarea.value = '';
          if (reviewAcceptedRearmTimer) window.clearTimeout(reviewAcceptedRearmTimer);
          reviewAcceptedRearmTimer = window.setTimeout(function () {
            reviewAcceptedRearmTimer = null;
            if (reviewPhase !== 'accepted') return;
            resetReviewFlow();
            updateControls();
            if (!panel.hidden && mode === 'review') reviewTextarea.focus();
          }, ACCEPTED_REARM_DELAY_MS);
        })
        .catch(function (err) {
          console.error('[soma-feedback] review submit failed:', err);
          reviewPhase = 'error';
          reviewStatusLine.textContent = 'Could not send just now — your text is still here.';
          reviewStatusLine.className = 'soma-feedback-status soma-feedback-status--error';
          setTabResult('error');
        })
        .then(function () {
          reviewInFlight = false;
          updateControls();
        });
    });
  }

  reviewSubmitBtn.addEventListener('click', submitReview);

  function sendClarification() {
    if (!pendingQuestion) return;
    var reply = clarifyReply.value.trim();
    if (!reply) {
      clarifyReply.focus();
      return;
    }
    conversation.push({ role: 'assistant', content: pendingQuestion });
    conversation.push({ role: 'user', content: reply });
    pendingQuestion = '';
    currentRetry = postCurrent;
    renderThread();
    postCurrent();
  }

  submitBtn.addEventListener('click', beginSubmit);
  clarifySend.addEventListener('click', sendClarification);
  clarifyReply.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendClarification();
  });
  retryBtn.addEventListener('click', function () {
    if (currentRetry) currentRetry();
  });
  textarea.addEventListener('input', function () {
    // Reporter is actively typing a (possibly second) item — the re-arm's
    // auto-close-on-inactivity countdown must not fire out from under them.
    clearInactivityCloseTimer();
    if (phase === 'idle' || phase === 'error') {
      retryBtn.hidden = true;
      setStatus('');
    }
  });

  function markGoogleSignedIn() {
    adminLink.textContent = 'admin ✓';
    adminLink.setAttribute('aria-label', 'Admin Google identity captured');
  }

  function initializeGis(cb) {
    if (!googleClientId) { if (cb) cb(false); return; }
    if (gisInitialized) { if (cb) cb(true); return; }
    if (window.google && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: function (response) {
            if (response && response.credential) {
              googleIdToken = response.credential;
              markGoogleSignedIn();
            }
          },
          auto_select: true,
          itp_support: true,
          cancel_on_tap_outside: true,
        });
        gisInitialized = true;
        if (cb) cb(true);
      } catch (err) {
        console.warn('[soma-feedback] Google Identity initialization failed:', err);
        if (cb) cb(false);
      }
      return;
    }

    if (gisLoading) {
      window.setTimeout(function () { initializeGis(cb); }, 120);
      return;
    }
    gisLoading = true;
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = function () {
      gisLoaded = true;
      gisLoading = false;
      initializeGis(cb);
    };
    s.onerror = function () {
      gisLoading = false;
      if (cb) cb(false);
    };
    document.head.appendChild(s);
  }

  function promptGoogle(silent) {
    initializeGis(function (ok) {
      if (!ok || !window.google || !window.google.accounts || !window.google.accounts.id) return;
      try {
        window.google.accounts.id.prompt(function (notification) {
          if (!silent) return;
          try {
            if (notification && notification.isDisplayed && notification.isDisplayed()) {
              window.google.accounts.id.cancel();
            }
          } catch (_) {
            /* Moment notifications vary by browser; token callback is authoritative. */
          }
        });
      } catch (err) {
        console.warn('[soma-feedback] Google One Tap prompt failed:', err);
      }
    });
  }

  function attemptSilentGoogleCredential() {
    if (silentGoogleAttempted || googleIdToken || !googleClientId) return;
    silentGoogleAttempted = true;
    promptGoogle(true);
  }

  adminLink.addEventListener('click', function () {
    promptGoogle(false);
  });
}());
