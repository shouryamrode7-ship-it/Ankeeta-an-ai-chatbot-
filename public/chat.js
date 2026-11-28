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
let attachments = []; // { name, text, status: "busy" | "ready" }

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

const ICON_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
const DEFAULT_FILE_MESSAGE = "Please take a look at the attached file.";

// the server keeps attached file text inside [[attachment: name]] blocks; show those as chips again
function parseUser(content) {
  const files = [];
  const text = content.replace(/\n*\[\[attachment: ([^\]\n]*)\]\]\n[\s\S]*?\n\[\[\/attachment\]\]/g, (_, name) => { files.push(name); return ""; }).trim();
  return [files.length && text === DEFAULT_FILE_MESSAGE ? "" : text, files];
}

function addUser(text, files = []) {
  const el = document.createElement("div");
  el.className = "msg user";
  if (files.length) {
    const chips = document.createElement("div");
    chips.className = "chips";
    files.forEach((name) => {
      const chip = document.createElement("span");
      chip.className = "chip view";
      chip.innerHTML = ICON_FILE;
      const label = document.createElement("span");
      label.textContent = name;
      chip.append(label);
      chips.append(chip);
    });
    el.append(chips);
  }
  if (text) {
    const t = document.createElement("span");
    t.className = "msg-text";
    t.textContent = text;
    el.append(t);
  }
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
function syncSend() {
  const ready = attachments.some((a) => a.status === "ready");
  send.disabled = busy || attachments.some((a) => a.status === "busy") || (!input.value.trim() && !ready);
}

async function sendMessage(raw) {
  const text = raw.trim();
  const files = attachments.filter((a) => a.status === "ready");
  if ((!text && !files.length) || busy || attachments.some((a) => a.status === "busy")) return;
  busy = true;
  stopMic();
  body.classList.add("started");
  input.value = ""; autoGrow();
  attachments = []; renderAttachments(); syncSend();
  addUser(text, files.map((f) => f.name));
  touchChat(sessionId, text || files[0].name);
  const typing = addTyping();
  try {
    const { reply } = await post("/api/chat", {
      sessionId, message: text,
      ...(files.length ? { attachments: files.map(({ name, text: t }) => ({ name, text: t })) } : {}),
    });
    typing.remove();
    addAi(reply);
  } catch (err) {
    typing.remove();
    addError(err.message);
    // give the message and files back so they can be sent again
    if (!input.value) { input.value = text; autoGrow(); }
    if (!attachments.length) { attachments = files; renderAttachments(); }
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

// ── chats list in the sidebar (kept in this browser; the server holds each chat's messages) ──
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const CHATS_KEY = "ankeeta_chats";
const chatList = $("chat-list"), chatEmpty = $("chat-empty"), chatSearch = $("chat-search");
const root = document.documentElement;

function readChats() {
  try { const v = JSON.parse(localStorage.getItem(CHATS_KEY) || "[]"); return Array.isArray(v) ? v.filter((c) => c && typeof c.id === "string" && typeof c.title === "string") : []; }
  catch (_) { return []; }
}
function writeChats(c) { try { localStorage.setItem(CHATS_KEY, JSON.stringify(c.slice(0, 50))); } catch (_) {} }
function touchChat(id, title, { bump = true } = {}) {
  const chats = readChats();
  const i = chats.findIndex((c) => c.id === id);
  if (i >= 0 && !bump) return;
  const chat = i >= 0 ? chats.splice(i, 1)[0] : { id, title: (title || "New chat").replace(/\s+/g, " ").trim().slice(0, 48) };
  chat.ts = Date.now();
  chats.unshift(chat);
  writeChats(chats);
  renderChats();
}
function renderChats() {
  const q = chatSearch.value.trim().toLowerCase();
  const chats = readChats().filter((c) => !q || c.title.toLowerCase().includes(q));
  chatList.replaceChildren(...chats.map((c) => {
    const li = document.createElement("li");
    const open = document.createElement("button");
    open.type = "button"; open.className = "sb-chat" + (c.id === sessionId ? " active" : "");
    open.dataset.id = c.id; open.textContent = c.title; open.title = c.title;
    if (c.id === sessionId) open.setAttribute("aria-current", "true");
    const del = document.createElement("button");
    del.type = "button"; del.className = "sb-del"; del.dataset.del = c.id;
    del.setAttribute("aria-label", "Delete chat: " + c.title); del.innerHTML = ICON_X;
    li.append(open, del);
    return li;
  }));
  chatEmpty.hidden = chats.length > 0;
  chatEmpty.textContent = q ? "No chats match your search." : "No chats yet. Say hello!";
}

async function openSession(id) {
  sessionId = id;
  try { localStorage.setItem("ankeeta_session", id); } catch (_) {}
  log.replaceChildren();
  body.classList.remove("started");
  input.value = ""; autoGrow(); syncSend();
  try {
    const { messages } = await post("/api/chat/start", { sessionId });
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) {
      messages.forEach((m, i) => {
        if (m.role === "user") addUser(...parseUser(m.content));
        else if (i > 0) addAi(m.content); // the opening greeting is replaced by the welcome screen
      });
      body.classList.add("started");
      { const [t, f] = parseUser(firstUser.content); touchChat(id, t || f[0] || "New chat", { bump: false }); } // adds chats that predate the sidebar
      scrollDown(false);
    }
  } catch (err) {
    body.classList.add("started");
    addError(err.message);
  }
  renderChats();
  convo.scrollTo({ top: 0 });
  if (body.classList.contains("started")) scrollDown(false);
}

// fade the conversation out, swap it, fade back in
async function swapTo(id) {
  if (busy) return;
  root.classList.remove("sb-open");
  if (!reduced && log.children.length) {
    convo.classList.add("fading");
    await new Promise((r) => setTimeout(r, 200));
  }
  await openSession(id);
  convo.classList.remove("fading");
  if (finePointer) input.focus();
}

document.querySelectorAll("[data-new-chat]").forEach((b) => b.addEventListener("click", () => swapTo(newId())));
chatSearch.addEventListener("input", renderChats);
chatList.addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    if (busy) return;
    const id = del.dataset.del;
    writeChats(readChats().filter((c) => c.id !== id));
    if (id === sessionId) swapTo(newId()); else renderChats();
    return;
  }
  const open = e.target.closest(".sb-chat");
  if (open && open.dataset.id !== sessionId) swapTo(open.dataset.id);
  else if (open) root.classList.remove("sb-open");
});

