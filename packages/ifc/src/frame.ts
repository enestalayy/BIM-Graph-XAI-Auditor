/**
 * web-ifc emits geometry in a Y-up frame (three.js convention):
 *   (x, y, z)_webifc = (x, z, -y)_ifc
 * so the inverse mapping back to the IFC world frame (Z up) is
 *   (x, y, z)_ifc = (x, -z, y)_webifc
 */
export function toIfcFrame(x: number, y: number, z: number): [number, number, number] {
  return [x, -z, y];
}
