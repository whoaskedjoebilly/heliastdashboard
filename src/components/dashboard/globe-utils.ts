// Orthographic projection: turns a lat/lng into an x/y point on a globe of
// radius R, viewed with the sphere centered on longitude lambda0 and tilted
// by phi0 degrees. Returns depth (z) so points on the far side can be hidden
// or faded — this is what makes pins slide around the sphere convincingly.
export const DEG2RAD = Math.PI / 180;

export const GLOBE_R = 95;
export const GLOBE_CENTER = 130;
export const GLOBE_PHI0 = 16;
export const GLOBE_LAMBDA0_START = -97;

export interface GlobePoint {
  x: number;
  y: number;
  z: number;
}

export function projectToGlobe(lat: number, lng: number, lambda0: number, phi0: number, R: number): GlobePoint {
  const phi = lat * DEG2RAD;
  const lambda = (lng - lambda0) * DEG2RAD;
  const phi0r = phi0 * DEG2RAD;
  const z = Math.sin(phi0r) * Math.sin(phi) + Math.cos(phi0r) * Math.cos(phi) * Math.cos(lambda);
  const x = R * Math.cos(phi) * Math.sin(lambda);
  const y = -R * (Math.cos(phi0r) * Math.sin(phi) - Math.sin(phi0r) * Math.cos(phi) * Math.cos(lambda));
  return { x, y, z };
}

// Builds the decorative lat/long wireframe once (it doesn't need to rotate
// for the illusion to read as a globe — the visitor dots do that work).
export function buildGraticule(lambda0: number, phi0: number, R: number): string[] {
  const paths: string[] = [];
  for (let lonOffset = 0; lonOffset < 360; lonOffset += 30) {
    const lng = lonOffset - 180;
    let d = "";
    let drawing = false;
    for (let lat = -90; lat <= 90; lat += 6) {
      const p = projectToGlobe(lat, lng, lambda0, phi0, R);
      if (p.z > -0.02) {
        d += (drawing ? "L" : "M") + p.x.toFixed(2) + "," + p.y.toFixed(2) + " ";
        drawing = true;
      } else {
        drawing = false;
      }
    }
    if (d.trim()) paths.push(d.trim());
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    let d = "";
    let drawing = false;
    for (let lng = -180; lng <= 180; lng += 6) {
      const p = projectToGlobe(lat, lng, lambda0, phi0, R);
      if (p.z > -0.02) {
        d += (drawing ? "L" : "M") + p.x.toFixed(2) + "," + p.y.toFixed(2) + " ";
        drawing = true;
      } else {
        drawing = false;
      }
    }
    if (d.trim()) paths.push(d.trim());
  }
  return paths;
}

export function sweepWedgePath(R: number, halfAngleDeg: number): string {
  const a1 = -halfAngleDeg * DEG2RAD;
  const a2 = halfAngleDeg * DEG2RAD;
  const x1 = R * Math.cos(a1);
  const y1 = R * Math.sin(a1);
  const x2 = R * Math.cos(a2);
  const y2 = R * Math.sin(a2);
  return `M0,0 L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 0,1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
}
