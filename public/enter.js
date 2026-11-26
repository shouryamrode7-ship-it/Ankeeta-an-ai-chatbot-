/* Chat page: the other half of the black-hole transition. Runs in <head>, before first paint.
   If we arrived through the hole, the page starts fully black and the hole opens from the same
   point the home page swallowed everything into. Otherwise nothing happens. */
(() => {
  const root = document.documentElement;
  let flag = null;
  try {
    flag = JSON.parse(sessionStorage.getItem("ankeeta_hole") || "null");
    sessionStorage.removeItem("ankeeta_hole");
  } catch (_) {}
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!flag || reduced || Date.now() - flag.t > 15000) return;

  const X = Math.min(1, Math.max(0, flag.x ?? 0.5)), Y = Math.min(1, Math.max(0, flag.y ?? 0.5));
  const cover = (r) => {
    const cx = (X * innerWidth).toFixed(1), cy = (Y * innerHeight).toFixed(1);
    root.style.setProperty("--cover",
      `radial-gradient(circle at ${cx}px ${cy}px, rgba(0,0,0,0) ${r}px, #ffe2b0 ${r}px, rgba(255,150,60,.7) ${r + 2}px, rgba(255,110,30,.28) ${r + 30}px, #000 ${r + 110}px)`);
  };
  cover(0);
  root.classList.add("entering");

  const finish = () => { root.classList.remove("entering"); root.style.removeProperty("--cover"); };
  setTimeout(finish, 6000); // safety net: never leave the page covered

  const DURATION = 1100;
  const ease = (t) => 1 - Math.pow(1 - t, 3); // fast start, soft landing
  function open() {
    const t0 = performance.now();
    const R = Math.hypot(Math.max(X, 1 - X) * innerWidth, Math.max(Y, 1 - Y) * innerHeight) + 140;
    (function frame(now) {
      const t = Math.min(1, (now - t0) / DURATION);
      cover(ease(t) * R);
      if (t < 1) requestAnimationFrame(frame); else finish();
    })(t0);
  }
  // wait until the page has loaded (or 0.7s), keep a short beat of pure black first
  let started = false;
  const go = () => { if (started) return; started = true; setTimeout(() => requestAnimationFrame(open), 250); };
  if (document.readyState === "complete") go(); else addEventListener("load", go);
  setTimeout(go, 700);
})();
