/** Piezas compartidas por las escenas 3D (mismo estilo "arcilla" de la web). three.js va empaquetado: funciona sin internet. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const quieto = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Crea el renderer o devuelve null si el teléfono no tiene WebGL. */
export function crearRenderer(): THREE.WebGLRenderer | null {
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.NeutralToneMapping;
    r.shadowMap.enabled = true;
    r.debug.checkShaderErrors = false; // evita avisos del compilador de la GPU en la consola
    return r;
  } catch {
    return null;
  }
}

export const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });

/** Caja con aristas redondeadas que proyecta y recibe sombra. */
export function pieza(w: number, h: number, d: number, m: THREE.Material, r = 0.06): THREE.Mesh {
  const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), m);
  o.castShadow = o.receiveShadow = true;
  return o;
}

/** Ajusta una cámara ortográfica para que una caja del mundo quepa en el lienzo. */
export function encuadrar(camara: THREE.OrthographicCamera, w: number, h: number, caja: [number, number, number, number, number, number],
  holgura: [number, number] = [1.04, 1.08], desplazar: [number, number] = [0, 0]) {
  camara.updateMatrixWorld();
  const inv = camara.matrixWorldInverse, v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const [ax, bx, ay, by, az, bz] = caja;
  for (let k = 0; k < 8; k++) {
    v.set(k & 1 ? bx : ax, k & 2 ? by : ay, k & 4 ? bz : az).applyMatrix4(inv);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  let mw = (x1 - x0) / 2 * holgura[0], mh = (y1 - y0) / 2 * holgura[1];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (mw / mh > w / h) mh = mw / (w / h); else mw = mh * (w / h);
  Object.assign(camara, { left: cx - mw - desplazar[0] * mw, right: cx + mw - desplazar[0] * mw,
    top: cy + mh - desplazar[1] * mh, bottom: cy - mh - desplazar[1] * mh });
  camara.updateProjectionMatrix();
}

/** Libera geometrías, materiales y el contexto WebGL (los teléfonos tienen pocos contextos). */
export function liberar(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    mats.forEach((x) => x.dispose());
  });
  renderer.setAnimationLoop(null);
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement.remove();
}

/** Observa si el lienzo está en pantalla (también cuando su pestaña de la app queda oculta). */
export function observarVisible(el: Element, cb: (visible: boolean) => void): () => void {
  const io = new IntersectionObserver((e) => cb(e[0].isIntersecting), { threshold: 0.01 });
  io.observe(el);
  return () => io.disconnect();
}
