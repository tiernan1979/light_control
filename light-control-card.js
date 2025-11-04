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

    const on = st.state === "on";
    const bri = on && st.attributes.brightness ? Math.round(st.attributes.brightness / 2.55) : 0;

    // use last RGB if available, otherwise default
    const rgb = on
      ? (st.attributes.rgb_color || this._dragging[entity]?.lastRgb || this._defaultRgb)
      : this._defaultRgb;
    const alpha = on ? 0.4 : 0.25;
    const rgba = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

    const hsl = this._rgbToHsl(...rgb);
    const iconHsl = `hsl(${hsl.h},${hsl.s}%,${Math.min(100,hsl.l+60)}%)`;

    header.style.setProperty("--pct", `${bri}%`);
    header.style.setProperty("--fill", rgba);
    const fillEl = header.querySelector(".slider-fill");
    if (fillEl) fillEl.style.background = rgba;
    const pctEl = header.querySelector(".percent");
    if (pctEl) pctEl.textContent = `${bri}%`;

    const icon = header.querySelector(".icon");
    if (icon) icon.style.color = iconHsl;

    const chev = header.querySelector(".chevron");
    if (chev) {
      const isGroup = st.attributes?.entity_id?.length > 1;
      chev.style.display = isGroup ? "block" : "none";
      const expanded = header.closest(".group")?.classList.contains("expanded");
      chev.setAttribute("icon", expanded ? "mdi:chevron-down" : "mdi:chevron-right");
    }

    if (!this._dragging[entity]) this._dragging[entity] = { active: false, lastRgb: rgb };
    else this._dragging[entity].lastRgb = rgb;
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
        .header{position:relative;display:flex;align-items:center;gap:8px;height:${barHeight}px;padding:0 12px;border-radius:12px;cursor:pointer;overflow:hidden;background:var(--off-bg,#333);box-shadow:0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.1);}
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

  _attachHandlers() {
    this.shadowRoot.querySelectorAll(".header").forEach(header => {
      const groupEl = header.closest(".group");
      const entity = groupEl?.dataset.entity || header.closest(".item")?.dataset.entity;
      const st = entity ? this._hass.states[entity] : null;
      if (!entity || !st) return;

      const track = header.querySelector(".slider-track");
      if (!this._dragging[entity]) this._dragging[entity] = { active: false, lastRgb: this._defaultRgb };

      const commitBrightness = (pct, commit) => {
        header.style.setProperty("--pct", `${pct}%`);
        const fillEl = header.querySelector(".slider-fill");
        const pctEl = header.querySelector(".percent");
        const rgb = this._dragging[entity].lastRgb;

        const on = pct > 0;
        const rgba = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${on?0.4:0.25})`;
        if (fillEl) fillEl.style.background = rgba;
        if (pctEl) pctEl.textContent = `${pct}%`;

        if (commit) {
          const ids = st.attributes?.entity_id?.length > 1 ? st.attributes.entity_id : [entity];
          if (pct === 0) {
            this._hass.callService("light", "turn_off", { entity_id: ids });
          } else {
            this._hass.callService("light", "turn_on", {
              entity_id: ids,
              brightness_pct: Math.max(pct, 1),
              rgb_color: rgb
            });
          }
        }

        this._dragging[entity].lastRgb = rgb;
      };

      // dragging
      track.addEventListener("pointerdown", e => {
        e.stopPropagation();
        const dragState = this._dragging[entity];
        dragState.active = true;
        track.setPointerCapture(e.pointerId);

        const move = ev => {
          if (!dragState.active) return;
          const rect = track.getBoundingClientRect();
          const x = ev.clientX - rect.left;
          const pct = Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
          commitBrightness(pct, false);
        };

        const up = ev => {
          if (!dragState.active) return;
          dragState.active = false;
          track.releasePointerCapture(e.pointerId);
          const rect = track.getBoundingClientRect();
          const x = ev.clientX - rect.left;
          const pct = Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
          commitBrightness(pct, true);
          track.removeEventListener("pointermove", move);
          track.removeEventListener("pointerup", up);
          track.removeEventListener("pointercancel", up);
        };

        track.addEventListener("pointermove", move);
        track.addEventListener("pointerup", up);
        track.addEventListener("pointercancel", up);
        move(e);
      });

      // icon → more-info
      const icon = header.querySelector(".icon");
      icon?.addEventListener("click", e => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent("hass-more-info", {
          bubbles: true, composed: true,
          detail: { entityId: entity }
        }));
      });

      // chevron → expand individuals
      const chev = header.querySelector(".chevron");
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

      // click toggle → groups or individual
      header.addEventListener("click", e => {
        if (e.target.closest(".icon,.chevron,.lux")) return;
        const st = entity ? this._hass.states[entity] : null;
        if (!st) return;

        const service = st.state === "on" ? "turn_off" : "turn_on";
        const ids = st.attributes?.entity_id?.length > 1 ? st.attributes.entity_id : [entity];
        this._hass.callService("light", service, { entity_id: ids });
      });
    });
  }

  _loadIndividuals(groupId, container) {
    const groupState = this._hass.states[groupId];
    const manual = JSON.parse(container.closest(".group").dataset.manual);
    const lights = groupState?.attributes?.entity_id || manual || [];

    let html = "";
    lights.forEach(l => {
      const st = this._hass.states[l];
      if (!st) return;
      html += `
        <div class="header" data-type="individual" data-entity="${l}">
          <ha-icon class="icon"></ha-icon>
          <span class="name">${l.split(".")[1]}</span>
          <span class="percent">0%</span>
          <div class="slider-fill"></div>
          <div class="slider-track"></div>
        </div>`;
    });
    container.innerHTML = html;
    this._attachHandlers(); // reattach for new individual lights
  }

  _rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) h = s = 0;
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch(max) { case r: h = (g - b)/d + (g < b ? 6:0); break; case g: h = (b - r)/d + 2; break; case b: h = (r - g)/d + 4; break; }
      h *= 60;
    }
    return {h: Math.round(h), s: Math.round(s*100), l: Math.round(l*100)};
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll(".group, .individuals .header").forEach(el => {
      const entity = el.dataset.entity;
      if (entity && (!this._dragging[entity]?.active)) {
        this._updateHeader(el, entity);
      }
    });

    // update lux sensors
    this.shadowRoot.querySelectorAll(".lux").forEach(span => {
      const sensor = span.dataset.entity;
      const st = hass.states[sensor];
      if (st) span.textContent = `${st.state} lx`;
    });
  }

  getCardSize() { return this.config.groups.length; }

  get _defaultRgb() { return [85,85,85]; }
}

customElements.define("light-group-card", LightGroupCard);
