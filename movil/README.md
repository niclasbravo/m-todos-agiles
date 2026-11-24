# ¿Dónde ahorro? — app móvil

Port completo de la app web (Django, carpeta `comparador/`) a una app móvil para Android, con la misma estética y todas las
funcionalidades. Funciona **sin servidor y sin internet**: toda la lógica de cálculo corre en el teléfono.

| | Web (Django) | Móvil |
|---|---|---|
| Interfaz | Plantillas + CSS + JS | React 19 + TypeScript (Vite), mismo CSS y tokens |
| Cálculo | Python en el servidor | TypeScript en el teléfono (`src/logica/`), probado contra Python |
| 3D | three.js desde un CDN | three.js 0.186 empaquetado (funciona sin internet) |
| Tipografías | Google Fonts | Geist y Bricolage Grotesque empaquetadas (`@fontsource`) |
| Contenedor nativo | — | Capacitor 8 (Android; iOS se agrega con `npx cap add ios`) |
| Datos del usuario | `localStorage` | `localStorage` del teléfono, mismas claves (`ahorro_perfil_v1`, `tema`) |

## Cómo demostrarla

**1. En el navegador del computador o del teléfono (lo más rápido)**

```bash
cd movil
npm install
npm run dev
```

Abre la URL que muestra Vite. En el computador la app aparece dentro de un marco de teléfono; desde el teléfono (misma red wifi)
abre la URL «Network» y se ve a pantalla completa. Chrome ofrece «Instalar app» (es una PWA).

**2. Un solo archivo para compartir:** `npm run demo` genera `dist-demo/index.html`, autocontenido (≈1,1 MB). Se abre con doble clic.

**3. APK de Android sin instalar nada:** cada vez que se sube un cambio a `movil/` o `comparador/`, el workflow
`.github/workflows/apk-movil.yml` corre las pruebas y compila el APK. También se puede lanzar a mano desde Actions → «App móvil (APK)» → Run workflow. Se descarga en *Actions → la última ejecución → Artifacts → donde-ahorro-apk*.
En el teléfono: abrir el `.apk` y permitir «instalar apps desconocidas».

**4. Con Android Studio** (emulador o teléfono por USB):

```bash
cd movil
npm install
npm run android      # compila, sincroniza y abre el proyecto en Android Studio → ▶ Run
```

Requiere Android Studio con JDK 21 (viene incluido). Después de cambiar el código web: `npm run sync`.

## Pantallas

- **Simulador**: logotipo 3D (se inclina con el dedo o al inclinar el teléfono), maqueta isométrica con pallets que crecen,
  camiones, monedas, agua, bote, velero y gente; KPIs; línea de tiempo con ▶; zonas Bancos / Fondos / Pensión / Tu casa con su
  tarjeta; tocar una sucursal la enfoca y tocar la casa manda camiones; hoja inferior «Simula con tus números» con sliders que
  recalculan todo en vivo; formulario completo con las mismas validaciones; bloque «¿Y si no lo pones en ninguna parte?» con el
  estante 3D que se vacía al hacer scroll; ranking con barras, montos que cuentan, «Ver detalle» y «Ver en el mapa».
- **Quiz**: una pregunta por pantalla, progreso, avance automático, mini isla 3D que hunde las opciones descartadas («N de 7»
  y el perfil), resumen de respuestas, precarga del perfil guardado y botón para borrarlo. Atajos 1–5 y flechas en computador.
- **Mi plan**: perfil, 3 recomendaciones con medalla, puntaje, razones, desglose y fuente; proyección con gráfico de 4 líneas
  (se recorre con el dedo), ajuste de inflación / horizonte / aporte, tabla de datos, fórmula, textos del DAP y del APV;
  bloque sin invertir; descartes con motivo; «Ver cuánto podría crecer» lleva al simulador con las recomendadas destacadas.
- **Tema claro / oscuro** (sigue al sistema hasta que se elige) y barra de estado del color del tema.

Agregados propios del teléfono: botón atrás de Android (cierra la hoja, retrocede en el quiz, vuelve al simulador), vibración
corta al elegir, montos rápidos en el quiz, ▶ en el estante, compartir el plan con la hoja nativa, coma decimal en la inflación,
y aviso claro si el teléfono no tiene WebGL (los números siguen disponibles).

## Pruebas

```bash
npm test          # reglas de negocio (port de comparador/tests.py) + paridad si existe tests/paridad.json
npm run paridad   # genera tests/paridad.json con Python (no necesita Django) y compara
```

La prueba de paridad ejecuta la lógica Python de la web sobre **4.254 casos** (420 simulaciones con escena 3D, 810 perfiles
del quiz y 3.024 proyecciones con su gráfico) y exige que la app móvil produzca exactamente los mismos textos y cifras.
Para lograrlo, `src/logica/formatos.ts` redondea como Python («mitad al par»): `toFixed` de JavaScript daría «2,3%» donde la
web muestra «2,2%».

## Estructura

```
movil/
  src/logica/       instrumentos, recomendador, proyeccion, graficos, escena, formularios, formatos (port 1:1 de Python)
  src/escenas3d/    mapa.ts (maqueta), estante.ts (sin invertir), isla.ts (quiz), comun.ts
  src/ui/           App (pestañas), Simulador, Mapa, SinInvertir, Quiz, Resultado, Proyeccion, comunes, iconos
  src/estilos.css   tokens y componentes de base.html adaptados al teléfono
  src/nativo.ts     Capacitor: vibración, barra de estado, botón atrás, compartir
  src/almacen.ts    perfil y tema en el teléfono
  tests/            logica.test.ts, paridad.test.ts
  scripts/          generar_paridad.py
  android/          proyecto nativo de Capacitor (íconos y splash propios)
  demo/             donde-ahorro.html (la app en un solo archivo) y demo-app-movil.mp4 (recorrido grabado)
```

Si cambian tasas o reglas en `comparador/`, hay que replicarlas en `src/logica/` y correr `npm run paridad`.
