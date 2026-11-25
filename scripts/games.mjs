// Main-series Pokémon games, hand-curated (PokeAPI has no release dates).
// Dates: first release worldwide (usually Japan) and first North American release,
// per Bulbapedia's release-date tables.
// kind: 'base' = a generation's launch titles, 'follow-up' = paired/third version or
// remake, 'dlc' = expansion pass / post-launch content, 'event' = species added by a
// free update / raid event, 'spin-off-core' = Let's Go / Legends.
// The debut overrides below were cross-checked against PokeAPI's regional Pokédex lists
// (e.g. in the Kitakami dex but not Paldea's -> The Teal Mask).
export const GAMES = [
  { id: 'red-green', name: 'Red & Green', gen: 1, kind: 'base', platform: 'Game Boy', region: 'Kanto', jp: '1996-02-27', na: '1998-09-28', naName: 'Red & Blue' },
  { id: 'yellow', name: 'Yellow', gen: 1, kind: 'follow-up', platform: 'Game Boy', region: 'Kanto', jp: '1998-09-12', na: '1999-10-18' },
  { id: 'gold-silver', name: 'Gold & Silver', gen: 2, kind: 'base', platform: 'Game Boy Color', region: 'Johto', jp: '1999-11-21', na: '2000-10-15' },
  { id: 'crystal', name: 'Crystal', gen: 2, kind: 'follow-up', platform: 'Game Boy Color', region: 'Johto', jp: '2000-12-14', na: '2001-07-29' },
  { id: 'ruby-sapphire', name: 'Ruby & Sapphire', gen: 3, kind: 'base', platform: 'Game Boy Advance', region: 'Hoenn', jp: '2002-11-21', na: '2003-03-18' },
  { id: 'firered-leafgreen', name: 'FireRed & LeafGreen', gen: 3, kind: 'follow-up', platform: 'Game Boy Advance', region: 'Kanto', jp: '2004-01-29', na: '2004-09-09' },
  { id: 'emerald', name: 'Emerald', gen: 3, kind: 'follow-up', platform: 'Game Boy Advance', region: 'Hoenn', jp: '2004-09-16', na: '2005-05-01' },
  { id: 'diamond-pearl', name: 'Diamond & Pearl', gen: 4, kind: 'base', platform: 'Nintendo DS', region: 'Sinnoh', jp: '2006-09-28', na: '2007-04-22' },
  { id: 'platinum', name: 'Platinum', gen: 4, kind: 'follow-up', platform: 'Nintendo DS', region: 'Sinnoh', jp: '2008-09-13', na: '2009-03-22' },
  { id: 'heartgold-soulsilver', name: 'HeartGold & SoulSilver', gen: 4, kind: 'follow-up', platform: 'Nintendo DS', region: 'Johto', jp: '2009-09-12', na: '2010-03-14' },
  { id: 'black-white', name: 'Black & White', gen: 5, kind: 'base', platform: 'Nintendo DS', region: 'Unova', jp: '2010-09-18', na: '2011-03-06' },
  { id: 'black2-white2', name: 'Black 2 & White 2', gen: 5, kind: 'follow-up', platform: 'Nintendo DS', region: 'Unova', jp: '2012-06-23', na: '2012-10-07' },
  { id: 'x-y', name: 'X & Y', gen: 6, kind: 'base', platform: 'Nintendo 3DS', region: 'Kalos', jp: '2013-10-12', na: '2013-10-12' },
  { id: 'omega-ruby-alpha-sapphire', name: 'Omega Ruby & Alpha Sapphire', gen: 6, kind: 'follow-up', platform: 'Nintendo 3DS', region: 'Hoenn', jp: '2014-11-21', na: '2014-11-21' },
  { id: 'sun-moon', name: 'Sun & Moon', gen: 7, kind: 'base', platform: 'Nintendo 3DS', region: 'Alola', jp: '2016-11-18', na: '2016-11-18' },
  { id: 'ultra-sun-ultra-moon', name: 'Ultra Sun & Ultra Moon', gen: 7, kind: 'follow-up', platform: 'Nintendo 3DS', region: 'Alola', jp: '2017-11-17', na: '2017-11-17' },
  { id: 'lets-go', name: "Let's Go, Pikachu! & Eevee!", gen: 7, kind: 'spin-off-core', platform: 'Nintendo Switch', region: 'Kanto', jp: '2018-11-16', na: '2018-11-16' },
  { id: 'sword-shield', name: 'Sword & Shield', gen: 8, kind: 'base', platform: 'Nintendo Switch', region: 'Galar', jp: '2019-11-15', na: '2019-11-15' },
  { id: 'isle-of-armor', name: 'The Isle of Armor', gen: 8, kind: 'dlc', platform: 'Nintendo Switch', region: 'Galar', jp: '2020-06-17', na: '2020-06-17' },
  { id: 'crown-tundra', name: 'The Crown Tundra', gen: 8, kind: 'dlc', platform: 'Nintendo Switch', region: 'Galar', jp: '2020-10-22', na: '2020-10-22' },
  { id: 'brilliant-diamond-shining-pearl', name: 'Brilliant Diamond & Shining Pearl', gen: 8, kind: 'follow-up', platform: 'Nintendo Switch', region: 'Sinnoh', jp: '2021-11-19', na: '2021-11-19' },
  { id: 'legends-arceus', name: 'Legends: Arceus', gen: 8, kind: 'spin-off-core', platform: 'Nintendo Switch', region: 'Hisui', jp: '2022-01-28', na: '2022-01-28' },
  { id: 'scarlet-violet', name: 'Scarlet & Violet', gen: 9, kind: 'base', platform: 'Nintendo Switch', region: 'Paldea', jp: '2022-11-18', na: '2022-11-18' },
  { id: 'sv-raid-event-2023', name: 'Scarlet & Violet Tera Raid event (v1.2.0)', gen: 9, kind: 'event', platform: 'Nintendo Switch', region: 'Paldea', jp: '2023-02-27', na: '2023-02-27' },
  { id: 'teal-mask', name: 'The Teal Mask', gen: 9, kind: 'dlc', platform: 'Nintendo Switch', region: 'Kitakami', jp: '2023-09-13', na: '2023-09-13' },
  { id: 'indigo-disk', name: 'The Indigo Disk', gen: 9, kind: 'dlc', platform: 'Nintendo Switch', region: 'Blueberry Academy', jp: '2023-12-14', na: '2023-12-14' },
  { id: 'mochi-mayhem', name: 'Mochi Mayhem (epilogue)', gen: 9, kind: 'dlc', platform: 'Nintendo Switch', region: 'Kitakami', jp: '2024-01-11', na: '2024-01-11' },
  { id: 'legends-z-a', name: 'Legends: Z-A', gen: 9, kind: 'spin-off-core', platform: 'Nintendo Switch / Switch 2', region: 'Kalos', jp: '2025-10-16', na: '2025-10-16' },
];

