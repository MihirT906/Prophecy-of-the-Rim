import schema from './sector.schema.json';
import settings from './sector.json';
export interface SectorConfig { drag: number; gravity: number; width: number; height: number; cruiseSpeed: number; thrust: number; brake: number; asteroids: number; planetCount: number; orbitSeconds: number; trailSeconds: number }
/** Validates the numeric-object vocabulary used by sector.schema.json; no silent fallback. */
export function validateSectorConfig(value: unknown): SectorConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Sector config must be an object');
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!(key in schema.properties)) throw new Error(`Unknown sector setting: ${key}`);
  for (const key of schema.required) {
    const rule = schema.properties[key as keyof typeof schema.properties], n = record[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < rule.minimum || n > rule.maximum || (rule.type === 'integer' && !Number.isInteger(n))) throw new Error(`Invalid sector setting: ${key}`);
  }
  return { ...record } as unknown as SectorConfig;
}
export const SECTOR_CONFIG = Object.freeze(validateSectorConfig(settings));
