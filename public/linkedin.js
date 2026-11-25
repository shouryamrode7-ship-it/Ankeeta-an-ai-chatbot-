(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("form"), out = $("out"), go = $("go"), copy = $("copy");

  try { $("key").value = sessionStorage.getItem("ankeeta_key") || ""; } catch (_) {}

  function parseContext(text) {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const m = /^(them|me)\s*:\s*(.*)$/i.exec(line);
        return m ? { role: m[1].toLowerCase(), text: m[2] } : null;
      })
      .filter(Boolean);
  }

  async function run(payload) {
    out.className = "";
    out.textContent = "Thinking…";
    copy.hidden = true;
    go.disabled = true;
    $("opener").disabled = true;

    const key = $("key").value.trim();
    try { sessionStorage.setItem("ankeeta_key", key); } catch (_) {}

    try {
      const res = await fetch("/api/linkedin/draft-reply", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      out.textContent = data.reply;
      copy.hidden = false;
    } catch (err) {
      out.className = "error";
      out.textContent = err.message;
    } finally {
      go.disabled = false;
      $("opener").disabled = false;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!$("message").value.trim()) {
      out.className = "error";
      out.textContent = 'Paste the incoming message first, or press "Get opening greeting".';
      return;
    }
    run({
      message: $("message").value,
      threadId: $("thread").value.trim() || undefined,
      context: parseContext($("context").value),
    });
  });

  $("opener").addEventListener("click", () => run({ opener: true }));

  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(out.textContent);
      copy.textContent = "Copied!";
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    } catch (_) {
      copy.textContent = "Select & copy manually";
    }
  });
})();
