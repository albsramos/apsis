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
 * A dotted globe, shaded the way GitHub's is: a deep indigo sphere that falls off smoothly into shadow away
 * from the sun, with no terminator line and no imagery laid over it. Land is a grid of dots, spaced evenly
 * on the sphere (each row of latitude has as many dots as fit around it). Each dot looks up how much human
 * activity sits under it and lights up by that much, most visibly in the shadow.
 */
export const earthFrag = /* glsl */ `
uniform sampler2D landMap;
uniform sampler2D activityMap;
uniform vec3 sunDir;
uniform vec3 uOcean;
uniform vec3 uShade;
uniform vec3 uLand;
uniform vec3 uActive;
uniform vec3 uAtmos;
uniform float uSaa;
uniform vec2 uSaaCenter;
uniform vec2 uSaaRadius;
uniform vec3 uSaaColor;
uniform float uTime;
uniform float uStep;
uniform float uLod;
uniform float uDim;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;

// Dot grid at one spacing: 1 inside a land dot, 0 elsewhere. r is the distance to the cell's centre and
// act the activity under it, read once at the centre so a dot is one flat tone.
float dots(float lat, float lon, float sp, out float r, out float act) {
  float row = floor((lat + 90.0) / sp);
  float latc = -90.0 + (row + 0.5) * sp;
  float cols = max(1.0, floor(360.0 * cos(radians(latc)) / sp));
  float col = floor((lon + 180.0) / 360.0 * cols);
  float lonc = -180.0 + (col + 0.5) / cols * 360.0;
  vec2 cuv = vec2((lonc + 180.0) / 360.0, (latc + 90.0) / 180.0);
  float land = texture2D(landMap, cuv).r;
  act = texture2D(activityMap, cuv).r;
  vec2 q = vec2((lon - lonc) * cos(radians(lat)), lat - latc);
  r = length(q);
  float aa = fwidth(r) * 1.2;
  return (1.0 - smoothstep(sp * 0.26 - aa, sp * 0.26 + aa, r)) * step(0.5, land);
}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  // Light: a wide, soft falloff from the sunward side into shadow. It reaches a little past the terminator,
  // so the sphere darkens gradually instead of being cut in two.
  float lit = pow(smoothstep(-0.3, 1.0, dot(n, sunDir)), 1.4);

  float lon = vUv.x * 360.0 - 180.0;
  float lat = vUv.y * 180.0 - 90.0;

  // Level of detail: closer in, the grid halves its spacing (cross-fading between levels) and the dots dim,
  // so the globe stays texture, not a distraction, behind a focused cluster.
  float k = floor(uLod);
  float s0 = uStep / exp2(k);
  float r, r1, a0, a1;
  float m0 = dots(lat, lon, s0, r, a0);
  float m1 = dots(lat, lon, s0 * 0.5, r1, a1);
  float f = fract(uLod);
  float dotMask = mix(m0, m1, f);
  float act = mix(a0, a1, f);

  float aa = fwidth(r) * 1.2;

  // The sphere itself: indigo in the light, sinking to near-black navy in the shadow.
  vec3 sea = mix(uShade, uOcean, lit);

  // Land dots take the same light, staying a faint outline in the shadow. Where there is activity the dot
  // itself lights up: a little in daylight, more in the dark, where it is the only thing to see.
  vec3 dotCol = mix(uShade, uLand, 0.16 + 0.84 * lit);
  float glow = smoothstep(0.04, 1.0, act) * (1.0 - 0.6 * lit);
  dotCol = mix(dotCol, uActive, glow * 0.8);
  vec3 col3 = mix(sea, mix(sea, dotCol, uDim), dotMask);

  // Limb: a soft rim of light on the sunward edge, gone in the shadow
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  col3 += uAtmos * fres * (0.01 + 0.3 * lit);

  // South Atlantic Anomaly (Faults lens): a soft outlined zone, dots inside tinted
  if (uSaa > 0.001) {
    vec2 s = vec2((lon - uSaaCenter.x) * cos(radians(lat)) / uSaaRadius.x, (lat - uSaaCenter.y) / uSaaRadius.y);
    float sr = length(s);
    float inside = 1.0 - smoothstep(0.74, 0.8, sr);
    float ring = 1.0 - smoothstep(0.0, 0.03, abs(sr - 0.8));
    // the zone gets its own dot grid, over ocean and land alike
    float zoneDots = 1.0 - smoothstep(s0 * 0.22 - aa, s0 * 0.22 + aa, r);
    float pulse = 0.75 + 0.25 * sin(uTime * 1.6);
    col3 = mix(col3, uSaaColor, (inside * zoneDots * 0.55 * pulse + ring * 0.7) * uSaa);
  }

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
  // The halo sits on the sunward limb and fades out round the shadow side, like the sphere's own light.
  float sun = smoothstep(-0.5, 0.7, dot(n, sunDir));
  vec3 col = uColor * pow(k, 2.6) * (0.02 + 0.42 * sun);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`
