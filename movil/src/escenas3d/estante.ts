/**
 * Estante 3D del bloque «¿Y si no lo pones en ninguna parte?» (port de _sin_invertir.html).
 * El avance (0 a 1) es el paso del tiempo: tu plata no cambia, pero los productos que alcanzas a comprar
 * van desapareciendo según la inflación, hasta el poder de compra real del final del plazo.
 */
import * as THREE from "three";
import { crearRenderer, encuadrar, liberar, mat, observarVisible, quieto as prefiereQuieto } from "./comun";

/** Caja con aristas redondeadas usando solo el núcleo de three.js (igual que en la web). */
function caja3(w: number, h: number, d: number, m: THREE.Material, r = 0.04) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: 0, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o;
}

export interface Reloj { mes: number; poder: number }

export class Estante {
  readonly ok: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  private productos: { g: THREE.Group; sale: number; vel: number; base: number }[] = [];
  private progreso = 0;
  private quieto = prefiereQuieto();
  private limpiar: (() => void)[] = [];
  private enPantalla = false;
  private ultimoMes = -1;
  private caja: HTMLElement;
  meses: number;
  pctFinal: number;
  private onReloj: (r: Reloj) => void;

  constructor(caja: HTMLElement, meses: number, pctFinal: number, onReloj: (r: Reloj) => void) {
    this.caja = caja; this.meses = meses; this.pctFinal = pctFinal; this.onReloj = onReloj;
    const r = crearRenderer();
    this.ok = !!r;
    if (!r) return;
    this.renderer = r;
    caja.prepend(r.domElement);
    if (this.quieto) this.progreso = 1;
    const { scene } = this;
    const sol = new THREE.DirectionalLight(0xffffff, 2.3); sol.position.set(-3, 6, 5); sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024); sol.shadow.radius = 5; Object.assign(sol.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
    scene.add(sol, new THREE.HemisphereLight(0xffffff, 0xd6dde6, 1.5));
    const mesa = caja3(7.2, 0.2, 2.4, mat(0xf4f6f8), 0.08); mesa.position.y = -0.1; scene.add(mesa);
    const mueble = new THREE.Group(); mueble.position.set(0.9, 0, -0.2); scene.add(mueble);
    const fondo = caja3(4.6, 2.5, 0.12, mat(0xffffff)); fondo.position.set(0, 1.25, -0.55);
    const repisaA = caja3(4.8, 0.1, 1.1, mat(0xe6eaef), 0.03); repisaA.position.set(0, 0.06, -0.05);
    const repisaB = caja3(4.8, 0.1, 1.1, mat(0xe6eaef), 0.03); repisaB.position.set(0, 1.26, -0.05);
    const ladoI = caja3(0.12, 2.5, 1.1, mat(0xffffff)); ladoI.position.set(-2.4, 1.25, -0.05);
    const ladoD = caja3(0.12, 2.5, 1.1, mat(0xffffff)); ladoD.position.set(2.4, 1.25, -0.05);
    mueble.add(fondo, repisaA, repisaB, ladoI, ladoD);
    const TONOS = [0xf3e6cf, 0xe3ecef, 0xf6efe4, 0xe8e2d6, 0xf1e9dc];
    const FRANJAS = [0xf2b937, 0x3b6aa8, 0xe0773b, 0x14a38b, 0x2b2f36];
    for (let k = 0; k < 10; k++) {
      const fila = k < 5 ? 0 : 1, col = k % 5, x = -1.8 + col * 0.9, y = fila ? 1.31 : 0.11;
      const g = new THREE.Group(), forma = k % 3;
      let cuerpo: THREE.Mesh, alto: number;
      if (forma === 0) { alto = 0.85; cuerpo = caja3(0.55, alto, 0.42, mat(TONOS[k % 5])); cuerpo.position.y = alto / 2; }
      else if (forma === 1) { alto = 0.6; cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, alto, 28), mat(TONOS[(k + 2) % 5])); cuerpo.position.y = alto / 2; cuerpo.castShadow = true; }
      else {
        alto = 0.7; cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, alto, 28), mat(0xffffff, { roughness: 0.4 })); cuerpo.position.y = alto / 2; cuerpo.castShadow = true;
        const tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.1, 28), mat(0xf2b937, { roughness: 0.35, metalness: 0.4 })); tapa.position.y = alto + 0.05; g.add(tapa);
      }
      const franja = forma === 0 ? caja3(0.56, 0.16, 0.43, mat(FRANJAS[k % 5]), 0.02)
        : new THREE.Mesh(new THREE.CylinderGeometry(forma === 1 ? 0.245 : 0.215, forma === 1 ? 0.245 : 0.215, 0.16, 28), mat(FRANJAS[k % 5]));
      franja.position.y = alto * 0.55; g.add(cuerpo, franja);
      g.position.set(x, y, 0); mueble.add(g);
      this.productos.push({ g, sale: 0, vel: 0, base: y });
    }
    const fajo = new THREE.Group(); fajo.position.set(-2.55, 0, 0.45); scene.add(fajo);
    for (let k = 0; k < 7; k++) {
      const b = caja3(1.1, 0.07, 0.56, mat(k % 2 ? 0xbfe0d6 : 0xa9d3c6), 0.02);
      b.position.set((k % 3 - 1) * 0.03, 0.035 + k * 0.075, (k % 2) * 0.03); b.rotation.y = (k % 3 - 1) * 0.05; fajo.add(b);
    }
    const faja = caja3(0.22, 0.56, 0.6, mat(0xf2b937, { roughness: 0.4 }), 0.02); faja.position.y = 0.28; fajo.add(faja);

    const medir = () => {
      const w = caja.clientWidth, h = caja.clientHeight; if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camara.position.set(3.5, 3.4, 7.5); this.camara.lookAt(0, 1, 0);
      encuadrar(this.camara, w, h, [-3.6, 3.6, -0.2, 2.7, -1, 1.2], [1.04, 1.16], [0, -0.08]);
    };
    medir();
    const ro = new ResizeObserver(medir); ro.observe(caja);
    this.limpiar.push(() => ro.disconnect(), observarVisible(caja, (v) => { this.enPantalla = v; }));

    let antes = performance.now();
    r.setAnimationLoop(() => {
      const ahora = performance.now(), dt = Math.min(0.05, (ahora - antes) / 1000), t = ahora / 1000; antes = ahora;
      if (!this.enPantalla || document.hidden) return;
      const m = Math.round(this.progreso * this.meses), poder = Math.pow(this.pctFinal, m / this.meses);
      const quedan = Math.max(1, Math.round(poder * 10 - 1e-9));
      this.productos.forEach((p, k) => {
        const meta = k < quedan ? 0 : 1; // los últimos de la lista son los que ya no alcanzas
        if (this.quieto) p.sale = meta;
        else { p.vel += ((meta - p.sale) * 120 - p.vel * 13) * dt; p.sale += p.vel * dt; }
        const s = Math.max(0.001, 1 - p.sale);
        p.g.scale.setScalar(s); p.g.position.y = p.base + p.sale * 0.5; p.g.rotation.y = p.sale * 0.8;
        p.g.visible = s > 0.02;
      });
      fajo.position.y = this.quieto ? 0 : Math.sin(t * 1.4) * 0.02;
      if (m !== this.ultimoMes) { this.ultimoMes = m; this.onReloj({ mes: m, poder }); }
      r.render(scene, this.camara);
    });
  }

  /** 0 = hoy, 1 = final del plazo. */
  setProgreso(p: number) { if (!this.quieto) this.progreso = Math.min(1, Math.max(0, p)); }
  actualizar(meses: number, pctFinal: number) { this.meses = meses; this.pctFinal = pctFinal; this.ultimoMes = -1; }
  destruir() { this.limpiar.forEach((f) => f()); if (this.ok) liberar(this.scene, this.renderer); }
  get contenedor() { return this.caja; }
}
