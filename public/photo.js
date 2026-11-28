// Optional photo backgrounds. Drop a clean (no UI) image at public/bg-night.jpg for dark mode
// and/or public/bg-day.jpg for light mode; when a file exists it replaces the drawn scene.
(() => {
  const root = document.documentElement;
  for (const [theme, file] of [["dark", "/bg-night.jpg"], ["light", "/bg-day.jpg"]]) {
    const img = new Image();
    img.onload = () => {
      root.style.setProperty("--photo-" + theme, `url("${file}")`);
      root.classList.add("photo-" + theme);
    };
    img.src = file;
  }
})();
