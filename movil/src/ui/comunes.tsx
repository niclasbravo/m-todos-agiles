/** Piezas de interfaz compartidas: errores, contador animado, hoja inferior y logotipo 3D. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { alVolver } from "../nativo";

export function Errores({ lista }: { lista?: string[] }) {
  if (!lista?.length) return null;
  return <ul className="errorlist">{lista.map((e) => <li key={e}>{e}</li>)}</ul>;
}

/** Monto que "cuenta" desde el valor anterior (o desde $0 la primera vez que se ve), como en la web. */
export function Contador({ valor, retraso = 0 }: { valor: number; retraso?: number }) {
  const [mostrado, setMostrado] = useState(0);
  const desde = useRef(0);
  const el = useRef<HTMLElement>(null);
  const visto = useRef(false);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setMostrado(valor); return; }
    let raf = 0, timer = 0;
    const animar = () => {
      const ini = desde.current, t0 = performance.now();
      const paso = (t: number) => {
        const u = Math.min(1, (t - t0) / 900), suave = 1 - Math.pow(1 - u, 3);
        const v = ini + (valor - ini) * suave; setMostrado(v); desde.current = v;
        if (u < 1) raf = requestAnimationFrame(paso);
      };
      timer = window.setTimeout(() => { raf = requestAnimationFrame(paso); }, retraso);
    };
    if (visto.current) { animar(); return () => { cancelAnimationFrame(raf); clearTimeout(timer); }; }
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { visto.current = true; io.disconnect(); animar(); } }, { threshold: 0.2 });
    if (el.current) io.observe(el.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [valor, retraso]);
  return <strong className="monto" ref={el}>{"$" + Math.round(mostrado).toLocaleString("es-CL")}</strong>;
}

/** Hoja que sube desde abajo. El botón atrás de Android y Escape la cierran. */
export function Hoja({ abierta, onCerrar, titulo, children }: { abierta: boolean; onCerrar: () => void; titulo: string; children: React.ReactNode }) {
  const [montada, setMontada] = useState(abierta);
  const [cerrando, setCerrando] = useState(false);
  useEffect(() => {
    if (abierta) { setMontada(true); setCerrando(false); return alVolver(() => { onCerrar(); return true; }); }
    if (montada) { setCerrando(true); const t = setTimeout(() => { setMontada(false); setCerrando(false); }, 200); return () => clearTimeout(t); }
  }, [abierta]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!montada) return null;
  // Portal al armazón: dentro de una pantalla con transform, position:fixed quedaría atrapado bajo las pestañas.
  return createPortal(<>
    <div className={"velo" + (cerrando ? " cerrando" : "")} onClick={onCerrar} />
    <div className={"hoja" + (cerrando ? " cerrando" : "")} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="asa" />
      <div className="hoja-cab"><h2>{titulo}</h2><button type="button" className="cerrar" aria-label="Cerrar" onClick={onCerrar}>×</button></div>
      {children}
    </div>
  </>, document.querySelector(".app") ?? document.body);
}

/** Logotipo «¿Dónde ahorro?» con relieve: se inclina con el dedo, el mouse o al inclinar el teléfono. */
export function Marca3D() {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let mx = 0, my = 0, rx = 0, ry = 0, vrx = 0, vry = 0, raf = 0, antes = performance.now();
    const puntero = (ev: PointerEvent) => { mx = (ev.clientX / innerWidth - 0.5) * 2; my = (ev.clientY / innerHeight - 0.5) * 2; };
    const giro = (ev: DeviceOrientationEvent) => {
      if (ev.gamma == null || ev.beta == null) return;
      mx = Math.max(-1, Math.min(1, ev.gamma / 25)); my = Math.max(-1, Math.min(1, (ev.beta - 45) / 25));
    };
    addEventListener("pointermove", puntero); addEventListener("deviceorientation", giro);
    const cuadro = (t: number) => {
      const dt = Math.min(0.05, (t - antes) / 1000); antes = t;
      vrx += ((-my * 6 - rx) * 60 - vrx * 12) * dt; rx += vrx * dt;
      vry += ((mx * 10 - ry) * 60 - vry * 12) * dt; ry += vry * dt;
      ref.current?.style.setProperty("--rx", rx.toFixed(2) + "deg"); ref.current?.style.setProperty("--ry", ry.toFixed(2) + "deg");
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => { cancelAnimationFrame(raf); removeEventListener("pointermove", puntero); removeEventListener("deviceorientation", giro); };
  }, []);
  return <p className="marca3d" ref={ref} aria-label="¿Dónde ahorro?"><span className="sig">¿</span>Dónde ahorro<span className="sig">?</span></p>;
}
