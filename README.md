# Ahorro Chile
 
Simulador y comparador de opciones de ahorro e inversión en Chile, pensado para quienes ahorran por primera vez.
Es un MVP desarrollado con metodología SCRUM/KANBAN (tablero en Jira) en Django.
 
> Es una herramienta educativa. Las tasas son referenciales y no están garantizadas. No constituye asesoría financiera.

# Problema que busca atacar
 
En Chile se aprende poco sobre finanzas personales en el colegio, y elegir dónde poner la plata por primera vez es confuso:
hay depósitos, cuentas que pagan interés, fondos mutuos y APV, cada uno con montos mínimos, riesgos y plazos distintos.
La app responde tres preguntas básicas:
 
1. ¿Cuánto tendría con cada opción si ahorro durante cierto tiempo?
2. ¿Cuál me conviene según mi situación (ingresos, plazo, tolerancia al riesgo, fondo de emergencia)?
3. ¿Cuánto vale realmente ese dinero una vez descontada la inflación, o si no lo pongo en ninguna parte?
## Crear el entorno virtual (Visual Studio Code)

### Windows

```powershell
python -m venv venv
venv\Scripts\Activate.ps1
```

### macOS / Linux

```bash
python -m venv venv
source venv/bin/activate
```


## Ejecutar
    pip install -r requirements.txt
    python manage.py test
    python manage.py runserver

    Correr en un navegador ' http://127.0.0.1:8000 '

## Funcionalidades
 
| Funcionalidad | Dónde |
|---|---|
| **Simulador**: compara 7 instrumentos con monto inicial, aporte mensual, plazo e inflación | `/` |
| **Quiz de perfil**: 4 preguntas (ingresos, plazo con 5 opciones, reacción a caídas, fondo de emergencia) y el monto | `/recomendador/` |
| **Ranking**: hasta 3 recomendaciones, cada una con 3 o más razones, y lista de descartes con su motivo | `/recomendador/` |
| **Proyección con gráfico**: se elige una recomendación y se ve su evolución con la inflación descontada y aportes mensuales opcionales | `/recomendador/` |
| **¿Y si no lo pones en ninguna parte?**: cuánto poder de compra pierde el dinero guardado sin invertir | en ambas páginas |
| **Perfil guardado solo en el navegador** (`localStorage`): se prellena al volver y se actualiza al responder de nuevo; el servidor no almacena nada | quiz |
 
El gráfico muestra cuatro líneas: valor con la rentabilidad de la opción (azul), valor descontando la inflación (roja),
lo que pone la persona (gris, discontinua) y lo que valdría el dinero guardado sin invertir (ámbar, punteada).
 
## Instrumentos incluidos
 
| Instrumento | Riesgo | Tasa usada | Origen de la tasa |
|---|---|---|---|
| Cuenta Vista Más (Banco Consorcio) | muy bajo | TPM + 0,5% anual | contratada |
| DAP 30 días (Banco Ripley) | muy bajo | 0,41% mensual | publicada (tasas.cl) |
| Visión Money Market (Principal AGF) | bajo | promedio anual de 3 años (14,23% acumulado) | histórica (Rankia, 23-09-2026) |
| Progresión Deuda Largo Plazo (Principal AGF) | medio | promedio anual de 3 años (23,55% acumulado) | histórica (Rankia, 23-09-2026) |
| Cartera Equilibrada (Principal AGF) | medio-alto | promedio anual de 3 años (37,79% acumulado, 11,3% anual) | histórica (Rankia, 23-09-2026) |
| Capitales Acciones Chilenas (Principal AGF) | alto | promedio anual de 3 años (59,83% acumulado, 16,9% anual) | histórica (Rankia, 23-09-2026) |
| APV régimen A | medio-alto | 7% anual + bono del Estado | supuesto del equipo |

## Cómo funciona
 
**Descartes.** Antes de puntuar, se descarta con motivo visible: monto menor al mínimo, plazo más corto que el mínimo del producto,
riesgo mayor al que tolera la persona, y APV si no tiene fondo de emergencia. El riesgo máximo es el menor entre lo que la persona
dice soportar y lo que permiten sus ingresos.
 
**Puntaje (0 a 100).** Combina rentabilidad efectiva, calce entre el riesgo y el plazo, y liquidez. Pesos habituales: 35%, 40% y 25%.
Sin fondo de emergencia la liquidez pesa 45%.
 
**Proyección.** Interés compuesto mensual, con los aportes al final de cada mes. Sin aportes equivale a `monto × (1 + tasa)^años`
(hay una prueba que lo verifica). El valor real es el nominal dividido por `(1 + inflación)^años`, es decir, en pesos de hoy.
 
