import type { Orbit } from './types'

/**
 * Orbital mechanics, kept small: circular Keplerian orbits, a fixed Sun, a rotating Earth.
 *
 * Frames: ECI has z pointing north. The scene (three.js) is y-up, so scene = (x, z, -y) of ECI.
 * The Sun sits on +x in both. One scene unit is one Earth radius. Altitudes are drawn ×ALT_EXAG so the
 * orbits read at a glance; eclipse and ground tracks use the true altitude.
 */

export const R_E = 6371
export const MU = 398600.4418
export const OMEGA_E = (2 * Math.PI) / 86164
export const ALT_EXAG = 3
/** Earth's rotation at sim time 0, chosen so the Americas face the default camera. */
export const THETA0 = 2.2
export const SUN: Vec3 = [1, 0, 0]

export type Vec3 = [number, number, number]

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export const meanMotion = (o: Orbit) => {
  const a = R_E + o.altKm
  return Math.sqrt(MU / (a * a * a))
}
export const periodS = (o: Orbit) => (2 * Math.PI) / meanMotion(o)
export const velocityKms = (o: Orbit) => Math.sqrt(MU / (R_E + o.altKm))
export const visualRadius = (o: Orbit) => 1 + (o.altKm / R_E) * ALT_EXAG
export const earthRotation = (t: number) => THETA0 + OMEGA_E * t

interface Frame {
  /** Unit position (zenith), velocity direction (along-track) and orbit normal, all in scene axes */
  zenith: Vec3
  along: Vec3
  normal: Vec3
}

/** Unit vectors of the orbit at time t, in scene axes. */
export function orbitFrame(o: Orbit, t: number): Frame {
  const u = rad(o.phaseDeg) + meanMotion(o) * t
  const W = rad(o.raanDeg)
  const i = rad(o.incDeg)
  const cu = Math.cos(u), su = Math.sin(u), cW = Math.cos(W), sW = Math.sin(W), ci = Math.cos(i), si = Math.sin(i)
  // ECI
  const px = cW * cu - sW * su * ci, py = sW * cu + cW * su * ci, pz = su * si
  const vx = -cW * su - sW * cu * ci, vy = -sW * su + cW * cu * ci, vz = cu * si
  const zenith: Vec3 = [px, pz, -py]
  const along: Vec3 = [vx, vz, -vy]
  return { zenith, along, normal: cross(along, zenith) }
}

/** Position in scene units (exaggerated altitude). */
export function scenePosition(o: Orbit, t: number): Vec3 {
  const { zenith } = orbitFrame(o, t)
  const r = visualRadius(o)
  return [zenith[0] * r, zenith[1] * r, zenith[2] * r]
}

/** In Earth's cylindrical shadow, using the true altitude. */
export function isEclipsed(o: Orbit, t: number): boolean {
  const { zenith } = orbitFrame(o, t)
  const r = (R_E + o.altKm) / R_E
  const x = zenith[0] * r
  if (x >= 0) return false
  const y = zenith[1] * r, z = zenith[2] * r
  return y * y + z * z < 1
}

/** A scene-axes unit vector rotated into Earth's body frame (undo the Earth's spin). */
export function toEarthFrame(v: Vec3, t: number): Vec3 {
  const th = earthRotation(t)
  const c = Math.cos(th), s = Math.sin(th)
  return [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c]
}

/** Latitude/longitude of a point in Earth's body frame, matching three's SphereGeometry UVs. */
export function latLon(local: Vec3): { lat: number; lon: number } {
  const lat = deg(Math.asin(Math.max(-1, Math.min(1, local[1]))))
  let lon = deg(Math.atan2(local[2], -local[0])) - 180
  if (lon < -180) lon += 360
  return { lat, lon }
}

export function localFromLatLon(lat: number, lon: number): Vec3 {
  const phi = rad(lon + 180)
  const cl = Math.cos(rad(lat))
  return [-Math.cos(phi) * cl, Math.sin(rad(lat)), Math.sin(phi) * cl]
}

export function subSatellite(o: Orbit, t: number) {
  return latLon(toEarthFrame(orbitFrame(o, t).zenith, t))
}

/** The South Atlantic Anomaly, as an ellipse in lat/lon. The Earth shader draws the same shape. */
export const SAA = { lat: -26, lon: -50, rLon: 32, rLat: 20 }
export function inSaa(lat: number, lon: number) {
  const dx = ((lon - SAA.lon) * Math.cos(rad(lat))) / SAA.rLon
  const dy = (lat - SAA.lat) / SAA.rLat
  return dx * dx + dy * dy < 0.64
}

/** Angle between the orbit plane and the Sun. Above ~65° (LEO) a cluster never enters shadow. */
export function betaDeg(o: Orbit) {
  const W = rad(o.raanDeg), i = rad(o.incDeg)
  const n: Vec3 = [Math.sin(W) * Math.sin(i), -Math.cos(W) * Math.sin(i), Math.cos(i)]
  return deg(Math.asin(n[0] * SUN[0]))
}

/**
 * How a cluster flies. Its wings and radiators turn about one axis, their booms, so the booms must lie across
 * the sunlight for the wings to face it.
 *
 * - crosswise: booms along the orbit normal. Right when the Sun is near the orbit plane (low beta); the wings
 *   turn once an orbit.
 * - tower: booms on the local vertical, the cluster rolled a quarter turn about its truss. Right when the Sun
 *   is near the orbit normal (dawn-dusk orbits), where crosswise wings could only ever be edge-on to it.
 */
export type Attitude = 'crosswise' | 'tower'
export const attitude = (o: Orbit): Attitude => (Math.abs(betaDeg(o)) >= 45 ? 'tower' : 'crosswise')

/**
 * The cluster's body axes in scene axes: x along the truss (along-track), z along the booms, y the axis the
 * compute modules stand on. In a tower, +y is the orbit's angular momentum, so the Sun is on the +y side
 * when beta is positive.
 */
export function bodyFrame(o: Orbit, t: number): { x: Vec3; y: Vec3; z: Vec3 } {
  const { along, zenith, normal } = orbitFrame(o, t)
  return attitude(o) === 'tower' ? { x: along, y: cross(zenith, along), z: zenith } : { x: along, y: zenith, z: normal }
}

/** Sun direction about the booms, as an angle from the truss: what the sun-tracking wing drives point at. */
export function sunAngleDeg(o: Orbit, t: number) {
  const { x, y } = bodyFrame(o, t)
  return deg(Math.atan2(dot(SUN, y), dot(SUN, x)))
}

/** Share of sunlight a perfectly tracking wing still misses, because the Sun is not square to the booms. */
export function pointingLoss(o: Orbit, t: number) {
  const s = dot(SUN, bodyFrame(o, t).z)
  return 1 - Math.sqrt(Math.max(0, 1 - s * s))
}

/** Footprint half-angle (deg) for a ground station seeing the cluster above `minElev`. */
export function footprintDeg(o: Orbit, minElevDeg = 10) {
  const e = rad(minElevDeg)
  return deg(Math.acos((R_E / (R_E + o.altKm)) * Math.cos(e)) - e)
}

export function centralAngleDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const p1 = rad(a.lat), p2 = rad(b.lat), dl = rad(b.lon - a.lon)
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)
  return deg(Math.acos(Math.max(-1, Math.min(1, c))))
}

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
