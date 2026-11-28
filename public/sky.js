// Light/dark switch: the moon arcs away to the left while the sun swings in from the right
// (and the reverse going back). Clicking the moon in the scene does the same as the toggle button.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let busy = false;

  function apply(next) {
    root.classList.add("theme-anim");
    root.dataset.theme = next;
    try { localStorage.setItem("ankeeta_theme", next); } catch (_) {}
    setTimeout(() => root.classList.remove("theme-anim"), 350);
  }
  const orb = (kind, size) => {
    const d = document.createElement("div");
    d.className = "orb orb-" + kind;
    d.style.width = d.style.height = size + "px";
    d.setAttribute("aria-hidden", "true");
    document.body.appendChild(d);
    return d;
  };
  const ease = (t) => t * t * (3 - 2 * t);
  function fly(el, size, pos) {
    const frames = [];
    for (let i = 0; i <= 28; i++) {
      const [x, y] = pos(ease(i / 28));
      frames.push({ transform: `translate(${x - size / 2}px, ${y - size / 2}px)`, offset: i / 28 });
    }
    return el.animate(frames, { duration: 1500, easing: "linear", fill: "forwards" });
  }

  // where the moon is: the drawn scene's moon, or (with a photo background) its spot in the cover-fitted photo
  function moonRect() {
    const m = document.querySelector("#scene .c-moon");
    const r = m && m.getBoundingClientRect();
    if (r && r.width) return r;
    if (root.classList.contains("photo-dark") && root.dataset.theme === "dark") {
      const iw = 1869, ih = 1054, k = Math.max(innerWidth / iw, innerHeight / ih);
      const d = 0.068 * iw * k;
      return { left: (innerWidth - iw * k) / 2 + 0.222 * iw * k - d / 2, top: (innerHeight - ih * k) / 2 + 0.218 * ih * k - d / 2, width: d };
    }
    if (root.classList.contains("photo-light") && root.dataset.theme === "light") {
      const iw = 1864, ih = 1043, k = Math.max(innerWidth / iw, innerHeight / ih);
      const d = 0.05 * iw * k;
      return { left: (innerWidth - iw * k) / 2 + 0.165 * iw * k - d / 2, top: (innerHeight - ih * k) / 2 + 0.36 * ih * k - d / 2, width: d };
    }
    return null;
  }
  window.skyShift = (next) => {
    if (busy) return;
    const r = moonRect();
    if (reduce || !r || !r.width) { apply(next); return; }
    busy = true;
    const size = r.width * (next === "light" ? 1 : 1);
    const cx = r.left + r.width / 2, cy = r.top + r.width / 2;
    const lift = Math.min(190, innerHeight * 0.3), drop = innerHeight * 0.14;
    const leaving = orb(next === "light" ? "moon" : "sun", size);
    const arriving = orb(next === "light" ? "sun" : "moon", size);
    root.classList.add("orb-run");
    const a = fly(leaving, size, (t) => [cx - (cx + size * 1.6) * t, cy + drop * t - lift * Math.sin(Math.PI * t)]);
    const b = fly(arriving, size, (t) => [innerWidth + size - (innerWidth + size - cx) * t, cy + drop * (1 - t) - lift * Math.sin(Math.PI * t)]);
    setTimeout(() => apply(next), 700);
    Promise.all([a.finished, b.finished]).catch(() => {}).then(() => {
      root.classList.remove("orb-run");
      arriving.style.transition = "opacity 300ms"; arriving.style.opacity = "0";
      leaving.remove();
      setTimeout(() => { arriving.remove(); busy = false; }, 320);
    });
  };

  // the moon in the scene is itself a switch
  const blocked = "a, button, input, textarea, label, aside, header, form, .prompt, .card, .msg, .step, .footer, .welcome h1";
  function overMoon(e) {
    const r = moonRect();
    if (!r || !r.width || (e.target.closest && e.target.closest(blocked))) return false;
    return Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.width / 2)) < r.width * 0.7;
  }
  document.addEventListener("click", (e) => { if (overMoon(e)) window.skyShift(root.dataset.theme === "dark" ? "light" : "dark"); });
  let was = false;
  document.addEventListener("mousemove", (e) => {
    const on = overMoon(e);
    if (on !== was) { was = on; root.classList.toggle("moon-hover", on); }
  }, { passive: true });
})();
