import { cp, mkdir } from 'node:fs/promises';

const source = new URL('../comingsoon/', import.meta.url);
const destination = new URL('../dist/comingsoon/', import.meta.url);

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

console.log('Copied Coming Soon page to dist/comingsoon');
