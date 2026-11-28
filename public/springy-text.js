/* Springy text for the chat box – plain JS, no dependencies.
   The real <textarea> keeps doing the editing (so typing, selection, paste and IME all behave normally); its
   text is made transparent and mirrored in an overlay where each new letter drops in with a spring and a
   springy caret follows the cursor (stiffness/damping 700/32, as in the original Springy Input). */
(() => {
  const input = document.getElementById("msg");
  const wrap = input && input.closest(".sp-wrap");
  if (!wrap || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = wrap.querySelector(".sp-in"), box = wrap.querySelector(".sp-text"), caret = wrap.querySelector(".sp-caret");
  wrap.classList.add("sp-on");

  const CARET_H = 20;
  const spring = { k: 700, c: 32 };
  const X = { x: 0, v: 0, t: 0 }, Y = { x: 0, v: 0, t: 0 };
  const step = (s, dt) => { const a = -spring.k * (s.x - s.t) - spring.c * s.v; s.v += a * dt; s.x += s.v * dt; };

  let prev = "", chars = [], lastMove = performance.now(), snap = true;

  function rebuild(next) {
    let a = 0;
    while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
    let b = 0;
    while (b < prev.length - a && b < next.length - a && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++;
    const newEnd = next.length - b;
    const frag = document.createDocumentFragment();
    chars = [];
    let word = null, u = 0, fresh = 0;
    for (const cp of Array.from(next)) {
      const len = cp.length;
      const el = document.createElement("span");
      if (cp === "\n" || /\s/.test(cp)) {
        el.textContent = cp; el.dataset.nl = cp === "\n" ? "1" : "";
        frag.append(el); word = null;
      } else {
        if (!word) { word = document.createElement("span"); word.className = "sp-w"; frag.append(word); }
        el.className = "sp-ch"; el.textContent = cp;
        if (u >= a && u < newEnd) { el.classList.add("in"); el.style.setProperty("--d", Math.min(fresh++, 30) * 16 + "ms"); }
        word.append(el);
      }
      u += len;
      chars.push({ el, end: u });
    }
    layer.replaceChildren(frag);
    prev = next;
    lastMove = performance.now();
  }

  function target() {
    const sel = input.selectionEnd ?? prev.length;
    let j = 0;
    while (j < chars.length && chars[j].end <= sel) j++;
    const cs = getComputedStyle(box), padL = parseFloat(cs.paddingLeft) || 0, padT = parseFloat(cs.paddingTop) || 0;
    if (j === 0) return { x: padL, y: padT + (24 - CARET_H) / 2 };
    const el = chars[j - 1].el, r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (el.dataset.nl) return { x: padL, y: r.top - b.top + 24 + (24 - CARET_H) / 2 - Math.max(0, (24 - r.height) / 2) };
    return { x: r.right - b.left, y: r.top - b.top + r.height / 2 - CARET_H / 2 };
  }

  const events = ["keydown", "keyup", "click", "select", "input", "focus"];
  events.forEach((ev) => input.addEventListener(ev, () => { lastMove = performance.now(); }));

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    if (input.value !== prev) rebuild(input.value);       // typed, pasted, dictated or cleared by the page
    layer.style.transform = `translateY(${-input.scrollTop}px)`;
    const focused = document.activeElement === input && input.selectionStart === input.selectionEnd;
    const t = target();
    X.t = t.x; Y.t = t.y;
    if (snap || !focused) { X.x = X.t; Y.x = Y.t; X.v = Y.v = 0; snap = !focused; }
    for (let k = 0; k < 4; k++) { step(X, dt / 4); step(Y, dt / 4); }
    const speed = Math.abs(X.v) + Math.abs(Y.v), stretch = Math.min(speed / 80, 7);
    caret.style.width = 2 + stretch + "px";
    caret.style.transform = `translate(${X.x - (X.v > 0 ? stretch : 0)}px, ${Y.x}px)`;
    const idle = performance.now() - lastMove > 550 && speed < 5;
    caret.style.opacity = focused ? 1 : 0;
    caret.classList.toggle("blink", focused && idle);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
