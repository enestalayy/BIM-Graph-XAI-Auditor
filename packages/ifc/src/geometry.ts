import type { IfcAPI } from 'web-ifc';
import type { Aabb } from '@bim/core';
import { toIfcFrame } from './frame.ts';

const VERTEX_STRIDE = 6; // x, y, z, nx, ny, nz

/**
 * Computes a world-space AABB (metres, IFC Z-up frame) per element from its
 * tessellated body geometry. web-ifc applies the model's length unit scale.
 */
export function computeAabbs(api: IfcAPI, modelID: number): Map<number, Aabb> {
  const boxes = new Map<number, Aabb>();
  api.StreamAllMeshes(modelID, (mesh) => {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let g = 0; g < mesh.geometries.size(); g++) {
      const placed = mesh.geometries.get(g);
      const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
      try {
        const v = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const m = placed.flatTransformation; // column-major 4x4
        for (let i = 0; i < v.length; i += VERTEX_STRIDE) {
          const x = v[i]!, y = v[i + 1]!, z = v[i + 2]!;
          const [wx, wy, wz] = toIfcFrame(
            m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
            m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
            m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
          );
          if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
          if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
          if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
        }
      } finally {
        geometry.delete();
      }
    }
    if (minX <= maxX) boxes.set(mesh.expressID, { minX, minY, minZ, maxX, maxY, maxZ });
  });
  return boxes;
}
