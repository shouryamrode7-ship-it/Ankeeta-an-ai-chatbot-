/* Background scene: a Japanese lake at night (or in the soft light of day): moon, Mount Fuji, a pagoda and
   temple, an arched bridge, a stone lantern and the lake with reflections. Drawn here as SVG so it needs no
   image files; colours come from CSS variables so the light/dark switch re-paints it. */
(() => {
  const host = document.getElementById("scene");
  if (!host) return;
  let seed = 5;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rand = (a, b) => a + (b - a) * rnd();
  const n = (v) => +v.toFixed(1);
  const W = 1600, H = 900, SHORE = 600;
  const out = [];
  const add = (s) => out.push(s);

  // sky, stars, moon, clouds
  add(`<rect class="c-sky" width="${W}" height="${SHORE + 40}" fill="url(#sky)"/>`);
  let stars = "";
  for (let i = 0; i < 90; i++) stars += `<circle cx="${n(rand(0, W))}" cy="${n(rand(0, 380))}" r="${n(rand(0.6, 1.8))}" opacity="${n(rand(0.35, 1))}"/>`;
  add(`<g class="c-stars">${stars}</g>`);
  add(`<circle cx="340" cy="210" r="170" fill="url(#moonGlow)"/><circle class="c-moon" cx="340" cy="210" r="54"/>
       <g class="c-crater"><ellipse cx="322" cy="198" rx="13" ry="10"/><ellipse cx="356" cy="230" rx="9" ry="7"/><ellipse cx="350" cy="190" rx="6" ry="5"/></g>`);
  add(`<g class="c-cloud"><ellipse cx="170" cy="150" rx="150" ry="14"/><ellipse cx="260" cy="268" rx="190" ry="12"/><ellipse cx="1060" cy="190" rx="210" ry="13"/><ellipse cx="620" cy="140" rx="170" ry="10"/></g>`);

  // Mount Fuji and hills
  add(`<path class="c-hill-far" d="M0 ${SHORE - 70} Q150 ${SHORE - 130} 330 ${SHORE - 60} T620 ${SHORE - 40} L620 ${SHORE + 20} L0 ${SHORE + 20}Z"/>`);
  add(`<path class="c-fuji" d="M360 ${SHORE} C520 ${SHORE - 40} 610 400 690 330 L752 292 L800 282 L850 294 L912 332 C1000 404 1090 ${SHORE - 40} 1250 ${SHORE}Z"/>`);
  add(`<path class="c-snow" d="M688 334 L735 304 L772 292 L800 283 L850 295 L892 322 L914 338 Q890 330 872 346 L846 322 L824 350 L800 322 L776 352 L752 326 L724 350 L706 346 Q696 340 688 334Z"/>`);
  add(`<path class="c-hill-far" d="M1000 ${SHORE - 20} Q1180 ${SHORE - 120} 1340 ${SHORE - 70} T1600 ${SHORE - 90} L1600 ${SHORE + 20} L1000 ${SHORE + 20}Z"/>`);
  add(`<rect class="c-mist" x="0" y="${SHORE - 120}" width="${W}" height="150" fill="url(#mist)"/>`);

  // right shore with distant blossom trees
  add(`<path class="c-land" d="M1060 ${SHORE + 8} Q1200 ${SHORE - 30} 1380 ${SHORE - 10} L1600 ${SHORE - 20} L1600 ${SHORE + 40} L1060 ${SHORE + 40}Z"/>`);
  let bush = "";
  for (let i = 0; i < 46; i++) bush += `<circle cx="${n(rand(1180, 1560))}" cy="${n(rand(SHORE - 120, SHORE - 20))}" r="${n(rand(12, 34))}" opacity="${n(rand(0.25, 0.6))}"/>`;
  add(`<g class="c-bush">${bush}</g>`);

  // left shore: pines, temple halls, pagoda, bridge
  add(`<path class="c-land" d="M0 ${SHORE - 90} C130 ${SHORE - 100} 270 ${SHORE - 30} 430 ${SHORE + 4} L560 ${SHORE + 14} L560 ${SHORE + 40} L0 ${SHORE + 40}Z"/>`);
  for (const [x, y, s] of [[30, 520, 1.1], [80, 500, 1.3], [440, 560, 0.9], [480, 575, 0.7], [18, 570, 0.9]]) {
    let t = "";
    for (let k = 0; k < 4; k++) t += `<path d="M${x - (46 - k * 8) * s} ${y - k * 24 * s} L${x} ${y - (k * 24 + 40) * s} L${x + (46 - k * 8) * s} ${y - k * 24 * s}Z"/>`;
    add(`<g class="c-pine">${t}<rect x="${x - 3}" y="${y}" width="6" height="${30 * s}"/></g>`);
  }
  const windows = [];
  const roof = (cx, y, w, hgt) => `<path class="c-roof" d="M${cx - w - 20} ${y + 14} Q${cx - w + 4} ${y + 10} ${cx - w + 22} ${y - 4} L${cx - 10} ${y - hgt} L${cx + 10} ${y - hgt} L${cx + w - 22} ${y - 4} Q${cx + w - 4} ${y + 10} ${cx + w + 20} ${y + 14} Q${cx} ${y + 26} ${cx - w - 20} ${y + 14}Z"/>`;
  // pagoda
  const px = 205, base = SHORE - 38;
  let pg = "";
  for (let i = 0; i < 5; i++) {
    const y = base - i * 52, w = 92 - i * 12;
    pg += `<rect class="c-wall" x="${px - w * 0.62}" y="${y - 40}" width="${w * 1.24}" height="38"/>`;
    pg += roof(px, y - 38, w, 30);
    for (let k = -1; k <= 1; k++) windows.push([px + k * w * 0.36 - 4, y - 28, 8, 14]);
  }
  pg += `<rect class="c-roof" x="${px - 2}" y="${base - 5 * 52 - 70}" width="4" height="64"/>`;
  for (let k = 0; k < 5; k++) pg += `<rect class="c-roof" x="${px - 9 + k}" y="${base - 5 * 52 - 62 + k * 11}" width="${18 - 2 * k}" height="3" rx="1.5"/>`;
  add(pg);
  // temple halls
  let hall = "";
  for (const [cx, y, w] of [[96, SHORE - 20, 120], [360, SHORE - 6, 110]]) {
    hall += `<rect class="c-wall" x="${cx - w * 0.8}" y="${y - 44}" width="${w * 1.6}" height="46"/>` + roof(cx, y - 44, w, 38);
    for (let k = -3; k <= 3; k++) windows.push([cx + k * w * 0.21 - 5, y - 32, 10, 20]);
  }
  add(hall);
  // arched bridge
  add(`<g class="c-bridge"><path d="M420 ${SHORE + 6} Q470 ${SHORE - 44} 520 ${SHORE + 6}" fill="none" stroke-width="7"/><path d="M420 ${SHORE - 14} Q470 ${SHORE - 64} 520 ${SHORE - 14}" fill="none" stroke-width="3"/>
       ${[432, 450, 470, 490, 508].map((x) => `<line x1="${x}" y1="${SHORE + 2 - Math.max(0, 28 - Math.abs(x - 470) * 0.6)}" x2="${x}" y2="${SHORE - 16 - Math.max(0, 28 - Math.abs(x - 470) * 0.6)}" stroke-width="2"/>`).join("")}</g>`);
  for (const [x, y] of [[392, SHORE - 6], [530, SHORE + 4], [560, SHORE + 12]]) windows.push([x - 3, y - 20, 6, 14, 1]);
  add(`<g class="c-win">${windows.map((w) => `<rect x="${n(w[0])}" y="${n(w[1])}" width="${w[2]}" height="${w[3]}" rx="1"/>`).join("")}</g>`);

  // lake: base, moon path, window reflections, ripples
  add(`<rect class="c-water" y="${SHORE + 12}" width="${W}" height="${H - SHORE}" fill="url(#water)"/>`);
  let refl = "";
  for (const w of windows) refl += `<rect x="${n(w[0] + 1)}" y="${n(SHORE + 18 + (SHORE - w[1]) * 0.9)}" width="${w[2] - 2}" height="${n(rand(26, 80))}" rx="2" opacity="${n(rand(0.18, 0.4))}"/>`;
  add(`<g class="c-reflect shimmer">${refl}</g>`);
  let streak = "";
  for (let i = 0; i < 9; i++) streak += `<ellipse cx="340" cy="${n(SHORE + 50 + i * 24)}" rx="${n(26 + i * 4 + rand(0, 8))}" ry="${n(2.2 + i * 0.25)}" opacity="${n(0.5 - i * 0.04)}"/>`;
  add(`<g class="c-moonpath shimmer">${streak}</g>`);
  let ripples = "";
  for (let i = 0; i < 46; i++) { const y = SHORE + 30 + rnd() * rnd() * 260, x = rand(0, W), l = rand(30, 120) * (1 + (y - SHORE) / 200); ripples += `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + l)}" y2="${n(y)}" opacity="${n(rand(0.06, 0.2))}"/>`; }
  add(`<g class="c-ripple">${ripples}</g>`);

  // foreground: stone lantern with torii post (right), pier (bottom), fallen petals
  add(`<rect class="c-pier" y="${H - 105}" width="${W}" height="105" fill="url(#pier)"/>`);
  let planks = "";
  for (let i = -8; i <= 24; i++) planks += `<line x1="${800 + i * 48}" y1="${H - 105}" x2="${800 + i * 110 - 400}" y2="${H}" />`;
  add(`<g class="c-plank">${planks}</g>`);
  add(`<circle cx="1466" cy="${H - 196}" r="120" fill="url(#lanternGlow)"/>
       <g class="c-red"><rect x="1500" y="${H - 300}" width="22" height="260"/><rect x="1486" y="${H - 330}" width="120" height="16" rx="2"/><rect x="1530" y="${H - 292}" width="90" height="12"/></g>
       <g class="c-stone"><path d="M1418 ${H - 222} L1466 ${H - 258} L1514 ${H - 222}Z"/><rect x="1428" y="${H - 222}" width="76" height="62" rx="3"/><rect x="1440" y="${H - 160}" width="52" height="20"/><rect x="1432" y="${H - 140}" width="68" height="34" rx="3"/></g>
       <rect class="c-lamp" x="1440" y="${H - 214}" width="52" height="46" rx="2"/>`);
  let pet = "";
  for (let i = 0; i < 38; i++) pet += `<ellipse cx="${n(rand(0, W))}" cy="${n(rand(H - 150, H - 6))}" rx="${n(rand(4, 8))}" ry="${n(rand(2, 4))}" transform="rotate(${(rnd() * 180) | 0} ${n(rand(0, W))} 0)" opacity="${n(rand(0.5, 0.95))}"/>`;
  add(`<g class="c-fallen">${pet}</g>`);
  add(`<rect width="${W}" height="${H}" fill="url(#vignette)"/>`);

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="presentation">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop class="s-sky0" offset="0"/><stop class="s-sky1" offset=".62"/><stop class="s-sky2" offset="1"/></linearGradient>
      <radialGradient id="moonGlow"><stop class="s-glow" offset="0"/><stop class="s-glow" offset=".35" stop-opacity=".35"/><stop class="s-glow" offset="1" stop-opacity="0"/></radialGradient>
      <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop class="s-mist" offset="0" stop-opacity="0"/><stop class="s-mist" offset=".6"/><stop class="s-mist" offset="1" stop-opacity="0"/></linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop class="s-water0" offset="0"/><stop class="s-water1" offset="1"/></linearGradient>
      <linearGradient id="pier" x1="0" y1="0" x2="0" y2="1"><stop class="s-pier0" offset="0"/><stop class="s-pier1" offset="1"/></linearGradient>
      <radialGradient id="lanternGlow"><stop class="s-lamp" offset="0" stop-opacity=".75"/><stop class="s-lamp" offset=".4" stop-opacity=".22"/><stop class="s-lamp" offset="1" stop-opacity="0"/></radialGradient>
      <radialGradient id="vignette" cx=".5" cy=".5" r=".75"><stop class="s-vig" offset=".55" stop-opacity="0"/><stop class="s-vig" offset="1"/></radialGradient>
    </defs>${out.join("")}</svg>`;
})();
