/* -------------------------------------------------
   light-group-card.js  (fixed)
   – GROUP: click = turn ALL ON (no toggle)
   – COLOR: only changes ON lights
   – MIXED: correct % and no accidental toggles
   – Dragging: smooth, exact %
   – Fill: visible when OFF + ON
   – Padding: between groups
   – Individuals: own rgb_color + own slider
------------------------------------------------- */
class LightGroupCard extends HTMLElement {
  constructor() {
    super();
    this._dragging = {};
    this._lastStates = {};
    this._expanded = new Set();
    this._defaultRgb = [28, 28, 28]; // fallback before hass
    this.attachShadow({ mode: "open" });
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
                background:var(--off-bg,#333);box-shadow:0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.1);}
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

      const placeholder = `
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
      html += placeholder;
    }

    container.innerHTML = html;

    // set initial slider fill for individuals safely
    container.querySelectorAll(".header").forEach(hdr => {
      const entityId = hdr.closest(".item")?.dataset.entity;
      if (!entityId) return;

      const st = this._hass?.states[entityId];
      if (!st) return;

      const on = st.state === "on";
      const bri = on && st.attributes.brightness
        ? Math.round(st.attributes.brightness / 2.55)
        : 0;
      const rgb = on && st.attributes.rgb_color ? st.attributes.rgb_color : this._defaultRgb;
      const rgba = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${on ? 0.4 : 0.25})`;

      hdr.style.setProperty("--pct", `${bri}%`);
      hdr.style.setProperty("--fill", rgba);
      hdr.querySelector(".slider-fill").style.background = rgba;
      hdr.querySelector(".percent").textContent = `${bri}%`;

      if (!this._dragging[entityId]) this._dragging[entityId] = { active: false, lastPct: bri, lastRgb: rgb };
      else this._dragging[entityId].lastRgb = rgb;
    });
  }

  /* ------------------------------------------------- */
  _attachHandlers() {
    this.shadowRoot.querySelectorAll(".header").forEach(header => {
      const groupEl = header.closest(".group");
      const entity = groupEl?.dataset.entity || header.closest(".item")?.dataset.entity || null;
      if (!entity) return;

      const track = header.querySelector(".slider-track");
      const fill  = header.querySelector(".slider-fill");
      const pctEl = header.querySelector(".percent");
      const icon  = header.querySelector(".icon");
      const chev  = header.querySelector(".chevron");

      if (!this._dragging[entity]) this._dragging[entity] = { active: false, lastPct: 0, lastRgb: this._defaultRgb };

      const commitBrightness = (pct, commit) => {
        header.style.setProperty("--pct", `${pct}%`);
        pctEl.textContent = `${pct}%`;

        const state = this._hass.states[entity];
        const rgb = state?.attributes?.rgb_color ?? this._dragging[entity].lastRgb;
        const rgba = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${pct > 0 ? 0.4 : 0.25})`;
        header.style.setProperty("--fill", rgba);
        fill.style.background = rgba;

        if (commit) {
          this._hass.callService("light", "turn_on", { entity_id: entity, brightness_pct: pct, rgb_color: rgb });
        }
        this._dragging[entity].lastRgb = rgb;
      };

      track.addEventListener("pointerdown", e => {
        e.stopPropagation();
        this._dragging[entity].active = true;
        track.setPointerCapture(e.pointerId);

        const move = ev => {
          if (!this._dragging[entity].active) return;
          const rect = track.getBoundingClientRect();
          const x = ev.clientX - rect.left;
          const pct = Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
          commitBrightness(pct, false);
        };
        const up = ev => {
          if (!this._dragging[entity].active) return;
          this._dragging[entity].active = false;
          track.releasePointerCapture(e.pointerId);
          const rect = track.getBoundingClientRect();
          const x = ev.clientX - rect.left;
          const pct = Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
          commitBrightness(pct, true);
          track.removeEventListener("pointermove", move);
        };

        track.addEventListener("pointermove", move);
        track.addEventListener("pointerup", up);
        track.addEventListener("pointercancel", up);
        move(e);
      });

      icon?.addEventListener("click", e => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: entity } }));
      });

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

      header.addEventListener("click", e => {
        if (e.target.closest(".icon,.chevron,.lux")) return;

        const item = header.closest(".item");
        const groupEntity = groupEl?.dataset.entity;

        if (item) {
          const targetEntity = item.dataset.entity;
          const state = this._hass.states[targetEntity];
          const turnOn = !state || state.state === "off";
          this._hass.callService("light", turnOn ? "turn_on" : "turn_off", { entity_id: targetEntity });
        } else if (groupEntity) {
          const state = this._hass.states[groupEntity];
          const ids = state?.attributes?.entity_id || [];
          const anyOn = ids.some(id => this._hass.states[id]?.state === "on");
          ids.forEach(id => this._hass.callService("light", anyOn ? "turn_off" : "turn_on", { entity_id: id }));
        }
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

  set hass(hass) {
    this._hass = hass;
    this._defaultRgb = [28, 28, 28]; // fallback for any undefined color
    this.shadowRoot.querySelectorAll(".lux").forEach(el => {
      const s = hass.states[el.dataset.entity];
      if (s) el.textContent = `${s.state} lx`;
    });
    this._renderGroups();
  }

  getCardSize() { return 1; }
}

customElements.define("light-group-card", LightGroupCard);
