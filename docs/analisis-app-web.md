# Análisis de la app web «¿Dónde ahorro?» (Ahorro Chile)

Revisión hecha el 22-11-2026 sobre el contenido de esta carpeta (último commit `d867a51`, «Agrega al README la sección Fuentes…»).
La app se levantó localmente con `python manage.py runserver` y sus 50 pruebas pasan (`python manage.py test`).

## 1. Qué es

Simulador y comparador de opciones de ahorro e inversión en Chile para quien ahorra por primera vez. MVP educativo hecho
con SCRUM/Kanban (tablero en Jira). Publicado en <https://dondeahorro.pythonanywhere.com>. No es asesoría financiera.

Responde tres preguntas:
1. ¿Cuánto tendría con cada opción si ahorro durante cierto tiempo? → **Simulador** (`/`)
2. ¿Cuál me conviene según mi situación? → **Quiz de perfil + ranking** (`/recomendador/`)
3. ¿Cuánto vale realmente ese dinero con inflación, o si no lo invierto? → **Proyección** y bloque **«¿Y si no lo pones en ninguna parte?»**

## 2. Stack y estructura

| Pieza | Detalle |
|---|---|
| Backend | Django 5 (`Django>=5.0,<6`), sin base de datos (`DATABASES = {}`), sin modelos, sin estáticos propios |
| Frontend | Plantillas Django + CSS propio en `base.html` + JS sin framework |
| 3D | three.js 0.186.0 desde el CDN jsdelivr (`RoundedBoxGeometry`, `RoomEnvironment`) |
| Fuentes | Google Fonts: *Geist* 400/500/700 (texto) y *Bricolage Grotesque* 800 (titulares/números grandes) |
| Estado del usuario | Solo en el navegador: `localStorage["ahorro_perfil_v1"]` (perfil) y `localStorage["tema"]` (claro/oscuro) |
| Config | `config/settings.py`: `DEBUG` se apaga solo si existe `DJANGO_SECRET_KEY`; `ALLOWED_HOSTS` por variable; `es-cl`, `America/Santiago` |

```
config/            settings.py, urls.py (incluye comparador.urls), wsgi.py
comparador/
  instruments.py   catálogo de 7 instrumentos + motor de cálculo (trayectoria, simular, comparar, sin_invertir)
  recomendador.py  preguntas del quiz, perfil, descartes, puntaje y razones
  proyeccion.py    proyección de una recomendación (textos + datos del gráfico + tabla)
  graficos.py      geometría del gráfico SVG (ejes "bonitos", etiquetas, separación de etiquetas, hover)
  forms.py         SimuladorForm, QuizForm, AjusteProyeccionForm (validaciones)
  views.py         simulador (HTML o JSON con ?formato=json), quiz; barrio() arma los datos de la escena 3D
  urls.py          "" → simulador, "recomendador/" → quiz
  tests.py         50 pruebas (criterios de aceptación CA1–CA8, gráfico, vistas, sin invertir, aportes)
  templates/comparador/
    base.html          layout, tokens de diseño, tema claro/oscuro, todo el CSS común
    simulador.html     formulario + ranking + supuestos
    _mapa3d.html       hero con la maqueta 3D (≈770 líneas de JS)
    _sin_invertir.html bloque de inflación + estante 3D
    quiz.html          quiz en pasos + mini isla 3D + resultado
    _proyeccion.html   gráfico SVG + ajuste + tabla
```

## 3. Datos y constantes (`instruments.py`)

- `TPM = 4.5` (% anual, reunión BCCh 27-10-2026) · `UTM = 72_440` (nov-2026) · `INFLACION_DEFECTO = 3.0`
- APV régimen A: `BONO_APV_PORCENTAJE = 0.15`, `TOPE_BONO_APV_UTM = 6` → tope $434.640 al año
- `RIESGO_TXT = {1: muy bajo, 2: bajo, 3: medio, 4: medio-alto, 5: alto}`
- `ORIGEN_TXT`: `contratada`, `promedio_3a`, `ficha_12m`, `supuesto`

