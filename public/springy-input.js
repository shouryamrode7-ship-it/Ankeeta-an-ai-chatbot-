/* Springy input – plain JS, no dependencies.
   Spring physics and animation logic follow DesignBookmark's Springy Input; the stiffness/damping
   values are read from the CSS variables --input-caret and --input-morph (700 32 and 300 20). */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = (x, k = 400, c = 30) => ({ x, v: 0, t: x, k, c });
  const tune = (s, k, c) => { s.k = k; s.c = reduce ? 2 * Math.sqrt(k) : c; };
  const step = (s, dt) => { const a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * dt; s.x += s.v * dt; };
  const spring = (name, fallback) =>
    (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback).split(/\s+/).map(Number);

  const timers = [];
  const after = (sec, fn) => timers.push({ t: sec, fn });
  const comps = [];
  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= dt) <= 0) timers.splice(i, 1)[0].fn();
    for (let k = 0; k < 4; k++) comps.forEach((c) => c.frame(dt / 4));
    comps.forEach((c) => c.render());
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function init(field) {
    const q = (s) => field.querySelector(s);
    const input = q(".sp-input"), layer = q(".sp-layer-in"), caret = q(".sp-caret");
    const label = q(".sp-label"), go = q(".sp-go");
    const help = field.parentElement.querySelector(".sp-help");
    const T = { caret: spring("--input-caret", "700 32"), morph: spring("--input-morph", "300 20") };
    const C = S(0, ...T.caret), LB = S(0, 420, 26), W = S(0, ...T.morph), shake = S(0, 700, 10);
    let spans = [], prev = "", scroll = 0, lastMove = 0, focused = false, busy = false;

    function sync() {
      const next = input.value;
      if (next === prev) return;
      let a = 0; while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
      let b = 0; while (b < prev.length - a && b < next.length - a && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++;
      spans.splice(a, prev.length - a - b).forEach((s) => {
        const left = s.offsetLeft;
        s.classList.remove("in", "nope");
        s.style.left = left + "px";
        s.classList.add("out");
        setTimeout(() => s.remove(), 360);
      });
      const ref = spans[a] || null;
      const fresh = [...next.slice(a, next.length - b)].map((ch, i) => {
        const s = document.createElement("span");
        s.className = "sp-ch in"; s.textContent = ch;
        s.style.setProperty("--d", Math.min(i, 30) * 18 + "ms");
        layer.insertBefore(s, ref);
        return s;
      });
      spans.splice(a, 0, ...fresh);
      prev = next;
      lastMove = performance.now();
      field.classList.remove("err"); help.classList.remove("err"); help.textContent = "";
      go.classList.toggle("idle", !next);
    }

    function caretTarget() {
      const i = input.selectionEnd ?? spans.length;
      if (!spans.length) return 0;
      if (i < spans.length) return spans[i].offsetLeft;
      const l = spans[spans.length - 1];
      return l.offsetLeft + l.offsetWidth;
    }

    input.addEventListener("input", sync);
    input.addEventListener("focus", () => { focused = true; field.classList.add("focus"); });
    input.addEventListener("blur", () => { focused = false; field.classList.remove("focus"); });
    ["keydown", "keyup", "click", "select"].forEach((ev) => input.addEventListener(ev, () => { lastMove = performance.now(); }));

    field.addEventListener("submit", (e) => {
      e.preventDefault();
      if (busy) return;
      const v = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        spans.forEach((s, i) => { s.classList.remove("in", "nope"); void s.offsetWidth; s.style.setProperty("--d", i * 14 + "ms"); s.classList.add("nope"); });
        field.classList.add("err"); help.classList.add("err");
        help.textContent = v ? "That email doesn’t look right. Check it and try again." : "Type your email first.";
        shake.v += 420;
        input.focus();
        return;
      }
      busy = true;
      field.dispatchEvent(new CustomEvent("springy:submit", { bubbles: true, detail: { email: v } }));
      spans.forEach((s, i) => { s.classList.remove("in", "nope"); void s.offsetWidth; s.style.setProperty("--d", i * 16 + "ms"); s.classList.add("fly"); });
      after(.25 + spans.length * .016, () => {
        W.x = field.parentElement.clientWidth; W.v = 0;
        tune(W, ...T.morph); W.t = 232;
        field.classList.add("ok");
        field.setAttribute("aria-label", "You’re on the list");
        input.blur();
      });
      after(2.8 + spans.length * .016, reset);
    });

    function reset() {
      field.classList.remove("ok");
      field.removeAttribute("aria-label");
      tune(W, T.morph[0] * .8, T.morph[1]);
      W.t = field.parentElement.clientWidth;
      after(.6, () => { W.x = W.t = 0; W.v = 0; });
      input.value = ""; prev = "";
      spans.forEach((s) => s.remove()); spans = [];
      go.classList.add("idle");
      busy = false;
    }

    comps.push({
      frame(dt) {
        C.t = caretTarget();
        LB.t = focused || input.value ? 1 : 0;
        step(C, dt); step(LB, dt); step(W, dt); step(shake, dt);
      },
      render() {
        const box = layer.parentElement.clientWidth;
        const want = Math.max(0, C.t - box + 6);
        scroll += (want - scroll) * .25;
        if (Math.abs(want - scroll) < .3) scroll = want;
        layer.style.transform = `translateX(${-scroll}px)`;
        input.scrollLeft = scroll;
        const speed = Math.abs(C.v), stretch = Math.min(speed / 80, 7);
        caret.style.width = 2 + stretch + "px";
        caret.style.transform = `translateX(${C.x - scroll - (C.v > 0 ? stretch : 0)}px)`;
        const idle = performance.now() - lastMove > 550 && speed < 5;
        caret.style.opacity = focused && !busy ? 1 : 0;
        caret.classList.toggle("blink", focused && idle);
        label.style.transform = `translateY(${-13 * LB.x}px) scale(${1 - .3 * LB.x})`;
        field.style.width = W.x > 1 ? W.x + "px" : "";
        field.style.transform = `translateX(${shake.x}px)`;
      },
    });
  }

  document.querySelectorAll(".springy").forEach(init);
})();
