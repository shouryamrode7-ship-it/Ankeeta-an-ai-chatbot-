(() => {
  const log = document.getElementById("log");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("msg");
  const send = document.getElementById("send");
  const chips = document.getElementById("chips");

  function newId() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let sessionId;
  try {
    sessionId = localStorage.getItem("ankeeta_session");
    if (!sessionId) { sessionId = newId(); localStorage.setItem("ankeeta_session", sessionId); }
  } catch (_) { sessionId = newId(); }

  function scrollDown() { log.scrollTop = log.scrollHeight; }

  function add(text, cls) {
    const el = document.createElement("div");
    el.className = "bubble " + cls;
    el.textContent = text;
    log.appendChild(el);
    scrollDown();
    return el;
  }

  function addTyping() {
    const el = document.createElement("div");
    el.className = "bubble bot";
    el.innerHTML = '<span class="dots" role="status" aria-label="Ankeeta is typing"><i></i><i></i><i></i></span>';
    log.appendChild(el);
    scrollDown();
    return el;
  }

  async function post(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }

  async function sendMessage(text) {
    text = text.trim();
    if (!text || send.disabled) return;
    chips.hidden = true;
    add(text, "me");
    send.disabled = true;
    const typing = addTyping();
    try {
      const { reply } = await post("/api/chat", { sessionId, message: text });
      typing.remove();
      add(reply, "bot");
    } catch (err) {
      typing.remove();
      add(err.message, "err");
    } finally {
      send.disabled = false;
      if (window.matchMedia("(pointer: fine)").matches) input.focus();
    }
  }

  (async () => {
    try {
      const { messages } = await post("/api/chat/start", { sessionId });
      for (const m of messages) add(m.content, m.role === "user" ? "me" : "bot");
      // Offer conversation starters only for a brand-new chat.
      chips.hidden = messages.some((m) => m.role === "user");
    } catch (err) { add(err.message, "err"); }
    // Only auto-focus with a mouse/keyboard; on phones it would open the keyboard over the greeting.
    if (window.matchMedia("(pointer: fine)").matches) input.focus();
  })();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = "";
    sendMessage(text);
  });

  chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) sendMessage(chip.textContent);
  });
})();
