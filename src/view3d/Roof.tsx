import { useMemo } from 'react'
import * as THREE from 'three'
import { Edges } from '@react-three/drei'
import type { Plan, Point, Wall } from '../model'
import type { Colors } from './palette'
import { slabOutline } from './geometry'
import type { Look } from './looks'

const M = 0.001

type RoofSettings = NonNullable<Plan['roof']>

const DEFAULTS = { height: 3000, lowerPitchDeg: 70, upperPitchDeg: 25, overhang: 300, dormers: 2 }

const centroid = (poly: Point[]): Point => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
})

const scalePoly = (poly: Point[], c: Point, k: number): Point[] =>
  poly.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }))

const v3 = (p: Point, y: number) => new THREE.Vector3(p.x * M, y * M, p.y * M)

function geometry(triangles: THREE.Vector3[][]) {
  const pos: number[] = []
  const idx: number[] = []
  for (const poly of triangles) {
    if (poly.length < 3) continue
    const base = pos.length / 3
    for (const q of poly) pos.push(q.x, q.y, q.z)
    for (let i = 1; i + 1 < poly.length; i++) idx.push(base, base + i, base + i + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function ringQuads(lower: Point[], upper: Point[], y0: number, y1: number) {
  const out: THREE.Vector3[][] = []
  for (let i = 0; i < lower.length; i++) {
    const j = (i + 1) % lower.length
    out.push([v3(lower[i], y0), v3(lower[j], y0), v3(upper[j], y1), v3(upper[i], y1)])
  }
  return out
}

function cap(poly: Point[], y: number) {
  const out: THREE.Vector3[][] = []
  for (let i = 1; i + 1 < poly.length; i++) out.push([v3(poly[0], y), v3(poly[i], y), v3(poly[i + 1], y)])
  return out
}



function obb(poly: Point[]) {
  let best = { i: 0, len: 0 }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > best.len) best = { i, len }
  }
  const a = poly[best.i]
  const b = poly[(best.i + 1) % poly.length]
  const ux = (b.x - a.x) / best.len
  const uy = (b.y - a.y) / best.len
  const nx = -uy
  const ny = ux
  const proj = poly.map((p) => ({ u: p.x * ux + p.y * uy, n: p.x * nx + p.y * ny }))
  const minU = Math.min(...proj.map((p) => p.u))
  const maxU = Math.max(...proj.map((p) => p.u))
  const minN = Math.min(...proj.map((p) => p.n))
  const maxN = Math.max(...proj.map((p) => p.n))
  const point = (u: number, n: number, y: number) => {
    const x = u * ux + n * nx
    const z = u * uy + n * ny
    return new THREE.Vector3(x * M, y * M, z * M)
  }
  return { ux, uy, nx, ny, minU, maxU, minN, maxN, len: maxU - minU, width: maxN - minN, point }
}

function gableRoof(poly: Point[], rise: number) {
  if (poly.length < 3) return { roof: [], wall: [] }
  const o = obb(poly)
  const cN = (o.minN + o.maxN) / 2
  const rA = o.point(o.minU, cN, rise)
  const rB = o.point(o.maxU, cN, rise)
  const e1a = o.point(o.minU, o.maxN, 0)
  const e1b = o.point(o.maxU, o.maxN, 0)
  const e2a = o.point(o.minU, o.minN, 0)
  const e2b = o.point(o.maxU, o.minN, 0)
  return {
    roof: [
      [e1a, e1b, rB, rA],
      [e2b, e2a, rA, rB],
    ],
    wall: [
      [e1a, e2a, rA],
      [e1b, e2b, rB],
    ],
  }
}

function shedRoof(poly: Point[], rise: number, other: Point[]) {
  if (poly.length < 3) return { roof: [], wall: [] }
  const o = obb(poly)
  const midU = (o.minU + o.maxU) / 2
  const pMax = o.point(midU, o.maxN, 0)
  const pMin = o.point(midU, o.minN, 0)
  const oc = centroid(other)
  const highMax = Math.hypot(pMax.x / M - oc.x, -pMax.z / M - oc.y) < Math.hypot(pMin.x / M - oc.x, -pMin.z / M - oc.y)
  const hi = highMax ? o.maxN : o.minN
  const lo = highMax ? o.minN : o.maxN
  const hip = Math.min(o.len * 0.25, o.width * 0.45)
  const hA = o.point(o.minU, hi, rise)
  const hB = o.point(o.maxU, hi, rise)
  const lA = o.point(o.minU + hip, lo, 0)
  const lB = o.point(o.maxU - hip, lo, 0)
  const lowMin = o.point(o.minU, lo, 0)
  const lowMax = o.point(o.maxU, lo, 0)
  return {
    roof: [
      [hA, hB, lB, lA],
      [hA, lA, lowMin],
      [hB, lowMax, lB],
    ],
    wall: [],
  }
}

function ridgeTop(poly: Point[], baseY: number, upperH: number, upperPitch: number): THREE.Vector3[][] {
  if (poly.length < 3) return []
  let best = { i: 0, len: 0 }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > best.len) best = { i, len }
  }
  const a = poly[best.i]
  const b = poly[(best.i + 1) % poly.length]
  const ux = (b.x - a.x) / best.len
  const uy = (b.y - a.y) / best.len
  const nx = -uy
  const ny = ux
  const proj = poly.map((p) => ({ u: p.x * ux + p.y * uy, n: p.x * nx + p.y * ny }))
  const minU = Math.min(...proj.map((p) => p.u))
  const maxU = Math.max(...proj.map((p) => p.u))
  const minN = Math.min(...proj.map((p) => p.n))
  const maxN = Math.max(...proj.map((p) => p.n))
  const len = maxU - minU
  const width = maxN - minN
  if (width < 1) return []
  const centerU = (minU + maxU) / 2
  const centerN = (minN + maxN) / 2
  const point = (u: number, n: number, y: number) => {
    const x = u * ux + n * nx
    const z = u * uy + n * ny
    return new THREE.Vector3(x * M, y * M, z * M)
  }
  const ridgeH = Math.min(upperH, Math.tan((upperPitch * Math.PI) / 180) * (width / 2))
  const half = Math.max(0.001, (len - width) / 2)
  const rA = point(centerU - half, centerN, baseY + ridgeH)
  const rB = point(centerU + half, centerN, baseY + ridgeH)
  const e1a = point(minU, maxN, baseY)
  const e1b = point(maxU, maxN, baseY)
  const e2a = point(minU, minN, baseY)
  const e2b = point(maxU, minN, baseY)
  return [
    [e1a, e1b, rB, rA],
    [e2b, e2a, rA, rB],
    [e1b, e2b, rB],
    [e2a, e1a, rA],
  ]
}

