import data from './sector-content.json';
import schema from './sector-content.schema.json';
import { validateContract } from './json-contract';
validateContract(data, schema);
for (const encounter of data.encounters) {
  if (!Number.isInteger(encounter.countMin) || !Number.isInteger(encounter.countMax) || encounter.countMax < encounter.countMin) throw new Error(`Invalid encounter count: ${encounter.id}`);
}
export const SECTOR_CONTENT = data;
