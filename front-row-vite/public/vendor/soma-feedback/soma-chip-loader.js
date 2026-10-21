/*!
 * soma-chip-loader.js — loads the SOMA feedback chip from the central host and
 * falls back to the site's own copy. Install it once; after that a chip upgrade
 * is a publish to the central host, not a rebuild of every site.
 *
 *   <script src="/vendor/soma-feedback/soma-chip-loader.js"
 *           data-site="playmaker" data-endpoint="/api/submit-feedback-widget"
 *           data-showme="/api/feedback-converse" defer></script>
 *
 * How it works:
 *   1. Reads <base>channels/<channel>.json (base defaults to /soma-chip/, which
 *      each site proxies to the central host, so everything stays same-origin).
 *      The manifest names a version and its files: {version, js, css, sri}.
 *   2. Adds that version's CSS and JS. Every data-* attribute on this tag except
 *      the loader's own is copied onto the chip's script tag, so the chip reads
 *      the same configuration it always did.
 *   3. Falls back to the site's own copy (data-fallback-js / data-fallback-css,
 *      default /vendor/soma-feedback/soma-feedback.{js,css}) when the manifest
 *      is missing, slow (3 s), malformed, or the central script fails to load or
 *      fails its integrity check. The worst case is an older chip, never no chip.
 *
 * Loader attributes: data-chip-base, data-channel (default "stable"),
 * data-fallback-js, data-fallback-css, data-timeout-ms.
 * Try another channel in one browser: ?soma-chip=beta (remembered in
 * localStorage as soma-chip:channel); ?soma-chip=local forces the site's copy;
 * ?soma-chip=stable goes back to the default.
 * State for checks and support: window.somaChipLoader = {channel, source,
 * version, error}; source is "central" or "fallback".
 *
 * Why: 2026-07-22 a single shared host's TLS expiry took every chip down at
 * once, so sites vendored the chip (2026-08-10); vendored copies then drifted,
 * and on 2026-09-20 PlayMaker silently lost v4.2's drag. Central-with-fallback
 * keeps both properties. Written 2026-10-09 (Mike Wolf; Claude Opus 5.5, CCc).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.somaChipLoader) return;

  var me = document.currentScript;
  var OWN = ['data-chip-base', 'data-channel', 'data-fallback-js', 'data-fallback-css', 'data-timeout-ms'];
  function attr(name, fallback) {
    var v = me && me.getAttribute(name);
    return v ? v : fallback;
  }

  var base = attr('data-chip-base', '/soma-chip/');
  if (base.charAt(base.length - 1) !== '/') base += '/';
  var fallbackJs = attr('data-fallback-js', '/vendor/soma-feedback/soma-feedback.js');
  var fallbackCss = attr('data-fallback-css', '/vendor/soma-feedback/soma-feedback.css');
  var timeoutMs = parseInt(attr('data-timeout-ms', '3000'), 10) || 3000;
  var channel = attr('data-channel', 'stable');
  try {
    var asked = new URLSearchParams(window.location.search).get('soma-chip');
    if (asked && /^[a-z0-9-]{1,32}$/.test(asked)) {
      if (asked === 'stable') window.localStorage.removeItem('soma-chip:channel');
      else window.localStorage.setItem('soma-chip:channel', asked);
    }
    var kept = window.localStorage.getItem('soma-chip:channel');
    if (kept && /^[a-z0-9-]{1,32}$/.test(kept)) channel = kept;
  } catch (_) { /* storage blocked: use the tag's channel */ }

  var state = window.somaChipLoader = { channel: channel, source: null, version: null, error: null };
  var settled = false;

  function chipScript(src, integrity) {
    var s = document.createElement('script');
    s.src = src;
    if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; }
    if (me) {
      for (var i = 0; i < me.attributes.length; i++) {
        var a = me.attributes[i];
        if (a.name.indexOf('data-') === 0 && OWN.indexOf(a.name) < 0) s.setAttribute(a.name, a.value);
      }
    }
    return s;
  }

  function stylesheet(href, integrity) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    if (integrity) { l.integrity = integrity; l.crossOrigin = 'anonymous'; }
    return l;
  }

  function useFallback(reason) {
    if (settled) return;
    settled = true;
    state.source = 'fallback';
    state.error = reason || null;
    document.head.appendChild(stylesheet(fallbackCss));
    document.head.appendChild(chipScript(fallbackJs));
  }

  function useCentral(manifest) {
    if (settled) return;
    settled = true;
    var sri = manifest.sri || {};
    var css = stylesheet(base + manifest.css, sri.css);
    var js = chipScript(base + manifest.js, sri.js);
    js.onerror = function () {
      // Network failure or integrity mismatch: drop the central files, use ours.
      if (css.parentNode) css.parentNode.removeChild(css);
      if (js.parentNode) js.parentNode.removeChild(js);
      settled = false;
      useFallback('central script failed to load or verify (' + manifest.version + ')');
    };
    state.source = 'central';
    state.version = manifest.version || null;
    document.head.appendChild(css);
    document.head.appendChild(js);
  }

  if (channel === 'local' || typeof window.fetch !== 'function') {
    useFallback(channel === 'local' ? 'channel local' : 'no fetch');
    return;
  }

  var timer = setTimeout(function () { useFallback('manifest timeout after ' + timeoutMs + ' ms'); }, timeoutMs);
  window.fetch(base + 'channels/' + channel + '.json', { cache: 'no-cache', credentials: 'omit' })
    .then(function (r) {
      if (!r.ok) throw new Error('manifest ' + r.status);
      return r.json();
    })
    .then(function (m) {
      clearTimeout(timer);
      if (!m || typeof m.js !== 'string' || typeof m.css !== 'string' || /^(?:[a-z]+:)?\/\//i.test(m.js + m.css)) {
        throw new Error('manifest malformed');
      }
      useCentral(m);
    })
    .catch(function (e) {
      clearTimeout(timer);
      useFallback(String((e && e.message) || e));
    });
}());
