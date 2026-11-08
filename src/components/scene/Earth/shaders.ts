export const earthVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

/**
 * A dotted globe: land is drawn as a grid of dots, spaced evenly on the sphere (each row of latitude has
 * as many dots as fit around it). The ocean is near-black. Day and night are only a gentle change in
 * brightness, so the globe stays a quiet backdrop for the orbits.
 */
export const earthFrag = /* glsl */ `
uniform sampler2D landMap;
uniform sampler2D cityMap;
uniform vec3 uCity;
uniform vec3 sunDir;
uniform vec3 uOcean;
uniform vec3 uLand;
uniform vec3 uAtmos;
uniform float uStep;
uniform float uLod;
uniform float uDim;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;

// Dot grid at one spacing: 1 inside a land dot, 0 elsewhere. r is the distance to the cell's centre.
float dots(float lat, float lon, float sp, out float r) {
  float row = floor((lat + 90.0) / sp);
  float latc = -90.0 + (row + 0.5) * sp;
  float cols = max(1.0, floor(360.0 * cos(radians(latc)) / sp));
  float col = floor((lon + 180.0) / 360.0 * cols);
  float lonc = -180.0 + (col + 0.5) / cols * 360.0;
  vec2 cuv = vec2((lonc + 180.0) / 360.0, (latc + 90.0) / 180.0);
  float land = texture2D(landMap, cuv).r;
  vec2 q = vec2((lon - lonc) * cos(radians(lat)), lat - latc);
  r = length(q);
  float aa = fwidth(r) * 1.2;
  return (1.0 - smoothstep(sp * 0.26 - aa, sp * 0.26 + aa, r)) * step(0.5, land);
}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  float d = dot(n, sunDir);
  float day = smoothstep(-0.12, 0.22, d);

  float lon = vUv.x * 360.0 - 180.0;
  float lat = vUv.y * 180.0 - 90.0;

  // Level of detail: closer in, the grid halves its spacing (cross-fading between levels) and the dots dim,
  // so the globe stays texture, not a distraction, behind a focused cluster.
  float k = floor(uLod);
  float s0 = uStep / exp2(k);
  float r, r1;
  float m0 = dots(lat, lon, s0, r);
  float m1 = dots(lat, lon, s0 * 0.5, r1);
  float f = fract(uLod);
  float dotMask = mix(m0, m1, f);

  float aa = fwidth(r) * 1.2;

  // Day and night: the night side drops nearly to black, with the land dots only a faint outline.
  vec3 col3 = uOcean * (0.15 + 0.85 * day);
  vec3 dayDot = uLand * (0.3 + 0.7 * day) * uDim;
  vec3 nightDot = uLand * 0.045 * uDim;
  col3 = mix(col3, mix(nightDot, dayDot, day), dotMask);

  // City lights, drawn from the real night-lights map at full resolution (not on the dot grid): sharp,
  // warm cores in the densest cities fading to dim sprawl, plus a soft halo (the map's blurred channel).
  vec2 lights = texture2D(cityMap, vUv).rg;
  float night = 1.0 - smoothstep(0.0, 0.3, day);
  float core = pow(lights.r, 1.7) * 2.6;
  float halo = pow(lights.g, 1.4) * 0.28;
  col3 += uCity * (core + halo) * night;

  // Limb: a thin blue rim, like a lit atmosphere edge
  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col3 += uAtmos * fres * (0.015 + 0.17 * day);

  // South Atlantic Anomaly (Faults lens): a soft outlined zone, dots inside tinted

  gl_FragColor = vec4(col3, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export const atmosphereVert = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

export const atmosphereFrag = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 uColor;
uniform float uShell;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  // How close does the view ray pass to the Earth's centre? Glow only in the thin band just outside the
  // limb (1 < b < shell), strongest at the limb, so it never shows through the globe.
  vec3 dir = normalize(vPosW - cameraPosition);
  float b = length(cross(cameraPosition, dir));
  if (b < 1.0) discard;
  float k = 1.0 - clamp((b - 1.0) / (uShell - 1.0), 0.0, 1.0);
  vec3 n = normalize(vNormalW);
  float sun = smoothstep(-0.4, 0.6, dot(n, sunDir));
  vec3 col = uColor * pow(k, 3.0) * (0.08 + 0.24 * sun);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`
