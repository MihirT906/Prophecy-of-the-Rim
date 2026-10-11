/** Small validator for the explicitly supported JSON Schema vocabulary in our data contracts. */
export interface Rule { type?: string; enum?: unknown[]; required?: string[]; properties?: Record<string, Rule>; additionalProperties?: boolean; items?: Rule; minItems?: number; minLength?: number; minimum?: number; maximum?: number }
export function validateContract(value: unknown, rule: Rule, path = 'data'): void {
  const fail = () => { throw new Error(`Invalid ${path}`); };
  if (rule.enum && !rule.enum.includes(value)) fail();
  if (rule.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    const record = value as Record<string, unknown>;
    for (const k of rule.required ?? []) if (!(k in record)) fail();
    for (const [k, v] of Object.entries(record)) {
      if (rule.properties?.[k]) validateContract(v, rule.properties[k], `${path}.${k}`);
      else if (rule.additionalProperties === false) fail();
    }
  } else if (rule.type === 'array') {
    if (!Array.isArray(value) || value.length < (rule.minItems ?? 0)) return fail();
    if (rule.items) value.forEach((v, i) => validateContract(v, rule.items!, `${path}[${i}]`));
  } else if (rule.type === 'string') {
    if (typeof value !== 'string' || value.length < (rule.minLength ?? 0)) fail();
  } else if (rule.type === 'number' || rule.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < (rule.minimum ?? -Infinity) || value > (rule.maximum ?? Infinity) || (rule.type === 'integer' && !Number.isInteger(value))) fail();
  }
}
