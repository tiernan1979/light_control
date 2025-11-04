/* -------------------------------------------------
   light-group-card.js
   – Solid colour fill (group + individuals)
   – Dynamic text/ icon colour (readable at 50%)
   – Chevron: > (collapsed) / down arrow (expanded)
   – Single click = toggle
   – Drag = brightness (1 %), off only at 0 %
   – Icon = more-info | Chevron = expand
------------------------------------------------- */
class LightGroupCard extends HTMLElement {
  constructor() {
    super();
    this._dragging = {};
    this._lastStates = {};
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (!config.groups || !Array.isArray(config.groups))
      throw new Error('Define "groups"');

    this.config = config;
    const barHeight = config.bar_height || 48;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          font-family: 'Roboto', sans-serif;
          background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
          color: var(--primary-text-color, #fff);
          border-radius: 12px;
          padding: 16px;
          display: block;
          user-select: none;
        }
        .group { margin-bottom: 12px; }
        .header {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          height: ${barHeight}px;
          padding: 0 12px;
          border-radius: 12px;
          cursor: pointer;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.1);
        }
        .header.off { background: #333; }

        /* ICON & CHEVRON – always on top */
        .header ha-icon.icon,
        .header ha-icon.chevron {
          font-size: 24px;
          cursor: pointer;
          z-index: 2;
          pointer-events: auto;
          position: relative;
        }
        .header ha-icon.chevron {
          font-size: 22px;
          padding: 6px;
          transition: transform .2s;
        }
        .header .chevron:active { opacity: 0.7; }

        .header .name { flex: 1; font-weight: 500; z-index: 2; position: relative; }
        .header .lux { font-size: 14px; color: #ccc; cursor: pointer; z-index: 2; position: relative; }
        .header .percent {
          position: absolute;
          right: 56px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 14px;
          font-weight: bold;
          pointer-events: none;
          z-index: 2;
        }

        /* SOLID FILL */
        .slider-fill {
          position: absolute;
          left: 0; top: 0; height: 100%;
          width: var(--percent, 0%);
          background: var(--light-color, #555);
          border-radius: 12px;
          z-index: 1;
          transition: width 0.1s ease;
        }
        .slider-track {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          cursor: pointer;
          z-index: 1;
        }

        .individuals { margin-top: 8px; display: none; }
        .individuals.show { display: block; }
      </style>
      <div class="groups"></div>
    `;

    const groupsDiv = this.shadowRoot.querySelector(".groups");
    let html = "";

    config.groups.forEach(g => {
      const lux = g.lux_sensor
        ? `<span class="lux" data-entity="${g.lux_sensor}">-- lx</span>`
        : "";
      const manual = JSON.stringify(g.lights || []).replace(/"/g, "&quot;");
      html += `
        <div class="group" data-entity="${g.entity || ""}" data-manual="${manual}">
          <div class="header off" data-type="group">
            <ha-icon class="icon" icon="${g.icon || "mdi:lightbulb-group"}"></ha-icon>
            <span class="name">${g.name}</span>
            ${lux}
            <span class="percent">0%</span>
            <ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>
            <div class="slider-fill"></div>
            <div class="slider-track"></div>
          </div>
          <div class="individuals"></div>
        </div>`;
    });

    groupsDiv.innerHTML = html;
    this._attachAll();
  }

  _attachAll() {
    this.shadowRoot.querySelectorAll(".header").forEach(header => {
      const entity = header.parentElement.dataset.entity || header.closest(".group").dataset.entity;
      if (!entity) return;

      let track = header.querySelector(".slider-track");
      let fill = header.querySelector(".slider-fill");
      let icon = header.querySelector(".icon");
      let chevron = header.querySelector(".chevron");
      const isGroup = header.dataset.type === "group";

      // Clone & re-attach
      [track, fill, icon, chevron].forEach(el => {
        if (!el) return;
        const clone = el.cloneNode(true);
        el.parentNode.replaceChild(clone, el);
        if (el === track) track = clone;
        if (el === fill) fill = clone;
        if (el === icon) icon = clone;
        if (el === chevron) chevron = clone;
      });

      this._dragging[entity] = false;

      // --- DRAG & CLICK ---
      const set = (clientX, commit = false) => {
        const r = track.getBoundingClientRect();
        const off = clientX - r.left;
        const pct = Math.max(0, Math.min(100, Math.round((off / r.width) * 100)));
        header.style.setProperty("--percent", pct + "%");
        header.querySelector(".percent").textContent = pct + "%";
        header.classList.toggle("off", pct === 0);
        if (commit) {
          if (pct > 0) {
            this._hass.callService("light", "turn_on", { entity_id: entity, brightness_pct: pct });
          } else {
            this._hass.callService("light", "turn_off", { entity_id: entity });
          }
        }
      };

      track.addEventListener("click", e => { e.stopPropagation(); set(e.clientX, true); });
      track.addEventListener("pointerdown", e => {
        e.stopPropagation();
        this._dragging[entity] = true;
        track.setPointerCapture(e.pointerId);
        const move = ev => this._dragging[entity] && set(ev.clientX);
        const up = () => {
          if (!this._dragging[entity]) return;
          this._dragging[entity] = false;
          track.releasePointerCapture(e.pointerId);
          set(e.clientX, true);
          track.removeEventListener("pointermove", move);
          track.removeEventListener("pointerup", up);
          track.removeEventListener("pointercancel", up);
        };
        track.addEventListener("pointermove", move);
        track.addEventListener("pointerup", up);
        track.addEventListener("pointercancel", up);
      });

      // --- ICON = MORE INFO ---
      icon.addEventListener("click", e => {
        e.stopPropagation();
        const ev = new Event("hass-more-info", { bubbles: true, composed: true });
        ev.detail = { entityId: entity };
        header.dispatchEvent(ev);
      });

      // --- CHEVRON = EXPAND / COLLAPSE ---
      if (isGroup && chevron) {
        chevron.addEventListener("click", e => {
          e.stopPropagation();
          const grp = header.parentElement;
          const expanded = grp.classList.toggle("expanded");
          const individuals = grp.querySelector(".individuals");
          individuals.classList.toggle("show", expanded);
          chevron.setAttribute("icon", expanded ? "mdi:chevron-down" : "mdi:chevron-right");
          if (expanded) this._loadIndividuals(grp.dataset.entity, individuals);
        });
      }

      // --- SINGLE CLICK ANYWHERE ELSE = TOGGLE ---
      header.addEventListener("click", e => {
        if (e.target.closest(".icon") || e.target.closest(".chevron") || e.target.closest(".lux")) return;
        const st = this._hass.states[entity];
        const turnOn = !st || st.state === "off";
        this._hass.callService("light", turnOn ? "turn_on" : "turn_off", { entity_id: entity });
      });
    });
  }

  _loadIndividuals(groupId, container) {
    if (!this._hass) return;
    const grp = container.closest(".group");
    const manual = JSON.parse(grp.dataset.manual.replace(/&quot;/g, '"'));
    const group = groupId ? this._hass.states[groupId] : null;
    const ids = group?.attributes?.entity_id || [];
    const all = [];

    ids.forEach(id => { const s = this._hass.states[id]; if (s) all.push({ entity: id, state: s }); });
    manual.forEach(m => {
      const s = this._hass.states[m.entity];
      if (s) all.push({ entity: m.entity, state: s, name: m.name, icon: m.icon });
    });

    const seen = new Set();
    const uniq = all.filter(l => !seen.has(l.entity) && seen.add(l.entity));

    container.innerHTML = "";
    uniq.forEach(l => {
      const st = l.state;
      const on = st.state === "on";
      const bri = on && st.attributes.brightness ? Math.round(st.attributes.brightness / 2.55) : 0;
      const name = l.name || st.attributes.friendly_name || l.entity.split(".").pop();
      const icon = l.icon || st.attributes.icon || "mdi:lightbulb";

      const html = `
        <div class="item" data-entity="${l.entity}">
          <div class="header off">
            <ha-icon class="icon" icon="${icon}"></ha-icon>
            <span class="name">${name}</span>
            <span class="percent">${bri}%</span>
            <div class="slider-fill"></div>
            <div class="slider-track"></div>
          </div>
        </div>`;
      container.insertAdjacentHTML("beforeend", html);
    });

    this._attachAll();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll(".item, .group > .header").forEach(el => {
      const entity = el.dataset.entity || el.closest(".group").dataset.entity;
      if (!entity) return;

      const st = hass.states[entity];
      if (!st) return;

      const on = st.state === "on";
      const bri = on && st.attributes.brightness ? Math.round(st.attributes.brightness / 2.55) : 0;
      const rgb = on && st.attributes.rgb_color ? st.attributes.rgb_color : [85, 85, 85];
      const hex = this._rgbToHex(rgb);

      const key = `${on}|${bri}|${hex}`;
      if (this._lastStates[entity] !== key) {
        const hdr = el.tagName === "DIV" && el.classList.contains("header") ? el : el.querySelector(".header");
        const fill = hdr.querySelector(".slider-fill");

        // Solid fill color
        hdr.style.setProperty("--light-color", hex);
        fill.style.background = hex;

        // Update percent
        hdr.style.setProperty("--percent", bri + "%");
        hdr.querySelector(".percent").textContent = bri + "%";
        hdr.classList.toggle("off", bri === 0);

        // Dynamic text color – readable at 50%
        const { r, g, b } = this._hexToRgb(hex);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const textColor = lum > 0.55 ? "#000" : "#fff";  // Slightly higher threshold
        hdr.style.color = textColor;
        hdr.querySelectorAll("ha-icon, .name, .lux, .percent").forEach(e => {
          e.style.color = textColor;
        });

        // Update chevron icon
        const chevron = hdr.querySelector(".chevron");
        if (chevron) {
          const isExpanded = hdr.closest(".group")?.classList.contains("expanded");
          chevron.setAttribute("icon", isExpanded ? "mdi:chevron-down" : "mdi:chevron-right");
        }

        this._lastStates[entity] = key;
      }

      // Lux sensor
      const lux = el.querySelector(".lux");
      if (lux) {
        const s = hass.states[lux.dataset.entity];
        const v = s && !isNaN(s.state) ? Math.round(+s.state) : null;
        lux.textContent = v !== null ? `${v} lx` : "-- lx";
      }

      // Reload individuals if expanded
      const grp = el.closest(".group");
      if (grp && grp.classList.contains("expanded")) {
        this._loadIndividuals(grp.dataset.entity, grp.querySelector(".individuals"));
      }
    });
  }

  /* -------------------------------------------------
     HELPERS
  ------------------------------------------------- */
  _hexToRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    return {
      r: parseInt(h.substr(0, 2), 16),
      g: parseInt(h.substr(2, 2), 16),
      b: parseInt(h.substr(4, 2), 16)
    };
  }
  _rgbToHex([r, g, b]) {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  getCardSize() { return 3 + (this.config?.groups?.length || 0) * 3; }
}
customElements.define("light-group-card", LightGroupCard);
