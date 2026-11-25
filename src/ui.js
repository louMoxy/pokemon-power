// HTML overlay: hover tooltip, focus card and layout switcher.
import { TYPE_COLORS } from './data.js';

const STAT_LABELS = [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function pokemonCard(p, gameName) {
  const types = p.types
    .map((t) => `<span class="type" style="--type:${TYPE_COLORS[t]}">${t}</span>`).join('');
  const tags = [
    p.isLegendary && 'Legendary', p.isMythical && 'Mythical',
    p.specialClass === 'ultra-beast' && 'Ultra Beast', p.specialClass === 'paradox' && 'Paradox',
  ].filter(Boolean).map((t) => `<span class="tag">${t}</span>`).join('');
  const bars = STAT_LABELS.map(([k, label]) => `
    <div class="stat"><span>${label}</span><b>${p.stats[k]}</b>
      <i style="--w:${Math.min(100, (p.stats[k] / 180) * 100)}%"></i></div>`).join('');
  return `
    <div class="card-head">
      <div><div class="num">#${String(p.id).padStart(4, '0')}</div><div class="name">${esc(p.name)}</div></div>
      <div class="bst"><b>${p.bst}</b><span>BST</span></div>
    </div>
    <div class="types">${types}${tags}</div>
    <div class="stats">${bars}</div>
    <div class="debut">Gen ${p.generation} · ${esc(gameName)} · ${p.debutDate.slice(0, 4)}</div>`;
}

export class Overlay {
  constructor({ games, layouts, onLayout }) {
    this.gameName = Object.fromEntries(games.map((g) => [g.id, g.name]));
    this.tooltip = document.getElementById('tooltip');
    this.focus = document.getElementById('focus-card');
    this.hint = document.getElementById('layout-hint');
    this.layouts = layouts;

    const bar = document.getElementById('layout-bar');
    this.buttons = {};
    let section = null;
    for (const [key, layout] of Object.entries(layouts)) {
      if (layout.hidden) continue;
      if (layout.section !== section) {
        section = layout.section;
        const s = document.createElement('span');
        s.className = 'section';
        s.textContent = section;
        bar.appendChild(s);
      }
      const b = document.createElement('button');
      b.textContent = layout.label;
      b.addEventListener('click', () => onLayout(key));
      bar.appendChild(b);
      this.buttons[key] = b;
    }
  }

  setLayout(key, hint = null) {
    for (const [k, b] of Object.entries(this.buttons)) b.setAttribute('aria-pressed', String(k === key));
    this.buttons[key]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    this.hint.textContent = hint ?? this.layouts[key].hint;
  }

  showTooltip(p, x, y) {
    if (!p) { this.tooltip.hidden = true; this.tooltipId = null; return; }
    if (this.tooltipId !== p.id) {
      this.tooltip.innerHTML = pokemonCard(p, this.gameName[p.debutGame]);
      this.tooltipId = p.id;
    }
    this.tooltip.hidden = false;
    // keep inside the viewport: flip to the left near the right edge
    const r = this.tooltip.getBoundingClientRect();
    const left = x + 18 + r.width > innerWidth ? x - 18 - r.width : x + 18;
    const top = Math.min(Math.max(8, y - r.height / 2), innerHeight - r.height - 8);
    this.tooltip.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`;
  }

  showFocus(p) {
    this.focus.hidden = !p;
    if (p) {
      const touch = matchMedia('(pointer: coarse)').matches;
      this.focus.querySelector(".focus-body").innerHTML = pokemonCard(p, this.gameName[p.debutGame]) +
        `<div class="close-hint">Drag the model to turn it · ${touch ? 'tap empty space' : 'Esc'} to close</div>`;
    }
  }
}
