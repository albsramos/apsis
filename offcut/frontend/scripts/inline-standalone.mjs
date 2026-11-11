// Turns the standalone build into one self-contained page: the stylesheet and
// the script go inline (fonts are already data URIs), so it can be published
// anywhere as a single file. Writes dist-standalone/offcut.html.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist-standalone/', import.meta.url);
const html = readFileSync(new URL('index.html', dir), 'utf8');
const read = (href) => readFileSync(new URL(href.replace(/^\.\//, ''), dir), 'utf8');

const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => read(m[1])).join('\n');
const js = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((m) => read(m[1])).join('\n');
const title = /<title>(.*?)<\/title>/.exec(html)?.[1] ?? 'Offcut';

const page = `<title>${title}</title>
<style>${css.replaceAll('</style', '<\\/style')}</style>
<div id="root"></div>
<script type="module">${js.replaceAll('</script', '<\\/script')}</script>
`;
writeFileSync(new URL('offcut.html', dir), page);
console.log(`dist-standalone/offcut.html: ${(page.length / 1024 / 1024).toFixed(2)} MB`);
