/* Sakura scene: a half cherry tree on the right (drawn here as SVG) and petals that drift across the screen.
   Click or tap a petal and it gets pushed and spins. Plain JS, no dependencies. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── the tree ──
  const holder = document.getElementById("sakura-tree");
  let tree = null; // { svg, flowers: [[x, y]], hot: [[x, y, r]] } in SVG units, used for click tests
  if (holder) {
    let seed = 23;
    const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rand = (a, b) => a + (b - a) * rnd();
    const W = 700, H = 1000, MAX = 6;
    const tints = ["#ffe4ec", "#ffd3e0", "#ffc2d4", "#ffb3cb", "#fff0f5", "#ffa9c4"];
    const flower = (id, fill) => `<g id="${id}">${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="0" cy="-7.2" rx="4.8" ry="7.4" fill="${fill}" stroke="#ff8fb1" stroke-width=".45" stroke-opacity=".55" transform="rotate(${i * 72})"/>`).join("")}<circle r="2.2" fill="#ff6f9c"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M0 0L${(3.4 * Math.cos(i * 1.047)).toFixed(1)} ${(3.4 * Math.sin(i * 1.047)).toFixed(1)}" stroke="#d8386f" stroke-width=".5"/>`).join("")}</g>`;
    const bark = [], shine = [], far = [], mid = [], near = [], flowers = [], hot = [];
    const f = (n) => n.toFixed(1);

    // a tapered branch: one filled outline that follows a curve and thins towards its tip
    function limb(x0, y0, a, len, w0, w1) {
      const bend = rand(-0.2, 0.2) * len;
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      const cx = (x0 + x1) / 2 - Math.sin(a) * bend, cy = (y0 + y1) / 2 + Math.cos(a) * bend;
      const N = 9, L = [], R = [], C = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        const x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
        const dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy), m = Math.hypot(dx, dy) || 1;
        const w = (w0 + (w1 - w0) * t) / 2 * (1 + 0.06 * Math.sin(t * 9 + len)); // slight knobbliness
        L.push([x - (dy / m) * w, y + (dx / m) * w]); R.push([x + (dy / m) * w, y - (dx / m) * w]); C.push([x, y, w]);
      }
      const pts = L.concat(R.reverse());
      bark.push(`<path d="M${pts.map((p) => f(p[0]) + " " + f(p[1])).join("L")}Z"/><circle cx="${f(x1)}" cy="${f(y1)}" r="${f(w1 / 2)}"/>`);
      if (false) { // lighter ridge on the lit side of thick limbs
        const ridge = C.map((c, i) => `${f(c[0] - c[2] * 0.35)} ${f(c[1] - c[2] * 0.1)}`);
        shine.push(`<path d="M${ridge.join("L")}" stroke-width="${f(Math.max(2, w0 * 0.22))}"/>`);
      }
      C.forEach((c, i) => { if (i % 2 === 0) hot.push([c[0], c[1], c[2] + 9]); });
      return { x1, y1, at: (t) => { const u = 1 - t; return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]; } };
    }

    function blossoms(x, y, d, big) {
      const clumps = d >= 6 ? 2 : 1;
      for (let c = 0; c < clumps; c++) {
        const cx = x + rand(-16, 16), cy = y + rand(-16, 16), cr = rand(15, 26);
        hot.push([cx, cy, cr + 8]);
        far.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(cr)}" fill="${rnd() < 0.5 ? "#ffb7cf" : "#ffc9da"}" opacity="${f(rand(0.5, 0.75))}"/>`);
        const n = big ? 4 : 2;
        for (let i = 0; i < n; i++) {
          if (rnd() < 0.35) continue; // thin the canopy a little to keep the drawing light
          const fx = cx + rand(-22, 22), fy = cy + rand(-22, 22), sc = rand(0.8, 1.9);
          (sc > 1.35 ? near : mid).push(`<use href="#f${(rnd() * 6) | 0}" transform="translate(${f(fx)} ${f(fy)}) rotate(${(rnd() * 360) | 0}) scale(${sc.toFixed(2)})"/>`);
          flowers.push([fx, fy]); hot.push([fx, fy, 17 * sc]);
        }
        if (rnd() < 0.6) mid.push(`<ellipse cx="${f(cx + rand(-18, 18))}" cy="${f(cy + rand(-18, 18))}" rx="2.2" ry="3.4" fill="#ff7aa2" transform="rotate(${(rnd() * 90) | 0} ${f(cx)} ${f(cy)})"/>`);
      }
    }

    function grow(x, y, a, len, w, d) {
      const tip = Math.max(2, w * 0.7);
      const b = limb(x, y, a, len, w, tip);
      if (d >= 2) for (const t of d >= 4 ? [0.45, 0.75] : [0.6]) { const p = b.at(t); blossoms(p[0], p[1], d, false); }
      if (d >= 3) blossoms(b.x1, b.y1, d, d >= 4);
      if (d >= MAX) return;
      const kids = d < 2 ? 2 : rnd() < 0.3 ? 3 : 2;
      for (let k = 0; k < kids; k++) {
        let na = a + rand(0.3, 0.9) * (k % 2 ? 1 : -1) + (k === 2 ? rand(-0.25, 0.25) : 0);
        if (d >= 3) na += (na < -Math.PI / 2 ? -1 : 1) * rand(0.05, 0.3); // thin branches arch and droop
        na = Math.min(0.2, Math.max(-3.4, na));
        grow(b.x1, b.y1, na, len * rand(0.62, 0.78), tip * 0.96, d + 1);
      }
    }
    grow(W - 70, H + 40, -1.93, 260, 62, 0);   // the trunk, rooted off the right edge
    grow(W - 110, H - 300, -2.62, 220, 32, 1); // a long limb reaching left
    grow(W - 85, H - 540, -2.25, 180, 20, 2); // a higher limb
    grow(W - 150, H - 190, -2.95, 160, 22, 2); // a low limb sweeping over the ground

    holder.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMaxYMax meet" xmlns="http://www.w3.org/2000/svg">
      <defs>${tints.map((c, i) => flower("f" + i, c)).join("")}</defs>
      <g class="bark-line">${bark.join("")}</g><g class="bark">${bark.join("")}</g><g class="shine">${shine.join("")}</g>
      <g>${far.join("")}</g><g>${mid.join("")}</g><g>${near.join("")}</g></svg>`;
    tree = { svg: holder.firstElementChild, flowers, hot };
  }

  // ── the petals ──
  const cv = document.getElementById("petals");
  if (!cv || reduce) return;
  const ctx = cv.getContext("2d");
  const colors = ["#ffc9da", "#ffb7cf", "#ffd9e5", "#ff9fbf", "#ffe3ec"];
  const root = document.documentElement;
  const wanted = () => (innerWidth < 700 ? 14 : innerWidth < 1100 ? 22 : 30);
  let w = 0, h = 0, petals = [], t = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const r = (a, b) => a + (b - a) * Math.random();

  function make(initial, temp) {
    const size = r(7, 13);
    return {
      x: initial ? r(0, w) : r(w * 0.4, w + 140), y: initial ? r(-h * 0.1, h) : r(-80, -10),
      vx: -r(10, 30), vy: r(20, 45), size, rot: r(0, 6.28), vr: r(-1.2, 1.2), baseVr: r(-1.2, 1.2),
      flip: r(0, 6.28), fs: r(1.5, 3.2), ph: r(0, 6.28), pulse: 0, color: colors[(Math.random() * colors.length) | 0],
      alpha: r(0.75, 0.95), temp: !!temp,
    };
  }
  function fill() {
    const base = petals.filter((p) => !p.temp);
    for (let i = base.length; i < wanted(); i++) petals.push(make(true));
    if (base.length > wanted()) { let extra = base.length - wanted(); petals = petals.filter((p) => p.temp || extra-- <= 0); }
  }

  function draw(p) {
    const s = p.size * (1 + 0.3 * p.pulse);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.flip)));
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.95);
    ctx.bezierCurveTo(s * 0.95, s * 0.45, s * 0.85, -s * 0.7, s * 0.16, -s * 0.85);
    ctx.lineTo(0, -s * 0.58);
    ctx.lineTo(-s * 0.16, -s * 0.85);
    ctx.bezierCurveTo(-s * 0.85, -s * 0.7, -s * 0.95, s * 0.45, 0, s * 0.95);
    ctx.fill();
    ctx.restore();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 20); last = now; t = now;
    ctx.clearRect(0, 0, w, h);
    const gust = Math.pow(Math.max(0, Math.sin(now * 0.00017 + 1.3)), 3) * 45;
    const wind = -(26 + 18 * Math.sin(now * 0.0004) + gust);
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      const ease = Math.min(1, dt * 0.8);
      p.vx += (wind * (0.7 + p.size / 30) - p.vx) * ease;
      p.vy += (36 + p.size * 1.6 + Math.sin(now * 0.002 + p.ph) * 14 - p.vy) * ease;
      p.vr += (p.baseVr - p.vr) * ease;
      p.x += (p.vx + Math.sin(now * 0.0016 + p.ph) * 16) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt; p.flip += p.fs * dt;
      p.pulse = Math.max(0, p.pulse - dt * 3.5);
      if (p.y > h + 40 || p.x < -80 || p.x > w + 260) {
        if (p.temp) { petals.splice(i, 1); continue; }
        Object.assign(p, make(false));
      }
      draw(p);
    }
    requestAnimationFrame(frame);
  }

  function hit(px, py, touch) {
    let any = false;
    for (const p of petals) {
      const reach = p.size * 1.15 + (touch ? 16 : 8);
      const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy);
      if (d > reach) continue;
      any = true;
      const ux = d ? dx / d : r(-1, 1), uy = d ? dy / d : -1;
      p.vx += ux * 260 + r(-60, 60);
      p.vy += uy * 160 - 170;
      p.vr += (Math.random() < 0.5 ? -1 : 1) * r(4, 8);
      p.pulse = 1;
    }
    return any;
  }
  // the tree: is this screen point on a branch or blossom? (maps it into the SVG's own coordinates)
  function onTree(cx, cy) {
    if (!tree) return false;
    const m = tree.svg.getScreenCTM();
    if (!m) return false;
    const q = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return tree.hot.some((h) => Math.hypot(h[0] - q.x, h[1] - q.y) < h[2]);
  }
  // blossoms let go of the tree: from around the click and from random flowers across the canopy
  function shower(cx, cy) {
    const m = tree.svg.getScreenCTM();
    const add = (x, y, strong) => {
      if (petals.length >= 170) return;
      const p = make(false, true);
      Object.assign(p, { x, y, vx: -r(10, 70) - (strong ? 40 : 0), vy: r(-20, 50), vr: r(-4, 4), size: r(7, 13) });
      petals.push(p);
    };
    for (let i = 0; i < 12; i++) add(cx + r(-70, 70), cy + r(-60, 40), true);
    for (let i = 0; i < 26; i++) {
      const fl = tree.flowers[(Math.random() * tree.flowers.length) | 0];
      const q = new DOMPoint(fl[0], fl[1]).matrixTransform(m);
      if (q.x > -20 && q.x < w + 20 && q.y > -20 && q.y < h) setTimeout(() => add(q.x, q.y, false), r(0, 700));
    }
    holder.classList.remove("shake"); void holder.offsetWidth; holder.classList.add("shake");
    root.dataset.treeHits = String((+root.dataset.treeHits || 0) + 1);
  }
  addEventListener("pointerdown", (e) => {
    const touch = e.pointerType !== "mouse";
    if (hit(e.clientX, e.clientY, touch)) root.dataset.petalHits = String((+root.dataset.petalHits || 0) + 1);
    else if (onTree(e.clientX, e.clientY)) shower(e.clientX, e.clientY);
  }, { passive: true });
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const over = petals.some((p) => Math.hypot(p.x - e.clientX, p.y - e.clientY) < p.size * 1.15 + 6) || onTree(e.clientX, e.clientY);
    root.classList.toggle("petal-hover", over);
  }, { passive: true });

  // a flurry of petals, used by the page transition
  function burst(x, y) {
    for (let i = 0; i < 38 && petals.length < 160; i++) {
      const p = make(false, true), a = r(0, 6.28), v = r(120, 340);
      Object.assign(p, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, vr: r(-8, 8), size: r(7, 14) });
      petals.push(p);
    }
  }
  addEventListener("sakura-burst", (e) => burst(e.detail.x, e.detail.y));

  addEventListener("resize", () => { resize(); fill(); });
  resize(); fill();
  requestAnimationFrame(frame);
})();
