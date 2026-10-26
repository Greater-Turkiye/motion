// v2.html's entry: the scene names its design, and the design is its own module (B: provinces risen by
// population, src/v2/main.ts; D: the descent into a city, src/v2/city.ts)
const SPECS = import.meta.glob('../../scenes/v2/*.json', { eager: true, import: 'default' }) as Record<string, { design: string }>;
const name = new URLSearchParams(location.search).get('scene') || 'nufus-2025';
const design = Object.entries(SPECS).find(([k]) => k.endsWith(`/${name}.json`))?.[1]?.design;
if (design === 'D') await import('./city');
else await import('./main');
