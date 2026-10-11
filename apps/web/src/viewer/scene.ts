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

const ROLE_COLOURS = { subject: 0xd93025, object: 0x1a56db, mitigation: 0x188038 } as const;
/** Everything not involved is drawn as a faint, uniform grey ghost so only the involved elements carry colour. */
const GHOST_COLOUR = 0xc4c9cf;
const GHOST_OPACITY = 0.06;
/**
 * Draw order: ghosts first (they write no depth), then the involved elements over them, the
 * subject last and without depth test (x-ray) so it stays visible inside an opaque wall.
 * Involved elements are flagged transparent (at full opacity) only so they join the sorted
 * transparent pass after the ghosts; otherwise the ghosts in front would wash them out.
 */
const INVOLVED_RENDER_ORDER = 500;
const SUBJECT_RENDER_ORDER = 1000;
/** Smallest framing radius (m) around a focused element, so its surroundings stay in view. */
const FOCUS_MIN_RADIUS = 1.2;
/** Edge outlines of highlighted elements are drawn on top of everything so their shape stays readable. */
const OUTLINE_RENDER_ORDER = 999;

interface MaterialState {
  readonly color: THREE.Color;
  readonly opacity: number;
  readonly transparent: boolean;
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      (node.material as THREE.Material).dispose();
    }
  });
}

/** Imperative three.js scene; React owns only its lifecycle (see Viewer.tsx). */
export class IfcScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 5000);
  private readonly controls: OrbitControls;
  private readonly root = new THREE.Group();
  private readonly outlines = new THREE.Group();
  private readonly elements = new Map<string, ElementObject>();
  private readonly original = new Map<THREE.MeshLambertMaterial, MaterialState>();
  private readonly resizeObserver: ResizeObserver;
  private readonly container: HTMLElement;
  private pickListener: ((element: PickedElement | null) => void) | undefined;
  /** Incremented per setModels call; a load that is no longer the latest stops adding elements. */
  private loadVersion = 0;
  private currentHighlight: Highlight | null = null;
  /** When on, the subject is drawn through other geometry; when off, real depth shows where it enters a wall. */
  private xray = true;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(getComputedStyle(container).getPropertyValue('--viewer-bg').trim() || '#f4f5f7');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(30, 50, 20);
    this.scene.add(sun, this.root, this.outlines);
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

  /**
   * Replaces the displayed models. An element present in several models is shown once.
   * Resolves to false when a newer call superseded this one before it finished.
   */
  async setModels(models: readonly ModelInput[]): Promise<boolean> {
    const version = ++this.loadVersion;
    this.clearModels();
    for (const model of models) {
      const objects = await buildElementObjects(model.bytes);
      if (version !== this.loadVersion) {
        for (const element of objects) disposeGroup(element.group);
        return false;
      }
      for (const element of objects) {
        if (this.elements.has(element.globalId)) {
          disposeGroup(element.group);
          continue;
        }
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
    return true;
  }

  /** Colours the involved elements by role, dims everything else and frames the selection. */
  setXray(on: boolean): void {
    this.xray = on;
    this.applyHighlight(this.currentHighlight, false);
  }

  highlight(highlight: Highlight | null): void {
    this.currentHighlight = highlight;
    this.applyHighlight(highlight, true);
  }

  private applyHighlight(highlight: Highlight | null, frame: boolean): void {
    this.restoreMaterials();
    if (!highlight) {
      this.render();
      return;
    }
    const roles = Object.entries(highlight).filter(([, id]) => id) as [keyof Highlight, string][];
    const highlighted = new Map(roles.map(([role, id]) => [id, role]));
    for (const [globalId, element] of this.elements) {
      const role = highlighted.get(globalId);
      if (role !== undefined) this.addOutline(element, ROLE_COLOURS[role]);
      if (role !== undefined) this.setRenderOrder(element, role === 'subject' ? SUBJECT_RENDER_ORDER : INVOLVED_RENDER_ORDER);
      this.forEachMaterial(element, (m) => {
        if (role !== undefined) {
          m.color.setHex(ROLE_COLOURS[role]);
          m.opacity = 1;
          m.transparent = true;
          m.depthWrite = true;
          m.depthTest = !(role === 'subject' && this.xray);
        } else {
          m.color.setHex(GHOST_COLOUR);
          m.opacity = GHOST_OPACITY;
          m.transparent = true;
          m.depthWrite = false;
        }
        m.needsUpdate = true;
      });
    }
    // Frame the subject (usually the small pipe or duct) with some context; the user can zoom out.
    if (frame) this.fit(highlight.subject ? [highlight.subject] : [...highlighted.keys()], FOCUS_MIN_RADIUS);
    else this.render();
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

  private addOutline(element: ElementObject, colour: number): void {
    const material = new THREE.LineBasicMaterial({ color: colour, depthTest: false, transparent: true, opacity: 0.95 });
    element.group.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(node.geometry, 25), material);
      edges.renderOrder = OUTLINE_RENDER_ORDER;
      this.outlines.add(edges);
    });
  }

  private clearOutlines(): void {
    for (const child of [...this.outlines.children]) {
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
      this.outlines.remove(child);
    }
  }

  private setRenderOrder(element: ElementObject, order: number): void {
    element.group.traverse((node) => {
      if (node instanceof THREE.Mesh) node.renderOrder = order;
    });
  }

  private restoreMaterials(): void {
    this.clearOutlines();
    for (const element of this.elements.values()) this.setRenderOrder(element, 0);
    for (const [material, state] of this.original) {
      material.color.copy(state.color);
      material.opacity = state.opacity;
      material.transparent = state.transparent;
      material.depthWrite = true;
      material.depthTest = true;
      material.needsUpdate = true;
    }
  }

  private clearModels(): void {
    for (const element of this.elements.values()) {
      disposeGroup(element.group);
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

  private fit(globalIds: readonly string[], minRadius = 1): void {
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
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, minRadius);
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
