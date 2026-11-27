import { renderMarkdown } from "/markdown.js";

const $ = (id) => document.getElementById(id);
const log = $("log"), convo = $("convo"), form = $("chat-form"), input = $("msg"), send = $("send");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const body = document.body;

const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

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

let busy = false;

async function post(url, payload) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function scrollDown(smooth = true) {
  convo.scrollTo({ top: convo.scrollHeight, behavior: smooth && !reduced ? "smooth" : "auto" });
}

function logoEl() {
  const l = document.createElement("span");
  l.className = "logo"; l.setAttribute("aria-hidden", "true"); l.textContent = "A";
  return l;
}

function addUser(text) {
  const el = document.createElement("div");
  el.className = "msg user";
  el.textContent = text;
  log.appendChild(el);
  scrollDown();
  return el;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove();
    return ok;
  }
}

function addAi(text) {
  const el = document.createElement("div");
  el.className = "msg ai";
  const bodyEl = document.createElement("div");
  bodyEl.className = "msg-body";
  const md = document.createElement("div");
  md.className = "md";
  md.innerHTML = renderMarkdown(text);
  const actions = document.createElement("div");
  actions.className = "msg-actions";
  const copy = document.createElement("button");
  copy.type = "button"; copy.className = "icon-btn";
  copy.setAttribute("aria-label", "Copy response");
  copy.innerHTML = ICON_COPY + "<span>Copy</span>";
  copy.addEventListener("click", async () => {
    const ok = await copyText(text);
    copy.innerHTML = (ok ? ICON_CHECK : ICON_COPY) + `<span>${ok ? "Copied" : "Couldn’t copy"}</span>`;
    setTimeout(() => { copy.innerHTML = ICON_COPY + "<span>Copy</span>"; }, 1600);
  });
  actions.appendChild(copy);
  bodyEl.append(md, actions);
  el.append(logoEl(), bodyEl);
  log.appendChild(el);
  scrollDown();
  return el;
}

function addTyping() {
  const el = document.createElement("div");
  el.className = "msg ai";
  const b = document.createElement("div");
  b.className = "msg-body";
  b.innerHTML = '<span class="typing" role="status" aria-label="Ankeeta is typing"><i></i><i></i><i></i></span>';
  el.append(logoEl(), b);
  log.appendChild(el);
  scrollDown();
  return el;
}

function addError(text) {
  const el = document.createElement("div");
  el.className = "msg error";
  el.setAttribute("role", "alert");
  el.textContent = text;
  log.appendChild(el);
  scrollDown();
}

function autoGrow() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 200) + "px";
}
function syncSend() { send.disabled = busy || !input.value.trim(); }

async function sendMessage(raw) {
  const text = raw.trim();
  if (!text || busy) return;
  busy = true;
  body.classList.add("started");
  input.value = ""; autoGrow(); syncSend();
  addUser(text);
  const typing = addTyping();
  try {
    const { reply } = await post("/api/chat", { sessionId, message: text });
    typing.remove();
    addAi(reply);
  } catch (err) {
    typing.remove();
    addError(err.message);
    if (!input.value) { input.value = text; autoGrow(); } // give the message back so it can be sent again
  } finally {
    busy = false;
    syncSend();
    if (finePointer) input.focus();
  }
}

form.addEventListener("submit", (e) => { e.preventDefault(); sendMessage(input.value); });
input.addEventListener("input", () => { autoGrow(); syncSend(); });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(input.value); }
});
document.querySelectorAll(".prompt").forEach((b) => b.addEventListener("click", () => sendMessage(b.dataset.prompt)));

// copy button on code blocks (works for every rendered reply)
log.addEventListener("click", async (e) => {
  const btn = e.target.closest(".code-copy");
  if (!btn) return;
  const code = btn.closest(".code")?.querySelector("code");
  if (!code) return;
  const ok = await copyText(code.textContent);
  btn.textContent = ok ? "Copied" : "Couldn’t copy";
  setTimeout(() => { btn.textContent = "Copy"; }, 1600);
});

$("new-chat").addEventListener("click", async () => {
  if (busy) return;
  sessionId = newId();
  try { localStorage.setItem("ankeeta_session", sessionId); } catch (_) {}
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && log.children.length) {
    convo.classList.add("fading");
    await new Promise((r) => setTimeout(r, 200));
  }
  log.replaceChildren();
  convo.classList.remove("fading");
  body.classList.remove("started");
  input.value = ""; autoGrow(); syncSend();
  convo.scrollTo({ top: 0 });
  try { await post("/api/chat/start", { sessionId }); } catch (_) { /* the first message will start the session anyway */ }
  if (finePointer) input.focus();
});

(async () => {
  try {
    const { messages } = await post("/api/chat/start", { sessionId });
    const started = messages.some((m) => m.role === "user");
    if (started) {
      messages.forEach((m, i) => {
        if (m.role === "user") addUser(m.content);
        else if (i > 0) addAi(m.content); // the opening greeting is replaced by the welcome screen
      });
      body.classList.add("started");
      scrollDown(false);
    }
  } catch (err) {
    body.classList.add("started");
    addError(err.message);
  }
  body.classList.remove("pending");
  if (finePointer) input.focus();
})();

// fade the chat out before going back to the home page
document.querySelectorAll('a[href="/"]').forEach((a) => a.addEventListener("click", (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  e.preventDefault();
  document.body.classList.add("leaving");
  setTimeout(() => { location.assign("/"); }, 240);
}));
window.addEventListener("pageshow", (e) => { if (e.persisted) document.body.classList.remove("leaving"); });
