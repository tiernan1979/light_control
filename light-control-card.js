/* -------------------------------------------------
   light-group-card.js
   – Full bar coloured
   – Icon opens colour picker (group + individuals)
   – Chevron-down expands (mobile-friendly)
   – Drag = brightness (1 %), off only at 0 %
   – Single click anywhere else = toggle on/off
   – Text colour adapts to light colour
   – Uses AirconControlCard clone-and-reattach pattern
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
        :host{
          font-family:'Roboto',sans-serif;
          background:var(--card-backgroundccolor,#000);
          color:var(--text-color,#fff);
          border-radius:12px;
          padding:16px;
          display:block;
          user-select:none;
        }
        .group{margin-bottom:12px;}
        .header{
          position:relative;
          display:flex;
          align-items:center;
          gap:8px;
          height:${barHeight}px;
          padding:0 12px;
          border-radius:12px;
          cursor:pointer;
          overflow:hidden;
          background:linear-gradient(to right,
            var(--gradient-dark) 0%,
            var(--gradient-start) var(--percent),
            var(--light-gradient-end) var(--percent),
            var(--light-gradient-end) 100%
          );
          box-shadow:0 2px 4px rgba(0,0,0,.3),inset 0 1px 2px rgba(255,255,255,.1);
        }
        .header.off{background:#333;}
        .header ha-icon.icon{font-size:24px;cursor:pointer;}
        .header .name{flex:1;font-weight:500;}
        .header .lux{font-size:14px;color:#ccc;cursor:pointer;}
        .header .percent{
          position:absolute;
          right:56px;
          top:50%;
          transform:translateY(-50%);
          font-size:14px;
          font-weight:bold;
          pointer-events:none;
        }
        .header .chevron{
          font-size:22px;
          cursor:pointer;
          padding:6px;
          transition:transform .2s;
        }
        .header .chevron:active{opacity:0.7;}
        .header.expanded .chevron{transform:rotate(180deg);}
        .slider-track{
          position:absolute;
          inset:0;
          border-radius:12px;
          cursor:pointer;
        }
        .individuals{
          margin-top:8px;
          display:none;
        }
        .individuals.show{display:block;}
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
            <ha-icon class="chevron" icon="mdi:chevron-down"></ha-icon>
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
      const entity =
        header.parentElement.dataset.entity ||
        header.closest(".group").dataset.entity;
      if (!entity) return;

      let track = header.querySelector(".slider-track");
      let icon = header.querySelector(".icon");
      let chevron = header.querySelector(".chevron");
      const isGroup = header.dataset.type === "group";

      // ---- Clone & re-attach (AirconControlCard pattern) ----
      [track, icon, chevron].forEach(el => {
        if (!el) return;
        const clone = el.cloneNode(true);
        el.parentNode.replaceChild(clone, el);
        if (el === track) track = clone;
        if (el === icon) icon = clone;
        if (el === chevron) chevron = clone;
      });

      this._dragging[entity] = false;

      // ---- FULL TRACK CLICK & DRAG ----
      const set = (clientX, commit = false) => {
        const r = track.getBoundingClientRect();
        const off = clientX - r.left;
        const pct = Math.max(0, Math.min(100, Math.round((off / r.width) * 100)));
        header.style.setProperty("--percent", pct + "%");
        header.querySelector(".percent").textContent = pct + "%";
        header.classList.toggle("off", pct === 0);
        if (commit) {
          if (pct > 0) {
            this._hass.callService("light", "turn_on", {
              entity_id: entity,
              brightness_pct: pct
            });
          } else {
            this._hass.callService("light", "turn_off", { entity_id: entity });
          }
        }
      };

      track.addEventListener("click", e => {
        e.stopPropagation();
        set(e.clientX, true);
      });

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

      // ---- ICON = MORE INFO ----
      icon.addEventListener("click", e => {
        e.stopPropagation();
        const ev = new Event("hass-more-info", { bubbles: true, composed: true });
        ev.detail = { entityId: entity };
        header.dispatchEvent(ev);
      });

      // ---- CHEVRON = EXPAND / COLLAPSE ----
      if (isGroup && chevron) {
        chevron.addEventListener("click", e => {
          e.stopPropagation();
          const grp = header.parentElement;
          const expanded = grp.classList.toggle("expanded");
          const individuals = grp.querySelector(".individuals");
          individuals.classList.toggle("show", expanded);
          if (expanded) this._loadIndividuals(grp.dataset.entity, individuals);
        });
      }

      // ---- SINGLE CLICK ANYWHERE ELSE = TOGGLE ----
      header.addEventListener("click", e => {
        if (
          e.target.closest(".icon") ||
          e.target.closest(".chevron") ||
          e.target.closest(".lux")
        )
          return;

        const st = this._hass.states[entity];
        const turnOn = !st || st.state === "off";
        this._hass.callService(
          "light",
          turnOn ? "turn_on" : "turn_off",
          { entity_id: entity }
        );
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

    ids.forEach(id => {
      const s = this._hass.states[id];
      if (s) all.push({ entity: id, state: s });
    });
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
            <div class="slider-track"></div>
          </div>
        </div>`;
      container.insertAdjacentHTML("beforeend", html);
    });

    this._attachAll(); // Re-attach to newly created headers
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
      const rgb = on && st.attributes.rgb_color ? st.attributes.rgb_color : null;
      const hex = rgb ? this._rgbToHex(rgb) : "#555";

      const key = `${on}|${bri}|${hex}`;
      if (this._lastStates[entity] !== key) {
        const hdr = el.tagName === "DIV" && el.classList.contains("header")
          ? el
          : el.querySelector(".header");

        const dark = this._rgba(this._shade(hex, -40), 0.3);
        const start = this._rgba(hex, 0.7);
        const light = this._rgba(this._shade(hex, 50), 0.1);

        hdr.style.setProperty("--gradient-dark", dark);
        hdr.style.setProperty("--gradient-start", start);
        hdr.style.setProperty("--light-gradient-end", light);
        hdr.style.setProperty("--percent", bri + "%");
        hdr.querySelector(".percent").textContent = bri + "%";
        hdr.classList.toggle("off", bri === 0);

        // ---- Dynamic text colour ----
        if (on) {
          const { r, g, b } = this._hexToRgb(hex);
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const textColor = lum > 0.5 ? "#000" : "#fff";
          hdr.style.color = textColor;
          hdr.querySelectorAll("ha-icon, .name, .lux, .percent").forEach(el => {
            el.style.color = textColor;
          });
        } else {
          hdr.style.color = "#fff";
          hdr.querySelectorAll("ha-icon, .name, .lux, .percent").forEach(el => {
            el.style.color = "#fff";
          });
        }

        this._lastStates[entity] = key;
      }

      const lux = el.querySelector(".lux");
      if (lux) {
        const s = hass.states[lux.dataset.entity];
        const v = s && !isNaN(s.state) ? Math.round(+s.state) : null;
        lux.textContent = v !== null ? `${v} lx` : "-- lx";
      }

      const grp = el.closest(".group");
      if (grp && grp.classList.contains("expanded")) {
        this._loadIndividuals(grp.dataset.entity, grp.querySelector(".individuals"));
      }
    });
  }

  /* -------------------------------------------------
     HELPERS
  ------------------------------------------------- */
  _shade(hex, pct) {
    let [r, g, b] = hex.slice(1).match(/.{2}/g).map(v => parseInt(v, 16));
    r = Math.min(255, Math.round((r * (100 + pct)) / 100));
    g = Math.min(255, Math.round((g * (100 + pct)) / 100));
    b = Math.min(255, Math.round((b * (100 + pct)) / 100));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  _rgba(hex, a) { const { r, g, b } = this._hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
  _hexToRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
  }
  _rgbToHex([r, g, b]) {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  getCardSize() { return 3 + (this.config?.groups?.length || 0) * 3; }
}
customElements.define("light-group-card", LightGroupCard);
