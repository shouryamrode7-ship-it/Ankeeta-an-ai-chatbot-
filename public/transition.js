/* Home page: "Start Chatting" sends a two-colour wave out from the button, the page folds away into it,
   then we move on to /chat, where enter.js pours the wave back into the message box. */
(() => {
  const links = document.querySelectorAll("a[data-enter]");
  if (!links.length) return;
  const targets = ["header.nav", "main", "footer.footer"].map((s) => document.querySelector(s)).filter(Boolean);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = false, layers = [], anims = [];

  function reset() {
    anims.forEach((a) => a.cancel()); anims = [];
    layers.forEach((l) => l.remove()); layers = [];
    document.documentElement.style.overflow = "";
    document.body.style.pointerEvents = "";
    running = false;
  }
  addEventListener("pageshow", (e) => { if (e.persisted) reset(); }); // back button must not show the covered page

  links.forEach((link) => link.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (running) return;
    running = true;
    const href = link.href;
    if (reduced) { location.assign(href); return; }
    const r0 = link.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    const R = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 24;
    document.documentElement.style.overflow = "hidden";
    document.body.style.pointerEvents = "none";

    targets.forEach((el) => anims.push(el.animate(
      [{ transform: "scale(1)", opacity: 1, filter: "blur(0)" }, { transform: "scale(0.94)", opacity: 0, filter: "blur(8px)" }],
      { duration: 620, delay: 60, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }
    )));

    const make = (varName, delay) => {
      const l = document.createElement("div");
      l.className = "wipe";
      l.style.background = `var(${varName})`;
      l.style.clipPath = `circle(0px at ${cx}px ${cy}px)`;
      document.body.appendChild(l); layers.push(l);
      const a = l.animate(
        [{ clipPath: `circle(0px at ${cx}px ${cy}px)` }, { clipPath: `circle(${R}px at ${cx}px ${cy}px)` }],
        { duration: 760, delay, easing: "cubic-bezier(.76,0,.24,1)", fill: "forwards" }
      );
      anims.push(a);
      return a;
    };
    make("--wipe-a", 0);
    const top = make("--wipe-b", 130);
    top.finished.then(() => {
      try { sessionStorage.setItem("ankeeta_wipe", String(Date.now())); } catch (_) {}
      location.assign(href);
    }).catch(() => reset());
  }));
})();