(async () => {
  await openSession(sessionId);
  body.classList.remove("pending");
  if (finePointer) input.focus();
})();

// ── attach files / PDFs ──
const fileInput = $("file"), attachBox = $("attachments"), noteEl = $("composer-note");
const DEFAULT_NOTE = noteEl.textContent;
let noteTimer = 0;
function note(text, ms = 6000) {
  noteEl.textContent = text;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { noteEl.textContent = DEFAULT_NOTE; }, ms);
}

const MAX_FILES = 3, MAX_BYTES = 5 * 1024 * 1024, MAX_CHARS = 15000;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|log|html?|css|js|ts|py|java|c|cpp|h|sql|xml|ya?ml)$/i;

function renderAttachments() {
  attachBox.hidden = attachments.length === 0;
  attachBox.replaceChildren(...attachments.map((a) => {
    const chip = document.createElement("span");
    chip.className = "chip" + (a.status === "busy" ? " busy" : "");
    chip.innerHTML = ICON_FILE;
    const label = document.createElement("span");
    label.textContent = a.status === "busy" ? `Reading ${a.name}…` : a.name;
    const rm = document.createElement("button");
    rm.type = "button"; rm.setAttribute("aria-label", "Remove " + a.name); rm.innerHTML = ICON_X;
    rm.addEventListener("click", () => { attachments = attachments.filter((x) => x !== a); renderAttachments(); syncSend(); });
    chip.append(label, rm);
    return chip;
  }));
}

async function pdfText(file) {
  const pdfjs = await import("/vendor/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let out = "";
  for (let p = 1; p <= Math.min(doc.numPages, 40) && out.length < MAX_CHARS; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    out += content.items.map((i) => i.str + (i.hasEOL ? "\n" : "")).join(" ") + "\n\n";
  }
  return out;
}

async function addFiles(list) {
  for (const file of list) {
    if (attachments.length >= MAX_FILES) { note(`You can attach up to ${MAX_FILES} files at a time.`); break; }
    if (file.size > MAX_BYTES) { note(`${file.name} is bigger than 5 MB.`); continue; }
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf && !(file.type.startsWith("text/") || TEXT_EXT.test(file.name))) {
      note(`${file.name}: I can read PDFs and text files (txt, md, csv, json, code).`);
      continue;
    }
    const item = { name: file.name, text: "", status: "busy" };
    attachments.push(item); renderAttachments(); syncSend();
    try {
      let text = (isPdf ? await pdfText(file) : await file.text()).replace(/\u0000/g, "").trim();
      if (!text) throw new Error("empty");
      if (text.length > MAX_CHARS) { text = text.slice(0, MAX_CHARS); note(`${file.name} is long, so I'll read the first part.`); }
      item.text = text; item.status = "ready";
    } catch (_) {
      attachments = attachments.filter((x) => x !== item);
      note(isPdf ? `I couldn't find any text in ${file.name}. Scanned PDFs aren't supported yet.` : `I couldn't read ${file.name}.`);
    }
    renderAttachments(); syncSend();
  }
}
$("attach").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => { addFiles([...fileInput.files]); fileInput.value = ""; });
// dropping files onto the page works too
addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });

// ── dictation (browser speech recognition; the button only shows where it is supported) ──
const mic = $("mic");
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function stopMic() { if (rec) { try { rec.stop(); } catch (_) {} } }
if (Recognition) {
  mic.hidden = false;
  mic.addEventListener("click", () => {
    if (rec) { stopMic(); return; }
    if (busy) return;
    const r = new Recognition();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = true;
    const base = input.value && !/\s$/.test(input.value) ? input.value + " " : input.value;
    r.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      input.value = (base + said).slice(0, 1000);
      autoGrow(); syncSend();
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") note("Microphone access is blocked. Allow it in your browser's site settings to dictate.");
      else if (e.error === "no-speech") note("I didn't hear anything. Try again.");
      else if (e.error !== "aborted") note("Dictation stopped. Please try again.");
    };
    r.onend = () => { rec = null; mic.classList.remove("listening"); mic.setAttribute("aria-pressed", "false"); mic.setAttribute("aria-label", "Speak your message"); };
    try {
      r.start();
      rec = r;
      mic.classList.add("listening"); mic.setAttribute("aria-pressed", "true"); mic.setAttribute("aria-label", "Stop listening");
      note("Listening… tap the microphone again to stop.", 4000);
    } catch (_) { rec = null; }
  });
}

