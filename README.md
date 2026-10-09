# Cabidas presupuestales · Fase 1

MVP web para convertir indicadores históricos de costos en escenarios de cabida comparables, editables y trazables. El cálculo reproduce las sensibilidades 2 y 3 de `INDICADORES.xlsx` sin presentar el resultado como presupuesto aprobado ni como validación normativa.

## Qué incluye

- Importación local de las hojas exactas `Indicadores costos`, `Ppto ` y `Presentacion`.
- Catálogo completo de **45 indicadores** de Serraclara, Arbore, Rocca, Oficinas Rocca, Urbanismo Casas, Oficinas T6 y Pinar VIS.
- Lectura de fórmulas y valores cacheados sin modificar el archivo original.
- Motor determinista por capítulos: Torres VIS, Torres No VIS, parqueaderos, zonas comunes, urbanismo interno y preliminares.
- Administración y gastos generales configurable.
- Urbanismo externo separado, con inclusión explícita y sin doble conteo.
- Creación de presupuestos con áreas manuales o importadas, mezcla de referentes, duplicación y edición de partidas.
- Guardado de presupuestos como proyectos activos, con edición, eliminación y restauración al volver a abrir el navegador.
- Resumen ejecutivo dinámico para cada proyecto histórico o activo, con métricas y gráficas comparativas.
- Análisis inteligente local con recomendaciones, aclaraciones y puntos de revisión para el contexto colombiano.
- Informe ejecutivo descargable en PDF A4 con cifras, partidas, gráficas y análisis.
- Selección inicial explicable de un referente por capítulo y posibilidad de cambiarlo para recalcular inmediatamente.
- Separación entre indicadores completos seleccionables, desgloses parciales, administración mensual y conceptos pendientes de homologación.
- Trazabilidad por proyecto, hoja y celda de origen.
- Alertas de consistencia, contexto técnico y conciliación contra el Excel.
- Exportación CSV del detalle calculado e informe ejecutivo en PDF.

## Desarrollo local

Requiere Node.js 22 o superior.

```bash
npm install
npm run dev
```

La aplicación queda disponible en la dirección que indique Vite, normalmente `http://localhost:5173`.

## Flujo de uso

1. En **Indicadores**, consulta las 45 filas de la biblioteca y sus cuadros por proyecto referente.
2. Pulsa **Nuevo presupuesto**, escribe el nombre y el área total, e ingresa las cantidades manualmente o con la plantilla de áreas.
3. Revisa o cambia el proyecto referente y el indicador de cada partida; la tarifa y el total se recalculan inmediatamente.
4. Pulsa **Guardar como proyecto activo**. El proyecto aparecerá en los selectores y tendrá su propio resumen ejecutivo.
5. Desde el resumen puedes **analizar**, **editar**, **eliminar** o **exportar el informe PDF**.
6. En **Importar Excel**, carga el formato actual de `INDICADORES.xlsx` para reemplazar el catálogo y los escenarios de fuente.

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
├── components/ Interfaz del editor y del resumen ejecutivo
├── data/       Datos iniciales conciliados
├── domain/     Cálculo, análisis y persistencia local
├── import/     Parser XLSX e importadores
├── reports/    Generación del informe PDF
├── utils/      Formato y exportación CSV
├── App.tsx     Flujo principal del MVP
└── styles.css  Sistema visual responsive
```

## Decisiones del piloto

- La moneda oficial del piloto es **COP**, confirmada por el responsable del proyecto; el símbolo `$` del libro se interpreta con ese código.
- `Ppto ` es la fuente de los escenarios; `Indicadores costos` aporta las tarifas y `Presentacion` aporta mezcla, áreas vendibles y urbanismo externo.
- La aplicación recalcula `cantidad × (tarifa base + ajuste)` y concilia el resultado; no ejecuta fórmulas arbitrarias del libro.
- Solo se procesan las tres hojas permitidas. Nombres definidos heredados, vínculos externos, dibujos y macros se ignoran.
- Los proyectos activos y sus tarifas se guardan en `localStorage` del navegador; cada partida conserva un snapshot para no cambiar al recargar o importar otro catálogo.
- El análisis inteligente actual es determinístico y usa solo los datos cargados. No consulta precios, índices ni normas en tiempo real y no debe interpretarse como validación profesional.
- Autenticación, permisos, base de datos multiusuario e integración con un proveedor de IA mediante un servidor seguro quedan para una fase posterior.

## Alcance del resultado

Las alternativas son hipótesis presupuestales sujetas a revisión de Presupuestos, Diseño y Planeación. La herramienta no valida POT, licencias, aislamientos, parqueaderos mínimos, estructuras, redes, rentabilidad ni compra del lote.
