/* Runs in <head> before first paint: applies the saved theme and sidebar state, and wires the toggles. */
(() => {
  const root = document.documentElement;
  let theme = null, sb = null;
  try { theme = localStorage.getItem("ankeeta_theme"); sb = localStorage.getItem("ankeeta_sidebar"); } catch (_) {}
  root.dataset.theme = theme === "light" ? "light" : "dark";
  if (sb === "closed" && innerWidth > 900) root.classList.add("sb-closed");

  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (t) {
      const next = root.dataset.theme === "light" ? "dark" : "light";
      root.classList.add("theme-anim");
      root.dataset.theme = next;
      try { localStorage.setItem("ankeeta_theme", next); } catch (_) {}
      setTimeout(() => root.classList.remove("theme-anim"), 350);
      return;
    }
    const s = e.target.closest && e.target.closest("[data-sidebar-toggle]");
    if (s) {
      if (matchMedia("(max-width: 900px)").matches) root.classList.toggle("sb-open");
      else {
        const closed = root.classList.toggle("sb-closed");
        try { localStorage.setItem("ankeeta_sidebar", closed ? "closed" : "open"); } catch (_) {}
      }
      return;
    }
    if (e.target.closest && e.target.closest(".scrim")) root.classList.remove("sb-open");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") root.classList.remove("sb-open"); });
})();
