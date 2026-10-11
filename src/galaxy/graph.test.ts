import { expect, test } from 'vitest';
import { connection, readGraph, shortestPath } from './graph';
import { loadGalaxy } from './catalog';
import document from './galaxy.json';
import content from './content.json';
import { generateSystem, generateUniverse } from '../universe';

test('topology is independent of payload shape, content names and gameplay', () => {
  const raw = { nodes: [{ id: 'one', label: 'One', data: ['unknown', 42] }, { id: 'two', label: 'Two', data: null }], edges: [{ id: 'path', label: 'A link', from: 'one', to: 'two', data: { arbitrary: { plugin: true } } }] };
  const graph = readGraph(raw);
  expect(shortestPath(graph, 'two', 'one')).toEqual(['two', 'one']);
  expect(connection(graph, 'two', 'one')?.data).toEqual({ arbitrary: { plugin: true } });
  expect(() => readGraph({ ...raw, nodes: [raw.nodes[0], raw.nodes[0]] })).toThrow();
  expect(() => readGraph({ ...raw, edges: [{ ...raw.edges[0], to: 'missing' }] })).toThrow();
});
test('JSON profile changes affect generated content without changing graph topology', () => {
  const revised = structuredClone(content);
  revised.systems.haunted.planets = 2; revised.systems.haunted.stations = 3;
  const before = generateUniverse('same', loadGalaxy(document, content));
  const after = generateUniverse('same', loadGalaxy(document, revised));
  expect(after.catalog.graph).toEqual(before.catalog.graph);
  expect(generateSystem(before, 0).planets).toHaveLength(4);
  expect(generateSystem(after, 0).planets).toHaveLength(2);
  expect(generateSystem(after, 0).stations).toHaveLength(3);
  expect(() => loadGalaxy(document, { ...revised, systems: {} })).toThrow();
});
