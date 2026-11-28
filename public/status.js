// Shows whether Ankeeta's server is reachable, using the real /health endpoint.
(() => {
  const els = document.querySelectorAll("[data-status]");
  const year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
  if (!els.length) return;
  const set = (ok) => els.forEach((el) => {
    el.classList.toggle("ok", ok);
    const label = el.querySelector("span");
    if (label) label.textContent = (el.dataset.prefix || "") + (ok ? "Online" : "Unavailable");
  });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  fetch("/health", { signal: ctl.signal, cache: "no-store" })
    .then((r) => set(r.ok)).catch(() => set(false)).finally(() => clearTimeout(timer));
})();