function Dormers({ eave, centroid: c, settings }: { eave: Point[]; centroid: Point; settings: RoofSettings }) {
  const lowerH = (settings.height ?? DEFAULTS.height) * 0.62
  const count = settings.dormers ?? DEFAULTS.dormers
  const wall: THREE.Vector3[][] = []
  const roof: THREE.Vector3[][] = []
  const windows: THREE.Vector3[][] = []
  const frames: THREE.Vector3[][] = []
  if (!count) return null

  let best = { i: 0, len: 0, score: -Infinity }
  const longest = Math.max(
    ...eave.map((p, i) => {
      const q = eave[(i + 1) % eave.length]
      return Math.hypot(q.x - p.x, q.y - p.y)
    }),
  )
  for (let i = 0; i < eave.length; i++) {
    const a = eave[i]
    const b = eave[(i + 1) % eave.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < longest * 0.8) continue
    const ux = (b.x - a.x) / len
    const uy = (b.y - a.y) / len
    let nx = -uy
    let ny = ux
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    if ((mid.x - c.x) * nx + (mid.y - c.y) * ny < 0) { nx = -nx; ny = -ny }
    const score = nx + ny
    if (score > best.score) best = { i, len, score }
  }
  const a = eave[best.i]
  const b = eave[(best.i + 1) % eave.length]
  const ux = (b.x - a.x) / best.len
  const uy = (b.y - a.y) / best.len
  let nx = -uy
  let ny = ux
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  if ((mid.x - c.x) * nx + (mid.y - c.y) * ny < 0) {
    nx = -nx
    ny = -ny
  }
  const w = 2600
  const d = 1900
  const h = Math.min(lowerH * 0.92 + 350, (settings.height ?? DEFAULTS.height) * 0.82)
  const rise = 650
  for (let k = 0; k < count; k++) {
    const t = (k + 1) / (count + 1)
    const cx = a.x + (b.x - a.x) * t
    const cy = a.y + (b.y - a.y) * t
    const fl = { x: cx + ux * (w / 2) + nx * 120, y: cy + uy * (w / 2) + ny * 120 }
    const fr = { x: cx - ux * (w / 2) + nx * 120, y: cy - uy * (w / 2) + ny * 120 }
    const bl = { x: fl.x - nx * d, y: fl.y - ny * d }
    const br = { x: fr.x - nx * d, y: fr.y - ny * d }
    // box walls: front, left, right, back
    wall.push([v3(fl, 0), v3(fr, 0), v3(fr, h), v3(fl, h)])
    wall.push([v3(fl, 0), v3(fl, h), v3(bl, h), v3(bl, 0)])
    wall.push([v3(fr, 0), v3(br, 0), v3(br, h), v3(fr, h)])
    wall.push([v3(bl, 0), v3(br, 0), v3(br, h), v3(bl, h)])
    // front gable triangle
    const rl = { x: fl.x + nx * 0, y: fl.y + ny * 0 }
    const rr = { x: fr.x + nx * 0, y: fr.y + ny * 0 }
    const ridgeFront = { x: (fl.x + fr.x) / 2, y: (fl.y + fr.y) / 2 }
    const ridgeBack = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 }
    wall.push([v3(rl, h), v3(ridgeFront, h + rise), v3(rr, h)])
    // gable roof planes
    roof.push([v3(ridgeFront, h + rise), v3(ridgeBack, h + rise), v3(bl, h), v3(fl, h)])
    roof.push([v3(ridgeBack, h + rise), v3(ridgeFront, h + rise), v3(fr, h), v3(br, h)])
    // window on the front
    const wy0 = Math.max(500, h * 0.32)
    const wy1 = Math.min(h - 250, h * 0.7)
    const ww = w * 0.52
    const wl = { x: (fl.x + fr.x) / 2 + ux * (ww / 2) + nx * 14, y: (fl.y + fr.y) / 2 + uy * (ww / 2) + ny * 14 }
    const wr = { x: (fl.x + fr.x) / 2 - ux * (ww / 2) + nx * 14, y: (fl.y + fr.y) / 2 - uy * (ww / 2) + ny * 14 }
    windows.push([v3(wl, wy0), v3(wr, wy0), v3(wr, wy1), v3(wl, wy1)])
    const fw = 90
    const fl0 = { x: wl.x + ux * fw - nx * 4, y: wl.y + uy * fw - ny * 4 }
    const fr0 = { x: wr.x - ux * fw - nx * 4, y: wr.y - uy * fw - ny * 4 }
    frames.push([v3(fl0, wy0 - fw), v3(fr0, wy0 - fw), v3(fr0, wy1 + fw), v3(fl0, wy1 + fw)])
  }
  return { wallGeom: geometry(wall), roofGeom: geometry(roof), frameGeom: geometry(frames), windowGeom: geometry(windows), edges: true }
}

