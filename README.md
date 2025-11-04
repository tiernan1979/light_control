# Light Group Card for Home Assistant

**A sleek, modern, and fully interactive light control card** — styled to match your custom aircon card, with **dynamic color sliders**, **expandable individual lights**, **auto + manual light support**, and **optional lux sensors**.

---

## Features

| Feature | Description |
|-------|-----------|
| **Dynamic Slider Color** | Slider **matches current light color** (RGB). Off → neutral grey. |
| **Click & Drag Anywhere** | Invisible thumb — tap or drag **anywhere** on the slider. |
| **Expandable Lights** | Click group name → reveals **individual lights** with toggle + slider. |
| **Auto + Manual Lights** | Auto-discover group members **+** manually add extra lights. |
| **Color Picker** | Tap color circle → opens HA color picker. |
| **Optional Lux Sensor** | Show live lux value next to group name (click for more-info). |
| **No Base Color Config** | Fully dynamic — no `slider_color` needed. |
| **Aircon Card Style** | Same fonts, glow, gradients, invisible sliders, no underlines. |

---

## Screenshots

### Group View (Collapsed)
![Collapsed](https://via.placeholder.com/600x150.png?text=Collapsed+View)

### Expanded with Individual Lights
![Expanded](https://via.placeholder.com/600x350.png?text=Expanded+View)

### Dynamic Color Matching
![Color Match](https://via.placeholder.com/600x150.png?text=Color+Matches+Light)

> *Replace placeholder images with real screenshots in your repo.*

---

## Installation

1. **Download the card**
   ```bash
   mkdir -p /config/www/light-group-card
   wget -O /config/www/light-group-card/light-group-card.js \
     https://raw.githubusercontent.com/your-username/your-repo/main/light-group-card.js
   ```
2. **Add to configuration.yaml**
   ```yaml
   frontend:
      extra_module_url:
        - /local/light-group-card/light-group-card.js
   ```
3. **Restart Home Assistant**
4. **Use in Lovelact (UI or YAML)**

---

## Usage

**YAML Example**
   ```yaml
    type: custom:light-group-card
    groups:
      - name: Living Room
        entity: light.living_room_group
        icon: mdi:sofa
        lux_sensor: sensor.living_room_lux
        lights:
          - entity: light.special_mood_lamp
            name: Mood Lamp
            icon: mdi:star
          - entity: light.hidden_strip
   ```

---
**Configuration Options

| Key | Required | Type | Description |
|-------|----|-------|--------------------------|
| **groups** | Yes | Array | List of light groups |
| **name** | Yes | String | Display Name |
| **entity** | Yes* | String | light.group_entity (required for auto-discovery) | 
| **Icon** | No | String | Icon for group header |
| **lux_sensor** | No | String | sensor.lux_entity to show lux value |
| **lights** | No | Array | Manually add extra lights |
** Note: entity is optional only if you use lights: array **

---
**Compatibility**
* Home Assistant > 2024.2
* Works with any <b>light</b> group
* Supports <b>rgb_color</b> capable lights
* Mobile & Desktop friendly

---
**Contributing**
1. Fork the repo
2. Create a feature Branch
3. Commit Changes
4. Push and open a Pull Reuqest
