// HIM Robotics — Lenis smooth scrolling bootstrap (loads right after lenis.min.js).
//
// - Wheel smoothing only (`smoothWheel`); touch devices keep native scrolling.
// - `respectReducedMotion` (Lenis default) disables smoothing for users who ask
//   for reduced motion.
// - rAF loop is driven manually (`autoRaf: false`) so exactly one loop runs.
// - `window.__lenis` exposes the instance (tests + the service dialog pauses it
//   while open so the blurred page behind a modal does not scroll).
// - `anchors: true` makes in-page anchor links scroll smoothly.
(function () {
  function boot() {
    if (!window.Lenis || window.__lenis) return;
    var lenis = new window.Lenis({
      autoRaf: false,
      smoothWheel: true,
      anchors: true,
    });
    var raf = function (time) {
      lenis.raf(time);
      window.requestAnimationFrame(raf);
    };
    window.requestAnimationFrame(raf);
    window.__lenis = lenis;
  }
  // Wait for `load` so the captured page has hydrated before classes are added
  // to <html> and wheel handling starts.
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