export function Roof({ plan, walls = plan.walls, settings: given, look, colors }: { plan: Plan; walls?: Wall[]; settings?: Plan['roof']; look: Look; colors: Colors }) {
  const settings = given ?? plan.roof
  const data = useMemo(() => {
    if (!settings || settings.type === 'none') return null
    const overhang = settings.overhang ?? DEFAULTS.overhang
    const eave = slabOutline(walls, overhang)
    if (eave.length < 3) return null
    const c = centroid(eave)
    const height = settings.height ?? DEFAULTS.height
    if (settings.type === 'gable') {
      const g = gableRoof(eave, height)
      return { roofGeom: geometry(g.roof), wallGeom: geometry(g.wall), dormer: null, height }
    }
    if (settings.type === 'shed') {
      const others = plan.walls.filter((w) => !walls.some((x) => x.id === w.id))
      const s = shedRoof(eave, height, others.flatMap((w) => [w.a, w.b]))
      return { roofGeom: geometry(s.roof), wallGeom: geometry(s.wall), dormer: null, height }
    }
    const lowerH = height * 0.62
    const upperH = height - lowerH
    const lowerPitch = ((settings.lowerPitchDeg ?? DEFAULTS.lowerPitchDeg) * Math.PI) / 180
    const upperPitch = ((settings.upperPitchDeg ?? DEFAULTS.upperPitchDeg) * Math.PI) / 180
    const radius = eave.reduce((s, p) => s + Math.hypot(p.x - c.x, p.y - c.y), 0) / eave.length
    const run1 = lowerH / Math.tan(lowerPitch)
    const run2 = upperH / Math.tan(upperPitch)
    const k1 = Math.max(0.2, 1 - run1 / Math.max(radius, 1))
    const breakPts = scalePoly(eave, c, k1)
    const k2 = Math.max(0.05, 1 - run2 / Math.max(radius * k1, 1))
    const upperGeom = settings.type === 'mansard'
      ? ridgeTop(breakPts, lowerH, upperH, settings.upperPitchDeg ?? DEFAULTS.upperPitchDeg)
      : (() => {
          const topPts = scalePoly(breakPts, c, k2)
          return [...ringQuads(breakPts, topPts, lowerH, height), ...cap(topPts, height)]
        })()
    const roofGeom = geometry([...ringQuads(eave, breakPts, 0, lowerH), ...upperGeom])
    const dormer = settings.type === 'mansard' ? Dormers({ eave, centroid: c, settings }) : null
    return { roofGeom, wallGeom: null, dormer, height }
  }, [plan.walls, walls, settings])

  if (!data) return null
  const edgeColor = look === 'model' ? '#5f625f' : '#4c4b47'
  return (
    <group>
      <mesh geometry={data.roofGeom} castShadow receiveShadow>
        <meshStandardMaterial color={colors.roof} roughness={0.92} metalness={0.02} side={THREE.DoubleSide} />
        {look === 'model' && <Edges threshold={22} color={edgeColor} />}
      </mesh>
      {data.wallGeom && (
        <mesh geometry={data.wallGeom} castShadow receiveShadow>
          <meshStandardMaterial color={colors.walls} roughness={0.9} side={THREE.DoubleSide} />
          {look === 'model' && <Edges threshold={22} color={edgeColor} />}
        </mesh>
      )}
      {data.dormer && (
        <>
          <mesh geometry={data.dormer.wallGeom} castShadow receiveShadow>
            <meshStandardMaterial color={colors.walls} roughness={0.9} side={THREE.DoubleSide} />
            {look === 'model' && <Edges threshold={22} color={edgeColor} />}
          </mesh>
          <mesh geometry={data.dormer.roofGeom} castShadow receiveShadow>
            <meshStandardMaterial color={colors.roof} roughness={0.92} metalness={0.02} side={THREE.DoubleSide} />
            {look === 'model' && <Edges threshold={22} color={edgeColor} />}
          </mesh>
          <mesh geometry={data.dormer.frameGeom}>
            <meshStandardMaterial color="#f2eee6" roughness={0.85} side={THREE.DoubleSide} />
            {look === 'model' && <Edges threshold={22} color={edgeColor} />}
          </mesh>
          <mesh geometry={data.dormer.windowGeom}>
            <meshStandardMaterial color="#23313a" roughness={0.4} metalness={0.15} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  )
}
