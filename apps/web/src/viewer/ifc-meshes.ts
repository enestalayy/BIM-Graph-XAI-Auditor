import * as THREE from 'three';
import { IfcAPI } from 'web-ifc';

let ready: Promise<IfcAPI> | undefined;

/** Single-threaded web-ifc in the browser; the WASM file is served at /wasm/ by the Vite plugin. */
function getBrowserIfcApi(): Promise<IfcAPI> {
  ready ??= (async () => {
    const api = new IfcAPI();
    await api.Init((path) => `${import.meta.env.BASE_URL}wasm/${path}`, true);
    return api;
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

export interface ElementObject {
  readonly globalId: string;
  readonly ifcClass: string;
  readonly name: string | null;
  /** One child mesh per placed geometry, each with its own IFC colour. */
  readonly group: THREE.Group;
}

const VERTEX_STRIDE = 6; // x, y, z, nx, ny, nz

/**
 * Builds three.js objects from an IFC file with the same parser the server uses.
 * Coordinates stay in web-ifc's Y-up frame, which is three.js' native frame.
 */
export async function buildElementObjects(bytes: Uint8Array): Promise<ElementObject[]> {
  const api = await getBrowserIfcApi();
  const modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
  const objects: ElementObject[] = [];
  try {
    api.StreamAllMeshes(modelID, (flatMesh) => {
      const line = api.GetLine(modelID, flatMesh.expressID);
      const globalId = line?.GlobalId?.value;
      if (typeof globalId !== 'string') return;
      const group = new THREE.Group();
      for (let i = 0; i < flatMesh.geometries.size(); i++) {
        const placed = flatMesh.geometries.get(i);
        const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
        try {
          const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
          const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
          const count = vertices.length / VERTEX_STRIDE;
          const positions = new Float32Array(count * 3);
          const normals = new Float32Array(count * 3);
          for (let v = 0; v < count; v++) {
            positions.set(vertices.subarray(v * VERTEX_STRIDE, v * VERTEX_STRIDE + 3), v * 3);
            normals.set(vertices.subarray(v * VERTEX_STRIDE + 3, v * VERTEX_STRIDE + 6), v * 3);
          }
          const buffer = new THREE.BufferGeometry();
          buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          buffer.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
          buffer.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
          buffer.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
          const { x, y, z, w } = placed.color;
          const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(x, y, z),
            transparent: w < 1,
            opacity: w,
            side: THREE.DoubleSide,
          });
          group.add(new THREE.Mesh(buffer, material));
        } finally {
          geometry.delete();
        }
      }
      group.userData.globalId = globalId;
      objects.push({ globalId, ifcClass: api.GetNameFromTypeCode(line.type), name: line.Name?.value ?? null, group });
    });
  } finally {
    api.CloseModel(modelID);
  }
  return objects;
}
