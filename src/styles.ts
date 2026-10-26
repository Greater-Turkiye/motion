import type { StyleId } from './engine/scene';

/** The design directions of PLAN.md section 11 and docs/research/03, as data. */
export interface Style {
  id: StyleId;
  name: string;
  flat: boolean;           // C is a flat Mercator page; the others are a globe
  bg: [string, string];    // radial background, centre and edge
  sea: string;
  land: string;
  border: string;
  graticule: string;
  home: string; homeStroke: string;          // Türkiye
  subject: string; subjectStroke: string;    // the country the story is about
  glow: string | null;
  atmosphere: string | null;
  accent: string;          // hook line two, rings
  ink: string;             // text
  muted: string;
  status: string;          // the DOĞRULANMADI line
  label: string;
  emblemMono: boolean;     // draw emblems white on dark styles
  baseScale: number;       // globe radius (px) at zoom 1, or Mercator scale for C
  cy: number;              // where the camera centre sits on screen
  grain: number;
  relief: number;          // 0 flat colours, 1 full hill shading (ETOPO1 normal map)
  limb: number;            // how much the globe darkens towards its edge
  hypso?: [string, string, string];   // land coloured by height: lowland, middle, high (G)
  shadeTint?: [string, string];       // relief shadow and light colours instead of black and white (G)
  rhumb?: { color: string; centers: [number, number][] };  // portolan rhumb lines on the sea, 32 winds (K; flat styles only)
  tile?: string;                      // a faint tile pattern on the sea (K)
  halftone?: number;                  // relief printed as a 45° dot screen, cell size in px (H)
  speckle?: number;                   // photocopy toner speckle, 0..1 (H)
  contour?: { color: string; step: number };  // contour lines, step as a share of 5 km (I)
  gratStep?: number;                  // graticule spacing in degrees (default 10)
  maxZoom?: number;                   // the camera comes no closer than this: past it the relief's grain shows (G)
  subjectRelief?: boolean;            // the subject's fill lets the relief through at full strength (G)
  stepFps?: number;                   // camera moves in steps, n per second: stop motion (H)
  /** The style's motion language: how its text enters, how its camera moves, whether it shows the
   *  stories-style progress bar. Part of the style, so a style change changes all of it together. */
  motion: { text: 'rise' | 'wipe' | 'type' | 'pop'; camera: 'glide' | 'fly' | 'snap'; progress: boolean };
  /** Type families (assets.ts FAMILIES): display for hooks, titles and numbers, text for sentences,
   *  mono for kickers, footers and chips. Turkish glyphs verified in every file (docs/research/06). */
  fonts: { display: string; text: string; mono: string };
}

