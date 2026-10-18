/* HIM Robotics — WebGL "dead canvas" self-recovery.
 *
 * Why this exists: on this machine the browser's graphics (GPU) process can be
 * restarted by the system — most commonly when a fullscreen game (e.g. Valorant)
 * switches display modes, or after the graphics process hangs. When that
 * happens every live WebGL canvas in every open tab silently loses its context
 * and stays blank forever: three.js never rebuilds a killed context by itself,
 * so the robot scenes stay empty until the page is reloaded manually.
 *
 * What this does: when a canvas that is still part of the page AND currently
 * in (or near) the viewport loses its context, wait a few seconds (the GPU
 * process needs a moment to come back); if the context has not recovered,
 * reload the page once to rebuild the scenes, restoring the previous scroll
 * position. Reloads are rate-limited to one per 90 seconds, and the normal
 * "context lost" events fired on canvases that the app has unmounted are
 * ignored.
 *
 * It also covers a second failure mode seen on this machine: when the local
 * server is restarting while a page is open, the 3D model fetches can fail.
 * The scene app then crashes to a blank page and cannot heal by itself (the
 * failed loads are remembered for the session). The guard detects that error
 * and retries the reload once the site answers again (checked with a HEAD
 * request first, so it never reloads into a dead server), at most three times
 * per incident; the retry budget resets after a healthy minute.
 *
 * Every auto-reload first sends a small diagnostic report (page state, WebGL
 * probes, model fetch statuses) to the local server via POST /__diag-report,
 * stored in _diag-incoming/ — so a failure on this machine can be inspected
 * afterwards without the user having to run diag.html manually.
 *
 * This script is injected by tools/add-ctx-guard.mjs into content/index.html.
 * It is a no-op on healthy sessions: a context loss on a live canvas was never
 * observed in local testing (only on canvases the app had already removed).
 */
