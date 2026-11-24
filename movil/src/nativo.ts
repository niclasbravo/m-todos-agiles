/**
 * Puente con Android/iOS (Capacitor). En el navegador todo esto degrada a lo que exista (o a nada).
 * - Vibración corta al elegir opciones y botones importantes.
 * - Color de la barra de estado según el tema.
 * - Botón «atrás» de Android: cierra hojas, retrocede en el quiz o vuelve al simulador.
 * - Compartir la recomendación con la hoja nativa.
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export const esNativo = Capacitor.isNativePlatform();

export function vibrar(fuerte = false) {
  if (esNativo) Haptics.impact({ style: fuerte ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
  else if ("vibrate" in navigator) try { navigator.vibrate(fuerte ? 14 : 8); } catch { /* sin vibración */ }
}

export function barraDeEstado(oscuro: boolean) {
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", oscuro ? "#0b0b0c" : "#f2f4f7");
  if (!esNativo) return;
  StatusBar.setStyle({ style: oscuro ? Style.Dark : Style.Light }).catch(() => {});
}

/** Pila de manejadores del botón atrás: el último registrado responde primero; si devuelve false, sigue el siguiente. */
const pila: (() => boolean)[] = [];
export function alVolver(fn: () => boolean): () => void {
  pila.push(fn);
  return () => { const i = pila.lastIndexOf(fn); if (i >= 0) pila.splice(i, 1); };
}
function volver(): boolean {
  for (let i = pila.length - 1; i >= 0; i--) if (pila[i]()) return true;
  return false;
}

export function iniciarNativo() {
  if (esNativo) {
    App.addListener("backButton", () => { if (!volver()) App.exitApp(); });
    SplashScreen.hide().catch(() => {});
  }
  // En el navegador, Escape hace lo mismo que el botón atrás (útil para la demo en computador).
  addEventListener("keydown", (ev) => { if (ev.key === "Escape") volver(); });
}

export async function compartir(titulo: string, texto: string): Promise<"ok" | "copiado" | "no"> {
  try {
    if (esNativo || (await Share.canShare()).value) { await Share.share({ title: titulo, text: texto, dialogTitle: titulo }); return "ok"; }
  } catch (e) {
    if (String(e).includes("cancel")) return "ok";
  }
  try { await navigator.clipboard.writeText(texto); return "copiado"; } catch { return "no"; }
}
