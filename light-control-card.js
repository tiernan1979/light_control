/* -------------------------------------------------
   light-group-card.js  (fixed)
------------------------------------------------- */
class LightGroupCard extends HTMLElement {
  constructor() {
    super();
    this._dragging = {};
    this._lastStates = {};
    this._expanded = new Set();
    this.attachShadow({ mode: "open" });
  }
   
   _updateHeader(header, entity) {
       const st = this._hass.states[entity];
       if (!st) return;
       const dragState = this._dragging[entity];
       const dragState = this._dragging[entity];
       if (dragState?.active) {
           // Use the dragging value instead of HA state
           const pct = dragState.lastPct ?? 0;
           const fillEl = header.querySelector(".slider-fill");
           const pctEl  = header.querySelector(".percent");
           fillEl.style.width = `${pct}%`;
           pctEl.textContent = `${pct}%`;
           return;  // skip rest of update
       }
       const on = st.state === "on";
       const bri = on && st.attributes.brightness ? Math.round(st.attributes.brightness / 2.55) : 0;
   
       const rgb = on && st.attributes.rgb_color ? st.attributes.rgb_color : this._defaultRgb;
       const rgba = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${on ? 0.4 : 0.25})`;
       const hsl = this._rgbToHsl(...rgb);
       const iconHsl = `hsl(${hsl.h},${hsl.s}%,${Math.min(100,hsl.l+60)}%)`;
   
       // fill + percent
       header.style.setProperty("--pct", `${bri}%`);
       header.style.setProperty("--fill", rgba);
       const fillEl = header.querySelector(".slider-fill");
       if (fillEl) fillEl.style.background = rgba;
       const pctEl = header.querySelector(".percent");
       if (pctEl) pctEl.textContent = `${bri}%`;
   
       // icon color
       const icon = header.querySelector(".icon");
       if (icon) icon.style.color = iconHsl;
   
       // chevron for groups
       const chev = header.querySelector(".chevron");
       if (chev) {
         const isGroup = st.attributes?.entity_id?.length > 1;
         chev.style.display = isGroup ? "block" : "none";
         const expanded = header.closest(".group")?.classList.contains("expanded");
         chev.setAttribute("icon", expanded ? "mdi:chevron-down" : "mdi:chevron-right");
       }
   
       // remember last RGB for dragging
       if (this._dragging[entity]) this._dragging[entity].lastRgb = rgb;
   }

  setConfig(config) {
    if (!config.groups || !Array.isArray(config.groups))
      throw new Error('Define "groups"');

    this.config = config;
    const barHeight = config.bar_height || 48;
    const pad = config.padding ?? 8;

    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;font-family:Roboto,sans-serif;background:var(--ha-card-background,#1c1c1c);color:#fff;border-radius:12px;padding:16px;}
        .groups{margin-top:-${pad}px}
        .group{margin-top:${pad}px}
        .header{position:relative;display:flex;align-items:center;gap:8px;height:${barHeight}px;padding:0 12px;border-radius:12px;cursor:pointer;overflow:hidden;
                box-shadow:0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.1);}
        ha-icon{flex-shrink:0;z-index:3;}
        .icon{width:24px;height:24px}
        .chevron{font-size:22px;transition:transform .2s;z-index:3;}
        .name{flex:1;font-weight:500}
        .lux{font-size:14px;color:#ccc}
        .percent{position:absolute;right:56px;top:50%;transform:translateY(-50%);font-weight:bold;pointer-events:none;z-index:2}
        .slider-fill{position:absolute;inset:0;width:var(--pct,0%);background:var(--fill,rgba(85,85,85,.4));border-radius:12px;z-index:1;transition:width .03s}
        .slider-track{position:absolute;inset:0;border-radius:12px;z-index:2;cursor:pointer}
        .individuals{margin-top:8px;display:none}
        .individuals.show{display:block}
        .individuals .header{margin-left:24px;height:40px;font-size:14px;opacity:.9}
      </style>
      <div class="groups"></div>
    `;

