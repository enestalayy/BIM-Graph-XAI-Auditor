import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildElementObjects, type ElementObject } from './ifc-meshes.ts';
import { coreBoxIndices } from './robust-bounds.ts';

export interface Highlight {
  readonly subject?: string;
  readonly object?: string;
  readonly mitigation?: string;
}

export interface PickedElement {
  readonly globalId: string;
  readonly ifcClass: string;
  readonly name: string | null;
}

export interface ModelInput {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

const ROLE_COLOURS = { subject: 0xd93025, object: 0xf29900, mitigation: 0x188038 } as const;
const DIMMED_OPACITY = 0.12;

interface MaterialState {
  readonly color: THREE.Color;
  readonly opacity: number;
  readonly transparent: boolean;
}

/** Imperative three.js scene; React owns only its lifecycle (see Viewer.tsx). */
export class IfcScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 5000);
  private readonly controls: OrbitControls;
  private readonly root = new THREE.Group();
  private readonly elements = new Map<string, ElementObject>();
  private readonly original = new Map<THREE.MeshLambertMaterial, MaterialState>();
  private readonly resizeObserver: ResizeObserver;
  private readonly container: HTMLElement;
  private pickListener: ((element: PickedElement | null) => void) | undefined;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(getComputedStyle(container).getPropertyValue('--viewer-bg').trim() || '#f4f5f7');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(30, 50, 20);
    this.scene.add(sun, this.root);
    this.camera.position.set(20, 15, 20);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', () => this.render());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.renderer.domElement.addEventListener('click', this.handleClick);
    this.resize();
  }

  onPick(listener: (element: PickedElement | null) => void): void {
    this.pickListener = listener;
  }

  /** Replaces the displayed models. An element present in several models is shown once. */
  async setModels(models: readonly ModelInput[]): Promise<void> {
    this.clearModels();
    for (const model of models) {
      for (const element of await buildElementObjects(model.bytes)) {
        if (this.elements.has(element.globalId)) continue;
        this.elements.set(element.globalId, element);
        this.root.add(element.group);
        element.group.traverse((node) => {
          if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshLambertMaterial) {
            const m = node.material;
            this.original.set(m, { color: m.color.clone(), opacity: m.opacity, transparent: m.transparent });
          }
        });
      }
    }
    this.fit(this.coreElementIds());
  }

  /** Colours the involved elements by role, dims everything else and frames the selection. */
  highlight(highlight: Highlight | null): void {
    this.restoreMaterials();
    if (!highlight) {
      this.render();
      return;
    }
    const roles = Object.entries(highlight).filter(([, id]) => id) as [keyof Highlight, string][];
    const highlighted = new Map(roles.map(([role, id]) => [id, ROLE_COLOURS[role]]));
    for (const [globalId, element] of this.elements) {
      const colour = highlighted.get(globalId);
      this.forEachMaterial(element, (m) => {
        if (colour !== undefined) {
          m.color.setHex(colour);
          m.opacity = 1;
          m.transparent = false;
        } else {
          m.opacity = DIMMED_OPACITY;
          m.transparent = true;
        }
        m.needsUpdate = true;
      });
    }
    this.fit([...highlighted.keys()]);
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('click', this.handleClick);
    this.controls.dispose();
    this.clearModels();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private forEachMaterial(element: ElementObject, visit: (material: THREE.MeshLambertMaterial) => void): void {
    element.group.traverse((node) => {
      if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshLambertMaterial) visit(node.material);
    });
  }

  private restoreMaterials(): void {
    for (const [material, state] of this.original) {
      material.color.copy(state.color);
      material.opacity = state.opacity;
      material.transparent = state.transparent;
      material.needsUpdate = true;
    }
  }

  private clearModels(): void {
    for (const element of this.elements.values()) {
      element.group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          (node.material as THREE.Material).dispose();
        }
      });
      this.root.remove(element.group);
    }
    this.elements.clear();
    this.original.clear();
    this.render();
  }

  private coreElementIds(): string[] {
    const entries = [...this.elements.entries()].map(([id, element]) => ({ id, box: new THREE.Box3().setFromObject(element.group) }));
    const boxes = entries.map(({ box }) => ({ min: box.min.toArray(), max: box.max.toArray() }));
    return coreBoxIndices(boxes).map((i) => entries[i]!.id);
  }

  private fit(globalIds: readonly string[]): void {
    const box = new THREE.Box3();
    for (const id of globalIds) {
      const element = this.elements.get(id);
      if (element) box.expandByObject(element.group);
    }
    if (box.isEmpty()) {
      this.render();
      return;
    }
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const direction = new THREE.Vector3(1, 0.8, 1).normalize();
    this.camera.position.copy(centre).addScaledVector(direction, distance);
    this.controls.target.copy(centre);
    this.controls.update();
    this.render();
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const hit = raycaster.intersectObjects(this.root.children, true).find((h) => (h.object as THREE.Mesh).material);
    let node: THREE.Object3D | null = hit?.object ?? null;
    while (node && !node.userData.globalId) node = node.parent;
    const element = node ? this.elements.get(node.userData.globalId as string) : undefined;
    this.pickListener?.(element ? { globalId: element.globalId, ifcClass: element.ifcClass, name: element.name } : null);
  };
}
