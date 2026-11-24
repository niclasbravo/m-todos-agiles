/**
 * Maqueta isométrica del simulador (port de templates/comparador/_mapa3d.html).
 * Tu casa a la izquierda y una sucursal por instrumento. En el patio de cada sucursal se apilan pallets
 * (gris-azulados = lo que pones, dorados = la ganancia) según la misma trayectoria que calcula la lógica.
 * La interfaz (KPIs, línea de tiempo, zonas) vive en React; esta clase solo dibuja y avisa los cambios.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { DatosEscena, InstEscena } from "../logica/escena";
import { clpJs, corto } from "../logica/formatos";
import { crearRenderer, liberar, mat, observarVisible, pieza, quieto as prefiereQuieto } from "./comun";

export type Zona = "todo" | "bancos" | "fondos" | "pension" | "casa";
export interface Ahora { aportado: number; nominal: number; real: number; capas: number }
export interface EventosMapa {
  onMomento?: (f: number, mes: number, ahora: Ahora[]) => void;
  onSeleccion?: (i: number) => void;
  onEnfoque?: (enfocado: boolean) => void;
  onZona?: (z: Zona) => void;
  onCasa?: () => void;
  onToque?: () => void;
}

export const tipoInst = (nombre: string) => (/APV/.test(nombre) ? "apv" : /Principal/.test(nombre) ? "fondo" : "banco");
export const ZONAS: Record<Exclude<Zona, "todo">, { titulo: string; et: string; foco: [number, number]; zoom: number; tipo: string | null; texto: string }> = {
  bancos: { titulo: "Bancos", et: "Riesgo muy bajo", foco: [-5.4, 2.6], zoom: 1.9, tipo: "banco",
    texto: "Cuenta vista con intereses y depósito a plazo: tu plata queda en un banco, con una tasa que conoces de antemano. Ideal para el fondo de emergencia o metas cortas." },
  fondos: { titulo: "Fondos mutuos", et: "Riesgo bajo a alto", foco: [2.2, -2.6], zoom: 1.35, tipo: "fondo",
    texto: "Juntan la plata de muchas personas y la invierten en deuda o acciones. Pueden subir o bajar: la tasa que ves es el promedio de los últimos 3 años y no está garantizada." },
  pension: { titulo: "Pensión (APV)", et: "Largo plazo", foco: [4.4, 2.9], zoom: 1.7, tipo: "apv",
    texto: "Ahorro Previsional Voluntario, régimen A: el Estado bonifica el 15% de lo que aportas en el año, con tope de 6 UTM. Es para la pensión: si retiras antes, devuelves el bono." },
  casa: { titulo: "Tu casa", et: "De aquí sale tu ahorro", foco: [-9.4, -2.4], zoom: 2.2, tipo: null, texto: "" },
};

type Pin = HTMLElement & { _w?: number; _h?: number };
interface Sucursal { g: THREE.Group; edificio: THREE.Mesh; frente: number; alto: number; partes: THREE.Mesh[]; salto?: number }

const MAXP = 45, PP = 0.42, PH = 0.22, DURA = 6;

export class MapaIsla {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private quieto = prefiereQuieto();
  private D!: DatosEscena;
  private inst!: (InstEscena & { ahora?: Ahora })[];
  private cortes = 0;
  private maximo = 1;
  private sucursales: Sucursal[] = [];
  private pines: Pin[] = [];
  private pinCasa!: Pin;
  private pinesDistrito: { z: Zona; el: HTMLButtonElement }[] = [];
  private mBase!: THREE.InstancedMesh;
  private mOro!: THREE.InstancedMesh;
  private caidas: { visibles: number; t: number[] }[] = [];
  private sel = 0;
  private momento = 0;
  private reproduciendo = false;
  private t0 = 0;
  private ultimoAviso = 0;
  private enPantalla = true;
  private foco = new THREE.Vector3();
  private focoObj = new THREE.Vector3();
  private zoomObj = 1;
  private zoomBase = 1;
  private enfocado = false;
  private objetivos: THREE.Object3D[] = [];
  private casa!: THREE.Group;
  private animarMundo!: (t: number, dt: number) => void;
  private moverEnvios!: (t: number) => void;
  private envios: { i: number; t0: number; g: THREE.Group; llego?: boolean }[] = [];
  private flota: THREE.Group[] = [];
  private camiones: THREE.Group[] = [];
  private limpiar: (() => void)[] = [];
  private escena: HTMLElement;
  private capa: HTMLElement;
  private ev: EventosMapa;
  readonly ok: boolean;
  private readonly BASE = new THREE.Vector3(7, 13, 21);

  constructor(escena: HTMLElement, capa: HTMLElement, datos: DatosEscena, ev: EventosMapa = {}) {
    this.escena = escena; this.capa = capa; this.ev = ev;
    const r = crearRenderer();
    this.ok = !!r;
    if (!r) { this.renderer = null as unknown as THREE.WebGLRenderer; return; }
    this.renderer = r;
    escena.prepend(r.domElement);
    this.construirMundo();
    this.prepararDatos(datos);
    this.crearPines();
    this.sel = this.mejor();
    this.momento = this.quieto ? this.cortes - 1 : 0;
    this.construir(this.momento, performance.now() / 1000);
    this.textos();
    this.ubicar();
    const ro = new ResizeObserver(() => { this.ubicar(); this.medirPines(); });
    ro.observe(escena);
    this.limpiar.push(() => ro.disconnect());
    this.limpiar.push(observarVisible(escena, (v) => { this.enPantalla = v; }));
    // Reproduce sola la primera vez que la maqueta aparece en pantalla.
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { this.reproducir(); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(escena);
    this.limpiar.push(() => io.disconnect());
    this.eventos();
    r.setAnimationLoop(() => this.cuadro());
  }

  // ---------------------------------------------------------------- mundo
  private construirMundo() {
    const { scene, renderer } = this;
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    const sol = new THREE.DirectionalLight(0xffffff, 2.4);
    sol.position.set(-8, 16, 10);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    sol.shadow.radius = 5;
    sol.shadow.bias = -0.0005;
    Object.assign(sol.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 50 });
    scene.add(sol, new THREE.HemisphereLight(0xffffff, 0xd6dde6, 1.6));

    const blanco = mat(0xffffff), gris = mat(0xdfe4ea), asfalto = mat(0xc9d0d9), vidrio = mat(0x24364f, { roughness: 0.25, metalness: 0.2 });
    const menta = mat(0x8fd6bd), tronco = mat(0xb08a63);
    this.gris = gris; this.blanco = blanco; this.vidrio = vidrio;

    const isla = pieza(26, 0.6, 13, mat(0xf4f6f8), 0.3); isla.position.y = -0.3; scene.add(isla);
    const calle = pieza(23, 0.08, 1.4, asfalto, 0.03); calle.position.set(-0.5, 0.04, 0); scene.add(calle);
    for (let x = -11.5; x < 11; x += 1.4) { const l = pieza(0.6, 0.02, 0.08, blanco, 0.01); l.position.set(x, 0.09, 0); scene.add(l); }

    const arbol = (x: number, z: number, s = 1) => {
      const t = pieza(0.12 * s, 0.4 * s, 0.12 * s, tronco, 0.03); t.position.set(x, 0.2 * s, z);
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 * s, 2), menta); c.position.set(x, 0.65 * s, z);
      c.castShadow = c.receiveShadow = true; scene.add(t, c);
    };
    ([[-12, -5.5], [-11, 5.4], [-7.5, -5.6], [-3.5, 5.6], [0.5, -5.7], [4.5, 5.6], [8.5, -5.6], [11.6, 5], [12, -4.5], [11.8, 0.2], [-12.2, 0.4]] as const)
      .forEach(([x, z], i) => arbol(x, z, 0.8 + (i % 3) * 0.15));

    // Tu casa: de aquí sale el aporte de cada mes.
    const casa = new THREE.Group();
    const cuerpo = pieza(1.6, 1, 1.4, blanco); cuerpo.position.y = 0.5;
    const techo = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.75, 4), mat(0x2b2f36)); techo.position.y = 1.37; techo.rotation.y = Math.PI / 4;
    techo.castShadow = true;
    const puerta = pieza(0.32, 0.55, 0.05, mat(0xf2b937), 0.02); puerta.position.set(0, 0.28, 0.72);
    casa.add(cuerpo, techo, puerta); casa.position.set(-10.2, 0, -2.4); scene.add(casa);
    casa.traverse((o) => { o.userData.casa = true; });
    this.casa = casa;
    this.objetivosCasa = [cuerpo, techo];
    arbol(-9, -3.6, 0.7);

    // Barrios: bancos adelante a la izquierda, fondos atrás junto a la torre, pensión adelante a la derecha.
    const placa = (x0: number, x1: number, z0: number, z1: number, color: number) => {
      const m = pieza(x1 - x0, 0.04, z1 - z0, mat(color), 0.2); m.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2); scene.add(m);
    };
    placa(-9.2, -1.6, 0.85, 4.35, 0xe7eef8);
    placa(-7.4, 10.6, -4.35, -0.85, 0xe5f2ee);
    placa(-0.6, 10.6, 0.85, 4.75, 0xf6ece2);
    const torre = new THREE.Group(); torre.position.set(9, 0, -2.6);
    const tc = pieza(1.7, 3.6, 1.7, blanco, 0.12); tc.position.y = 1.8;
    const tv = pieza(1.72, 2.6, 1.3, vidrio, 0.05); tv.position.set(0, 1.9, 0.22);
    const tt = pieza(1.85, 0.3, 1.85, mat(0xf2b937, { roughness: 0.35, metalness: 0.5 }), 0.08); tt.position.y = 3.72;
    const ta = pieza(0.08, 0.7, 0.08, gris, 0.03); ta.position.set(0.4, 4.2, 0.3);
    torre.add(tc, tv, tt, ta); scene.add(torre);
    ([[4.6, 2.2, 0xffffff], [6.4, 3.4, 0xfdf6ec], [8.2, 2.2, 0xffffff], [9.8, 3.4, 0xfdf6ec]] as const).forEach(([x, z, c], k) => {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const b = pieza(1.2, 0.8, 1, mat(c)); b.position.y = 0.45;
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 4), mat(k % 2 ? 0xe0773b : 0x2b2f36)); t.position.y = 1.15; t.rotation.y = Math.PI / 4; t.castShadow = true;
      const pu = pieza(0.26, 0.42, 0.04, mat(0xf2b937), 0.02); pu.position.set(0, 0.26, 0.51);
      g.add(b, t, pu); scene.add(g);
    });
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 40), mat(0xd9ead0)); plaza.position.set(6.6, 0.05, 5.2); plaza.receiveShadow = true; scene.add(plaza);
    arbol(6.2, 5.1, 0.75); arbol(7.2, 5.4, 0.6);

    // Mundo vivo: agua con olas, muelle, bote, velero, gente, nubes, espuma y crestas.
    const geoAgua = new THREE.PlaneGeometry(80, 56, 56, 40); geoAgua.rotateX(-Math.PI / 2);
    const agua = new THREE.Mesh(geoAgua, mat(0xbcdcec, { roughness: 0.35, metalness: 0.05, flatShading: true }));
    agua.position.y = -0.34; agua.receiveShadow = true; scene.add(agua);
    const aguaBase = (geoAgua.attributes.position.array as Float32Array).slice();
    const muelle = pieza(1, 0.12, 2.2, mat(0xc9a27a), 0.03); muelle.position.set(10.6, -0.12, 7.4); scene.add(muelle);
    ([[10.2, 6.6], [11, 6.6], [10.2, 8.3], [11, 8.3]] as const).forEach(([x, z]) => { const p = pieza(0.1, 0.5, 0.1, mat(0x9c7a58), 0.02); p.position.set(x, -0.3, z); scene.add(p); });
    const bote = new THREE.Group();
    const casco = pieza(1.7, 0.36, 0.62, blanco, 0.14); casco.position.y = 0.12;
    const cabina = pieza(0.6, 0.34, 0.46, blanco, 0.08); cabina.position.set(-0.25, 0.46, 0);
    const vidrioB = pieza(0.62, 0.12, 0.48, vidrio, 0.03); vidrioB.position.set(-0.25, 0.52, 0);
    const franjaB = pieza(1.72, 0.07, 0.64, mat(0xf2b937), 0.03); franjaB.position.y = 0.2;
    bote.add(casco, cabina, vidrioB, franjaB); scene.add(bote);
    const velero = new THREE.Group();
    const cascoV = pieza(1.3, 0.28, 0.46, blanco, 0.12); cascoV.position.y = 0.1;
    const mastil = pieza(0.05, 1.3, 0.05, gris, 0.02); mastil.position.set(0.05, 0.85, 0);
    const formaVela = new THREE.Shape(); formaVela.moveTo(0, 0); formaVela.lineTo(0.75, 0); formaVela.lineTo(0, 1.1); formaVela.lineTo(0, 0);
    const vela = new THREE.Mesh(new THREE.ShapeGeometry(formaVela), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }));
    vela.position.set(0.1, 0.32, 0); vela.castShadow = true;
    const fb = new THREE.Shape(); fb.moveTo(0, 0); fb.lineTo(0.28, -0.08); fb.lineTo(0, -0.16);
    const banderin = new THREE.Mesh(new THREE.ShapeGeometry(fb), new THREE.MeshStandardMaterial({ color: 0xf2b937, side: THREE.DoubleSide }));
    banderin.position.set(0.07, 1.5, 0);
    velero.add(cascoV, mastil, vela, banderin); scene.add(velero);
    const gente = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.075, 0.16, 4, 8), mat(0xffffff), 12);
    gente.castShadow = true; scene.add(gente);
    const caminantes = Array.from({ length: 12 }, (_, k) => ({ x: -11 + ((k * 1.93) % 22), z: k % 2 ? 0.86 : -0.86, dir: k % 3 ? 1 : -1, vel: 0.3 + (k % 4) * 0.08, fase: k }));
    const tonosGente = [0x2b2f36, 0xe0773b, 0x2f6fde, 0x14a38b, 0xd99a00, 0x8a8f99];
    caminantes.forEach((_, k) => gente.setColorAt(k, new THREE.Color(tonosGente[k % tonosGente.length])));
    const nubes = ([[-8, 6.4, -1.5], [6, 7, 2.5]] as const).map(([x, y, z], k) => {
      const g = new THREE.Group();
      ([[0, 0, 0, 0.9], [0.8, -0.1, 0.2, 0.7], [-0.8, -0.15, -0.1, 0.65], [0.2, 0.35, -0.2, 0.6]] as const).forEach(([dx, dy, dz, r]) => {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(0xffffff, { roughness: 1 }));
        b.position.set(dx, dy, dz); b.castShadow = true; g.add(b);
      });
      g.position.set(x, y, z); g.userData = { vel: 0.25 + k * 0.1 }; scene.add(g); return g;
    });
    const espuma = new THREE.Mesh(new THREE.PlaneGeometry(27.6, 14.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    espuma.rotation.x = -Math.PI / 2; espuma.position.y = -0.27; scene.add(espuma);
    const geoCresta = new THREE.CapsuleGeometry(0.05, 0.9, 3, 6); geoCresta.rotateZ(Math.PI / 2);
    const crestas = new THREE.InstancedMesh(geoCresta, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), 26);
    scene.add(crestas);
    const datosCrestas = Array.from({ length: 26 }, (_, k) => {
      const lado = k % 4;
      const x = lado < 2 ? -18 + ((k * 4.7) % 36) : (lado === 2 ? -16.5 : 16.5) + Math.sin(k) * 1.5;
      const z = lado === 0 ? -9 - (k % 3) * 1.6 : lado === 1 ? 9 + (k % 3) * 1.4 : -6 + ((k * 3.1) % 12);
      return { x, z, fase: (k * 0.37) % 1, vel: 0.35 + (k % 5) * 0.06 };
    });
    const m4 = new THREE.Matrix4(), pv = new THREE.Vector3(), qv = new THREE.Quaternion(), sv = new THREE.Vector3(), uno = new THREE.Vector3(1, 1, 1);
    this.animarMundo = (t, dt) => {
      if (!this.quieto) {
        const a = geoAgua.attributes.position.array as Float32Array;
        for (let k = 0; k < a.length; k += 3) {
          const x = aguaBase[k], z = aguaBase[k + 2];
          a[k + 1] = Math.sin(x * 0.55 + z * 0.2 + t * 1.3) * 0.085 + Math.cos(z * 0.7 - x * 0.15 + t * 0.9) * 0.06;
        }
        geoAgua.attributes.position.needsUpdate = true;
        nubes.forEach((n) => { n.position.x += n.userData.vel * dt; if (n.position.x > 16) n.position.x = -16; });
        const respira = 1 + Math.sin(t * 1.3) * 0.012;
        espuma.scale.set(respira, respira, 1); (espuma.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 1.3) * 0.15;
        datosCrestas.forEach((c, k) => {
          const u = (t * 0.22 + c.fase) % 1, vida = Math.sin(u * Math.PI);
          pv.set(c.x + u * c.vel * 4, -0.26 + vida * 0.05, c.z);
          sv.set(0.3 + vida * 0.9, 1, 1); m4.compose(pv, qv, sv); crestas.setMatrixAt(k, m4);
        });
        crestas.instanceMatrix.needsUpdate = true;
      }
      bote.position.set(this.quieto ? 4 : ((t * 1.1) % 34) - 17, -0.28 + Math.sin(t * 1.6) * 0.04, 7.1);
      velero.position.set(this.quieto ? -4 : -14 + ((t * 0.45) % 28), -0.3 + Math.sin(t * 1.2 + 1) * 0.05, -7.3);
      velero.rotation.z = Math.sin(t * 1.1) * 0.06;
      bote.rotation.z = Math.sin(t * 1.3) * 0.04; bote.rotation.x = Math.sin(t * 1.1) * 0.03;
      caminantes.forEach((c, k) => {
        if (!this.quieto) { c.x += c.dir * c.vel * dt; if (c.x > 11.4) c.x = -11.4; if (c.x < -11.4) c.x = 11.4; }
        pv.set(c.x, 0.2 + (this.quieto ? 0 : Math.abs(Math.sin(t * 7 + c.fase)) * 0.04), c.z);
        m4.compose(pv, qv, uno); gente.setMatrixAt(k, m4);
      });
      gente.instanceMatrix.needsUpdate = true;
    };

    // Pallets instanciados: 3 x 3 por capa en el patio (7 sucursales como máximo).
    const geoPallet = new RoundedBoxGeometry(PP * 0.9, PH * 0.88, PP * 0.9, 2, 0.035);
    this.mBase = new THREE.InstancedMesh(geoPallet, mat(0xc5d0de), 8 * MAXP);
    this.mOro = new THREE.InstancedMesh(geoPallet, mat(0xf2b937, { roughness: 0.35, metalness: 0.55 }), 8 * MAXP);
    [this.mBase, this.mOro].forEach((m) => { m.castShadow = m.receiveShadow = true; m.count = 0; scene.add(m); });

    const camion = (franjaAlta: number) => {
      const g = new THREE.Group();
      const c1 = pieza(0.95, 0.5, 0.48, blanco, 0.06); c1.position.set(-0.12, 0.38, 0);
      const c2 = pieza(0.38, 0.4, 0.46, mat(0x2b2f36), 0.06); c2.position.set(0.5, 0.33, 0);
      const c3 = pieza(0.96, franjaAlta, 0.49, mat(0xf2b937), 0.02); c3.position.set(-0.12, 0.3, 0);
      g.add(c1, c2, c3); return g;
    };
    // Camiones de valores que recorren la calle (el aporte de cada mes).
    this.camiones = [0, 1, 2].map((k) => {
      const g = camion(0.08);
      g.userData = { x: -10 + k * 7, vel: 1.6 + k * 0.25, z: k % 2 ? 0.32 : -0.32, dir: k % 2 ? -1 : 1 };
      g.rotation.y = g.userData.dir > 0 ? 0 : Math.PI;
      scene.add(g); return g;
    });

    // Envíos: un camión sale de tu casa y descarga monedas en el patio.
    const mMonedas = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 20), mat(0xf2b937, { roughness: 0.3, metalness: 0.8 }), 8 * 12);
    mMonedas.castShadow = true; mMonedas.count = 0; scene.add(mMonedas);
    this.flota = Array.from({ length: 8 }, () => { const g = camion(0.1); g.visible = false; scene.add(g); return g; });
    const tmp = new THREE.Vector3(), e3 = new THREE.Euler(), qm = new THREE.Quaternion();
    this.moverEnvios = (t) => {
      let nm = 0;
      for (let k = this.envios.length - 1; k >= 0; k--) {
        const e = this.envios[k], su = this.sucursales[e.i], g = e.g, u = t - e.t0;
        if (!su) { g.visible = false; this.envios.splice(k, 1); continue; }
        if (u < 0) { g.visible = false; continue; }
        const carril = su.frente > 0 ? -0.32 : 0.32, x0 = casa.position.x + 0.9, x1 = su.g.position.x - 0.3;
        const salir = 0.35, viaje = Math.abs(x1 - x0) / 9, descarga = 0.9, fin = salir + viaje + descarga;
        g.visible = true; g.scale.setScalar(u > fin - 0.15 ? Math.max(0.01, (fin - u) / 0.15) : 1);
        if (u < salir) {
          const a = u / salir;
          g.position.set(x0, 0.08, casa.position.z + 0.9 + (carril - casa.position.z - 0.9) * a);
          g.rotation.y = -Math.PI / 2 * (1 - a);
        } else if (u < salir + viaje) {
          const a = (u - salir) / viaje, suave = a < 0.5 ? 2 * a * a : 1 - Math.pow(-2 * a + 2, 2) / 2;
          g.position.set(x0 + (x1 - x0) * suave, 0.08, carril); g.rotation.y = 0;
        } else {
          g.position.set(x1, 0.08, carril);
          const a = (u - salir - viaje) / descarga;
          for (let m = 0; m < 12; m++) {
            const am = Math.min(1, Math.max(0, a * 1.6 - m * 0.05));
            if (am <= 0 || am >= 1) continue;
            const dx = su.g.position.x + 0.75 + ((m % 3) - 1) * 0.3, dz = su.g.position.z - 0.25 * su.frente + ((m % 4) - 1.5) * 0.25;
            tmp.set(x1 + (dx - x1) * am, 0.6 + Math.sin(am * Math.PI) * 1.4 + 0.3 * am, carril + (dz - carril) * am);
            e3.set(am * 9 + m, am * 5, 0); qm.setFromEuler(e3); m4.compose(tmp, qm, uno); mMonedas.setMatrixAt(nm++, m4);
          }
          if (!e.llego && a > 0.7) { e.llego = true; su.salto = t; }
        }
        if (u > fin) { g.visible = false; this.envios.splice(k, 1); }
      }
      mMonedas.count = nm; mMonedas.instanceMatrix.needsUpdate = true;
    };
  }
  private gris!: THREE.MeshStandardMaterial;
  private blanco!: THREE.MeshStandardMaterial;
  private vidrio!: THREE.MeshStandardMaterial;
  private objetivosCasa: THREE.Object3D[] = [];
  private grupoSucursales = new THREE.Group();

  // ---------------------------------------------------------------- sucursales (dependen de los datos)
  private prepararDatos(datos: DatosEscena) {
    this.D = datos; this.inst = datos.inst; this.cortes = datos.meses.length;
    this.maximo = Math.max(...this.inst.map((d) => d.puntos[this.cortes - 1][1])) || 1;
    this.caidas = this.inst.map(() => ({ visibles: 0, t: new Array(MAXP).fill(-1) }));
    if (this.sucursales.length === this.inst.length) return; // mismas 7 sucursales: solo cambian los pallets
    this.scene.remove(this.grupoSucursales);
    this.grupoSucursales = new THREE.Group(); this.scene.add(this.grupoSucursales);
    const colores = { banco: 0x2f6fde, fondo: 0x14a38b, apv: 0xe0773b } as Record<string, number>;
    const PUESTOS: Record<string, [number, number][]> = { banco: [[-7.2, 2.6], [-3.6, 2.6]], fondo: [[-5.4, -2.6], [-1.8, -2.6], [1.8, -2.6], [5.4, -2.6]], apv: [[1.4, 2.6]] };
    const libres: [number, number][] = [[-0.2, 5.6], [4, 5.6]], usados: Record<string, number> = { banco: 0, fondo: 0, apv: 0 };
    const pasto = mat(0xe6ece4);
    this.sucursales = this.inst.map((d, i) => {
      const t = tipoInst(d.nombre);
      const [x, z] = PUESTOS[t][usados[t]++] || libres.shift() || [0, 0];
      const frente = z > 0 ? -1 : 1, color = colores[t];
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const lote = pieza(3.5, 0.1, 3, pasto, 0.05); lote.position.y = 0.05; g.add(lote);
      const alto = 0.9 + (i % 3) * 0.25;
      const edificio = pieza(1.5, alto, 1.3, this.blanco); edificio.position.set(-0.85, 0.1 + alto / 2, -0.3 * frente);
      const losa = pieza(1.62, 0.12, 1.42, this.gris, 0.03); losa.position.set(-0.85, 0.16 + alto, -0.3 * frente);
      const banda = pieza(1.52, 0.18, 1.32, mat(color), 0.03); banda.position.set(-0.85, 0.1 + alto - 0.2, -0.3 * frente);
      const ventanas = pieza(1.1, alto * 0.38, 0.04, this.vidrio, 0.015); ventanas.position.set(-0.85, 0.1 + alto * 0.42, -0.3 * frente + 0.66 * frente);
      const letrero = pieza(0.08, 0.9, 0.08, this.gris, 0.02); letrero.position.set(0.0, 0.55, 0.95 * frente);
      const placa = pieza(0.5, 0.3, 0.06, mat(color), 0.03); placa.position.set(0.0, 1.05, 0.95 * frente);
      const patio = pieza(1.7, 0.04, 1.7, this.gris, 0.03); patio.position.set(0.75, 0.12, -0.25 * frente);
      [edificio, ventanas, banda, lote, patio].forEach((o) => { o.userData.i = i; });
      g.add(edificio, losa, banda, ventanas, letrero, placa, patio);
      this.grupoSucursales.add(g);
      return { g, edificio, frente, alto, partes: [edificio, banda, ventanas, losa] };
    });
    this.objetivos = [...this.sucursales.flatMap((s) => [s.edificio, s.partes[1], s.partes[2], s.g.children[0], s.g.children[6]]), ...this.objetivosCasa];
  }

  private crearPines() {
    this.capa.querySelectorAll(".pin").forEach((p) => p.remove());
    this.pines = this.inst.map(() => {
      const p = document.createElement("div") as Pin; p.className = "pin";
      p.innerHTML = `<b></b><span class="monto"></span><span class="vivo"><i></i><span></span></span>`;
      this.capa.append(p); return p;
    });
    this.pinCasa = document.createElement("div") as Pin; this.pinCasa.className = "pin casa"; this.capa.append(this.pinCasa);
    this.pinesDistrito = ([["bancos", "Bancos"], ["fondos", "Fondos"], ["pension", "Pensión"]] as const).map(([z, t]) => {
      const el = document.createElement("button"); el.type = "button"; el.className = "pin distrito"; el.textContent = t;
      el.addEventListener("click", (ev) => { ev.stopPropagation(); this.ev.onZona?.(z); });
      this.capa.append(el);
      return { z, el };
    });
    this.medirPines();
  }

  private medirPines() { // una sola lectura de tamaños cuando cambia el texto, no en cada cuadro
    for (const el of Array.from(this.capa.children) as Pin[]) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
  }

  private mejor() {
    const c = this.cortes - 1;
    return this.inst.reduce((b, d, i) => (d.puntos[c][1] > this.inst[b].puntos[c][1] ? i : b), 0);
  }

  // ---------------------------------------------------------------- tiempo
  private valor(d: InstEscena, f: number) {
    const a = Math.floor(f), b = Math.min(this.cortes - 1, a + 1), u = f - a;
    return d.puntos[a].map((x, k) => x + (d.puntos[b][k] - x) * u);
  }
  mes(f = this.momento) {
    const a = Math.floor(f), b = Math.min(this.cortes - 1, a + 1);
    return Math.round(this.D.meses[a] + (this.D.meses[b] - this.D.meses[a]) * (f - a));
  }
  get totalCortes() { return this.cortes; }
  get mesesMarcas() { return this.D.meses; }
  get seleccion() { return this.sel; }
  get ahora() { return this.inst.map((d) => d.ahora!); }

  private construir(f: number, ahora: number) {
    let nb = 0, no = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    this.inst.forEach((d, i) => {
      const [aportado, nominal, real] = this.valor(d, f);
      const tot = Math.max(1, Math.round((nominal / this.maximo) * MAXP));
      const base = Math.min(tot, Math.max(1, Math.round((aportado / this.maximo) * MAXP)));
      const c = this.caidas[i], su = this.sucursales[i];
      for (let k = c.visibles; k < tot; k++) c.t[k] = this.quieto ? -10 : ahora + (k - c.visibles) * 0.04;
      c.visibles = tot;
      for (let k = 0; k < tot; k++) {
        const u = Math.min(1, Math.max(0, (ahora - c.t[k]) / 0.35));
        if (u <= 0) continue;
        const capaN = Math.floor(k / 9), j = k % 9;
        const baja = (1 - u) * (1 - u) * 1.6;
        p.set(su.g.position.x + 0.75 + ((j % 3) - 1) * PP, 0.14 + PH / 2 + capaN * PH + baja, su.g.position.z - 0.25 * su.frente + (Math.floor(j / 3) - 1) * PP);
        m4.compose(p, q, s1);
        if (k < base) this.mBase.setMatrixAt(nb++, m4); else this.mOro.setMatrixAt(no++, m4);
      }
      d.ahora = { aportado, nominal, real, capas: Math.ceil(tot / 9) };
    });
    this.mBase.count = nb; this.mOro.count = no;
    this.mBase.instanceMatrix.needsUpdate = this.mOro.instanceMatrix.needsUpdate = true;
  }

  private textos() {
    const m = this.mes();
    this.inst.forEach((d, i) => {
      const pin = this.pines[i];
      pin.querySelector("b")!.textContent = d.nombre.split(" (")[0];
      pin.querySelector(".monto")!.textContent = corto(d.ahora!.nominal);
      pin.querySelector(".vivo span")!.textContent = `Ganancia ${corto(d.ahora!.nominal - d.ahora!.aportado)} · Real ${corto(d.ahora!.real)} · Riesgo ${d.riesgo}`;
      pin.classList.toggle("on", i === this.sel);
    });
    this.pinCasa.innerHTML = `<b>Tu casa</b>${m === 0 ? "Aporte inicial" : `Aporte del mes ${m}`}`;
    this.medirPines();
    this.sucursales.forEach((su, i) => (su.partes[1].material as THREE.MeshStandardMaterial).emissive?.setHex(i === this.sel ? 0x222222 : 0x000000));
    this.ev.onMomento?.(this.momento, m, this.ahora);
  }

  reproducir() { if (this.quieto || !this.ok) return; this.reproduciendo = true; this.t0 = performance.now(); }
  get reproduciendoAhora() { return this.reproduciendo; }
  setMomento(f: number) { if (!this.ok) return; this.reproduciendo = false; this.momento = Math.max(0, Math.min(this.cortes - 1, f)); this.textos(); }

  /** Datos nuevos (sliders o formulario): reconstruye la isla, manda camiones y vuelve a reproducir. */
  cargar(nuevo: DatosEscena) {
    if (!this.ok) return;
    this.prepararDatos(nuevo);
    if (this.pines.length !== this.inst.length) this.crearPines();
    this.momento = this.quieto ? this.cortes - 1 : 0;
    this.construir(this.momento, performance.now() / 1000); this.textos();
    this.inst.forEach((_, i) => this.enviar(i, i * 0.12));
    this.reproducir();
  }

  // ---------------------------------------------------------------- selección, foco y zonas
  seleccionar(i: number) {
    if (i === this.sel) return;
    this.sel = i; this.sucursales[i].salto = performance.now() / 1000; this.textos(); this.ev.onSeleccion?.(i);
  }
  enfocar(i: number) {
    this.seleccionar(i); this.enfocado = true;
    this.focoObj.set(this.sucursales[i].g.position.x * 0.85, 0, this.sucursales[i].g.position.z * 0.6);
    this.zoomObj = this.zoomBase * 1.8; this.ev.onEnfoque?.(true);
  }
  soltar() {
    this.enfocado = false; this.focoObj.set(0, 0, 0); this.zoomObj = this.zoomBase;
    this.ev.onEnfoque?.(false); this.marcarZona("todo");
  }
  private marcarZona(z: Zona) { this.pinesDistrito.forEach((pd) => pd.el.classList.toggle("oculto", z !== "todo")); }
  irZona(z: Zona) {
    if (!this.ok) return;
    if (z === "todo") { this.soltar(); return; }
    const Z = ZONAS[z];
    this.marcarZona(z); this.enfocado = true; this.ev.onEnfoque?.(true);
    this.focoObj.set(Z.foco[0] * 0.85, 0, Z.foco[1] * 0.6); this.zoomObj = this.zoomBase * Z.zoom;
    const primero = this.inst.findIndex((d) => Z.tipo && tipoInst(d.nombre) === Z.tipo);
    if (primero >= 0) this.seleccionar(primero);
    if (z === "casa") this.enviarTodos(0.15);
  }
  enfocarNombre(nombre: string) {
    const i = this.inst.findIndex((d) => d.nombre === nombre);
    if (i < 0 || !this.ok) return;
    this.marcarZona("bancos"); // oculta las etiquetas de barrio mientras se mira una sucursal
    this.enfocar(i); this.enviar(i);
  }
  enviar(i: number, retraso = 0) {
    if (this.quieto || this.envios.length >= this.flota.length) return;
    const g = this.flota.find((f) => !this.envios.some((e) => e.g === f))!;
    this.envios.push({ i, t0: performance.now() / 1000 + retraso, g });
  }
  enviarTodos(paso = 0.18) {
    this.inst.forEach((_, i) => this.enviar(i, i * paso));
    this.pinCasa.classList.add("envia"); setTimeout(() => this.pinCasa.classList.remove("envia"), 1200);
  }

  private eventos() {
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), el = this.renderer.domElement;
    const tocar = (ev: PointerEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camara);
      return ray.intersectObjects(this.objetivos)[0];
    };
    const mover = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse") return; // en el teléfono no hay "hover"
      const hit = tocar(ev);
      el.style.cursor = hit ? "pointer" : "default";
      if (!this.enfocado && hit && hit.object.userData.i != null) this.seleccionar(hit.object.userData.i);
    };
    const clic = (ev: MouseEvent) => {
      const hit = tocar(ev);
      this.ev.onToque?.();
      if (!hit) { if (this.enfocado) this.soltar(); return; }
      if (hit.object.userData.casa) { this.enviarTodos(); this.ev.onCasa?.(); return; }
      const i = hit.object.userData.i as number;
      this.enfocar(i); this.enviar(i);
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("click", clic);
    this.limpiar.push(() => { el.removeEventListener("pointermove", mover); el.removeEventListener("click", clic); });
  }

  // ---------------------------------------------------------------- cámara y cuadro
  private ubicar() {
    const w = this.escena.clientWidth, h = this.escena.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    // En pantallas verticales la isla completa queda chica: se acerca un poco más, como en la web móvil.
    const antes = this.zoomBase;
    const aspecto = w / h;
    this.zoomBase = aspecto < 0.8 ? 1.5 : aspecto < 1.3 ? 1.32 : w < 700 ? 1.2 : 1;
    if (this.zoomObj === antes) this.zoomObj = this.zoomBase;
    const { camara, BASE } = this;
    camara.position.copy(BASE).add(this.foco); camara.lookAt(this.foco); camara.updateMatrixWorld();
    const inv = camara.matrixWorldInverse, v = new THREE.Vector3();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < 8; k++) {
      v.set(k & 1 ? 12.6 : -12.6, k & 2 ? 2.6 : -0.6, k & 4 ? 7.4 : -6.2).applyMatrix4(inv);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let mw = (x1 - x0) / 2 * 0.98, mh = (y1 - y0) / 2 * 1.04;
    if (mw / mh > w / h) mh = mw / (w / h); else mw = mh * (w / h);
    Object.assign(camara, { left: cx - mw, right: cx + mw, top: cy + mh, bottom: cy - mh });
    camara.updateProjectionMatrix();
  }

  private antes = performance.now();
  private cuadro() {
    const ms = performance.now(), dt = Math.min(0.05, (ms - this.antes) / 1000); this.antes = ms;
    if (!this.enPantalla || document.hidden) return;
    if (this.reproduciendo) {
      this.momento = Math.min(this.cortes - 1, ((ms - this.t0) / 1000 / DURA) * (this.cortes - 1));
      if (this.momento >= this.cortes - 1) this.reproduciendo = false;
      if (ms - this.ultimoAviso > 150 || !this.reproduciendo) { this.ultimoAviso = ms; this.textos(); }
    }
    const t = ms / 1000;
    this.construir(this.momento, t);
    this.moverEnvios(t);
    this.animarMundo(t, dt);
    this.camiones.forEach((c) => {
      const u = c.userData;
      if (!this.quieto) { u.x += u.dir * u.vel * dt; if (u.x > 11) u.x = -11; if (u.x < -11) u.x = 11; }
      c.position.set(u.x, 0.08, u.z);
    });
    const k = this.quieto ? 1 : 1 - Math.pow(0.002, dt);
    this.foco.lerp(this.focoObj, k);
    const { camara } = this;
    camara.zoom += (this.zoomObj - camara.zoom) * k;
    camara.position.copy(this.BASE).add(this.foco); camara.lookAt(this.foco); camara.updateProjectionMatrix();
    this.sucursales.forEach((su) => {
      const e = su.salto ? t - su.salto : 9;
      su.g.scale.y = 1 + (e < 0.6 ? Math.sin(e * 16) * Math.exp(-e * 6) * 0.12 : 0);
    });
    this.renderer.render(this.scene, camara);
    const w = this.escena.clientWidth, h = this.escena.clientHeight, v = new THREE.Vector3();
    const poner = (el: Pin, x: number, y: number, z: number) => {
      v.set(x, y, z).project(camara);
      const medio = (el._w || 0) / 2 + 10; // la tarjeta nunca se sale de la escena
      el.style.left = Math.min(w - medio, Math.max(medio, ((v.x + 1) / 2) * w)) + "px";
      el.style.top = Math.max((el._h || 0) + 8, ((1 - v.y) / 2) * h) + "px";
    };
    this.inst.forEach((d, i) => {
      const su = this.sucursales[i];
      poner(this.pines[i], su.g.position.x - 0.1, Math.max(su.alto + 0.6, 0.3 + d.ahora!.capas * PH + 0.5), su.g.position.z - 0.3 * su.frente);
    });
    poner(this.pinCasa, this.casa.position.x, 2.1, this.casa.position.z);
    const ALTO_D: Record<string, [number, number, number]> = { bancos: [-3.6, 3.4, 4.2], fondos: [9, 4.9, -2.6], pension: [7.2, 2.6, 3] };
    this.pinesDistrito.forEach(({ z, el }) => poner(el, ...ALTO_D[z]));
  }

  destruir() {
    this.limpiar.forEach((f) => f());
    this.capa.querySelectorAll(".pin").forEach((p) => p.remove());
    if (this.ok) liberar(this.scene, this.renderer);
  }
}

export { clpJs };