(function () {
  if (window.__himCtxGuard) return;
  window.__himCtxGuard = true;

  var RELOAD_KEY = 'him:ctxguard:reloadAt';
  var SCROLL_KEY = 'him:ctxguard:scrollY';
  var MODEL_TRY_KEY = 'him:ctxguard:modelTries';
  var RELOAD_WINDOW_MS = 90 * 1000; // at most one auto-reload per 90s
  var SETTLE_MS = 4000;             // give the GPU process time to come back
  var PEEK_THROTTLE_MS = 3000;
  var MODEL_TRIES_MAX = 3;          // reload attempts for failed 3D model fetches

  // 1) Restore the scroll position saved by a previous auto-recovery reload.
  try {
    var saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved !== null) {
      sessionStorage.removeItem(SCROLL_KEY);
      var y = parseInt(saved, 10);
      if (y > 0) {
        var apply = function () {
          try { window.scrollTo(0, y); } catch (e) { /* ignore */ }
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', apply, { once: true });
        } else {
          apply();
        }
        window.addEventListener('load', function () { setTimeout(apply, 120); }, { once: true });
      }
    }
  } catch (e) { /* ignore */ }

  function canReload() {
    try {
      var last = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10) || 0;
      return Date.now() - last > RELOAD_WINDOW_MS;
    } catch (e) {
      return false;
    }
  }

  function reload(reason) {
    if (!canReload()) return;
    sendAutoReport(reason);
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (e) { /* ignore */ }
    // After an app crash the document may have collapsed to the top, which would
    // make scrollY read 0; fall back to the last position seen while it worked.
    var y = Math.round(window.scrollY || 0) || lastGoodY;
    try { sessionStorage.setItem(SCROLL_KEY, String(y)); } catch (e) { /* ignore */ }
    try { console.info('[him-ctx-guard] recovering the page (' + reason + ')'); } catch (e) { /* ignore */ }
    location.reload();
  }

  // Best-effort diagnostic report before an auto-reload (fire and forget; the
  // beacon survives the navigation). Stored by the local server in _diag-incoming/.
  function sendAutoReport(reason) {
    try {
      var models = [];
      try {
        var entries = performance.getEntriesByType('resource') || [];
        for (var i = 0; i < entries.length && models.length < 24; i++) {
          var e = entries[i];
          if (String(e.name || '').indexOf('/models/') === -1) continue;
          models.push(String(e.name).replace(/^https?:\/\/[^/]+/, '') + '  status=' + (e.responseStatus || 0) + '  ms=' + Math.round(e.duration || 0));
        }
      } catch (e2) { /* ignore */ }
      var canvases = [];
      try {
        var cs = document.querySelectorAll('canvas');
        for (var j = 0; j < cs.length && j < 12; j++) {
          var c = cs[j];
          var kind = 'none';
          try {
            if (c.getContext('webgl2')) kind = 'webgl2';
            else if (c.getContext('webgl')) kind = 'webgl';
            else if (c.getContext('2d')) kind = '2d';
          } catch (e3) { kind = 'error'; }
          canvases.push(c.width + 'x' + c.height + '  ' + kind + (c.isConnected ? '' : '  detached'));
        }
      } catch (e4) { /* ignore */ }
      var fresh = 'unknown';
      try {
        fresh = document.createElement('canvas').getContext('webgl2') ? 'webgl2-ok' : 'webgl2-null';
      } catch (e5) { fresh = 'webgl2-error'; }
      var tries = '0';
      try { tries = sessionStorage.getItem(MODEL_TRY_KEY) || '0'; } catch (e6) { /* ignore */ }
      var text = [
        'GUARD-AUTO-REPORT (him-ctx-recovery v3)',
        'at: ' + new Date().toISOString(),
        'reason: ' + String(reason || ''),
        'url: ' + location.href,
        'ua: ' + navigator.userAgent,
        'visibility: ' + document.visibilityState,
        'scrollY: ' + Math.round(window.scrollY || 0),
        'fresh-canvas-webgl2: ' + fresh,
        'canvases: ' + (canvases.length ? '\n  ' + canvases.join('\n  ') : 'none'),
        'model-resources: ' + (models.length ? '\n  ' + models.join('\n  ') : 'none seen'),
        'modelTries: ' + tries,
      ].join('\n');
      try {
        if (navigator.sendBeacon && navigator.sendBeacon('/__diag-report', new Blob([text], { type: 'text/plain' }))) return;
      } catch (e7) { /* ignore */ }
      try { fetch('/__diag-report', { method: 'POST', body: text, keepalive: true }).catch(function () {}); } catch (e8) { /* ignore */ }
    } catch (e9) { /* ignore */ }
  }

  var pending = false;
  var lastGoodY = 0; // last non-zero scroll position seen while the page still worked

  function scheduleRecovery(canvas, why) {
    if (pending) return;
    pending = true;
    try {
      console.info('[him-ctx-guard] 3D context lost on a live canvas (' + why + '); restoring in ' + (SETTLE_MS / 1000) + 's if it does not recover');
    } catch (e) { /* ignore */ }
    setTimeout(function () {
      pending = false;
      if (!canvas.isConnected) return; // the app unmounted it normally: nothing to recover
      var gl = null;
      try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (e) { /* ignore */ }
      if (gl && !gl.isContextLost()) return; // context came back (or was rebuilt): all good
      reload(why);
    }, SETTLE_MS);
  }

  // 2) Failed 3D model fetches (e.g. the local server was restarting). The scene app
  //    crashes blank and caches the failure for the session; only a reload recovers.
  var modelFail = false;

  function noteModelFailure(msg) {
    try {
      if (!modelFail && /Could not load \/models\//.test(String(msg || ''))) {
        modelFail = true;
        console.info('[him-ctx-guard] a 3D model failed to load; will recover once the site answers again');
        setTimeout(tryModelRecovery, 1500);
      }
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('error', function (ev) { noteModelFailure(ev && ev.message); }, true);
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    noteModelFailure(r && (r.message || r));
  });

  var probePending = false;

  function tryModelRecovery() {
    if (probePending || !canReload()) return;
    probePending = true;
    var ctl = null;
    try { ctl = new AbortController(); } catch (e) { /* ignore */ }
    var done = false;
    var timer = 0;
    var finish = function (siteAnswers) {
      if (done) return;
      done = true;
      probePending = false;
      if (timer) clearTimeout(timer);
      if (!siteAnswers) return; // still down: peek() keeps retrying while the tab is visible
      var tries = 0;
      try { tries = parseInt(sessionStorage.getItem(MODEL_TRY_KEY) || '0', 10) || 0; } catch (e) { /* ignore */ }
      if (tries >= MODEL_TRIES_MAX) {
        try { console.info('[him-ctx-guard] 3D models still failing after ' + tries + ' retries; leaving recovery to a manual reload'); } catch (e) { /* ignore */ }
        modelFail = false; // stop retrying in this tab
        return;
      }
      try { sessionStorage.setItem(MODEL_TRY_KEY, String(tries + 1)); } catch (e) { /* ignore */ }
      reload('3D models could not load');
    };
    if (ctl) timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} finish(false); }, 5000);
    try {
      fetch('/', { method: 'HEAD', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
        .then(function () { finish(true); }, function () { finish(false); });
    } catch (e) { finish(false); }
  }

  function nearViewport(canvas) {
    try {
      var r = canvas.getBoundingClientRect();
      if (!r || r.width < 2 || r.height < 2) return false;
      var m = 200;
      return r.bottom > -m && r.top < ((window.innerHeight || 0) + m);
    } catch (e) {
      return false;
    }
  }

  // 3) Live context-loss events (capture: the event does not bubble).
  document.addEventListener('webglcontextlost', function (ev) {
    var c = ev.target;
    if (!c || c.tagName !== 'CANVAS' || !c.isConnected) return; // ignore unmounted canvases
    if (!nearViewport(c)) return;                               // the user is not looking at a scene
    scheduleRecovery(c, 'live canvas lost');
  }, true);

  // 4) Periodic peek: catches losses that happened before this listener attached
  //    or while the tab was in the background, and drives model-failure recovery.
  var nextPeek = 0;
  function peek() {
    if (document.visibilityState !== 'visible') return;
    var now = Date.now();
    if (now < nextPeek) return;
    nextPeek = now + PEEK_THROTTLE_MS;
    var sy = Math.round(window.scrollY || 0);
    if (sy > 0) lastGoodY = sy;
    if (modelFail) tryModelRecovery();
    var list = document.querySelectorAll('canvas');
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c.isConnected || !nearViewport(c)) continue;
      var gl = null;
      try { gl = c.getContext('webgl2') || c.getContext('webgl'); } catch (e) { continue; }
      if (gl && gl.isContextLost()) { scheduleRecovery(c, 'dead context found'); return; }
    }
  }

  window.addEventListener('load', function () {
    setTimeout(peek, 2500);
    setTimeout(peek, 8000);
    // a healthy minute clears the model-retry budget for this tab
    setTimeout(function () {
      if (!modelFail) { try { sessionStorage.removeItem(MODEL_TRY_KEY); } catch (e) { /* ignore */ } }
    }, 60000);
  }, { once: true });
  window.addEventListener('scroll', peek, { passive: true });
  document.addEventListener('visibilitychange', peek);
  setInterval(peek, 15000);
})();