Conversión de tasas: `anual_desde_nominal(n) = (1+n/100/12)^12-1`, `anual_desde_mensual(m) = (1+m/100)^12-1`,
`promedio_anual(acum, 3) = (1+acum/100)^(1/3)-1` (promedio geométrico).

| id | Nombre | Riesgo | Monto mín. | Plazo mín. | Rescate | Tasa anual | Origen | Especial |
|---|---|---|---|---|---|---|---|---|
| `cuenta_vista_mas` | Cuenta Vista Más (Banco Consorcio) | 1 | $0 | 0 m | 0 d | ≈5,12% (TPM+0,5 nominal) | contratada | garantía estatal |
| `dap_ripley_30` | DAP 30 días (Banco Ripley) | 1 | $10.000 | 1 m | 30 d | ≈5,03% (0,41% mensual) | contratada | `deposito_nuevo_por_aporte`, garantía estatal |
| `vision_money_market` | Visión Money Market (Principal AGF) | 2 | $5.000 | 1 m | 1 d | ≈4,5% (14,23% a 36 m) | promedio_3a | |
| `progresion_deuda_lp` | Progresión Deuda Largo Plazo (Principal AGF) | 3 | $5.000 | 6 m | 10 d | ≈7,3% (23,55%) | promedio_3a | |
| `cartera_equilibrada` | Cartera Equilibrada (Principal AGF) | 4 | $5.000 | 36 m | 10 d | ≈11,3% (37,79%) | promedio_3a | |
| `capitales_acciones_chilenas` | Capitales Acciones Chilenas (Principal AGF) | 5 | $5.000 | 24 m | 10 d | ≈16,9% (59,83%) | promedio_3a | |
| `apv_a` | APV régimen A | 4 | $5.000 | 60 m | 10 d | 7,0% | supuesto | `apv`, `penaliza_retiro`, `exige_fondo_emergencia` |

Cada instrumento trae además `liquidez` (texto), `nota` y `fuente` (texto largo con la fuente y su fecha).

## 4. Motor de cálculo

**`trayectoria(inicial, aporte, meses, tasa_anual, inflacion, apv=False, aporte_min=0)`** — valor mes a mes (0…meses):
- tasa mensual `i = (1+tasa)^(1/12) - 1`; cada mes: `saldo *= 1+i`, luego se suma el aporte (al final del mes).
- **DAP**: con `aporte_min > 0` el aporte se acumula en `pendiente` (sin interés) hasta llegar al mínimo de $10.000 y recién ahí entra al saldo.
- **APV**: cada 12 meses se suma `bono_apv(aportes del año)` = `min(15% × aportes, 6 UTM)`; el monto inicial cuenta como aporte del primer año.
- deflactor `(1+inflación)^(mes/12)`; cada punto trae `nominal`, `real`, `aportado`, `bono`, `sin_interes`, `efectivo_real` (lo aportado guardado sin invertir, en pesos de hoy).

**`simular`** = último punto. **`comparar`** = simular para los 7 instrumentos + textos formateados + porcentajes de barra
(`pct_aportado`, `pct_ganancia`, `pct_real` respecto del máximo final). **`sin_invertir`** = trayectoria con tasa 0:
pérdida de poder de compra, % perdido, y cuánto costaría en el futuro lo que hoy cuesta $10.000.

Formatos: `clp(n)` → `$1.234.567`; `pct_txt(n)` → `4,5` (un decimal con coma).

## 5. Recomendador (`recomendador.py`)

Preguntas (`PREGUNTAS`):
1. Ingresos: `bajos` (Bajos o variables…), `medios`, `altos`
2. Plazo (`PLAZOS`, con `meses_max` y `meses_ref`): `menos_6m` (6/3), `6_12m` (12/9), `1_3a` (36/24), `3_5a` (60/48), `mas_5a` (∞/84)
3. Reacción a una caída del 10%: `vender`, `esperar`, `aportar`
4. Fondo de emergencia de 3 meses: `no`, `parcial`, `si`
5. Monto (entero ≥ 1)

