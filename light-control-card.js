/* -------------------------------------------------
   light-group-card.js
   – Header = full control (tap = toggle, drag = brightness)
   – Smooth dragging (no jump)
   – Group + every light uses the same header
   – Down arrow + colour dot
   – Auto + manual lights
------------------------------------------------- */
class LightGroupCard extends HTMLElement {
  constructor() {
    super();
    this._dragging = {};
    this._lastStates = {};
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {font-family:'Roboto',sans-serif;background:var(--card-background-color,#000);color:var(--text-color,#fff);border-radius:12px;padding:16px;display:block;user-select:none;}
        .group{margin-bottom:12px;}
        .header{
          position:relative;display:flex;align-items:center;gap:8px;height:48px;padding:0 12px;
          border-radius:12px;cursor:pointer;overflow:hidden;
          background:linear-gradient(to right,
            var(--gradient-dark) 0%,
            var(--gradient-start) var(--percent),
            var(--light-gradient-end) var(--percent),
            var(--light-gradient-end) 100%
          );
          box-shadow:0 2px 4px rgba(0,0,0,.3),inset 0 1px 2px rgba(255,255,255,.1);
        }
        .header.off{background:#333;}
        .header ha-icon.icon{font-size:24px;}
        .header .name{flex:1;font-weight:500;}
        .header .lux{font-size:14px;color:#ccc;cursor:pointer;}
        .header .percent{position:absolute;right:50px;top:50%;transform:translateY(-50%);font-size:14px;font-weight:bold;color:#fff;pointer-events:none;}
        .header .color-dot{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:24px;height:24px;border-radius:50%;border:2px solid #444;cursor:pointer;background:#888;}
        .header .chevron{transition:transform .2s;font-size:20px;}
        .header.expanded .chevron{transform:rotate(90deg);}
        .slider-track{position:absolute;top:0;left:0;right:0;bottom:0;border-radius:12px;cursor:pointer;}
        .individuals{margin-top:8px;display:none;}
        .individuals.show{display:block;}
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
      const lux = g.lux_sensor ? `<span class="lux" data-entity="${g.lux_sensor}">-- lx</span>` : '';
      const manual = JSON.stringify(g.lights || []).replace(/"/g, '&quot;');
      html += `
        <div class="group" data-entity="${g.entity||''}" data-manual="${manual}">
          <div class="header off" data-type="group">
            <ha-icon class="icon" icon="${g.icon||'mdi:lightbulb-group'}"></ha-icon>
            <span class="name">${g.name}</span>
            ${lux}
            <span class="percent">0%</span>
            <div class="color-dot"></div>
            <ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>
            <div class="slider-track"></div>
          </div>
          <div class="individuals"></div>
        </div>`;
    });
    groupsDiv.innerHTML = html;
    this._attachAll();
  }

  /* -------------------------------------------------
     ATTACH LISTENERS (group + individuals)
  ------------------------------------------------- */
  _attachAll() {
    this.shadowRoot.querySelectorAll('.header').forEach(h => this._attachHeader(h));
  }
  _attachHeader(header) {
    const entity = header.parentElement.dataset.entity || header.parentElement.closest('.group').dataset.entity;
    if (!entity) return;
    const track = header.querySelector('.slider-track');
    const pctEl = header.querySelector('.percent');
    const dot = header.querySelector('.color-dot');
    const chevron = header.querySelector('.chevron');
    const isGroup = header.dataset.type === 'group';
    this._dragging[entity] = false;

    /* ---- TAP = TOGGLE ---- */
    header.addEventListener('click', e => {
      if (e.target.closest('.lux') || e.target.closest('.color-dot')) return;
      const st = this._hass.states[entity];
      const turnOn = !st || st.state === 'off';
      this._hass.callService('light', turnOn ? 'turn_on' : 'turn_off', { entity_id: entity });
    });

    /* ---- SMOOTH DRAG ---- */
    let startX = 0;
    const set = (clientX, commit = false) => {
      const r = track.getBoundingClientRect();
      const off = clientX - r.left;
      const pct = Math.max(0, Math.min(100, Math.round(off / r.width * 100 / 5) * 5));
      header.style.setProperty('--percent', pct + '%');
      pctEl.textContent = pct + '%';
      header.classList.toggle('off', pct === 0);
      if (commit) {
        if (pct > 0) this._hass.callService('light', 'turn_on', { entity_id: entity, brightness_pct: pct });
        else this._hass.callService('light', 'turn_off', { entity_id: entity });
      }
    };

    track.addEventListener('pointerdown', e => {
      e.preventDefault();
      startX = e.clientX;
      this._dragging[entity] = true;
      track.setPointerCapture(e.pointerId);
      const move = ev => { if (this._dragging[entity]) set(ev.clientX); };
      const up = () => {
        if (!this._dragging[entity]) return;
        this._dragging[entity] = false;
        track.releasePointerCapture(e.pointerId);
        set(e.clientX, true);
        track.removeEventListener('pointermove', move);
        track.removeEventListener('pointerup', up);
        track.removeEventListener('pointercancel', up);
      };
      track.addEventListener('pointermove', move);
      track.addEventListener('pointerup', up);
      track.addEventListener('pointercancel', up);
    });

    /* ---- COLOR DOT ---- */
    dot.addEventListener('click', e => {
      e.stopPropagation();
      const ev = new Event('hass-more-info', { bubbles:true, composed:true });
      ev.detail = { entityId: entity };
      header.dispatchEvent(ev);
    });

    /* ---- EXPAND (group only) ---- */
    if (isGroup) {
      header.addEventListener('dblclick', e => {
        e.stopPropagation();
        const grp = header.parentElement;
        const exp = grp.classList.toggle('expanded');
        grp.querySelector('.individuals').classList.toggle('show', exp);
        chevron.classList.toggle('expanded', exp);
        if (exp) this._loadIndividuals(grp.dataset.entity, grp.querySelector('.individuals'));
      });
    }
  }

  /* -------------------------------------------------
     INDIVIDUAL LIGHTS (same header style)
  ------------------------------------------------- */
  _loadIndividuals(groupId, container) {
    if (!this._hass) return;
    const grp = container.closest('.group');
    const manual = JSON.parse(grp.dataset.manual.replace(/&quot;/g, '"'));
    const group = groupId ? this._hass.states[groupId] : null;
    const ids = group?.attributes?.entity_id || [];

    const all = [];
    ids.forEach(id => { const s = this._hass.states[id]; if (s) all.push({entity:id,state:s}); });
    manual.forEach(m => { const s = this._hass.states[m.entity]; if (s) all.push({entity:m.entity,state:s,name:m.name,icon:m.icon}); });

    const seen = new Set();
    const uniq = all.filter(l => { if (seen.has(l.entity)) return false; seen.add(l.entity); return true; });

    container.innerHTML = "";
    uniq.forEach(l => {
      const st = l.state;
      const on = st.state === 'on';
      const bri = on && st.attributes.brightness ? Math.round(st.attributes.brightness/2.55) : 0;
      const rgb = on && st.attributes.rgb_color ? st.attributes.rgb_color : null;
      const hex = rgb ? this._rgbToHex(rgb) : '#555';
      const name = l.name || st.attributes.friendly_name || l.entity.split('.').pop();
      const icon = l.icon || st.attributes.icon || 'mdi:lightbulb';

      const html = `
        <div class="item" data-entity="${l.entity}">
          <div class="header off">
            <ha-icon class="icon" icon="${icon}"></ha-icon>
            <span class="name">${name}</span>
            <span class="percent">${bri}%</span>
            <div class="color-dot" style="background:${hex}"></div>
            <div class="slider-track"></div>
          </div>
        </div>`;
      container.insertAdjacentHTML('beforeend', html);
    });

    // attach listeners to newly created headers
    container.querySelectorAll('.header').forEach(h => this._attachHeader(h));
  }

  /* -------------------------------------------------
     HASS UPDATE
  ------------------------------------------------- */
  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll('.item,.group > .header').forEach(el => {
      const entity = el.dataset.entity || el.closest('.group').dataset.entity;
      if (!entity) return;
      const st = hass.states[entity];
      if (!st) return;

      const on = st.state === 'on';
      const bri = on && st.attributes.brightness ? Math.round(st.attributes.brightness/2.55) : 0;
      const rgb = on && st.attributes.rgb_color ? st.attributes.rgb_color : null;
      const hex = rgb ? this._rgbToHex(rgb) : '#555';
      const key = `${on}|${bri}|${hex}`;

      if (this._lastStates[entity] !== key) {
        const hdr = el.tagName === 'DIV' && el.classList.contains('header') ? el : el.querySelector('.header');
        const dark = this._rgba(this._shade(hex,-40),0.3);
        const start = this._rgba(hex,0.7);
        const light = this._rgba(this._shade(hex,50),0.1);

        hdr.style.setProperty('--gradient-dark', dark);
        hdr.style.setProperty('--gradient-start', start);
        hdr.style.setProperty('--light-gradient-end', light);
        hdr.style.setProperty('--percent', bri + '%');
        hdr.querySelector('.percent').textContent = bri + '%';
        hdr.querySelector('.color-dot').style.background = hex;
        hdr.classList.toggle('off', bri === 0);
        this.shadowRoot.host.style.setProperty('--glow-color', on ? hex : '#ccc');

        this._lastStates[entity] = key;
      }

      // lux (group only)
      const lux = el.querySelector('.lux');
      if (lux) {
        const s = hass.states[lux.dataset.entity];
        const v = s && !isNaN(s.state) ? Math.round(+s.state) : null;
        lux.textContent = v !== null ? `${v} lx` : '-- lx';
      }

      // expand individuals if needed
      const grp = el.closest('.group');
      if (grp && grp.classList.contains('expanded')) {
        this._loadIndividuals(grp.dataset.entity, grp.querySelector('.individuals'));
      }
    });
  }

  /* -------------------------------------------------
     HELPERS
  ------------------------------------------------- */
  _shade(hex,pct){
    let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    r=Math.round(r*(100+pct)/100);g=Math.round(g*(100+pct)/100);b=Math.round(b*(100+pct)/100);
    r=r<255?r:255;g=g<255?g:255;b=b<255?b:255;
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }
  _rgba(hex,a){const {r,g,b}=this._hexToRgb(hex);return `rgba(${r},${g},${b},${a})`;}
  _hexToRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return{r:parseInt(h.substr(0,2),16),g:parseInt(h.substr(2,2),16),b:parseInt(h.substr(4,2),16)};}
  _rgbToHex([r,g,b]){return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;}

  getCardSize(){return 3+(this.config?.groups?.length||0)*3;}
}
customElements.define('light-group-card', LightGroupCard);
