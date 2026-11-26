/* Springy text – adds the bouncy letters and stretchy caret to any <input data-springy-text>.
   The real input stays (typing, paste, selection, screen readers) with transparent text; a mirror layer
   draws one span per character. Caret spring is the original 700 / 32 (CSS var --input-caret). */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const token = getComputedStyle(document.documentElement).getPropertyValue("--input-caret").trim() || "700 32";
  const [K, Cd] = token.split(/\s+/).map(Number);
  const damp = reduce ? 2 * Math.sqrt(K) : Cd;

  const all = [];
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    for (let k = 0; k < 4; k++) all.forEach((c) => c.frame(dt / 4));
    all.forEach((c) => c.render());
    requestAnimationFrame(loop);
  })(last);

  function attach(input) {
    const wrap = document.createElement("div");
    wrap.className = "st-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    wrap.insertAdjacentHTML("beforeend",
      '<div class="st-box" aria-hidden="true"><div class="st-layer"><div class="st-in"></div></div><span class="st-caret"></span></div>');
    input.classList.add("st-input");
    const layer = wrap.querySelector(".st-in"), box = wrap.querySelector(".st-box"), caret = wrap.querySelector(".st-caret");

    const c = { x: 0, v: 0, t: 0 };
    let spans = [], prev = "", scroll = 0, lastMove = 0, focused = false;

    function sync() {
      const next = input.value;
      if (next === prev) return;
      let a = 0; while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
      let b = 0; while (b < prev.length - a && b < next.length - a && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++;
      spans.splice(a, prev.length - a - b).forEach((s) => {
        s.classList.remove("in");
        s.style.left = s.offsetLeft + "px";
        s.classList.add("out");
        setTimeout(() => s.remove(), 360);
      });
      const ref = spans[a] || null;
      const fresh = [...next.slice(a, next.length - b)].map((ch, i) => {
        const s = document.createElement("span");
        s.className = "st-ch in"; s.textContent = ch;
        s.style.setProperty("--d", Math.min(i, 30) * 18 + "ms");
        layer.insertBefore(s, ref);
        return s;
      });
      spans.splice(a, 0, ...fresh);
      prev = next;
      lastMove = performance.now();
    }

    function caretTarget() {
      const i = input.selectionEnd ?? spans.length;
      if (!spans.length) return 0;
      if (i < spans.length) return spans[i].offsetLeft;
      const l = spans[spans.length - 1];
      return l.offsetLeft + l.offsetWidth;
    }

    input.addEventListener("focus", () => { focused = true; });
    input.addEventListener("blur", () => { focused = false; });
    ["keydown", "keyup", "click", "select"].forEach((ev) => input.addEventListener(ev, () => { lastMove = performance.now(); }));

    all.push({
      frame(dt) {
        sync(); // also catches input.value being cleared from code after sending
        c.t = caretTarget();
        const a = -K * (c.x - c.t) - damp * c.v;
        c.v += a * dt; c.x += c.v * dt;
      },
      render() {
        const w = box.clientWidth;
        const want = Math.max(0, c.t - w + 6);
        scroll += (want - scroll) * 0.25;
        if (Math.abs(want - scroll) < 0.3) scroll = want;
        layer.style.transform = `translateX(${-scroll}px)`;
        const speed = Math.abs(c.v), stretch = Math.min(speed / 80, 7);
        caret.style.width = 2 + stretch + "px";
        caret.style.transform = `translateX(${c.x - scroll - (c.v > 0 ? stretch : 0)}px)`;
        caret.style.opacity = focused ? 1 : 0;
        caret.classList.toggle("blink", focused && performance.now() - lastMove > 550 && speed < 5);
      },
    });
  }

  document.querySelectorAll("input[data-springy-text]").forEach(attach);
})();
