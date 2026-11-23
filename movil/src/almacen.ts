/**
 * Datos guardados solo en el teléfono, con las mismas claves que la web:
 *   - "ahorro_perfil_v1": respuestas del quiz + fecha de actualización.
 *   - "tema": "claro" | "oscuro" (sin elegir, sigue al sistema).
 * Nada sale del dispositivo.
 */
import type { Respuestas } from "./logica/recomendador";

const KEY = "ahorro_perfil_v1";
export const CAMPOS = ["monto", "ingresos", "plazo", "caida", "colchon"] as const;
export type PerfilGuardado = Respuestas & { actualizado?: string };

export function leerPerfil(): PerfilGuardado | null {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}

/** Guarda o actualiza el perfil. Devuelve el mensaje que se muestra al usuario (igual que en la web). */
export function guardarPerfil(nuevo: Respuestas): string {
  const antes = leerPerfil();
  const igual = !!antes && CAMPOS.every((c) => String(antes[c]) === String(nuevo[c]));
  let ok = igual;
  if (!igual) {
    try { localStorage.setItem(KEY, JSON.stringify({ ...nuevo, actualizado: new Date().toISOString() })); ok = true; } catch { ok = false; }
  }
  if (!ok) return "No pudimos guardar tu perfil en este teléfono.";
  return (igual ? "Tu perfil guardado en este teléfono está al día." : antes ? "Actualizamos tu perfil guardado en este teléfono." : "Guardamos tu perfil en este teléfono.")
    + " La app no lo envía a ningún servidor.";
}

export function borrarPerfil() { try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } }

export function fechaLarga(iso?: string): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; }
}

export type Tema = "light" | "dark";
export function temaInicial(): Tema {
  try {
    const t = localStorage.getItem("tema");
    if (t === "claro") return "light";
    if (t === "oscuro") return "dark";
  } catch { /* sin almacenamiento */ }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function guardarTema(t: Tema) { try { localStorage.setItem("tema", t === "dark" ? "oscuro" : "claro"); } catch { /* nada */ } }
export function temaElegido(): boolean { try { return !!localStorage.getItem("tema"); } catch { return false; } }
