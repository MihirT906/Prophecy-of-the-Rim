import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');

const html = read('index.html')
  .replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, src) =>
    `<script type="module">${read(src).replaceAll('</script', '<\\/script')}</script>`)
  .replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, href) => `<style>${read(href)}</style>`);

if (/src="\.\/|href="\.\//.test(html)) throw new Error('arena.html still references external files');
writeFileSync(new URL('../arena.html', import.meta.url), html);
