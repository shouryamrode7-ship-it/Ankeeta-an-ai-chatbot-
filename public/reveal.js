// Fades the "about" cards in as they scroll into view inside the chat.
(() => {
  const root = document.getElementById("convo");
  const items = document.querySelectorAll(".about .section-head, .about .card, .about .step, .about .footer-in");
  if (!root || !items.length || !("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { root, threshold: 0.15 });
  items.forEach((el, i) => { el.classList.add("rv"); el.style.transitionDelay = (i % 3) * 70 + "ms"; io.observe(el); });
})();