export const STYLES: Record<StyleId, Style> = {
  // motion: tabloid punch: words hit one by one, the camera cuts to its mark
  A: { id: 'A', fonts: { display: 'BigShoulders', text: 'M', mono: 'Martian' }, motion: { text: 'pop', camera: 'snap', progress: false }, name: 'Gece kırmızısı', flat: false, bg: ['#1a0f10', '#030303'], sea: '#050608', land: '#1b1719', border: 'rgba(255,255,255,0.11)',
    graticule: 'rgba(255,255,255,0.035)', home: '#8a1626', homeStroke: '#d9566a', subject: '#3a1219', subjectStroke: 'rgba(255,90,110,0.55)',
    glow: null, atmosphere: null, accent: '#f4e14a', ink: '#ffffff', muted: '#b7b0a8', status: '#ff8a98',
    label: 'rgba(255,255,255,0.8)', emblemMono: true, baseScale: 1400, cy: 640, grain: 0.05, relief: 0.95, limb: 0.35 },
  // motion: an operations screen: text is typed, the camera tracks smoothly
  // Türkiye in flag red on the navy: at #123d5a it sat one shade off the land and read as passive (owner, 2026-10-26)
  B: { id: 'B', fonts: { display: 'Archivo', text: 'Archivo', mono: 'JetBrains' }, motion: { text: 'type', camera: 'glide', progress: false }, name: 'Harekât lacivert', flat: false, bg: ['#06182a', '#020a12'], sea: '#061a2c', land: '#0b2740', border: 'rgba(140,190,215,0.28)',
    graticule: 'rgba(140,190,215,0.06)', home: '#c41e2e', homeStroke: '#ff8a96', subject: '#2a1f14', subjectStroke: '#e0a64a',
    glow: null, atmosphere: null, accent: '#8cc4dc', ink: '#ffffff', muted: '#7fc9ec', status: '#ffb020',
    label: 'rgba(223,244,255,0.85)', emblemMono: true, baseScale: 1700, cy: 640, grain: 0.035, relief: 0.6, limb: 0.3 },
  // motion: a newspaper page: lines are drawn on, the camera moves like a hand over paper
  C: { id: 'C', fonts: { display: 'Newsreader', text: 'Schibsted', mono: 'X' }, motion: { text: 'wipe', camera: 'glide', progress: false }, name: 'Editoryal', flat: true, bg: ['#f4efe6', '#ebe4d8'], sea: '#c7d1d4', land: '#fbf8f2', border: 'rgba(20,20,20,0.5)',
    graticule: 'rgba(20,20,20,0.06)', home: '#c8002a', homeStroke: '#8a001c', subject: '#d8cfc1', subjectStroke: '#141414',
    glow: null, atmosphere: null, accent: '#c8002a', ink: '#141414', muted: '#555555', status: '#555555',
    label: 'rgba(20,20,20,0.85)', emblemMono: false, baseScale: 1650, cy: 470, grain: 0.02, relief: 0.5, limb: 0 },
  // motion: a calm documentary from orbit: text rises, the camera flies
  // black night, Türkiye in flag red and the subject in signal orange: navy and grey read as dull (owner, 2026-10-26)
  D: { id: 'D', fonts: { display: 'Archivo', text: 'M', mono: 'JetBrains' }, motion: { text: 'rise', camera: 'fly', progress: false }, name: 'Uydu gecesi', flat: false, bg: ['#0c0c0e', '#000000'], sea: '#05070a', land: '#1b1c20', border: 'rgba(255,255,255,0.30)',
    graticule: 'rgba(255,255,255,0.035)', home: '#c8102e', homeStroke: '#ff7a88', subject: '#3a2408', subjectStroke: '#ff9f1c',
    glow: null, atmosphere: null, accent: '#ff9f1c', ink: '#ffffff', muted: '#b4b4bd', status: '#ff9f1c',
    label: 'rgba(255,255,255,0.85)', emblemMono: true, baseScale: 1100, cy: 640, grain: 0.04, relief: 1.0, limb: 0.45 },
  // research/03 E: a dark world in which one thing is lit (John Nelson's firefly recipe)
  // motion: a dark world lighting up: soft entrances, long flights
  E: { id: 'E', fonts: { display: 'Unbounded', text: 'M', mono: 'Martian' }, motion: { text: 'rise', camera: 'fly', progress: false }, name: 'Ateşböceği', flat: false, bg: ['#0b0f16', '#030406'], sea: '#05070B', land: '#12161D', border: 'rgba(38,45,58,0.9)',
    graticule: 'rgba(255,255,255,0.02)', home: '#14212b', homeStroke: 'rgba(180,210,225,0.55)', subject: '#2b1606', subjectStroke: '#FFF4D6',
    glow: null, atmosphere: null, accent: '#FFB547', ink: '#FFF4D6', muted: '#9aa3ad', status: '#FFB547',
    label: 'rgba(255,244,214,0.75)', emblemMono: true, baseScale: 1300, cy: 640, grain: 0.04, relief: 0.1, limb: 0.55 },
  // research/03 G: Imhof's Swiss relief, hypsometric tint, blue-grey shadows and warm light
  // motion: an atlas: slow, drawn, unhurried
  G: { id: 'G', fonts: { display: 'Schibsted', text: 'Schibsted', mono: 'X' }, motion: { text: 'wipe', camera: 'glide', progress: false }, name: 'İsviçre rölyefi', flat: true, bg: ['#eef0ea', '#e4e7df'], sea: '#A7C5D9', land: '#A9B89A', border: 'rgba(40,40,40,0.45)',
    graticule: 'rgba(40,60,80,0.07)', home: '#E30A17', homeStroke: '#8c1420', subject: '#C9837A', subjectStroke: '#7A1F2B',
    glow: null, atmosphere: null, accent: '#b3121f', ink: '#1d2326', muted: '#46525c', status: '#7A1F2B',
    label: 'rgba(20,30,40,0.85)', emblemMono: false, baseScale: 1650, cy: 520, grain: 0.02, relief: 1.0, limb: 0,
    hypso: ['#A9B89A', '#D9CFA6', '#F1EBDC'], shadeTint: ['#5B6E82', '#FFF6E0'],
    // close in on Russia the dark wine fill hid the land and the relief's grain showed (owner, 2026-10-26):
    // a lighter fill with the relief through it, and the camera stops at 1.9
    maxZoom: 1.9, subjectRelief: true },
  // research/03 K: an İznik tile atlas, Piri Reis rhumb lines on a pale sea
  // motion: ceremonial: nothing snaps, everything settles
  // the rhumb lines and the sea tile are gone (review, 23 October: crossing lines over both seas), and the
  // sea is a clear teal under the cream land: at #d9ebe7 the two were hard to tell apart
  K: { id: 'K', fonts: { display: 'Cinzel', text: 'Fraunces', mono: 'X' }, motion: { text: 'rise', camera: 'glide', progress: false }, name: 'Çini atlas', flat: true, bg: ['#F7F3EA', '#EFE8D8'], sea: '#9fc9c3', land: '#F7F3EA', border: 'rgba(27,27,27,0.6)',
    graticule: 'rgba(0,0,0,0)', home: '#B8322A', homeStroke: '#1B1B1B', subject: '#e6e3f0', subjectStroke: '#1F3F8F',
    glow: null, atmosphere: null, accent: '#1F3F8F', ink: '#1B1B1B', muted: '#4d4a44', status: '#B8322A',
    label: 'rgba(27,27,27,0.85)', emblemMono: false, baseScale: 1650, cy: 520, grain: 0.02, relief: 0.3, limb: 0 },
  // research/03 H: a declassified dossier, photocopied: toner on paper, Factbook-blue sea
  // motion: a typed dossier: typewriter text, a smooth camera
  // the stencil and typewriter faces were hard to read, and the 12-a-second camera steps and the halftone dots
  // that crawled as the map moved made the video judder (owner, 2026-10-26): a plain face, a smooth camera, no dots;
  // the dossier stays in the paper, the toner red and the typewriter kickers
  H: { id: 'H', fonts: { display: 'Archivo', text: 'Archivo', mono: 'CourierPrime' }, motion: { text: 'type', camera: 'glide', progress: false }, name: 'Gizliliği kaldırılmış', flat: true, bg: ['#ECE7DB', '#E2DCCD'], sea: '#C9D6DF', land: '#E9E4D8', border: 'rgba(26,26,26,0.8)',
    graticule: 'rgba(26,26,26,0.10)', home: '#d8cbb6', homeStroke: '#1A1A1A', subject: '#dcd3c3', subjectStroke: '#B3261E',
    glow: null, atmosphere: null, accent: '#B3261E', ink: '#1A1A1A', muted: '#4a4640', status: '#B3261E',
    label: 'rgba(26,26,26,0.9)', emblemMono: false, baseScale: 1650, cy: 520, grain: 0.07, relief: 0.8, limb: 0,
    speckle: 0.15 },
  // research/03 I: a printed field sheet: pale green lowland, brown contours, a one-degree grid
  // motion: a field sheet: ruled lines drawn on, decisive moves
  I: { id: 'I', fonts: { display: 'Archivo', text: 'Archivo', mono: 'Martian' }, motion: { text: 'wipe', camera: 'snap', progress: false }, name: 'Harekât paftası', flat: true, bg: ['#F2EFE4', '#E9E5D6'], sea: '#9CC7E0', land: '#F2EFE4', border: 'rgba(29,29,29,0.7)',
    graticule: 'rgba(29,29,29,0.09)', home: '#E30A17', homeStroke: '#1D1D1D', subject: '#D40000', subjectStroke: '#D40000',
    glow: null, atmosphere: null, accent: '#C8102E', ink: '#1D1D1D', muted: '#4b4b43', status: '#A0703C',
    label: 'rgba(29,29,29,0.9)', emblemMono: false, baseScale: 1650, cy: 520, grain: 0.02, relief: 0.55, limb: 0,
    hypso: ['#CFE3B4', '#EFE9D2', '#E6D5B8'], contour: { color: 'rgba(160,112,60,0.55)', step: 0.04 }, gratStep: 1 },
  // the earthquake channel (owner, 2026-10-25): the light relief map he liked, Türkiye a pale red with a red
  // edge, so the red wave fronts and the province names read over it
  Q: { id: 'Q', fonts: { display: 'Schibsted', text: 'Schibsted', mono: 'X' }, motion: { text: 'type', camera: 'glide', progress: false }, name: 'Deprem (açık rölyef)', flat: true, bg: ['#eef0ea', '#e4e7df'], sea: '#A7C5D9', land: '#A9B89A', border: 'rgba(40,40,40,0.45)',
    graticule: 'rgba(40,60,80,0.07)', home: '#F3C7C9', homeStroke: '#C8102E', subject: '#7A1F2B', subjectStroke: '#7A1F2B',
    glow: null, atmosphere: null, accent: '#C8102E', ink: '#1d2326', muted: '#46525c', status: '#7A1F2B',
    label: 'rgba(20,30,40,0.85)', emblemMono: false, baseScale: 1650, cy: 520, grain: 0.02, relief: 1.0, limb: 0,
    hypso: ['#A9B89A', '#D9CFA6', '#F1EBDC'], shadeTint: ['#5B6E82', '#FFF6E0'] },
};
