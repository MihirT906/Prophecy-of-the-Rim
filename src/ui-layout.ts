/** Canvas equivalent of TeX overfull-box diagnostics. Enabled only by the browser lint harness. */
export interface Box { x: number; y: number; w: number; h: number }
export interface LayoutItem extends Box { kind: 'text' | 'panel'; name: string; inset: number }
export interface LayoutIssue { rule: string; message: string }
const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const overlaps = (a: Box, b: Box) => Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x) > 1 && Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y) > 1;
export function lintLayout(items: LayoutItem[], viewport: Box): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const validBox = (b: Box) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0;
  if (!validBox(viewport)) return [{ rule: 'invalid-viewport', message: 'Viewport must have finite coordinates and positive dimensions' }];
  for (const item of items) {
    if (!validBox(item) || !Number.isFinite(item.inset) || item.inset < 0 ||
      (item.kind === 'panel' && (2 * item.inset >= item.w || 2 * item.inset >= item.h))) {
      issues.push({ rule: 'invalid-geometry', message: `${item.name}: (${item.x}, ${item.y}) ${item.w}×${item.h}, inset ${item.inset}` });
    }
  }
  for (const item of items) if (item.kind === 'panel' && !inside(item, viewport))
    issues.push({ rule: 'overfull-panel-viewport', message: `${item.name}: panel border extends beyond viewport` });
  const visible = items.filter(a => a.kind === 'text');
  for (const a of visible) {
    if (!inside(a, viewport)) issues.push({ rule: 'overfull-viewport', message: a.name });
    const index = items.indexOf(a);
    const parent = items.slice(0,index).reverse().find(b => b.kind === 'panel' && overlaps(a,b));
    if (parent) {
      const b = {x:parent.x+parent.inset,y:parent.y+parent.inset,w:parent.w-2*parent.inset,h:parent.h-2*parent.inset};
      if (!inside(a,b)) issues.push({rule:'overfull-panel',message:`${a.name} crosses ${parent.name} content inset ${parent.inset}`});
    }
    for (const b of items.slice(index+1)) if (b.kind === 'panel' && overlaps(a,b)) issues.push({rule:'panel-occludes-text',message:`${b.name} overlaps ${a.name}`});
  }
  for (let i=0;i<visible.length;i++) for(let j=i+1;j<visible.length;j++) if(overlaps(visible[i],visible[j])) issues.push({rule:'text-collision',message:`${visible[i].name} overlaps ${visible[j].name}`});
  return issues;
}
let items: LayoutItem[] | null = null;
export function beginLayout(w: number,h: number): void {
  if (typeof window === 'undefined' || !(window as any).__lintUI) { items=null; return; }
  items=[];
  (window as any).__uiLayout = () => ({ items, issues:lintLayout(items!,{x:0,y:0,w,h}) });
}
export function recordLayout(ctx: CanvasRenderingContext2D, item: LayoutItem): void {
  if (!items) return;
  const t=ctx.getTransform();
  // World labels move with the camera; this pass checks fixed screen typography.
  if (Math.abs(t.e)>0.01 || Math.abs(t.f)>0.01 || t.a!==1 || t.d!==1 || t.b!==0 || t.c!==0) return;
  items.push(item);
}
