# Light Group Card for Home Assistant

**A beautiful, modern, and highly interactive light control card** — styled to match your custom aircon card, with **dynamic color sliders**, **expandable individual lights**, and **optional lux sensors**.

![Light Group Card Screenshot](https://via.placeholder.com/800x400.png?text=Light+Group+Card+Preview)  
*(Replace with actual screenshot)*

---

## Features

| Feature | Description |
|-------|-----------|
| **Dynamic Slider Color** | The brightness slider **matches the current light color** (RGB). When off → neutral grey. |
| **Click & Drag Anywhere** | No visible thumb — tap or drag **anywhere** on the slider for instant control. |
| **Expandable Sub-Lights** | Click the group name → reveals individual lights with their own toggle + slider. |
| **Color Picker** | Tap the color circle → opens Home Assistant’s built-in color picker. |
| **Optional Lux Sensor** | Show live lux value next to group name (click for more-info). |
| **No Base Color Config** | Fully dynamic — no `slider_color` needed. |
| **Matches Aircon Card Style** | Same fonts, glow, gradients, invisible thumb sliders, no underlines. |

---

## Installation

1. **Download the card**
   ```bash
   mkdir -p /config/www/light-group-card
   wget -O /config/www/light-group-card/light-group-card.js \
     https://raw.githubusercontent.com/your-username/your-repo/main/light-group-card.js
   ``
2. **Add to configuration.yaml**
   ``yaml
   frontend:
      extra_module_url:
        - /local/light-group-card/light-group-card.js
3. **Restart Home Assistant**
4. **Use in Lovelact (UI or YAML)**

----

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