// Species that debuted after their generation's launch titles, by National Dex number.
// Everything else debuts in its generation's 'base' game.
const ranges = (pairs) => Object.fromEntries(pairs.flatMap(([from, to, game]) =>
  Array.from({ length: to - from + 1 }, (_, i) => [from + i, game])));
export const DEBUT_OVERRIDES = ranges([
  [803, 806, 'ultra-sun-ultra-moon'], // Poipole, Naganadel, Stakataka, Blacephalon
  [807, 807, 'ultra-sun-ultra-moon'], // Zeraora
  [808, 809, 'lets-go'], // Meltan, Melmetal
  [891, 893, 'isle-of-armor'], // Kubfu, Urshifu, Zarude
  [894, 898, 'crown-tundra'], // Regieleki, Regidrago, Glastrier, Spectrier, Calyrex
  [899, 905, 'legends-arceus'], // Wyrdeer ... Enamorus
  [1009, 1010, 'sv-raid-event-2023'], // Walking Wake, Iron Leaves (in no launch Pokédex)
  [1011, 1017, 'teal-mask'], // Dipplin, Poltchageist, Sinistcha, Okidogi, Munkidori, Fezandipiti, Ogerpon
  [1018, 1024, 'indigo-disk'], // Archaludon, Hydrapple, Gouging Fire, Raging Bolt, Iron Boulder, Iron Crown, Terapagos
  [1025, 1025, 'mochi-mayhem'], // Pecharunt
]);
