(function () {
  const API_BASE = "https://g960-chatbot-api-563810413320.europe-west1.run.app"; // <-- jouw API
  const MOUNT_ID = "g960-chat";
  const SESSION_KEY = "g960_session_id";

  function uuid() {
    return (crypto?.randomUUID?.() || ("s_" + Math.random().toString(16).slice(2) + Date.now().toString(16)));
  }

  function getSessionId() {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) { sid = uuid(); localStorage.setItem(SESSION_KEY, sid); }
    return sid;
  }

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "style") Object.assign(n.style, v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    children.forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  }

  function ensureMount() {
    let m = document.getElementById(MOUNT_ID);
    if (!m) {
      m = el("div", { id: MOUNT_ID });
      document.body.appendChild(m);
    }
    return m;
  }

  function injectStyles() {
    if (document.getElementById("g960-embed-css")) return;
    const css = `
#g960-chat { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
.g960-wrap{max-width:900px;margin:0 auto;border:1px solid rgba(0,0,0,.12);border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.08)}
.g960-head{padding:14px 16px;font-weight:700;background:#0b1f3a;color:#fff;display:flex;justify-content:space-between;align-items:center}
.g960-body{height:560px;overflow:auto;background:#fff;padding:14px;display:flex;flex-direction:column;gap:10px}
.g960-row{display:flex;gap:10px}
.g960-bubble{max-width:78%;padding:10px 12px;border-radius:14px;line-height:1.35;font-size:14px;white-space:pre-wrap}
.g960-user{justify-content:flex-end}
.g960-user .g960-bubble{background:#0b1f3a;color:#fff;border-bottom-right-radius:6px}
.g960-bot .g960-bubble{background:#f2f4f7;color:#111;border-bottom-left-radius:6px}
.g960-foot{padding:12px 12px;border-top:1px solid rgba(0,0,0,.08);display:flex;gap:10px;background:#fff}
.g960-in{flex:1;border:1px solid rgba(0,0,0,.18);border-radius:12px;padding:10px 12px;font-size:14px;outline:none}
.g960-btn{border:0;border-radius:12px;padding:10px 14px;background:#ffd200;color:#111;font-weight:800;cursor:pointer}
.g960-btn:disabled{opacity:.6;cursor:not-allowed}
.g960-hint{font-size:12px;opacity:.8}
    `.trim();
    const style = el("style", { id: "g960-embed-css" }, [css]);
    document.head.appendChild(style);
  }

  async function postMessage(text, sessionId) {
    const r = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId })
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  }

  function render() {
    injectStyles();
    const mount = ensureMount();
    mount.innerHTML = "";

    const body = el("div", { class: "g960-body" });
    const input = el("input", { class: "g960-in", placeholder: "Typ je vraag… (bv. onderhoud, remmen, diagnose)", autocomplete: "off" });
    const btn = el("button", { class: "g960-btn" }, ["Verstuur"]);
    const hint = el("div", { class: "g960-hint" }, ["Tip: vermeld merk/model/bouwjaar/motorcode voor snellere intake."]);

    function addBubble(role, text) {
      const row = el("div", { class: `g960-row g960-${role}` }, [
        el("div", { class: "g960-bubble" }, [text])
      ]);
      body.appendChild(row);
      body.scrollTop = body.scrollHeight;
    }

    const sessionId = getSessionId();

    async function send() {
      const text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      btn.disabled = true;
      addBubble("user", text);

      try {
        const data = await postMessage(text, sessionId);
        const reply = (data?.reply || data?.message || "Geen antwoord ontvangen.");
        addBubble("bot", reply);
      } catch (e) {
        addBubble("bot", "Technische fout. Probeer opnieuw of contacteer Garage 960 via WhatsApp.");
      } finally {
        btn.disabled = false;
        input.focus();
      }
    }

    btn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

    const wrap = el("div", { class: "g960-wrap" }, [
      el("div", { class: "g960-head" }, ["Garage 960 Chatbot"]),
      body,
      el("div", { class: "g960-foot" }, [input, btn]),
      el("div", { style: { padding: "0 12px 12px", background: "#fff" } }, [hint])
    ]);

    mount.appendChild(wrap);
    addBubble("bot", "Welkom. Waarmee kan ik helpen? (Onderhoud / diagnose / keuring / banden / remmen / …)");
    input.focus();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
