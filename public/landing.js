// Entry cascade: each [data-rise] element springs up from 14px, 45ms apart (tension 220, friction 26).
(() => {
  const STEP_MS = 45, FROM_Y = 14, TENSION = 220, FRICTION = 26, SUBSTEP = 1 / 240;
  document.documentElement.classList.add("lk-js");
  const nodes = [...document.querySelectorAll("[data-rise]")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rest = (el) => { el.style.transform = ""; el.style.opacity = "1"; el.style.willChange = ""; };
  const rise = (el, delay) => {
    el.style.opacity = "0";
    el.style.transform = `translate3d(0,${FROM_Y}px,0)`;
    if (reduced) return setTimeout(() => rest(el), delay);
    let x = FROM_Y, v = 0, last = null;
    const frame = (now) => {
      if (last === null) last = now;
      const dt = Math.min((now - last) / 1000, 0.064); last = now;
      const n = Math.max(1, Math.ceil(dt / SUBSTEP)), h = dt / n;
      for (let i = 0; i < n; i++) { v += (-TENSION * x - FRICTION * v) * h; x += v * h; }
      el.style.transform = `translate3d(0,${x.toFixed(3)}px,0)`;
      el.style.opacity = String(Math.max(0, Math.min(1, 1 - x / FROM_Y)));
      if (Math.abs(x) < 0.01 && Math.abs(v) < 0.01) return rest(el);
      requestAnimationFrame(frame);
    };
    setTimeout(() => requestAnimationFrame(frame), delay);
  };
  nodes.forEach((el) => rise(el, (Number(el.dataset.rise) || 0) * STEP_MS));
})();
