/** Pure undirected graph. Payloads are opaque: no files, simulation, renderer, or content rules. */
export interface GraphNode<T = unknown> { id: string; label: string; data: T }
export interface GraphEdge<T = unknown> { id: string; label: string; from: string; to: string; data: T }
export interface GraphDocument<N = unknown, E = unknown> { nodes: GraphNode<N>[]; edges: GraphEdge<E>[] }
export interface Graph<N = unknown, E = unknown> {
  nodes: ReadonlyMap<string, GraphNode<N>>;
  edges: ReadonlyMap<string, GraphEdge<E>>;
  adjacency: ReadonlyMap<string, readonly string[]>;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const label = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
/** Only validate topology. A payload may be any JSON value, including unknown future formats. */
export function readGraph(value: unknown): Graph {
  if (!object(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error('Graph needs nodes and edges');
  const nodes = new Map<string, GraphNode>(), edges = new Map<string, GraphEdge>(), adjacency = new Map<string, string[]>(), pairs = new Set<string>();
  for (const node of value.nodes) {
    if (!object(node) || !label(node.id) || !label(node.label) || !('data' in node) || nodes.has(node.id)) throw new Error('Invalid or duplicate graph node');
    nodes.set(node.id, { id: node.id, label: node.label, data: node.data }); adjacency.set(node.id, []);
  }
  for (const edge of value.edges) {
    if (!object(edge) || !label(edge.id) || !label(edge.label) || !label(edge.from) || !label(edge.to) || !('data' in edge)
      || edges.has(edge.id) || !nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to) throw new Error('Invalid graph edge or endpoint');
    const pair = JSON.stringify([edge.from, edge.to].sort());
    if (pairs.has(pair)) throw new Error('Duplicate graph connection');
    pairs.add(pair); edges.set(edge.id, { id: edge.id, label: edge.label, from: edge.from, to: edge.to, data: edge.data });
    adjacency.get(edge.from)!.push(edge.to); adjacency.get(edge.to)!.push(edge.from);
  }
  return { nodes, edges, adjacency };
}
export function connection<E>(graph: Graph<unknown, E>, from: string, to: string): GraphEdge<E> | undefined {
  return [...graph.edges.values()].find(e => e.from === from && e.to === to || e.from === to && e.to === from);
}
export function shortestPath(graph: Graph, from: string, to: string, order?: (a: string, b: string) => number): string[] {
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return [];
  const queue = [[from]], seen = new Set([from]);
  for (const path of queue) {
    const id = path[path.length - 1];
    if (id === to) return path;
    const next = [...graph.adjacency.get(id)!]; if (order) next.sort(order);
    for (const neighbor of next) if (!seen.has(neighbor)) { seen.add(neighbor); queue.push([...path, neighbor]); }
  }
  return [];
}
