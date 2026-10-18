import type { Plan } from './schema'

export const DEFAULT_FLOOR_HEIGHT = 3000

export const levelOf = (item: { level?: number } | undefined | null) => item?.level ?? 0

export const floorHeightOf = (plan: Plan) => plan.site.floorHeight ?? DEFAULT_FLOOR_HEIGHT

export function levelsOf(plan: Plan): number[] {
  const levels = new Set<number>()
  for (const w of plan.walls) levels.add(levelOf(w))
  for (const f of plan.furniture) levels.add(levelOf(f))
  for (const r of plan.rooms ?? []) levels.add(levelOf(r))
  return [...levels].sort((a, b) => a - b)
}

export function filterPlanByLevel(plan: Plan, level: number): Plan {
  const walls = plan.walls.filter((w) => levelOf(w) === level)
  const wallIds = new Set(walls.map((w) => w.id))
  const zones = plan.site.zones?.filter((z) => z.level === undefined || z.level === level)
  const levelPlan: Plan = {
    ...plan,
    site: zones ? { ...plan.site, zones } : plan.site,
    walls,
    openings: plan.openings.filter((o) => wallIds.has(o.wallId)),
    furniture: plan.furniture.filter((f) => levelOf(f) === level),
    rooms: plan.rooms?.filter((r) => levelOf(r) === level),
  }
  if (plan.networks) {
    const sewer = plan.networks.sewer
    const water = plan.networks.water
    const electric = plan.networks.electric
    const heating = plan.networks.heating
    const filterNet = <N extends { id: string; level?: number }, P extends { from: string; to: string }>(net: { nodes: N[]; pipes: P[] }) => {
      const nodeLevel = new Map(net.nodes.map((n) => [n.id, levelOf(n)]))
      const pipeLevel = (p: P) => Math.max(nodeLevel.get(p.from) ?? 0, nodeLevel.get(p.to) ?? 0)
      const pipes = net.pipes.filter((p) => pipeLevel(p) === level)
      const ids = new Set(net.nodes.filter((n) => levelOf(n) === level).map((n) => n.id))
      for (const p of pipes) { ids.add(p.from); ids.add(p.to) }
      return { ...net, nodes: net.nodes.filter((n) => ids.has(n.id)), pipes }
    }
    levelPlan.networks = {
      ...plan.networks,
      sewer: sewer ? filterNet(sewer) : sewer,
      water: water ? filterNet(water) : water,
      electric: electric
        ? {
            ...electric,
            panel: electric.panel && levelOf(electric.panel) === level ? electric.panel : undefined,
            points: electric.points.filter((p) => levelOf(p) === level),
            routes: electric.routes?.filter((r) => levelOf(r) === level),
          }
        : undefined,
      heating: heating
        ? {
            ...heating,
            collector: heating.collector && levelOf(heating.collector) === level ? heating.collector : undefined,
            loops: heating.loops.filter((l) => levelOf(l) === level),
          }
        : undefined,
    }
  }
  return levelPlan
}