    this._renderGroups();
    this._attachHandlers();
  }

  /* ------------------------------------------------- */
  _renderGroups() {
    const container = this.shadowRoot.querySelector(".groups");
    let html = "";

    for (const g of this.config.groups) {
      const lux = g.lux_sensor
        ? `<span class="lux" data-entity="${g.lux_sensor}">-- lx</span>`
        : "";
      const manual = JSON.stringify(g.lights || []).replace(/"/g, "&quot;");

      html += `
        <div class="group" data-entity="${g.entity || ""}" data-manual="${manual}">
          <div class="header" data-type="group">
            <ha-icon class="icon"></ha-icon>
            <span class="name">${g.name}</span>
            ${lux}
            <span class="percent">0%</span>
            <ha-icon class="chevron"></ha-icon>
            <div class="slider-fill"></div>
            <div class="slider-track"></div>
          </div>
          <div class="individuals"></div>
        </div>`;
    }
    container.innerHTML = html;
  }

  /* ------------------------------------------------- */
  _attachHandlers() {
    this.shadowRoot.querySelectorAll(".header").forEach(header => {
      const groupEl = header.closest(".group");
      const entity = groupEl?.dataset.entity || header.closest(".item")?.dataset.entity;

      const track = header.querySelector(".slider-track");
      const fill  = header.querySelector(".slider-fill");
      const pctEl = header.querySelector(".percent");
      const icon  = header.querySelector(".icon");
      const chev  = header.querySelector(".chevron");

      if (entity && !this._dragging[entity]) {
        this._dragging[entity] = { active: false, lastPct: 0, lastRgb: this._defaultRgb };
      }

      // ---------- commitBrightness inside _attachHandlers ----------
      const commitBrightness = (pct, commit) => {
          header.style.setProperty("--pct", `${pct}%`);
          const fillEl = header.querySelector(".slider-fill");
          const pctEl = header.querySelector(".percent");
      
          const state = entity ? this._hass.states[entity] : null;
          const isOn = state?.state === "on";
      
          // Update slider fill even if light is off
          const alpha = pct > 0 ? 0.4 : 0.25;
          if (fillEl) fillEl.style.background = `rgba(${this._defaultRgb[0]},${this._defaultRgb[1]},${this._defaultRgb[2]},${alpha})`;
          if (pctEl) pctEl.textContent = `${pct}%`;
      
          if (commit && entity) {
              if (pct > 0) {
                  // Turn on light at specified brightness
                  this._hass.callService("light", "turn_on", {
                      entity_id: entity,
                      brightness_pct: pct
                  });
              } else if (isOn && pct === 0) {
                  // Optional: don’t turn off when dragging to 0, just show UI
              }
          }
      
          // Remember last dragged value
          if (!this._dragging[entity]) this._dragging[entity] = {};
          this._dragging[entity].lastPct = pct;
      };



      // inside _attachHandlers, where track.addEventListener("pointerdown") is defined
      track.addEventListener("pointerdown", e => {
        e.stopPropagation();
        const dragState = this._dragging[entity];
        dragState.active = true;
        dragState.dragged = false;
        track.setPointerCapture(e.pointerId);
      
        const move = ev => {
          if (!dragState.active) return;
          const rect = track.getBoundingClientRect();
          let pct = ((ev.clientX - rect.left) / rect.width) * 100;
          pct = Math.max(0, Math.min(100, Math.round(pct)));
          commitBrightness(pct, false);
      
          dragState.dragged = true; // mark as dragged
        };
      
        const up = ev => {
          if (!dragState.active) return;
          dragState.active = false;
          dragState.dragged = false;
          track.releasePointerCapture(ev.pointerId);
          const rect = track.getBoundingClientRect();
          let pct = ((ev.clientX - rect.left) / rect.width) * 100;
          pct = Math.max(0, Math.min(100, Math.round(pct)));
      
          // Commit only if pct > 0
          if (pct > 0) {
              commitBrightness(pct, true);
          } else {
              commitBrightness(0, false); // just update UI, don't call HA
          }
      
        };
      
        track.addEventListener("pointermove", move);
        track.addEventListener("pointerup", up);
        track.addEventListener("pointercancel", up);
        move(e);
      });

      // icon → more-info
      icon?.addEventListener("click", e => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent("hass-more-info", {
          bubbles: true, composed: true,
          detail: { entityId: entity }
        }));
      });

      // chevron → expand individuals
      chev?.addEventListener("click", e => {
        e.stopPropagation();
        const expanded = groupEl.classList.toggle("expanded");
        groupEl.querySelector(".individuals").classList.toggle("show", expanded);
        chev.setAttribute("icon", expanded ? "mdi:chevron-down" : "mdi:chevron-right");
        if (expanded && entity && !this._expanded.has(entity)) {
          this._loadIndividuals(entity, groupEl.querySelector(".individuals"));
          this._expanded.add(entity);
        }
      });

      // ---------------- click toggle ----------------
      header.addEventListener("click", e => {
          if (e.target.closest(".icon,.chevron,.lux")) return;
          const dragState = this._dragging[entity];
          if (dragState?.active) {  // <<< ignore click if we just dragged
              dragState.dragged = false; // reset for next time
              return;
          }
          const state = entity ? this._hass.states[entity] : null;
          if (!state) return;
      
          const service = state.state === "on" ? "turn_off" : "turn_on";
          this._hass.callService("light", service, { entity_id: entity });
      });

    });
  }

  /* ------------------------------------------------- */
  _loadIndividuals(groupId, container) {
    const groupState = this._hass.states[groupId];
    const manual = JSON.parse(container.closest(".group").dataset.manual.replace(/&quot;/g, '"'));
    const ids = groupState?.attributes?.entity_id || [];

    const all = [];
    ids.forEach(id => {
      const s = this._hass.states[id];
      if (s) all.push({ entity: id, state: s });
    });
    manual.forEach(m => {
      const s = this._hass.states[m.entity];
      if (s) all.push({ entity: m.entity, state: s, name: m.name, icon: m.icon });
    });

    const uniq = [...new Map(all.map(o => [o.entity, o])).values()];

    container.innerHTML = uniq.map(l => {
      const st = l.state;
      const bri = st.state === "on" && st.attributes.brightness
        ? Math.round(st.attributes.brightness / 2.55)
        : 0;
      const name = l.name || st.attributes.friendly_name || l.entity.split(".").pop();
      const icon = l.icon || st.attributes.icon || "mdi:lightbulb";

      return `
        <div class="item" data-entity="${l.entity}">
          <div class="header">
            <ha-icon class="icon" icon="${icon}"></ha-icon>
            <span class="name">${name}</span>
            <span class="percent">${bri}%</span>
            <div class="slider-fill"></div>
            <div class="slider-track"></div>
          </div>
        </div>`;
    }).join("");

    this._attachHandlers();
  }

  /* ------------------------------------------------- */
  set hass(hass) {
    this._hass = hass;

    const cardBg = getComputedStyle(this).backgroundColor || "rgb(28,28,28)";
    const rgbMatch = cardBg.match(/(\d+),\s*(\d+),\s*(\d+)/);
    const cardRgb = rgbMatch ? [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])] : [28,28,28];
    const offBg = `rgb(${Math.min(255, cardRgb[0] + 13)}, ${Math.min(255, cardRgb[1] + 13)}, ${Math.min(255, cardRgb[2] + 13)})`;
    this._defaultRgb = offBg;
     
    // ---------- inside set hass(hass) ----------
    this.shadowRoot.querySelectorAll(".header").forEach(hdr => {
      const entity = hdr.closest(".group")?.dataset.entity || hdr.closest(".item")?.dataset.entity;
      if (!entity) return;
      this._updateHeader(hdr, entity);
   
      const st = hass.states[entity];
      if (!st) return;
   
      const on = st.state === "on";
      const bri = on && st.attributes.brightness
        ? Math.round(st.attributes.brightness / 2.55)
        : 0;
   
      const rgb = on && st.attributes.rgb_color ? st.attributes.rgb_color : this._defaultRgb;
      const alpha = on ? 0.4 : 0.25;
      const rgba = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
   
      hdr.style.setProperty("--pct", `${bri}%`);
      hdr.style.setProperty("--fill", rgba);
      hdr.querySelector(".slider-fill").style.background = rgba;
      hdr.querySelector(".percent").textContent = `${bri}%`;
   
      // icon
      const icon = hdr.querySelector(".icon");
      const isGroup = hdr.closest(".group")?.dataset.entity === entity && st.attributes?.entity_id?.length > 1;
      icon.setAttribute("icon", isGroup ? "mdi:lightbulb-group" : "mdi:lightbulb");
   
      // chevron
      const chev = hdr.querySelector(".chevron");
      if (chev) {
        chev.style.display = isGroup ? "block" : "none";
        const expanded = hdr.closest(".group")?.classList.contains("expanded");
        chev.setAttribute("icon", expanded ? "mdi:chevron-down" : "mdi:chevron-right");
      }
   
      if (this._dragging[entity]) this._dragging[entity].lastRgb = rgb;
    });

    this.shadowRoot.querySelectorAll(".lux").forEach(el => {
      const s = hass.states[el.dataset.entity];
      const v = s && !isNaN(s.state) ? Math.round(+s.state) : null;
      el.textContent = v !== null ? `${v} lx` : "-- lx";
    });
  }

  /* ------------------------------------------------- */
  _rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) h = s = 0;
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  getCardSize() { return 3 + (this.config?.groups?.length || 0) * 3; }
}
customElements.define("light-group-card", LightGroupCard);
