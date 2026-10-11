/* Recall Watch — household register + NHTSA/CPSC match viewer */
(function () {
  "use strict";

  const LS_KEY = "recall-watch-items-v1";
  const DATA = window.__DATA__ || { items: { items: [] }, recalls: { matches: [], mode: "demo" }, demo: { matches: [] } };
  const SEED_ITEMS = (DATA.items && DATA.items.items) ? DATA.items.items.slice() : [];
  let items = loadItems();
  let sevFilter = "all";
  let editingId = null;

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  function loadItems() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (_) {}
    return SEED_ITEMS.map((x) => Object.assign({}, x));
  }

  function saveItems() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch (_) {}
  }

  function recallsDoc() {
    return DATA.recalls || { matches: [], mode: "demo" };
  }

  function allMatches() {
    const doc = recallsDoc();
    let list = (doc.matches || []).slice();
    // If live empty, fall back to embedded DEMO (already labeled)
    if (!list.length && DATA.demo && DATA.demo.matches) {
      list = DATA.demo.matches.map((m) => Object.assign({}, m, { demo: true }));
    }
    // Only show matches whose itemId is still in the register (or demo with missing item)
    const ids = new Set(items.map((i) => i.id));
    return list.filter((m) => !m.itemId || ids.has(m.itemId) || m.demo);
  }

  function isDemoMode() {
    const doc = recallsDoc();
    if (doc.mode === "demo") return true;
    const ms = allMatches();
    return ms.length > 0 && ms.every((m) => m.demo);
  }

  function tickClock() {
    const now = new Date();
    const opts = { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" };
    $("#clockPill").textContent = now.toLocaleTimeString("en-US", opts) + " ET";
  }

  function setModePill() {
    const pill = $("#modePill");
    const demo = isDemoMode();
    const n = allMatches().length;
    const doc = recallsDoc();
    if (demo) {
      pill.textContent = `DEMO · ${n} matches`;
      pill.className = "pill demo";
      $("#demoBanner").hidden = false;
    } else {
      pill.textContent = `LIVE · ${n} matches`;
      pill.className = "pill live";
      $("#demoBanner").hidden = true;
    }
    const when = doc.fetchedAt || "—";
    $("#footMeta").textContent = `snapshot ${when}`;
    $("#aboutMeta").textContent =
      `Mode: ${demo ? "DEMO" : "LIVE"} · fetched ${when} · ` +
      `NHTSA ${doc.liveOk && doc.liveOk.nhtsa ? "ok" : "—"} · ` +
      `CPSC ${doc.liveOk && doc.liveOk.cpsc ? "ok" : "—"} · ` +
      `register ${items.length} items (localStorage)`;
  }

  function countBySev(list) {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    list.forEach((m) => {
      const s = m.severity || "low";
      if (c[s] != null) c[s]++;
      else c.low++;
    });
    return c;
  }

  function renderHome() {
    const list = allMatches();
    const c = countBySev(list);
    const flagged = c.critical + c.high + c.medium + c.low;
    $("#heroStats").innerHTML = `
      <div class="stat crit"><div class="n">${c.critical}</div><div class="l">Critical</div></div>
      <div class="stat high"><div class="n">${c.high}</div><div class="l">High</div></div>
      <div class="stat med"><div class="n">${c.medium}</div><div class="l">Medium</div></div>
      <div class="stat ok"><div class="n">${items.length}</div><div class="l">Items</div></div>`;
    const top = list
      .slice()
      .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
      .slice(0, 5);
    $("#homeMatches").innerHTML = top.length
      ? top.map(matchCardHtml).join("")
      : `<div class="empty">No matches in this snapshot. Add items and rebuild to re-check feeds.</div>`;
    $("#homeItems").innerHTML = items
      .slice(0, 8)
      .map((it) => {
        const detail = itemDetailLine(it);
        return `<li><strong>${esc(it.name)}</strong> <span class="badge-sample">SAMPLE</span><br>${esc(detail)}</li>`;
      })
      .join("");
    void flagged;
  }

  function sevRank(s) {
    return { critical: 4, high: 3, medium: 2, low: 1 }[s] || 0;
  }

  function itemDetailLine(it) {
    if (it.category === "vehicle" || it.source === "nhtsa") {
      return [it.year, it.make, it.model].filter(Boolean).join(" ") || it.notes || "vehicle";
    }
    return [it.brand, it.model || it.productModel, it.productQuery]
      .filter(Boolean)
      .join(" · ") || it.notes || it.category;
  }

  function catLabel(c) {
    return (
      {
        vehicle: "Vehicle",
        car_seat: "Car seat",
        kids_gear: "Kids gear",
        appliance: "Appliance",
        other: "Other",
      }[c] || c || "Item"
    );
  }

  function renderRegister() {
    $("#itemList").innerHTML = items
      .map((it) => {
        return `<article class="item-card" data-id="${esc(it.id)}">
          <span class="cat">${esc(catLabel(it.category))} · ${esc((it.source || "").toUpperCase())}</span>
          <h3>${esc(it.name)} <span class="badge-sample">SAMPLE</span></h3>
          <p class="item-meta">${esc(itemDetailLine(it))}${it.notes ? "<br>" + esc(it.notes) : ""}</p>
          <div class="item-actions">
            <button type="button" class="btn" data-act="edit">Edit</button>
            <button type="button" class="btn danger" data-act="del">Remove</button>
          </div>
        </article>`;
      })
      .join("");
  }

  function matchCardHtml(m) {
    const sev = m.severity || "low";
    const demo = m.demo ? `<span class="demo-tag">DEMO</span>` : "";
    const url = m.url || (m.source === "nhtsa" ? "https://www.nhtsa.gov/recalls" : "https://www.cpsc.gov/Recalls");
    return `<article class="match-card ${esc(sev)}${m.demo ? " demo-flag" : ""}">
      <div class="match-top">
        <div>
          <h3 class="match-title">${demo}${esc(m.title || "Recall")}</h3>
          <p class="match-sub">${esc(m.itemName || "")} · ${esc((m.source || "").toUpperCase())}${m.campaign ? " · " + esc(m.campaign) : ""}${m.date ? " · " + esc(String(m.date).slice(0, 10)) : ""}</p>
        </div>
        <span class="sev ${esc(sev)}">${esc(sev)}</span>
      </div>
      <div class="body">
        ${m.component ? `<div><strong>Component / hazard:</strong> ${esc(m.component)}</div>` : ""}
        ${m.summary ? `<div><strong>Summary:</strong> ${esc(clip(m.summary, 420))}</div>` : ""}
        ${m.consequence ? `<div><strong>Consequence:</strong> ${esc(clip(m.consequence, 280))}</div>` : ""}
        ${m.remedy ? `<div><strong>Remedy:</strong> ${esc(clip(m.remedy, 280))}</div>` : ""}
        ${m.parkIt ? `<div><strong>Park-it:</strong> Yes (NHTSA)</div>` : ""}
      </div>
      <div class="match-links">
        <a href="${esc(url)}" target="_blank" rel="noopener">Official recall page</a>
      </div>
    </article>`;
  }

  function clip(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function renderMatches() {
    let list = allMatches();
    if (sevFilter !== "all") list = list.filter((m) => (m.severity || "low") === sevFilter);
    list = list.slice().sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
    $("#matchesHint").textContent = isDemoMode()
      ? "DEMO placeholders — not real determinations. Open cpsc.gov / nhtsa.gov for truth."
      : "Live API snapshot matches for SAMPLE register items. Confirm on the official page.";
    $("#matchList").innerHTML = list.length
      ? list.map(matchCardHtml).join("")
      : `<div class="empty">No matches for this filter.</div>`;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showForm(item) {
    const panel = $("#itemForm");
    panel.hidden = false;
    const f = $("#editForm");
    f.reset();
    editingId = item ? item.id : null;
    $("#formTitle").textContent = item ? "Edit item" : "Add item";
    if (item) {
      f.name.value = item.name || "";
      f.category.value = item.category || "other";
      f.source.value = item.source || "cpsc";
      f.make.value = item.make || "";
      f.model.value = item.model || "";
      f.year.value = item.year || "";
      f.brand.value = item.brand || "";
      f.productModel.value = item.model && item.source === "cpsc" ? item.model : item.productModel || item.model || "";
      f.productQuery.value = item.productQuery || "";
      f.notes.value = item.notes || "";
      f.id.value = item.id;
    } else {
      f.id.value = "";
      f.category.value = "appliance";
      f.source.value = "cpsc";
    }
    syncFormFields();
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideForm() {
    $("#itemForm").hidden = true;
    editingId = null;
  }

  function syncFormFields() {
    const src = $("#editForm").source.value;
    $$(".veh-only").forEach((el) => {
      el.style.display = src === "nhtsa" ? "" : "none";
    });
    $$(".cpsc-only").forEach((el) => {
      el.style.display = src === "cpsc" ? "" : "none";
    });
  }

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }

  function route() {
    const hash = (location.hash || "#home").replace(/^#/, "").split("?")[0] || "home";
    const view = ["home", "register", "matches", "about"].includes(hash) ? hash : "home";
    $$(".view").forEach((el) => {
      const on = el.id === "view-" + view;
      el.hidden = !on;
      el.classList.toggle("active", on);
    });
    $$(".tab").forEach((tab) => {
      const on = tab.dataset.view === view;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (view === "home") renderHome();
    if (view === "register") renderRegister();
    if (view === "matches") renderMatches();
    setModePill();
  }

  function bind() {
    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        location.hash = tab.dataset.view;
      });
    });
    window.addEventListener("hashchange", route);

    $("#btnAddItem").addEventListener("click", () => showForm(null));
    $("#btnCancelForm").addEventListener("click", hideForm);
    $("#editForm").source.addEventListener("change", syncFormFields);
    $("#editForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const src = f.source.value;
      const base = {
        id: editingId || uid(src === "nhtsa" ? "veh" : "prod"),
        name: f.name.value.trim(),
        category: f.category.value,
        source: src,
        notes: f.notes.value.trim() || "SAMPLE — user-edited entry.",
      };
      if (src === "nhtsa") {
        Object.assign(base, {
          make: (f.make.value || "").trim().toUpperCase(),
          model: (f.model.value || "").trim().toUpperCase(),
          year: Number(f.year.value) || null,
        });
      } else {
        Object.assign(base, {
          brand: (f.brand.value || "").trim(),
          model: (f.productModel.value || "").trim(),
          productQuery: (f.productQuery.value || f.productModel.value || f.brand.value || "").trim(),
        });
      }
      if (editingId) {
        const ix = items.findIndex((x) => x.id === editingId);
        if (ix >= 0) items[ix] = base;
        else items.push(base);
      } else {
        items.push(base);
      }
      saveItems();
      hideForm();
      renderRegister();
      renderHome();
      setModePill();
    });

    $("#itemList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const card = btn.closest(".item-card");
      const id = card && card.dataset.id;
      const it = items.find((x) => x.id === id);
      if (!it) return;
      if (btn.dataset.act === "edit") showForm(it);
      if (btn.dataset.act === "del") {
        items = items.filter((x) => x.id !== id);
        saveItems();
        renderRegister();
        renderHome();
        setModePill();
      }
    });

    $("#btnResetItems").addEventListener("click", () => {
      items = SEED_ITEMS.map((x) => Object.assign({}, x));
      saveItems();
      hideForm();
      renderRegister();
      renderHome();
      setModePill();
    });

    $("#sevFilters").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      sevFilter = chip.dataset.sev;
      $$("#sevFilters .chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderMatches();
    });

    $("#btnRefreshHint").addEventListener("click", () => {
      location.hash = "about";
    });
  }

  bind();
  tickClock();
  setInterval(tickClock, 1000);
  route();
})();
