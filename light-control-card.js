/* -------------------------------------------------
   light-group-card.js
   – Header = Full Light Group Control (no power button)
   – Slide, tap, % inside, color picker inside
   – Dropdown shows individual lights
   – Auto + manual lights supported
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

        /* ---------- GROUP (HEADER = SLIDER) ---------- */
        .group {
          margin-bottom: 16px;
        }
        .group-header {
          display: flex; align-items: center; gap: 8px;
          height: 48px; padding: 0 12px;
          border-radius: 12px; cursor: pointer;
          background: linear-gradient(to right,
            var(--gradient-dark) 0%,
            var(--gradient-start) var(--percent),
            var(--light-gradient-end) var(--percent),
            var(--light-gradient-end) 100%
          );
          box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1);
          position: relative;
          overflow: hidden;
        }
        .group-header.off {
          background: #333;
        }
        .group-header ha-icon.name-icon { font-size: 24px; }
        .group-header .name { flex: 1; font-weight: 500; }
        .group-header .lux { font-size: 14px; color: #ccc; cursor: pointer; }
        .group-header .chevron { transition: transform .2s; font-size: 20px; }
        .group-header.expanded .chevron { transform: rotate(90deg); }

        .slider-track {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          border-radius: 12px; cursor: pointer;
        }
        .percent-label {
          position: absolute; right: 50px; top: 50%; transform: translateY(-50%);
          font-size: 14px; font-weight: bold; color: white; pointer-events: none;
        }
        .color-dot {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          width: 24px; height: 24px; border-radius: 50%; border: 2px solid #444;
          cursor: pointer; background: #888;
        }

        /* ---------- INDIVIDUAL LIGHTS ---------- */
        .individuals {
          margin-top: 8px; display: none; flex-direction: column; gap: 4px;
        }
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
          <div class="group-header off">
            <ha-icon class="name-icon" icon="${g.icon || 'mdi:lightbulb-group'}"></ha-icon>
            <span class="name">${g.name}</span>
            ${luxPart}
            <span class="percent-label">0%</span>
            <div class="color-dot"></div>
            <ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>
            <div class="slider-track"></div>
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
    this.shadowRoot.querySelectorAll('.group').forEach(group => {
      const header = group.querySelector('.group-header');
      const track = header.querySelector('.slider-track');
      const entity = group.dataset.entity;
      this._dragging[entity] = false;

      // --- TAP = TOGGLE ---
      header.addEventListener('click', e => {
        if (e.target.closest('.lux') || e.target.closest('.color-dot')) return;
        const state = this._hass.states[entity];
        const turnOn = !state || state.state === 'off';
        this._hass.callService('light', turnOn ? 'turn_on' : 'turn_off', { entity_id: entity });
      });

      // --- SLIDER LOGIC ---
      const setSlider = (pct, fromDrag = false) => {
        header.style.setProperty('--percent', pct + '%');
        header.querySelector('.percent-label').textContent = pct + '%';
        header.classList.toggle('off', pct === 0);
        if (pct > 0) this._hass.callService('light', 'turn_on', { entity_id: entity, brightness_pct: pct });
        else this._hass.callService('light', 'turn_off', { entity_id: entity });
      };

      track.addEventListener('click', e => {
        e.stopPropagation();
        const rect = track.getBoundingClientRect();
        const pct = Math.round((e.clientX - rect.left) / rect.width * 100 / 5) * 5;
        setSlider(pct);
      });

      track.addEventListener('pointerdown', e => {
        e.stopPropagation();
        this._dragging[entity] = true;
        track.setPointerCapture(e.pointerId);
        const move = ev => {
          if (!this._dragging[entity]) return;
          const rect = track.getBoundingClientRect();
          const pct = Math.round((ev.clientX - rect.left) / rect.width * 100 / 5) * 5;
          setSlider(pct, true);
        };
        const up = () => {
          this._dragging[entity] = false;
          track.releasePointerCapture(e.pointerId);
          track.removeEventListener('pointermove', move);
          track.removeEventListener('pointerup', up);
          track.removeEventListener('pointercancel', up);
        };
        track.addEventListener('pointermove', move);
        track.addEventListener('pointerup', up);
        track.addEventListener('pointercancel', up);
      });

      // --- COLOR DOT ---
      header.querySelector('.color-dot').addEventListener('click', e => {
        e.stopPropagation();
        const ev = new Event('hass-more-info', { bubbles: true, composed: true });
        ev.detail = { entityId: entity };
        header.dispatchEvent(ev);
      });

      // --- EXPAND ---
      header.addEventListener('dblclick', e => {
        e.stopPropagation();
        const expanded = group.classList.toggle('expanded');
        group.querySelector('.individuals').classList.toggle('show', expanded);
        header.querySelector('.chevron').classList.toggle('expanded', expanded);
        if (expanded) this._loadIndividuals(entity, group.querySelector('.individuals'));
      });
    });
  }

  /* -------------------------------------------------
     INDIVIDUAL LIGHTS
  ------------------------------------------------- */
  _loadIndividuals(groupId, container) {
    if (!this._hass) return;
    const groupEl = container.closest('.group');
    const manualLights = JSON.parse(groupEl.dataset.manualLights.replace(/&quot;/g, '"'));
    const group = groupId ? this._hass.states[groupId] : null;
    const groupEntities = group?.attributes?.entity_id || [];

    const allLights = [];
    groupEntities.forEach(id => {
      const st = this._hass.states[id];
      if (st) allLights.push({ entity: id, state: st });
    });
    manualLights.forEach(m => {
      const st = this._hass.states[m.entity];
      if (st) allLights.push({ entity: m.entity, state: st, name: m.name, icon: m.icon });
    });

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

    // Attach individual listeners
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
     HASS UPDATE
  ------------------------------------------------- */
  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll('.group').forEach(g => {
      const entity = g.dataset.entity;
      if (!entity) return;
      const state = hass.states[entity];
      if (!state) return;

      const on = state.state === 'on';
      const bri = on && state.attributes.brightness ? Math.round(state.attributes.brightness/2.55) : 0;
      const rgb = on && state.attributes.rgb_color ? state.attributes.rgb_color : null;
      const hex = rgb ? this._rgbToHex(rgb) : '#555';
      const key = `${on}|${bri}|${hex}`;

      if (this._lastStates[entity] !== key) {
        const header = g.querySelector('.group-header');
        const dark = this._rgba(this._shade(hex,-40),0.3);
        const start = this._rgba(hex,0.7);
        const light = this._rgba(this._shade(hex,50),0.1);

        header.style.setProperty('--gradient-dark', dark);
        header.style.setProperty('--gradient-start', start);
        header.style.setProperty('--light-gradient-end', light);
        header.style.setProperty('--percent', bri + '%');
        header.querySelector('.percent-label').textContent = bri + '%';
        header.querySelector('.color-dot').style.background = hex;
        header.classList.toggle('off', bri === 0);
        this.shadowRoot.host.style.setProperty('--glow-color', on ? hex : '#ccc');

        this._lastStates[entity] = key;
      }

      // Lux
      const luxEl = g.querySelector('.lux');
      if (luxEl) {
        const s = hass.states[luxEl.dataset.entity];
        const val = s && !isNaN(s.state) ? Math.round(+s.state) : null;
        luxEl.textContent = val !== null ? `${val} lx` : '-- lx';
      }

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

  getCardSize() { return 3 + (this.config?.groups?.length || 0) * 2; }
}
customElements.define('light-group-card', LightGroupCard);
