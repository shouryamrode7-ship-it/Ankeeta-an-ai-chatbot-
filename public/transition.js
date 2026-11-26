/* Home page: clicking "Ankeeta" opens a black hole at the name. The page and the dust swirl into it,
   then the hole swallows the screen and we move on to /chat (see enter.js for the other half). */
(() => {
  const link = document.querySelector(".wordmark");
  const hero = document.querySelector(".hero");
  const dust = document.getElementById("scene");
  if (!link || !hero) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = false, overlay = null, anims = [];

  function reset() {
    anims.forEach((a) => a.cancel()); anims = [];
    if (overlay) { overlay.remove(); overlay = null; }
    document.documentElement.style.background = ""; document.body.style.background = "";
    document.body.style.pointerEvents = "";
    hero.style.transformOrigin = ""; if (dust) dust.style.transformOrigin = "";
    running = false;
  }
  // coming back with the browser's back button must not show the swallowed page
  addEventListener("pageshow", (e) => { if (e.persisted) reset(); });

  const easeIn = (t) => t * t * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  link.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (running) return;
    running = true;
    const href = link.href;
    const r0 = link.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    try { sessionStorage.setItem("ankeeta_hole", JSON.stringify({ t: Date.now(), x: cx / innerWidth, y: cy / innerHeight })); } catch (_) {}
    if (reduced) { location.assign(href); return; }

    document.body.style.pointerEvents = "none";
    document.documentElement.style.background = "#000"; document.body.style.background = "#000";
    const hr = hero.getBoundingClientRect();
    hero.style.transformOrigin = `${cx - hr.left}px ${cy - hr.top}px`;
    anims.push(hero.animate(
      [
        { transform: "rotate(0deg) scale(1)", opacity: 1, filter: "blur(0px)" },
        { transform: "rotate(150deg) scale(0.35)", opacity: 0.9, filter: "blur(1px)", offset: 0.6 },
        { transform: "rotate(260deg) scale(0.02)", opacity: 0, filter: "blur(4px)" },
      ],
      { duration: 1050, delay: 120, easing: "cubic-bezier(.55,.05,.85,.45)", fill: "forwards" }
    ));
    if (dust) {
      dust.style.transformOrigin = `${cx}px ${cy}px`;
      anims.push(dust.animate(
        [{ transform: "rotate(0deg) scale(1)" }, { transform: "rotate(120deg) scale(0.55)" }],
        { duration: 1300, easing: "cubic-bezier(.5,0,.9,.5)", fill: "forwards" }
      ));
    }

    overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:100;pointer-events:none";
    document.body.appendChild(overlay);
    const R = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 140;
    const paint = (r) => {
      overlay.style.background =
        `radial-gradient(circle at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, #000 ${r}px, #ffe2b0 ${r}px, rgba(255,150,60,.7) ${r + 2}px, rgba(255,110,30,.28) ${r + 30}px, rgba(255,110,30,0) ${r + 110}px)`;
    };
    paint(0);

    // hole radius over time: opens (0-650ms), hangs and pulls (to 850ms), then swallows the screen
    const T_OPEN = 650, T_SWALLOW = 800, T_END = 1500;
    const t0 = performance.now();
    (function frame(now) {
      const t = now - t0;
      let r;
      if (t < T_OPEN) r = 70 * easeOut(Math.max(0, (t - 120) / (T_OPEN - 120)));
      else if (t < T_SWALLOW) r = 70 + 14 * ((t - T_OPEN) / (T_SWALLOW - T_OPEN));
      else r = 84 + (R - 84) * easeIn(Math.min(1, (t - T_SWALLOW) / (T_END - T_SWALLOW)));
      paint(r);
      if (t < T_END) return requestAnimationFrame(frame);
      overlay.style.background = "#000"; // fully black: safe to leave
      requestAnimationFrame(() => requestAnimationFrame(() => location.assign(href)));
    })(t0);
  });
})();
