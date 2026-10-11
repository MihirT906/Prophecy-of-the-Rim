import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileTree } from './ui-assets.mjs';
const leaf = {id:'portrait',prompt:'leaf details',output:'test.png',size:[64,64],regions:[{id:'test',rect:[0,0,64,64],border:4}]};
test('every root-to-leaf prompt inherits ordered style and records its path', () => {
 const tree = {id:'style',prompt:'broad direction',children:[{id:'aliens',prompt:'family details',children:[leaf]}]};
 const [job] = compileTree(tree);
 assert.equal(job.path,'style/aliens/portrait');
 assert.equal(job.prompt,'[style]\nbroad direction\n\n[aliens]\nfamily details\n\n[portrait]\nleaf details');
 assert.equal(job.sha256,compileTree(tree)[0].sha256);
 assert.notEqual(job.sha256,compileTree({...tree,prompt:'new direction'})[0].sha256);
});
test('bad crop geometry and non-leaf outputs fail before generation', () => {
 assert.throws(() => compileTree({...leaf,regions:[{id:'bad',rect:[50,0,64,64],border:4}]}),/Invalid region/);
 assert.throws(() => compileTree({...leaf,children:[leaf]}),/Only leaves/);
});
