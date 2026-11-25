// Story mode: a scroll-driven walk through the findings (docs/FINDINGS.md).
// Chapter cards scroll over the chart. When a card reaches the middle of the screen its
// chapter takes over the scene: layout, which Pokémon are shown, where newcomers fly in
// from, and a trend line through the group averages that draws itself as you scroll.

const isSpecial = (p) => p.isLegendary || p.isMythical;
const core = (p) => p.fullyEvolved && !isSpecial(p);
const strictCore = (p) => core(p) && !p.specialClass;
const isPseudo = (p) => p.chainLength === 3 && p.fullyEvolved && p.bst === 600 && !isSpecial(p);

// layout: a LAYOUTS key. show: which Pokémon are visible. enter: where Pokémon that
// appear in this chapter fly in from ('scatter' | 'left' | 'right' | 'top'; default:
// grow in place). trend: draw a line through the group averages.
export function chapters(games) {
  const launch = new Set(games.filter((g) => g.kind === 'base').map((g) => g.id));
  return [
    {
      id: 'intro', layout: 'role', show: null, enter: 'scatter',
      kicker: 'A data story in 3D',
      title: 'Are Pokémon getting stronger?',
      body: `Since 1996, nine generations have introduced <b>1,025 Pokémon</b>. Each has six base
        stats; added up, they make its <b>base stat total (BST)</b>, the usual shorthand for raw
        power. Every sprite here is one Pokémon. Scroll to see what 28 years of designs reveal.`,
    },
    {
      id: 'raw', layout: 'generation', show: null, trend: true,
      title: 'Every Pokémon, by generation',
      body: `Each column is a generation, each sprite a Pokémon placed by its BST. The gold line
        joins the averages: <b>408</b> in Gen 1 up to <b>457</b> in Gen 9.
        <br><br>Case closed? Not quite. Each generation adds a different mix of baby Pokémon,
        first stages and legendaries, and that mix moves the average on its own.`,
    },
    {
      id: 'core', layout: 'generation', show: strictCore, trend: true,
      title: 'Compare like with like',
      body: `Keep only <b>fully evolved, non-legendary</b> Pokémon and the picture changes:
        485 in Gen 1, a dip through Gens 2–3, then <b>one real step in Gen 4</b> (496)…
        and a plateau around 495 for the next five generations. Gen 9: 499.`,
    },
    {
      id: 'paradox', layout: 'generation', show: core, enter: 'right', trend: true,
      title: 'So where does Gen 9’s jump come from?',
      body: `Add back two new classes the games count as “regular”: the <b>11 Ultra Beasts</b>
        (Gen 7, average 567) and the <b>20 Paradox Pokémon</b> (Gen 9, average 578).
        Gen 9’s average leaps to <b>522</b>. The latest “power creep” is almost entirely this
        one near-legendary class.`,
    },
    {
      id: 'legends', layout: 'generation', show: (p) => isSpecial(p) && p.fullyEvolved, enter: 'top', trend: true,
      title: 'Meanwhile, legendaries are coming down',
      body: `Fully evolved legendaries peaked around <b>627</b> in Gens 4 and 6 and fell to
        <b>574</b> by Gen 9, while becoming far more common: 3% of Gen 1, but about one in
        eight new Pokémon since the 3DS era. The gap between legendary and regular shrank from
        <b>119 BST to 52</b>. The tiers are converging.`,
    },
    {
      id: 'launch', layout: 'release', show: (p) => launch.has(p.debutGame),
      title: 'Launch day',
      body: `Now ordered by the game each Pokémon debuted in. Until 2017, every new species
        arrived with its generation’s launch games: Red & Green, Gold & Silver and so on.`,
    },
    {
      id: 'dlc', layout: 'release', show: null, enter: 'right',
      title: 'The DLC era',
      body: `Since Ultra Sun & Ultra Moon, <b>39 species</b> have arrived after launch, through
        follow-ups, DLC and events: the gold column. They average <b>536 BST</b> against 423 at launch, and
        three in four are legendary, mythical, Ultra Beast or Paradox.
        <br><br>Updates need headline Pokémon, and headline Pokémon have big stats.`,
    },
    {
      id: 'types', layout: 'typeGen', show: null,
      title: 'Which types got buffed?',
      body: `Tile colour is a cell’s average BST, from dark (weak) to gold (strong).
        <b>Dragon</b> has run hot since Gen 1 (546 on average, flat over time).
        <b>Bug</b> started as the weakest type and climbed into the pack; Ghost and Fairy rose
        fastest. Water never moved.`,
    },
    {
      id: 'pseudo', layout: 'generation', show: isPseudo, enter: 'left', trend: true,
      title: 'Some things never creep',
      body: `Every generation gets a <b>pseudo-legendary</b>: a three-stage line ending at
        <b>exactly 600 BST</b>. From Dragonite in 1996 to Baxcalibur in 2022, that line hasn’t
        moved an inch. Stat budgets are designed, not drifting.`,
    },
    {
      id: 'outro', layout: 'role', show: null,
      title: 'So, are Pokémon getting stronger?',
      body: `A little: one real step in Gen 4. Most of the visible creep comes from new
        near-legendary classes and post-launch additions, while legendaries themselves drift
        down. And BST isn’t everything: abilities, moves and mechanics like Mega Evolution
        and Terastal changed battles far more.`,
      final: true,
    },
  ].map((c) => ({ ...c, show: c.show ? maskFrom(c.show) : null }));
}