Perfil: `riesgo_max = min(TOLERANCIA_CAIDA[caida] {vender 2, esperar 4, aportar 5}, CAPACIDAD_INGRESOS[ingresos] {bajos 3, medios 4, altos 5})`;
nombre Conservador (≤2), Moderado (3–4), Agresivo (5).

Descartes (cada uno con su frase): monto < mínimo · `meses_max <= plazo_min_meses` · riesgo > `riesgo_max` · APV sin fondo de emergencia.

Puntaje 0–100 = pesos × (rentabilidad, calce, liquidez):
- rentabilidad = tasa efectiva / mejor tasa viable × 100 (proyección con el monto y `meses_ref`, sin aportes ni inflación)
- calce = `100 - 25 × |riesgo - min(RIESGO_IDEAL_PLAZO, riesgo_max)|` (ideal por plazo: 1,2,3,4,5)
- liquidez = 15 si penaliza retiro; 100 si rescate inmediato; si no `max(20, 100 - 2×días)`
- pesos normales 35/40/25; sin fondo de emergencia 25/30/45
- orden: puntaje desc, riesgo asc, nombre; top 3 con ≥ 3 razones cada una; el resto viable va a «otras viables».
- nota extra si no tiene fondo de emergencia.

## 6. Proyección y gráfico

`armar_proyeccion(inst, monto, meses, inflación, aporte)` arma: resumen, frase de poder de compra (gana/pierde), fórmula
(`$X × (1 + t%)^años` o explicación con aportes), texto especial del DAP (aportes bajo el mínimo esperan sin interés,
«cada N meses»), texto del bono APV, tabla por hitos y el bloque sin invertir.

`construir_grafico` (SVG 600×340, márgenes 62/138/14/46): eje Y con pasos «bonitos» (1, 2, 2,5, 5, 10 × 10^k) y etiquetas
cortas (`$5,25 M`, `$800 mil`); eje X en meses o años (pasos 1,2,3,6,12,24,36,60,120 con ≤ 7 marcas); 4 polilíneas
(nominal dorada, real roja, aportado gris discontinua, guardado sin invertir verde azulada punteada); etiquetas finales
separadas para no encimarse; círculos con `<title>` para hover.

## 7. Pantallas y comportamiento del front

**Base**: barra superior con «¿Dónde ahorro?», links Simulador / Quiz de perfil y botón de tema (luna/sol animados).
Tema: sigue al sistema hasta que se elige; se guarda en `localStorage.tema` (`claro`/`oscuro`).

**Simulador (`/`)**
- *Hero 3D* (`_mapa3d.html`): isla isométrica con calle, árboles, tu casa, 7 sucursales (bancos azules adelante-izquierda,
  fondos verdes atrás, APV naranja adelante-derecha), torre de la bolsa, barrio de casas, plaza, agua facetada con olas,
  espuma, crestas, muelle, bote, velero, gente caminando, nubes y camiones. En el patio de cada sucursal se apilan
  pallets (gris-azulado = lo que pones, dorado = ganancia), hasta 45 por sucursal, cayendo con animación.
- Logotipo 3D «¿Dónde ahorro?» en CSS que se inclina hacia el puntero; tarjeta hero con CTA «Simular con mis números» y «Responde el quiz».
- KPIs: Lo que pones, Mejor opción, Ganancia de la mejor, Valor real de la mejor.
- Línea de tiempo: botón ▶ (6 s), slider de 12 cortes, hitos Hoy/Año N. Arranca sola al verse.
- Pines flotantes con monto por sucursal; el seleccionado muestra ganancia, valor real y riesgo con un punto «en vivo».
- Hover selecciona, clic enfoca (zoom + «Ver todo el mapa», Esc vuelve). Clic en la casa envía camiones que descargan monedas en todas las sucursales.
- Barra de zonas: Todo, Bancos, Fondos, Pensión, Tu casa → cámara al barrio + tarjeta con explicación y montos.
- Panel «Simula con tus números» (sliders inicial 0–10 M paso 50 mil, aporte 0–1 M paso 10 mil, plazo 1–10 años) que pide `?formato=json` y reconstruye la isla.
- Formulario completo (inicial, aporte, plazo + unidad años/meses, inflación) con validaciones: máximo 480 meses, no ambos en 0.
- Bloque «sin invertir» con estante 3D: el scroll hace pasar los meses y los 10 productos desaparecen según el poder de compra.
- Ranking ordenado por monto final: posición, pictograma (banco/fondo/pensión), monto que cuenta, barra (pones + ganancia + marca del valor real), frase, «Ver detalle» y «Ver en el mapa». Insignia «Recomendada para ti» si viene del quiz (`?destacar=`).
- «Supuestos y límites» desplegable; aviso de perfil guardado con link a la recomendación.