**APV régimen A.** El Estado bonifica el 15% de lo aportado en el año, con un tope de 6 UTM por año. El bono se suma al cumplir
cada año completo. Se usa la UTM de noviembre de 2026 ($72.440, tope de $434.640).
 
**Depósitos a plazo y aportes mensuales.** A un depósito ya abierto no se le puede agregar dinero. Por eso, en el modelo,
cada aporte mensual es un depósito nuevo con el monto mínimo del producto ($10.000). Si el aporte es menor, se acumula sin
ganar interés hasta alcanzar el mínimo. Cuenta Vista, fondos y APV sí aceptan aportes libres.

## Estado de los datos
 
Fecha de la revisión: 2 de noviembre de 2026.
 
| Dato | Estado | Detalle |
|---|---|---|
| TPM 4,5% | Verificado | Banco Central, reunión del 27-10-2026 (vía Rankia) |
| Inflación de referencia | Verificado | IPC de septiembre 2026: 4,1% a 12 meses (INE). La app usa 3% por defecto, ajustable |
| UTM $72.440 (noviembre 2026) | Verificado | calcular.cl. Ver nota abajo sobre el ticket |
| APV régimen A: bono 15% y tope 6 UTM | Verificado | Superintendencia de Pensiones y Rankia |
| Cuenta Vista Más: TPM + 0,5% | Publicado | Rankia, actualizada el 28-09-2026. Falta confirmar en el banco |
| DAP Banco Ripley: 0,41% mensual | Publicado | tasas.cl (sin fecha visible). Chocale informó 0,40% el 22-09-2026. Falta confirmar en el banco |
| Fondos Principal AGF: rentabilidad a 36 meses | Publicado | Rankia, datos al 23-09-2026, para los 4 fondos. Falta confirmar en Principal AGF o la CMF |
| APV: rentabilidad de 7% | Supuesto | Ninguna fuente la publica; se supone un fondo balanceado |
| Plazos mínimos (Cartera 3 años, Capitales 2 años, APV 5 años) y monto mínimo del APV | Supuesto | Definidos por el equipo |
| Monto mínimo por aporte en fondos | Sin verificar | Se supone libre |
 
**Limitación de las fuentes.** Las tasas vienen de sitios comparadores (Rankia, tasas.cl, Chocale) y no directamente del banco ni de la CMF;
confirmarlas en los sitios oficiales queda para el Sprint 2.
 
**Rentabilidad histórica.** Para los fondos se usa el promedio anual de los últimos 3 años. En Cartera Equilibrada (11,3%) y Capitales (16,9%) esos años
pueden haber sido mejores que los próximos, por eso la app lo advierte junto a la recomendación. Las rentabilidades a 12 meses publicadas
(3,40%, 4,68%, 10,79% y 19,72%) están guardadas en el catálogo pero no se usan en el cálculo.
 
**Nota sobre el tope del bono APV.** El ticket de Jira indica $429.894, que equivale a 6 × $71.649 (UTM de julio y agosto de 2026).
La app usa la UTM de noviembre ($72.440 × 6 = $434.640). Falta confirmar con la normativa qué mes de UTM corresponde aplicar.
 
**Retiro anticipado del APV.** Según la Superintendencia de Pensiones, al retirar antes de pensionarse se devuelve a Tesorería el 15% de lo retirado.
La app lo resume como "pierdes el bono" y lo penaliza en liquidez; no calcula el monto exacto de la devolución ni los impuestos.

## Limitaciones conocidas
 
- La rentabilidad se supone constante, algo que no ocurre en fondos ni en renta variable.
- No se descuentan impuestos ni comisiones, salvo el bono del APV.
- Se supone que los depósitos se renuevan a la misma tasa.
- Las tasas están escritas en el código; no se leen de una fuente de datos.
  
## Backlog
 
Ideas para próximos sprints, ordenadas de mayor a menor cercanía al MVP:
 
1. Confirmar los datos marcados "por confirmar" y reemplazar los supuestos por fuentes.
2. Tasas desde una fuente de datos (modelo en el admin o API del Banco Central/CMF) en lugar de estar en el código.
3. Impuestos y comisiones por instrumento (fondos mutuos, APV régimen B).
4. Guías breves: qué es un DAP, un fondo mutuo, el APV, y la diferencia entre ahorro e inversión.
5. Presupuesto y gastos hormiga: registro simple de gastos y suscripciones, y cuánto significarían ahorrados durante un año.
6. Costo de vida estudiantil: presupuesto mensual (arriendo, transporte, alimentación) y cuánto se puede ahorrar al mes.
