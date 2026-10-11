import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../assets/ui/', import.meta.url);
export function compileTree(node, ancestors = []) {
  if (!node.id || !node.prompt) throw new Error('Every node needs an id and prompt');
  const path = [...ancestors, node];
  if (node.children) {
    if (node.output) throw new Error('Only leaves can specify output');
    return node.children.flatMap(child => compileTree(child, path));
  }
  if (!node.output || !node.size || !node.regions?.length) throw new Error(`Incomplete leaf ${node.id}`);
  const [w, h] = node.size;
  for (const r of node.regions) {
    const [x,y,rw,rh] = r.rect;
    if (x < 0 || y < 0 || x + rw > w || y + rh > h || r.border * 2 >= Math.min(rw,rh)) throw new Error(`Invalid region ${r.id}`);
  }
  if (node.animation) {
    const a = node.animation, frames = a.columns * a.rows;
    if (![a.columns,a.rows,...a.frameSize].every(n => Number.isInteger(n) && n > 0) || a.columns*a.frameSize[0] !== w || a.rows*a.frameSize[1] !== h || [...a.idle,...a.talk].some(n => !Number.isInteger(n) || n < 0 || n >= frames)) throw new Error(`Invalid animation ${node.id}`);
  }
  const prompt = path.map(n => `[${n.id}]\n${n.prompt}`).join('\n\n');
  return [{ path: path.map(n => n.id).join('/'), output: node.output, size: node.size,
    regions: node.regions, ...(node.animation ? { animation: node.animation } : {}), prompt, sha256: createHash('sha256').update(prompt).digest('hex'),
    guide: `guides/${node.output}`, tool: 'built-in image_gen', status: 'planned' }];
}

async function main() {
  const tree = JSON.parse(readFileSync(new URL('prompt-tree.json', root), 'utf8'));
  const jobs = compileTree(tree);
  for (const field of ['output']) if (new Set(jobs.map(j => j[field])).size !== jobs.length) throw new Error(`Duplicate ${field}`);
  const ids = jobs.flatMap(j => j.regions.map(r => r.id));
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate region id');
  mkdirSync(new URL('guides/', root), { recursive:true });
  for (const job of jobs) {
    const [w,h] = job.size;
    let blocks = job.regions.map(r => {
      const [x,y,rw,rh] = r.rect, b = r.border;
      return `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="#999"/><rect x="${x+b}" y="${y+b}" width="${rw-b*2}" height="${rh-b*2}" fill="#282828"/>`;
    }).join('');
    if (job.animation) {
      const {columns,rows,frameSize:[fw,fh]} = job.animation;
      blocks = Array.from({length:columns*rows}, (_, i) => {
        const x = i % columns * fw, y = Math.floor(i / columns) * fh;
        return `<g transform="translate(${x} ${y}) scale(${fw/384} ${fh/384})"><rect width="384" height="384" fill="#151515" stroke="#777"/><ellipse cx="192" cy="348" rx="140" ry="100" fill="#555"/><ellipse cx="192" cy="173" rx="87" ry="120" fill="#999"/><path d="M137 150h32 M215 150h32 M170 220h44" stroke="#333" stroke-width="8"/></g>`;
      }).join('');
    }
    writeFileSync(new URL(job.guide.replace('.png','.svg'), root), `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#090909"/>${blocks}</svg>`);
  }
  writeFileSync(new URL('generation-plan.json', root), JSON.stringify({ version:1, jobs }, null, 2)+'\n');
  const overrides = JSON.parse(readFileSync(new URL('atlas-overrides.json', root), 'utf8'));
  writeFileSync(new URL('catalog.json', root), JSON.stringify(Object.fromEntries(jobs.flatMap(j => j.regions.map(r => [r.id, { file:j.output, size:j.size, rect:r.rect, border:r.border, slice:[r.border,r.border,r.border,r.border], ...overrides[r.id], ...(j.animation ? {animation:j.animation} : {}) }]))), null, 2)+'\n');
  // Guide-only rendering. No network generation, keys or hidden costs in this command.
  if (process.argv.includes('--guides') || process.argv.includes('--pack')) {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({channel:'chrome',headless:true});
    try {
      for (const job of jobs) {
        const page = await browser.newPage({viewport:{width:job.size[0],height:job.size[1]},deviceScaleFactor:1});
        if (process.argv.includes('--guides')) {
          await page.goto(new URL(job.guide.replace('.png','.svg'), root).href);
          await page.screenshot({path:fileURLToPath(new URL(job.guide, root))});
        }
        if (process.argv.includes('--pack')) {
          const source = new URL(`generated/${job.output}`, root);
          if (!existsSync(source)) throw new Error(`Generate ${job.output} before packing`);
          const url = `data:image/png;base64,${readFileSync(source).toString('base64')}`;
          const encoded = await page.evaluate(async url => {
            const image = new Image(); image.src = url; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
            canvas.getContext('2d').drawImage(image,0,0);
            return canvas.toDataURL('image/webp',.92).split(',')[1];
          },url);
          mkdirSync(new URL('runtime/',root),{recursive:true});
          writeFileSync(new URL(`runtime/${job.output.replace('.png','.webp')}`,root),Buffer.from(encoded,'base64'));
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }
  console.log(`Compiled ${jobs.length} root-to-leaf prompts and ${ids.length} named regions.`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