**Quiz (`/recomendador/`)**
- Sin JS: formulario completo. Con JS: una pregunta por pantalla, barra de progreso dorada, avance automático a los 280 ms,
  atajos 1–5 y flechas, botón Atrás/Siguiente, número grande para el monto.
- Columna «Tu perfil» con resumen en vivo y mini isla 3D: las 7 sucursales se hunden y se apagan al quedar descartadas
  (mismas reglas que el servidor), con el contador «N de 7» y el perfil (Conservador/Moderado/Agresivo).
- Con perfil guardado: precarga las respuestas y muestra «Ver mi recomendación con este perfil» y «Borrar mi perfil».

**Resultado**
- Perfil y monto; 3 tarjetas con medalla oro/plata/bronce, «Puntaje N de 100» con barra, razones, desglose y fuente; botón «Ver proyección de esta opción».
- Bloque sin invertir, proyección (gráfico + ajuste de inflación/horizonte/aporte con validaciones + tabla «Ver los datos del gráfico»), avisos, descartadas con motivos, otras viables.
- «Ver cuánto podría crecer» → simulador con monto, plazo de referencia en meses y las recomendadas destacadas; «Actualizar mis respuestas».
- Guarda/actualiza el perfil en `localStorage` y lo informa («Guardamos tu perfil en este navegador…»).

## 8. Lenguaje visual

Tokens (`:root`) claro → oscuro: ground `#f2f4f7`→`#0b0b0c`, surface `#fff`→`#151517`, raised `#eef0f3`→`#1f1f22`,
border `#e4e7ec`→`#2a2a2e`, text `#0a0a0a`→`#f5f5f5`, muted `#5f6368`→`#b4b4b4`, primary `#141414`→`#f5f5f5`,
hue `#9a6c00`→`#e0b347`, positive, negative `#c4242a`→`#ff7b71`, real (rojo), serie-pones `#3b6aa8`, serie-gana `#b37a00`,
efectivo `#0f766e`→`#4fb8ac`. Acento dorado `#d99a00` / `#f2b937`. Cielo del mapa `#c4e0ee`, agua `#bcdcec`.
Radios 6–14 px, sombras suaves `0 10px 30px rgba(15,23,42,.10)`, curva `cubic-bezier(.23,1,.32,1)`, números tabulares,
botones con escala 0,97 al presionar, respeto por `prefers-reduced-motion`, objetivos táctiles ≥ 44 px.

## 9. Pruebas existentes (50)

Criterios de aceptación CA1–CA8 (perfiles conservador/agresivo, descarte de APV sin colchón, monto mínimo, motivo por
descarte, máximo 3 recomendaciones con ≥ 3 razones en todas las combinaciones, bono APV, proyección), geometría del
gráfico, vistas HTML/JSON, bloque sin invertir y regla de aportes del DAP.

## 10. Observaciones

- Depende de dos CDN (jsdelivr y Google Fonts): sin internet no hay 3D ni tipografía.
- Las tasas están escritas en el código (lo reconoce el backlog).
- En `base.html` algunas reglas se repiten (`.detalle`, `.insignia`): la segunda gana.
- En pantallas angostas el hero pasa a flujo normal y la escena queda en 380 px de alto; el ranking y el bloque de inflación se revelan con el scroll.
- Todo el cálculo vive en Python; para una app móvil sin servidor hay que portarlo (ver `movil/`).
