/**
 * Mini isla 3D del quiz (port de quiz.html): las 7 sucursales del mapa. Las que se descartarían con tus
 * respuestas se hunden y se apagan; las que siguen en juego quedan arriba.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { crearRenderer, encuadrar, liberar, mat, observarVisible, pieza, quieto as prefiereQuieto } from "./comun";
import { tipoInst } from "./mapa";

export class IslaQuiz {
  readonly ok: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private edificios: { g: THREE.Group; cuerpo: THREE.Mesh; marca: THREE.Mesh; escala: number; vel: number; objetivo: number }[] = [];
  private limpiar: (() => void)[] = [];
  private mx = 0;

  constructor(lienzo: HTMLElement, nombres: string[]) {
    const r = crearRenderer();
    this.ok = !!r;
    if (!r) return;
    this.renderer = r;
    r.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    lienzo.append(r.domElement);
    const quieto = prefiereQuieto();
    const { scene } = this;
    scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.4;
    const sol = new THREE.DirectionalLight(0xffffff, 2.2); sol.position.set(-3, 6, 4); sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024); sol.shadow.radius = 5; Object.assign(sol.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
    scene.add(sol, new THREE.HemisphereLight(0xffffff, 0xd6dde6, 1.4));
    const camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);

    const geoAgua = new THREE.RingGeometry(0.01, 4.2, 48, 14); geoAgua.rotateX(-Math.PI / 2);
    const agua = new THREE.Mesh(geoAgua, mat(0xbcdcec, { roughness: 0.35, flatShading: true }));
    agua.position.y = -0.22; agua.receiveShadow = true; scene.add(agua);
    const aguaBase = (geoAgua.attributes.position.array as Float32Array).slice();
    const olas = (t: number) => {
      const a = geoAgua.attributes.position.array as Float32Array;
      for (let k = 0; k < a.length; k += 3) a[k + 1] = Math.sin(aguaBase[k] * 1.6 + t * 1.6) * 0.035 + Math.cos(aguaBase[k + 2] * 1.9 + t * 1.2) * 0.03;
      geoAgua.attributes.position.needsUpdate = true;
    };
    const isla = pieza(5.4, 0.36, 3.4, mat(0xf4f6f8), 0.18); isla.position.y = -0.18; scene.add(isla);
    const calle = pieza(5, 0.04, 0.42, mat(0xc9d0d9), 0.02); calle.position.y = 0.02; scene.add(calle);
    const PUESTOS: Record<string, [number, number][]> = { banco: [[-1.9, 0.85], [-0.9, 0.85]], fondo: [[-1.8, -0.85], [-0.6, -0.85], [0.6, -0.85], [1.8, -0.85]], apv: [[1.3, 0.85]] };
    const usados: Record<string, number> = { banco: 0, fondo: 0, apv: 0 };
    this.edificios = nombres.map((nombre, k) => {
      const t = tipoInst(nombre), [x, z] = PUESTOS[t][usados[t]++] || [0, 0];
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const alto = t === "fondo" ? 0.95 + (k % 2) * 0.2 : t === "apv" ? 0.55 : 0.7;
      const cuerpo = pieza(0.62, alto, 0.6, mat(0xffffff)); cuerpo.position.y = alto / 2;
      let techo: THREE.Mesh;
      if (t === "apv") {
        techo = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.36, 4), mat(0x2b2f36)); techo.castShadow = true;
        techo.position.y = alto + 0.18; techo.rotation.y = Math.PI / 4;
      } else { techo = pieza(0.68, 0.08, 0.66, mat(0xdfe4ea), 0.02); techo.position.y = alto + 0.04; }
      const marca = pieza(0.64, 0.07, 0.62, mat(0xf2b937, { roughness: 0.4, metalness: 0.3 }), 0.02); marca.position.y = alto * 0.78;
      g.add(cuerpo, techo, marca); scene.add(g);
      return { g, cuerpo, marca, escala: 1, vel: 0, objetivo: 1 };
    });

    const medir = () => {
      const w = lienzo.clientWidth, h = lienzo.clientHeight; if (!w || !h) return;
      r.setSize(w, h, false);
      camara.position.set(4, 5, 6); camara.lookAt(0, 0.3, 0);
      encuadrar(camara, w, h, [-2.8, 2.8, -0.3, 1.5, -1.8, 1.8], [1.05, 1.08]);
    };
    medir();
    const ro = new ResizeObserver(medir); ro.observe(lienzo);
    let enPantalla = true;
    this.limpiar.push(() => ro.disconnect(), observarVisible(lienzo, (v) => { enPantalla = v; }));
    const mover = (ev: PointerEvent) => { const b = lienzo.getBoundingClientRect(); this.mx = ((ev.clientX - b.left) / b.width - 0.5) * 2; };
    const salir = () => { this.mx = 0; };
    lienzo.addEventListener("pointermove", mover); lienzo.addEventListener("pointerleave", salir);
    this.limpiar.push(() => { lienzo.removeEventListener("pointermove", mover); lienzo.removeEventListener("pointerleave", salir); });

    const blanco = new THREE.Color(0xffffff), gris = new THREE.Color(0xc9ced6);
    let antes = performance.now(), giro = 0;
    r.setAnimationLoop(() => {
      const ahora = performance.now(), dt = Math.min(0.05, (ahora - antes) / 1000), t = ahora / 1000; antes = ahora;
      if (!enPantalla || document.hidden) return;
      this.edificios.forEach((ed) => {
        if (quieto) ed.escala = ed.objetivo;
        else { ed.vel += ((ed.objetivo - ed.escala) * 160 - ed.vel * 14) * dt; ed.escala += ed.vel * dt; } // resorte con rebote
        ed.g.scale.y = Math.max(0.05, ed.escala);
        const a = 1 - Math.min(1, Math.max(0, (1 - ed.escala) / 0.82));
        (ed.cuerpo.material as THREE.MeshStandardMaterial).color.copy(gris).lerp(blanco, a);
        ed.marca.visible = ed.escala > 0.6;
      });
      if (!quieto) { giro += ((Math.sin(t * 0.4) * 0.12 + this.mx * 0.25) - giro) * 0.06; scene.rotation.y = giro; scene.position.y = Math.sin(t * 1.2) * 0.03; olas(t); }
      r.render(scene, camara);
    });
  }

  /** vivos[k]: si la sucursal k sigue en juego. */
  actualizar(vivos: boolean[]) {
    if (!this.ok) return;
    vivos.forEach((vivo, k) => {
      const ed = this.edificios[k];
      if ((ed.objetivo === 1) !== vivo) ed.vel += vivo ? 2 : -1.5;
      ed.objetivo = vivo ? 1 : 0.18;
    });
  }

  destruir() { this.limpiar.forEach((f) => f()); if (this.ok) liberar(this.scene, this.renderer); }
}
