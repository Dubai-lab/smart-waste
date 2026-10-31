/**
 * Capacitated Vehicle Routing Problem solver.
 * Node 0 is the depot. Every customer has a demand (bins). Each vehicle has a capacity.
 * 1. Clarke–Wright savings (parallel version) builds routes.
 * 2. Each route is improved with 2-opt and Or-opt until no improving move is left.
 * The cost matrix may be asymmetric (one-way streets), so moves are evaluated on full route cost.
 */
export interface VrpInput {
  cost: number[][];      // cost[i][j], usually road distance in metres
  demand: number[];      // demand[0] = 0 for the depot
  capacity: number;      // per vehicle
  vehicles: number;      // max number of routes
  customers: number[];   // node indexes to serve (subset of 1..n-1)
}

export interface VrpResult {
  routes: number[][];    // customer sequences (without depot)
  unassigned: number[];  // customers that did not fit in the fleet's capacity
  cost: number;
}

export function routeCost(route: number[], cost: number[][]): number {
  let c = 0;
  let prev = 0;
  for (const n of route) {
    c += cost[prev]![n]!;
    prev = n;
  }
  return c + (route.length ? cost[prev]![0]! : 0);
}

export function solveVrp(input: VrpInput): VrpResult {
  const { cost, demand, capacity, vehicles } = input;
  const customers = input.customers.filter((c) => demand[c]! <= capacity);
  const unassigned = input.customers.filter((c) => demand[c]! > capacity);

  // 1. Clarke–Wright savings
  type R = { nodes: number[]; load: number };
  const routeOf = new Map<number, R>();
  for (const c of customers) routeOf.set(c, { nodes: [c], load: demand[c]! });

  const savings: { i: number; j: number; s: number }[] = [];
  for (const i of customers)
    for (const j of customers)
      if (i !== j) savings.push({ i, j, s: cost[i]![0]! + cost[0]![j]! - cost[i]![j]! });
  savings.sort((a, b) => b.s - a.s);

  for (const { i, j, s } of savings) {
    if (s <= 0) break;
    const ri = routeOf.get(i)!;
    const rj = routeOf.get(j)!;
    if (ri === rj) continue;
    // i must end its route and j must start its route
    if (ri.nodes[ri.nodes.length - 1] !== i || rj.nodes[0] !== j) continue;
    if (ri.load + rj.load > capacity) continue;
    ri.nodes.push(...rj.nodes);
    ri.load += rj.load;
    for (const n of rj.nodes) routeOf.set(n, ri);
  }

  let routes = [...new Set(routeOf.values())];

  // Too many routes for the fleet: merge the cheapest-to-merge pairs that still fit
  while (routes.length > vehicles) {
    let best: { a: number; b: number; delta: number } | null = null;
    for (let a = 0; a < routes.length; a++)
      for (let b = 0; b < routes.length; b++) {
        if (a === b || routes[a]!.load + routes[b]!.load > capacity) continue;
        const merged = [...routes[a]!.nodes, ...routes[b]!.nodes];
        const delta = routeCost(merged, cost) - routeCost(routes[a]!.nodes, cost) - routeCost(routes[b]!.nodes, cost);
        if (!best || delta < best.delta) best = { a, b, delta };
      }
    if (!best) {
      // fleet capacity exhausted: drop the smallest route's customers as unassigned
      routes.sort((x, y) => y.load - x.load);
      unassigned.push(...routes.pop()!.nodes);
      continue;
    }
    const merged = { nodes: [...routes[best.a]!.nodes, ...routes[best.b]!.nodes], load: routes[best.a]!.load + routes[best.b]!.load };
    routes = routes.filter((_, k) => k !== best!.a && k !== best!.b);
    routes.push(merged);
  }

  // 2. Local search on each route
  const improved = routes.map((r) => improveRoute(r.nodes, cost));
  return { routes: improved, unassigned, cost: improved.reduce((s, r) => s + routeCost(r, cost), 0) };
}

export function improveRoute(route: number[], cost: number[][]): number[] {
  let best = [...route];
  let bestCost = routeCost(best, cost);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    // 2-opt: reverse a segment
    for (let i = 0; i < best.length - 1 && !improved; i++)
      for (let k = i + 1; k < best.length && !improved; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const c = routeCost(cand, cost);
        if (c < bestCost - 1e-6) { best = cand; bestCost = c; improved = true; }
      }
    // Or-opt: move a segment of 1–3 stops elsewhere
    for (let len = 1; len <= 3 && !improved; len++)
      for (let i = 0; i + len <= best.length && !improved; i++) {
        const seg = best.slice(i, i + len);
        const rest = [...best.slice(0, i), ...best.slice(i + len)];
        for (let p = 0; p <= rest.length && !improved; p++) {
          if (p === i) continue;
          const cand = [...rest.slice(0, p), ...seg, ...rest.slice(p)];
          const c = routeCost(cand, cost);
          if (c < bestCost - 1e-6) { best = cand; bestCost = c; improved = true; }
        }
      }
  }
  return best;
}

/** The "habit" route used as baseline: visit every customer, always going to the nearest unvisited one. */
export function nearestNeighbourTour(customers: number[], cost: number[][], demand: number[], capacity: number): number[][] {
  const left = new Set(customers);
  const tours: number[][] = [];
  while (left.size) {
    const tour: number[] = [];
    let load = 0;
    let at = 0;
    while (left.size) {
      let next = -1;
      for (const c of left) if (load + demand[c]! <= capacity && (next < 0 || cost[at]![c]! < cost[at]![next]!)) next = c;
      if (next < 0) break;
      tour.push(next);
      load += demand[next]!;
      left.delete(next);
      at = next;
    }
    if (!tour.length) break;
    tours.push(tour);
  }
  return tours;
}

/** Cheapest place to insert an urgent stop into the not-yet-visited part of a route. */
export function cheapestInsertion(route: number[], node: number, cost: number[][], fromIndex: number): number {
  let bestPos = route.length;
  let bestDelta = Infinity;
  for (let p = fromIndex; p <= route.length; p++) {
    const prev = p === 0 ? 0 : route[p - 1]!;
    const next = p === route.length ? 0 : route[p]!;
    const delta = cost[prev]![node]! + cost[node]![next]! - cost[prev]![next]!;
    if (delta < bestDelta) { bestDelta = delta; bestPos = p; }
  }
  return bestPos;
}
