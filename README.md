# Cabidas presupuestales · Fase 1

MVP web para convertir indicadores históricos de costos en escenarios de cabida comparables, editables y trazables. El cálculo reproduce las sensibilidades 2 y 3 de `INDICADORES.xlsx` sin presentar el resultado como presupuesto aprobado ni como validación normativa.

## Qué incluye

- Importación local de las hojas exactas `Indicadores costos`, `Ppto ` y `Presentacion`.
- Catálogo completo de **45 indicadores**, agrupado y filtrable por vivienda en torre, oficinas y casas.
- Lectura de fórmulas y valores cacheados sin modificar el archivo original.
- Motor determinista por capítulos: Torres VIS, Torres No VIS, parqueaderos, zonas comunes, urbanismo interno y preliminares.
- Administración y gastos generales configurable.
- Urbanismo externo separado, con inclusión explícita y sin doble conteo.
- Escenarios 2 y 3 precargados, captura manual de áreas, creación de escenarios, duplicación y comparación.
- Selección inicial explicable de un referente por capítulo y posibilidad de cambiarlo para recalcular inmediatamente.
- Separación entre indicadores completos seleccionables, desgloses parciales, administración mensual y conceptos pendientes de homologación.
- Trazabilidad por proyecto, hoja y celda de origen.
- Alertas de consistencia, contexto técnico y conciliación contra el Excel.
- Exportación CSV del detalle calculado.

## Desarrollo local

Requiere Node.js 22 o superior.

```bash
npm install
npm run dev
```

La aplicación queda disponible en la dirección que indique Vite, normalmente `http://localhost:5173`.

## Flujo de uso

1. En **Indicadores**, consulta las 45 filas de la biblioteca por tipo de proyecto y proyecto referente.
2. En **Escenarios**, crea un escenario manual o edita uno importado y diligencia sus áreas.
3. Revisa el referente sugerido en cada capítulo. El selector permite sustituirlo y recalcula tarifa, trazabilidad y total.
4. En **Importar Excel**, carga el formato actual de `INDICADORES.xlsx`; `Ppto ` aporta las áreas por capítulo y `Presentacion` las viviendas, áreas vendibles y urbanismo externo.

## Validación

```bash
npm test
npm run build
```

Para ejecutar también la prueba de integración contra un libro real:

```bash
INDICADORES_XLSX_PATH=/ruta/INDICADORES.xlsx npm test
```

Los oráculos principales son:

| Escenario | Presupuesto base | Costo por m² construido |
|---|---:|---:|
| Escenario 2 | $157.417.838.654,76 | $2.954.209,66 |
| Escenario 3 | $153.089.553.978,72 | $2.872.982,14 |

## Estructura

```text
src/
├── data/       Datos iniciales conciliados
├── domain/     Tipos y motor puro de estimación
├── import/     Parser XLSX e importador del libro
├── utils/      Formato y exportación CSV
├── App.tsx     Flujo e interfaz del MVP
└── styles.css  Sistema visual responsive
```

## Decisiones del piloto

- La moneda oficial del piloto es **COP**, confirmada por el responsable del proyecto; el símbolo `$` del libro se interpreta con ese código.
- `Ppto ` es la fuente de los escenarios; `Indicadores costos` aporta las tarifas y `Presentacion` aporta mezcla, áreas vendibles y urbanismo externo.
- La aplicación recalcula `cantidad × (tarifa base + ajuste)` y concilia el resultado; no ejecuta fórmulas arbitrarias del libro.
- Solo se procesan las tres hojas permitidas. Nombres definidos heredados, vínculos externos, dibujos y macros se ignoran.
- La interfaz es un piloto local. Autenticación, permisos, base de datos corporativa, PDF/Excel de salida e IA asistida quedan para las siguientes fases.

## Alcance del resultado

Las alternativas son hipótesis presupuestales sujetas a revisión de Presupuestos, Diseño y Planeación. La herramienta no valida POT, licencias, aislamientos, parqueaderos mínimos, estructuras, redes, rentabilidad ni compra del lote.