// predicates become 0/1 masks lazily (they need the Pokémon list)
function maskFrom(pred) {
  let cache = null;
  return (pokemon) => (cache ??= Float32Array.from(pokemon, (p) => (pred(p) ? 1 : 0)));
}

export class Story {
  constructor({ games, onChapter, onProgress, onExplore }) {
    this.chapters = chapters(games);
    this.onChapter = onChapter;
    this.onProgress = onProgress;
    this.onExplore = onExplore;
    this.active = -1;
    this.el = document.getElementById('story');
    this.build();
  }

  build() {
    const n = this.chapters.length;
    this.el.innerHTML = this.chapters.map((c, i) => `
      <section class="chapter${i === 0 ? ' intro' : ''}" data-i="${i}">
        <div class="story-card">
          <p class="kicker">${c.kicker ?? `${i} / ${n - 1}`}</p>
          <h2>${c.title}</h2>
          <p>${c.body}</p>
          ${i === 0 ? '<p class="scroll-cue">Scroll to begin <span aria-hidden="true">↓</span></p>' : ''}
          ${c.final ? '<button type="button" class="explore-btn">Explore the data yourself →</button>' : ''}
        </div>
      </section>`).join('') + '<div class="story-end"></div>';
    this.el.querySelector('.explore-btn').addEventListener('click', () => this.onExplore());
    document.getElementById('skip-story').addEventListener('click', () => this.onExplore());

    this.sections = [...this.el.querySelectorAll('.chapter')];
    this.cards = this.sections.map((s) => s.querySelector('.story-card'));
    // Checked from the scroll position (not an IntersectionObserver), so a fast flick,
    // Page Down or End can never skip a chapter.
    let queued = false;
    this.el.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; this.update(); });
    }, { passive: true });
  }

  // The trigger line: mid-screen on desktop; lower on phones, where cards sit low
  triggerY() {
    return this.el.clientHeight * (innerWidth > 760 ? 0.55 : 0.75);
  }

  // Active chapter = the last card whose top has passed the trigger line
  update() {
    const y = this.triggerY();
    let i = 0;
    this.cards.forEach((c, k) => { if (c.getBoundingClientRect().top < y) i = k; });
    this.activate(i);
    this.progress();
  }

  activate(i) {
    if (i === this.active) return;
    this.active = i;
    this.sections.forEach((s, k) => s.classList.toggle('active', k === i));
    this.onChapter(this.chapters[i], i);
    this.progress();
  }

  // 0..1 progress through the active chapter: 0.25 the moment its card passes the
  // trigger line, 1 after another ~third of a screen (drives the trend line drawing)
  progress() {
    const card = this.cards[this.active];
    if (!card) return;
    const passed = this.triggerY() - card.getBoundingClientRect().top;
    this.onProgress(Math.min(1, Math.max(0, 0.25 + passed / (this.el.clientHeight * 0.35))));
  }

  show() {
    document.body.classList.add('story');
    this.el.scrollTop = 0;
    this.active = -1;
    this.activate(0);
  }

  hide() {
    document.body.classList.remove('story');
  }
}
