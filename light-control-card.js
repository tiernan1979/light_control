/* -------------------------------------------------
   light-group-card.js
   – slider colour = current light colour
   – off → grey, on → full colour + glow
   – expandable individual lights (auto + manual)
   – optional lux sensor per room
------------------------------------------------- */
class LightGroupCard extends HTMLElement {
  constructor() {
    super();
    this._dragging = {};
    this._lastStates = {};
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          font-family: 'Roboto', sans-serif;
          background: var(--card-background-color, #000);
          color: var(--text-color, white);
          border-radius: 12px;
          padding: 16px;
          display: block;
          user-select: none;
        }

        /* ---------- GROUP HEADER ---------- */
        .group-header {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px; cursor: pointer;
          background: #222; border-radius: 6px; margin-bottom: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1);
        }
        .group-header ha-icon { font-size: 24px; }
        .group-header .name { flex: 1; font-weight: 500; }
        .group-header .lux { font-size: 14px; color: #ccc; cursor: pointer; text-decoration: none; }
        .group-header .arrow { transition: transform .2s; }
        .group-header.expanded .arrow { transform: rotate(180deg); }

        /* ---------- GROUP CONTROLS ---------- */
        .group-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .group-toggle { width: 40px; height: 40px; cursor: pointer; }
        .group-toggle ha-icon { font-size: 28px; color: #ccc; }
        .group-toggle.on ha-icon { color: var(--glow-color, #fff); }

        .group-slider {
          flex: 1; height: 34px; -webkit-appearance: none; appearance: none;
          border-radius: 12px; outline: none; cursor: pointer;
          background: linear-gradient(to right,
            var(--gradient-dark) 0%,
            var(--gradient-start) var(--percent),
            var(--light-gradient-end) var(--percent)
          );
        }
        .group-slider::-webkit-slider-thumb { -webkit-appearance:none; width:0; height:0; opacity:0; }
        .group-slider::-moz-range-thumb { width:0; height:0; border:none; opacity:0; }

        .group-status { width: 50px; text-align: right; font-size: 15px; }

        .group-color {
          width: 40px; height: 40px; cursor: pointer;
          border-radius: 50%; border: 2px solid #444;
          background: #888;
        }

        /* ---------- INDIVIDUAL LIGHTS ---------- */
        .individuals { margin-top: 8px; display: none; flex-direction: column; gap: 4px; }
        .individuals.show { display: flex; }
        .ind-light {
          display: flex; align-items: center; gap: 8px; padding: 6px 10px;
          background: rgba(255,255,255,0.05); border-radius: 6px;
        }
        .ind-light ha-icon { font-size: 20px; }
        .ind-toggle { width: 36px; height: 36px; cursor: pointer; }
        .ind-toggle ha-icon { font-size: 24px; color: #ccc; }
        .ind-toggle.on ha-icon { color: var(--glow-color, #fff); }

        .ind-slider {
          flex: 1; height: 30px; -webkit-appearance: none; appearance: none;
          border-radius: 12px; outline: none; cursor: pointer;
          background: linear-gradient(to right,
            var(--ind-dark) 0%,
            var(--ind-start) var(--ind-percent),
            var(--ind-light) var(--ind-percent)
          );
        }
        .ind-slider::-webkit-slider-thumb { -webkit-appearance:none; width:0; height:0; opacity:0; }
        .ind-slider::-moz-range-thumb { width:0; height:0; border:none; opacity:0; }

        .ind-status { width: 44px; text-align: right; font-size: 14px; }
      </style>

      <div class="groups"></div>
    `;
  }

  /* -------------------------------------------------
     CONFIG
  ------------------------------------------------- */
  setConfig(config) {
    if (!config.groups || !Array.isArray(config.groups)) throw new Error('Define "groups"');
    this.config = config;

    const groupsDiv = this.shadowRoot.querySelector('.groups');
    let html = "";
    config.groups.forEach(g => {
      const luxPart = g.lux_sensor ? `<span class="lux" data-entity="${g.lux_sensor}">-- lx</span>` : '';
      const manualLights = JSON.stringify(g.lights || []).replace(/"/g, '&quot;');
      html += `
        <div class="group" data-entity="${g.entity || ''}" data-manual-lights="${manualLights}">
          <div class="group-header">
            <ha-icon icon="${g.icon || 'mdi:lightbulb-group'}"></ha-icon>
            <span class="name">${g.name}</span>
            ${luxPart}
            <ha-icon class="arrow" icon="mdi:chevron-down"></ha-icon>
          </div>

          <div class="group-controls" style="--percent:0%">
            <div class="group-toggle"><ha-icon icon="mdi:power"></ha-icon></div>
            <input type="range" class="group-slider" min="0" max="100" step="5" value="0">
            <span class="group-status">0%</span>
            <div class="group-color"></div>
          </div>

          <div class="individuals"></div>
        </div>`;
    });
    groupsDiv.innerHTML = html;
    this._attachListeners();
  }

  /* -------------------------------------------------
     LISTENERS
  ------------------------------------------------- */
  _attachListeners() {
    // ---- GROUP HEADER (expand + lux click) ----
    this.shadowRoot.querySelectorAll('.group-header').forEach(h => {
      h.addEventListener('click', e => {
        if (e.target.classList.contains('lux')) {
          const ev = new Event('hass-more-info', { bubbles:true, composed:true });
          ev.detail = { entityId: e.target.dataset.entity };
          e.target.dispatchEvent(ev);
          return;
        }
        const group = h.parentElement;
        const expanded = group.classList.toggle('expanded');
        group.querySelector('.individuals').classList.toggle('show', expanded);
        if (expanded) this._loadIndividuals(group.dataset.entity, group.querySelector('.individuals'));
      });
    });

    // ---- GROUP TOGGLE ----
    this.shadowRoot.querySelectorAll('.group-toggle').forEach(t => {
      t.addEventListener('click', () => {
        const entity = t.closest('.group').dataset.entity;
        const on = t.classList.toggle('on');
        this._hass.callService('light', on ? 'turn_on' : 'turn_off', { entity_id: entity });
      });
    });

    // ---- GROUP SLIDER (click / drag anywhere) ----
    this.shadowRoot.querySelectorAll('.group-slider').forEach(s => {
      const eid = s.closest('.group').dataset.entity;
      this._dragging[eid] = false;

      const setVal = v => {
        s.value = v;
        s.style.setProperty('--percent', v + '%');
        s.closest('.group-controls').querySelector('.group-status').textContent = v + '%';
      };

      s.addEventListener('click', e => {
        e.stopPropagation();
        const rect = s.getBoundingClientRect();
        const pct = Math.round((e.clientX - rect.left) / rect.width * 100 / 5) * 5;
        setVal(pct);
        this._hass.callService('light','turn_on',{entity_id:eid,brightness_pct:pct});
      });

      s.addEventListener('pointerdown', e => {
        e.stopPropagation();
        this._dragging[eid] = true;
        s.setPointerCapture(e.pointerId);
        const move = ev => {
          if (!this._dragging[eid]) return;
          const rect = s.getBoundingClientRect();
          const pct = Math.round((ev.clientX - rect.left) / rect.width * 100 / 5) * 5;
          setVal(pct);
        };
        const up = () => {
          this._dragging[eid] = false;
          s.releasePointerCapture(e.pointerId);
          s.removeEventListener('pointermove', move);
          s.removeEventListener('pointerup', up);
          s.removeEventListener('pointercancel', up);
          const v = +s.value;
          this._hass.callService('light','turn_on',{entity_id:eid,brightness_pct:v});
        };
        s.addEventListener('pointermove', move);
        s.addEventListener('pointerup', up);
        s.addEventListener('pointercancel', up);
      });
    });

    // ---- GROUP COLOUR (open picker) ----
    this.shadowRoot.querySelectorAll('.group-color').forEach(c => {
      c.addEventListener('click', () => {
        const entity = c.closest('.group').dataset.entity;
        const ev = new Event('hass-more-info', { bubbles:true, composed:true });
        ev.detail = { entityId: entity };
        c.dispatchEvent(ev);
      });
    });
  }

  /* -------------------------------------------------
     INDIVIDUAL LIGHTS – AUTO + MANUAL
  ------------------------------------------------- */
  _loadIndividuals(groupId, container) {
    if (!this._hass) return;
    const groupEl = container.closest('.group');
    const manualLights = JSON.parse(groupEl.dataset.manualLights.replace(/&quot;/g, '"'));
    const group = groupId ? this._hass.states[groupId] : null;
    const groupEntities = group?.attributes?.entity_id || [];

    const allLights = [];

    // Add group lights
    groupEntities.forEach(id => {
      const st = this._hass.states[id];
      if (st) allLights.push({ entity: id, state: st });
    });

    // Add manual lights
    manualLights.forEach(m => {
      const st = this._hass.states[m.entity];
      if (st) {
        allLights.push({
          entity: m.entity,
          state: st,
          name: m.name,
          icon: m.icon
        });
      }
    });

    // Deduplicate
    const seen = new Set();
    const uniqueLights = allLights.filter(l => {
      if (seen.has(l.entity)) return false;
      seen.add(l.entity);
      return true;
    });

    container.innerHTML = "";

    uniqueLights.forEach(l => {
      const st = l.state;
      const on = st.state === 'on';
      const bri = on && st.attributes.brightness ? Math.round(st.attributes.brightness/2.55) : 0;
      const rgb = on && st.attributes.rgb_color ? st.attributes.rgb_color : null;
      const hex = rgb ? this._rgbToHex(rgb) : '#555';
      const dark = this._rgba(this._shade(hex,-40),0.3);
      const start = this._rgba(hex,0.7);
      const light = this._rgba(this._shade(hex,50),0.1);

      const name = l.name || st.attributes.friendly_name || l.entity;
      const icon = l.icon || st.attributes.icon || 'mdi:lightbulb';

      const html = `
        <div class="ind-light" data-entity="${l.entity}">
          <ha-icon icon="${icon}"></ha-icon>
          <span class="ind-name">${name}</span>
          <div class="ind-toggle ${on?'on':''}"><ha-icon icon="mdi:power"></ha-icon></div>
          <input type="range" class="ind-slider" min="0" max="100" step="5" value="${bri}"
                 style="--ind-dark:${dark};--ind-start:${start};--ind-light:${light};--ind-percent:${bri}%">
          <span class="ind-status">${bri}%</span>
        </div>`;
      container.insertAdjacentHTML('beforeend', html);
    });

    // Attach listeners
    container.querySelectorAll('.ind-toggle').forEach(t => {
      t.addEventListener('click', () => {
        const entity = t.closest('.ind-light').dataset.entity;
        const on = t.classList.toggle('on');
        this._hass.callService('light', on?'turn_on':'turn_off', {entity_id:entity});
      });
    });

    container.querySelectorAll('.ind-slider').forEach(s => {
      const eid = s.closest('.ind-light').dataset.entity;
      this._dragging[eid] = false;

      const setVal = v => {
        s.value = v;
        s.style.setProperty('--ind-percent', v + '%');
        s.closest('.ind-light').querySelector('.ind-status').textContent = v + '%';
      };

      s.addEventListener('click', e => {
        e.stopPropagation();
        const rect = s.getBoundingClientRect();
        const pct = Math.round((e.clientX - rect.left) / rect.width * 100 / 5) * 5;
        setVal(pct);
        this._hass.callService('light','turn_on',{entity_id:eid,brightness_pct:pct});
      });

      s.addEventListener('pointerdown', e => {
        e.stopPropagation();
        this._dragging[eid] = true;
        s.setPointerCapture(e.pointerId);
        const move = ev => {
          if (!this._dragging[eid]) return;
          const rect = s.getBoundingClientRect();
          const pct = Math.round((ev.clientX - rect.left) / rect.width * 100 / 5) * 5;
          setVal(pct);
        };
        const up = () => {
          this._dragging[eid] = false;
          s.releasePointerCapture(e.pointerId);
          s.removeEventListener('pointermove', move);
          s.removeEventListener('pointerup', up);
          s.removeEventListener('pointercancel', up);
          const v = +s.value;
          this._hass.callService('light','turn_on',{entity_id:eid,brightness_pct:v});
        };
        s.addEventListener('pointermove', move);
        s.addEventListener('pointerup', up);
        s.addEventListener('pointercancel', up);
      });
    });
  }

  /* -------------------------------------------------
     HASS UPDATE – DYNAMIC COLOUR
  ------------------------------------------------- */
  set hass(hass) {
    this._hass = hass;

    this.shadowRoot.querySelectorAll('.group').forEach(g => {
      const entity = g.dataset.entity;
      const state = entity ? hass.states[entity] : null;
      const on = state?.state === 'on';
      const bri = on && state?.attributes.brightness ? Math.round(state.attributes.brightness/2.55) : 0;
      const rgb = on && state?.attributes.rgb_color ? state.attributes.rgb_color : null;
      const hex = rgb ? this._rgbToHex(rgb) : '#555';
      const key = `${on}|${bri}|${hex}`;

      if (this._lastStates[entity] !== key) {
        // toggle
        g.querySelector('.group-toggle').classList.toggle('on', on);

        // slider colour
        const dark = this._rgba(this._shade(hex,-40),0.3);
        const start = this._rgba(hex,0.7);
        const light = this._rgba(this._shade(hex,50),0.1);
        const ctrl = g.querySelector('.group-controls');
        ctrl.style.setProperty('--gradient-dark', dark);
        ctrl.style.setProperty('--gradient-start', start);
        ctrl.style.setProperty('--light-gradient-end', light);

        // glow
        this.shadowRoot.host.style.setProperty('--glow-color', on ? hex : '#ccc');

        // slider value
        const slider = g.querySelector('.group-slider');
        slider.value = bri;
        slider.style.setProperty('--percent', bri + '%');
        g.querySelector('.group-status').textContent = bri + '%';

        // colour circle
        g.querySelector('.group-color').style.background = hex;

        this._lastStates[entity] = key;
      }

      // lux sensor
      const luxEl = g.querySelector('.lux');
      if (luxEl) {
        const s = hass.states[luxEl.dataset.entity];
        const val = s && !isNaN(s.state) ? Math.round(+s.state) : null;
        luxEl.textContent = val !== null ? `${val} lx` : '-- lx';
      }

      // update expanded individuals
      if (g.classList.contains('expanded')) {
        this._loadIndividuals(entity, g.querySelector('.individuals'));
      }
    });
  }

  /* -------------------------------------------------
     HELPERS
  ------------------------------------------------- */
  _shade(hex, pct) {
    let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    r = Math.round(r * (100 + pct) / 100); g = Math.round(g * (100 + pct) / 100); b = Math.round(b * (100 + pct) / 100);
    r = r < 255 ? r : 255; g = g < 255 ? g : 255; b = b < 255 ? b : 255;
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }
  _rgba(hex, a) { const {r,g,b} = this._hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
  _hexToRgb(h) { h = h.replace('#',''); if (h.length===3) h=h.split('').map(c=>c+c).join(''); return {r:parseInt(h.substr(0,2),16),g:parseInt(h.substr(2,2),16),b:parseInt(h.substr(4,2),16)}; }
  _rgbToHex([r,g,b]) { return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`; }

  getCardSize() { return 4 + (this.config?.groups?.length || 0) * 2; }
}
customElements.define('light-group-card', LightGroupCard);
