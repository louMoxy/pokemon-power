// Filters: chips per category (OR within a category, AND across categories) plus a
// name/number search. Produces a 0/1 "visible" mask that the sprite field (dimming),
// the picker (only visible sprites are hoverable) and the guides (group averages) use.
import { CATEGORIES } from './layouts.js';
import { TYPE_COLORS } from './data.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Filter facets. Type matches either slot (dual types count for both), unlike
// "Group by Type", which has to put each Pokémon in one place: its primary type.
function facets(ctx) {
  return [
    {
      id: 'type', label: 'Type',
      options: Object.keys(TYPE_COLORS).map((t) => ({ id: t, label: cap(t), color: TYPE_COLORS[t] })),
      test: (p, set) => p.types.some((t) => set.has(t)),
    },
    ...['generation', 'evolution', 'status', 'console'].map((id) => {
      const cat = CATEGORIES[id];
      return {
        id, label: cat.label,
        options: cat.order(ctx).map((o) => ({ id: o.id, label: id === 'generation' ? o.short.replace('G', 'Gen ') : o.label })),
        test: (p, set) => set.has(cat.key(p)),
      };
    }),
  ];
}

export class Filters {
  constructor(pokemon, ctx, onChange) {
    this.pokemon = pokemon;
    this.onChange = onChange;
    this.facets = facets(ctx);
    this.selected = Object.fromEntries(this.facets.map((f) => [f.id, new Set()]));
    this.query = '';
    this.mask = new Float32Array(pokemon.length).fill(1);
    this.buildPanel();
  }

  get active() {
    return this.query !== '' || Object.values(this.selected).some((s) => s.size > 0);
  }

  matches(p) {
    for (const f of this.facets) {
      const set = this.selected[f.id];
      if (set.size && !f.test(p, set)) return false;
    }
    if (this.query) {
      const q = this.query;
      const num = q.replace(/^#/, '');
      if (!(p.name.toLowerCase().includes(q) || (/^\d+$/.test(num) && String(p.id) === String(+num)))) return false;
    }
    return true;
  }

  update() {
    let shown = 0;
    this.pokemon.forEach((p, i) => { this.mask[i] = this.matches(p) ? 1 : 0; shown += this.mask[i]; });
    const chipsOn = Object.values(this.selected).some((s) => s.size > 0);
    this.count.textContent = !this.active ? `All ${this.pokemon.length.toLocaleString()} Pokémon`
      : shown === 0 && this.query && chipsOn ? 'No matches with these filters'
      : `Showing ${shown.toLocaleString()} of ${this.pokemon.length.toLocaleString()}`;
    this.clearBtn.hidden = !this.active;
    const n = Object.values(this.selected).reduce((a, s) => a + s.size, 0) + (this.query ? 1 : 0);
    this.badge.textContent = n || '';
    this.badge.hidden = !n;
    this.onChange(this.mask, this.active);
  }

  // first visible match for the current search (Enter jumps to it)
  firstMatch() {
    const i = this.mask.indexOf(1);
    return this.query && i >= 0 ? i : -1;
  }

  clear() {
    for (const s of Object.values(this.selected)) s.clear();
    this.query = '';
    this.search.value = '';
    this.panel.querySelectorAll('.chip[aria-pressed="true"]').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    this.update();
  }

  buildPanel() {
    this.panel = document.getElementById('filter-panel');
    this.toggle = document.getElementById('filter-toggle');
    this.badge = this.toggle.querySelector('.badge');
    this.panel.innerHTML = `
      <div class="filter-search">
        <input type="search" placeholder="Search name or #number" aria-label="Search Pokémon" autocomplete="off" />
      </div>
      <div class="facets">${this.facets.map((f) => `
        <section data-facet="${f.id}">
          <h3>${esc(f.label)}</h3>
          <div class="chips">${f.options.map((o) => `
            <button class="chip" type="button" data-id="${esc(o.id)}" aria-pressed="false"
              ${o.color ? `style="--chip:${o.color}"` : ''}>${esc(o.label)}</button>`).join('')}
          </div>
        </section>`).join('')}
      </div>
      <footer><span class="count"></span><button type="button" class="clear" hidden>Clear filters</button></footer>`;
    this.search = this.panel.querySelector('input');
    this.count = this.panel.querySelector('.count');
    this.clearBtn = this.panel.querySelector('.clear');

    this.toggle.addEventListener('click', () => this.setOpen(this.panel.hidden));
    this.clearBtn.addEventListener('click', () => this.clear());
    this.search.addEventListener('input', () => {
      this.query = this.search.value.trim().toLowerCase();
      this.update();
    });
    this.panel.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const facet = chip.closest('section').dataset.facet;
      const f = this.facets.find((x) => x.id === facet);
      // option ids can be numbers (generation); find the original value
      const opt = f.options.find((o) => String(o.id) === chip.dataset.id);
      const set = this.selected[facet];
      const on = !set.has(opt.id);
      if (on) set.add(opt.id); else set.delete(opt.id);
      chip.setAttribute('aria-pressed', String(on));
      this.update();
    });
    this.update();
  }

  setOpen(open) {
    this.panel.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
    if (open && matchMedia('(pointer: fine)').matches) this.search.focus();
  }
}
