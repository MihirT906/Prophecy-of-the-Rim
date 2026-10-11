/** Gameplay adapter: JSON imports and content meanings live here, never in graph.ts. */
import { SECTOR_CONTENT } from '../sector-content';
import document from './galaxy.json';
import content from './content.json';
import { connection, readGraph, type Graph } from './graph';
import { validateContract, type Rule } from '../json-contract';
import type { EngineProfile } from '../engines';
import type { EnemyKind } from '../data';
export interface SystemProfile { planets: number; stations: number; debrisMultiplier: number; encounterMultiplier: number; encounterWeights: Record<string, number>; hazards: string[] }
export interface LaneProfile { length: number; width: number; obstacleCount: number; encounterCount: number; engine: EngineProfile; enemies: { kind: EnemyKind; weight: number }[] }
export interface SystemDefinition { ring: number; angle: number; danger: number; content: string }
export interface GalaxyCatalog { graph: Graph; systems: Map<string, SystemDefinition>; systemProfiles: Record<string, SystemProfile>; laneProfiles: Record<string, LaneProfile>; laneContent: Map<string, string> }
const num = (minimum: number, maximum: number): Rule => ({ type: 'number', minimum, maximum });
const object = (properties: Record<string, Rule>): Rule => ({ type: 'object', required: Object.keys(properties), additionalProperties: false, properties });
const string: Rule = { type: 'string', minLength: 1 };
const systemRule = object({ planets: { ...num(1, 8), type: 'integer' }, stations: { ...num(1, 4), type: 'integer' }, debrisMultiplier: num(0, 3), encounterMultiplier: num(0, 3), encounterWeights: { type: 'object' }, hazards: { type: 'array', items: string } });
const laneRule = object({ length: num(6000, 60000), width: num(800, 2400), obstacleCount: { ...num(0, 150), type: 'integer' }, encounterCount: { ...num(0, 30), type: 'integer' },
  engine: object({ cruiseSpeed: num(400, 1600), thrust: num(300, 3000), brake: num(300, 3000), drag: num(.05, 2) }),
  enemies: { type: 'array', minItems: 1, items: object({ kind: { enum: ['rusher', 'gunner', 'brute'] }, weight: num(.01, 100) }) } });
/** Accept already-decoded documents from any caller: file, network, editor, or generator. */
export function loadGalaxy(rawGraph: unknown, rawContent: unknown): GalaxyCatalog {
  const graph = readGraph(rawGraph);
  validateContract(rawContent, object({ systems: { type: 'object' }, hyperlanes: { type: 'object' } }));
  const profiles = rawContent as { systems: Record<string, SystemProfile>; hyperlanes: Record<string, LaneProfile> };
  for (const profile of Object.values(profiles.systems)) {
    validateContract(profile, systemRule);
    if (!Object.keys(profile.encounterWeights).length) throw new Error('Empty encounter distribution');
    for (const weight of Object.values(profile.encounterWeights)) validateContract(weight, num(.01, 100));
  }
  for (const profile of Object.values(profiles.hyperlanes)) validateContract(profile, laneRule);
  const systems = new Map<string, SystemDefinition>(), laneContent = new Map<string, string>();
  for (const node of graph.nodes.values()) {
    validateContract(node.data, object({ ring: { ...num(0, 4), type: 'integer' }, angle: num(-10, 10), danger: { ...num(1, 5), type: 'integer' }, content: string }));
    const data = node.data as SystemDefinition;
    if (!profiles.systems[data.content]) throw new Error(`Unknown system profile ${data.content}`);
    const profile = profiles.systems[data.content];
    if (Object.keys(profile.encounterWeights).some(id => !SECTOR_CONTENT.encounters.some(e => e.id === id))
      || profile.hazards.some(kind => !SECTOR_CONTENT.hazards.some(h => h.kind === kind))) throw new Error(`Unknown content in ${data.content}`);
    if (profile.encounterMultiplier > 0 && !SECTOR_CONTENT.encounters.some(e => e.minDanger <= data.danger && profile.encounterWeights[e.id])) throw new Error(`No eligible encounters for ${node.id}`);
    systems.set(node.id, data);
  }
  for (const edge of graph.edges.values()) {
    validateContract(edge.data, object({ content: string }));
    const name = (edge.data as { content: string }).content;
    if (!profiles.hyperlanes[name]) throw new Error(`Unknown hyperlane profile ${name}`);
    laneContent.set(edge.id, name);
  }
  return { graph, systems, systemProfiles: profiles.systems, laneProfiles: profiles.hyperlanes, laneContent };
}
export const DEFAULT_GALAXY = loadGalaxy(document, content);
export function laneProfile(catalog: GalaxyCatalog, from: string, to: string): LaneProfile {
  const edge = connection(catalog.graph, from, to);
  if (!edge) throw new Error('No hyperlane connects these systems');
  return catalog.laneProfiles[catalog.laneContent.get(edge.id)!];
}
