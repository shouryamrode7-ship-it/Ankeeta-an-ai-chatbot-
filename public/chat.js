(() => {
  const log = document.getElementById("log");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("msg");
  const send = document.getElementById("send");

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

  function add(text, cls) {
    const el = document.createElement("div");
    el.className = "bubble " + cls;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  async function post(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }

  (async () => {
    try {
      const { messages } = await post("/api/chat/start", { sessionId });
      for (const m of messages) add(m.content, m.role === "user" ? "me" : "bot");
    } catch (err) { add(err.message, "err"); }
    input.focus();
  })();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    add(text, "me");
    send.disabled = true;
    const typing = add("Ankeeta is typing…", "bot typing");
    try {
      const { reply } = await post("/api/chat", { sessionId, message: text });
      typing.remove();
      add(reply, "bot");
    } catch (err) {
      typing.remove();
      add(err.message, "err");
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
})();
