/* Chat page, runs in <head> before first paint. If we arrived through the home-page wave, the screen starts
   fully covered by the same colours; CSS (html.entering) then shrinks the wave into the message box. */
(() => {
  const root = document.documentElement;
  let t = 0;
  try { t = Number(sessionStorage.getItem("ankeeta_wipe") || 0); sessionStorage.removeItem("ankeeta_wipe"); } catch (_) {}
  if (!t || Date.now() - t > 15000 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.add("entering");
  setTimeout(() => root.classList.remove("entering"), 2400); // safety net: never stay covered
})();
