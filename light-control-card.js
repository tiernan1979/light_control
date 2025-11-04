/* -------------------------------------------------
   light-group-card.js
   – GROUP: click = turn ALL ON (not toggle)
   – COLOR: only changes ON lights
   – MIXED: no wrong toggling
   – Dragging: smooth, exact %
   – Fill: visible when OFF + ON
   – Padding: between groups
   – Individuals: own rgb_color
------------------------------------------------- */
class LightGroupCard extends HTMLElement {
  constructor() {
    super();
    this._dragging = {};
    this._lastStates = {};
    this._expandedCache = new Set();
    // ✅ derive default color from card background (5% lighter)
    const cardBgRaw = getComputedStyle(document.documentElement)
      .getPropertyValue("--ha-card-background")
      || getComputedStyle(document.documentElement)
      .getPropertyValue("--card-background-color")
      || "rgb(28,28,28)";
    const rgbMatch = cardBgRaw.match(/(\d+),\s*(\d+),\s*(\d+)/);
    const baseRgb = rgbMatch
      ? [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])]
      : [28, 28, 28];
    this._defaultRgb = baseRgb.map(v => Math.min(255, Math.round(v * 1.05)));
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (!config.groups || !Array.isArray(config.groups))
      throw new Error('Define "groups"');

    this.config = config;
    const barHeight = config.bar_height || 48;
    const groupPadding = config.padding !== undefined ? config.padding : 8;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          font-family: 'Roboto', sans-serif;
          background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
          color: #fff;
          border-radius: 12px;
          padding: 16px;
          display: block;
          user-select: none;
        }
        .groups { }
        .group {
          margin-top: ${groupPadding}px;
        }
        .group:first-child { margin-top: 0; }
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
          background: var(--off-bg, #333);
        }

        .header ha-icon.icon {
          lavor: 24px;
          cursor: pointer;
          z-index: 3;
          pointer-events: auto;
          position: relative;
        }
        .header ha-icon.chevron {
          font-size: 22px;
          cursor: pointer;
          z-index: 3;
          pointer-events: auto;
          position: relative;
          padding: 6px;
          transition: transform .2s;
        }
        .header .chevron:active { opacity: 0.7; }

        .header .name { flex: 1; font-weight: 500; position: relative; color: #fff; }
        .header .lux { font-size: 14px; color: #ccc; cursor: pointer; position: relative; }

        .header .percent {
          position: absolute;
          right: 56px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 14px;
          font-weight: bold;
          pointer-events: none;
          z-index: 2;
          color: #fff;
        }

        .slider-fill {
          position: absolute;
          left: 0; top: 0; height: 100%;
          width: var(--percent, 0%);
          background: var(--light-fill, rgba(85,85,85,0.4));
          border-radius: 12px;
          z-index: 1;
          transition: width 0.03s ease;
        }
        .slider-track {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          cursor: pointer;
          z-index: 2;
        }

        .individuals { margin-top: 8px; display: none; }
        .individuals.show { display: block; }
        .individuals .header {
          margin-left: 24px;
          height: 40px;
          font-size: 14px;
          opacity: 0.9;
        }
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
// Determine if this is a group light (has children)
let isSingle = true;

      // Manually listed lights in YAML
      if (g.lights && g.lights.length > 1) {
        isSingle = false;
      } else if (g.entity && this._hass?.states?.[g.entity]?.attributes?.entity_id?.length > 1) {
        // HA light group with multiple child entities
        isSingle = false;
      }      
      const iconName = isSingle ? (g.icon || "mdi:lightbulb") : (g.icon || "mdi:lightbulb-group");
      const chevronHtml = isSingle ? "" : `<ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>`;
      
      html += `
        <div class="group" data-entity="${g.entity || ""}" data-manual="${manual}" data-single="${isSingle}">
          <div class="header" data-type="group">
            <ha-icon class="icon" icon="${iconName}"></ha-icon>
            <span class="name">${g.name}</span>
            ${lux}
            <span class="percent">0%</span>
            ${chevronHtml}
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
      let percentEl = header.querySelector(".percent");
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
        if (el === percentEl) percentEl = clone;
      });

      this._dragging[entity] = { active: false, lastPct: 0, lastRgb: this._defaultRgb };

      const updateBrightness = (clientX, commit = false) => {
        const rect = track.getBoundingClientRect();
        const offsetX = clientX - rect.left;
        const width = rect.width;
        const pct = Math.max(0, Math.min(100, Math.round((offsetX / width) * 100)));
      
        header.style.setProperty("--percent", pct + "%");
        percentEl.textContent = pct + "%";
      
        const st = this._hass.states[entity];
        const rgb = (st && st.attributes && st.attributes.rgb_color)
          ? st.attributes.rgb_color
          : this._dragging[entity].lastRgb;
      
        const fillRgba = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.4)`;
        header.style.setProperty("--light-fill", fillRgba);
        fill.style.background = fillRgba;
      
        if (commit) {
          this._dragging[entity].lastPct = pct;
          this._dragging[entity].lastRgb = rgb;
        
          const st = this._hass.states[entity];
          const isOn = st && st.state === "on";
        
          if (pct > 0) {
            // Always turn_on with the desired brightness
            const serviceData = { entity_id: entity, brightness_pct: pct };
        
            // If RGB is provided, include it so color doesn't reset
            if (rgb && rgb.length === 3) {
              serviceData.rgb_color = rgb;
            }
        
            this._hass.callService("light", "turn_on", serviceData);
          } else if (pct === 0 && isOn) {
            // Only turn_off if slider ends at 0
            this._hass.callService("light", "turn_off", { entity_id: entity });
          }
        }
      };

      track.addEventListener("pointerdown", e => {
        e.preventDefault();
        e.stopPropagation();
        this._dragging[entity].active = true;
        track.setPointerCapture(e.pointerId);
      
        // ✅ Don’t commit on first touch; just preview position
        updateBrightness(e.clientX);
      
        const move = ev => this._dragging[entity].active && updateBrightness(ev.clientX);
        const up = ev => {
          if (!this._dragging[entity].active) return;
          this._dragging[entity].active = false;
          track.releasePointerCapture(e.pointerId);
          updateBrightness(ev.clientX, true); // ✅ commit final brightness
          track.removeEventListener("pointermove", move);
          track.removeEventListener("pointerup", up);
          track.removeEventListener("pointercancel", up);
        };
      
        track.addEventListener("pointermove", move);
        track.addEventListener("pointerup", up);
        track.addEventListener("pointercancel", up);
      });


      icon.addEventListener("click", e => {
        e.stopPropagation();
        const ev = new Event("hass-more-info", { bubbles: true, composed: true });
        ev.detail = { entityId: entity };
        header.dispatchEvent(ev);
      });

      if (isGroup && chevron) {
        chevron.addEventListener("click", e => {
          e.stopPropagation();
          const grp = header.parentElement;
          const expanded = grp.classList.toggle("expanded");
          const individuals = grp.querySelector(".individuals");
          individuals.classList.toggle("show", expanded);
          chevron.setAttribute("icon", expanded ? "mdi:chevron-down" : "mdi:chevron-right");
          if (expanded && !this._expandedCache.has(entity)) {
            this._loadIndividuals(entity, individuals);
            this._expandedCache.add(entity);
          }
        });
      }

      // FIXED: Group click = turn ALL ON
      header.addEventListener("click", e => {
        if (e.target.closest(".icon") || e.target.closest(".chevron") || e.target.closest(".lux")) return;
      
        const st = this._hass.states[entity];
        const isGroup = header.dataset.type === "group";
      
        if (isGroup) {
          // GROUP: toggle all
          const allOn = st && st.attributes && st.attributes.entity_id
            ? st.attributes.entity_id.every(id => this._hass.states[id]?.state === "on")
            : false;
          this._hass.callService("light", allOn ? "turn_off" : "turn_on", { entity_id: entity });
        } else {
          // INDIVIDUAL: toggle
          const turnOn = !st || st.state === "off";
          this._hass.callService("light", turnOn ? "turn_on" : "turn_off", { entity_id: entity });
        }
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
          <div class="header">
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

  // ✅ Get the card background color from theme
  const cardBgRaw = getComputedStyle(document.documentElement)
    .getPropertyValue("--ha-card-background")
    || getComputedStyle(document.documentElement)
    .getPropertyValue("--card-background-color")
    || "rgb(28,28,28)";

  const rgbMatch = cardBgRaw.match(/(\d+),\s*(\d+),\s*(\d+)/);
  const cardRgb = rgbMatch
    ? [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])]
    : [28, 28, 28];

  // ✅ Slightly lighter (5%) than card color
  const offBg = `rgb(
    ${Math.min(255, Math.round(cardRgb[0] * 1.05))},
    ${Math.min(255, Math.round(cardRgb[1] * 1.05))},
    ${Math.min(255, Math.round(cardRgb[2] * 1.05))}
  )`;

  // ✅ Store this derived color as the new default RGB (so individuals use it too)
  this._defaultRgb = [
    Math.min(255, Math.round(cardRgb[0] * 1.05)),
    Math.min(255, Math.round(cardRgb[1] * 1.05)),
    Math.min(255, Math.round(cardRgb[2] * 1.05))
  ];

   this.shadowRoot.querySelectorAll(".item, .group > .header").forEach(el => {
     // Determine the entity for this element
     const entity = el.dataset.entity || el.closest(".group")?.dataset.entity;
     if (!entity) return;
   
     const st = hass.states[entity];
     if (!st) return;
   
     // Check if this is a group (entity has multiple members)
     const isGroup = st.attributes?.entity_id?.length > 1;
   
     const on = st.state === "on";
     const bri = on && st.attributes.brightness ? Math.round(st.attributes.brightness / 2.55) : 0;
   
     // Use defaultRgb when off
     const rgb = (on && st.attributes.rgb_color) ? st.attributes.rgb_color : this._defaultRgb;
     const hex = this._rgbToHex(rgb);
   
     const key = `${on}|${bri}|${hex}`;
     if (this._lastStates[entity] !== key) {
       const hdr = el.tagName === "DIV" && el.classList.contains("header") ? el : el.querySelector(".header");
       const fill = hdr.querySelector(".slider-fill");
       const percentEl = hdr.querySelector(".percent");
       const icon = hdr.querySelector(".icon");
   
       // Default off background
       hdr.style.setProperty("--off-bg", offBg);
       if (!on) hdr.style.background = offBg;
   
       // Dimmer fill
       const fillRgba = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${on ? 0.4 : 0.25})`;
       hdr.style.setProperty("--light-fill", fillRgba);
       if (fill) fill.style.background = fillRgba;
   
       // Light icon color
       const hsl = this._rgbToHsl(rgb[0], rgb[1], rgb[2]);
       const lightHsl = `hsl(${hsl.h}, ${hsl.s}%, ${Math.min(100, hsl.l + 60)}%)`;
       if (icon) {
         icon.style.color = lightHsl;
         // Adjust icon for single/group
         if (!isGroup) {
           icon.setAttribute("icon", "mdi:lightbulb");
         } else {
           icon.setAttribute("icon", "mdi:light-group");
         }
       }
   
       // Show/hide chevron based on group
       const chevron = hdr.querySelector(".chevron");
       if (chevron) chevron.style.display = isGroup ? "" : "none";
   
       hdr.style.setProperty("--percent", bri + "%");
       if (percentEl) percentEl.textContent = bri + "%";
   
       // Update chevron icon for expanded/collapsed groups
       if (chevron && isGroup) {
         const expanded = hdr.closest(".group")?.classList.contains("expanded");
         chevron.setAttribute("icon", expanded ? "mdi:chevron-down" : "mdi:chevron-right");
       }
   
       this._lastStates[entity] = key;
     }
   
     // Update lux if present
     const lux = el.querySelector(".lux");
     if (lux) {
       const s = hass.states[lux.dataset.entity];
       const v = s && !isNaN(s.state) ? Math.round(+s.state) : null;
       lux.textContent = v !== null ? `${v} lx` : "-- lx";
     }
   });

}


  /* -------------------------------------------------
     HELPERS
  ------------------------------------------------- */
  _rgbToHex([r, g, b]) {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  _rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
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
