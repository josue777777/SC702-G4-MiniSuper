## Reglas del equipo

<!-- Obligatorio: el CI no deja pasar el PR si esta casilla no está marcada. -->

- [ ] Leí y cumplo `CONTRIBUTING.md` (en la raíz del repositorio).

## Qué cambia

<!-- Historia(s) de usuario y una descripción corta. Ejemplo: HU-20 — historial de ventas del día. -->

## Cómo se probó

<!-- Pruebas agregadas o corridas. Si cambia una pantalla, una captura ayuda. -->

## Revisión antes de pedir merge

Las reglas completas, con su porqué, están en
`docs/ESCALABILIDAD.md`. Marque solo las que aplican a este
cambio y explique abajo cualquier excepción.

- [ ] Toda tabla raíz nueva lleva `businessId`, y sus relaciones con otras tablas raíz usan FK compuesta `(id, businessId)`.
- [ ] El repositorio se construye con el `businessId` de la sesión y **todas** sus consultas filtran por él (también el SQL directo).
- [ ] El `businessId` sale de la sesión (`businessIdOf(res)`), nunca de la URL ni del cuerpo.
- [ ] El stock solo cambia dentro de los repositorios y deja su `InventoryMovement`.
- [ ] Lo que mueve dinero o stock va en una transacción, con una condición que impide el negativo, y sin llamar servicios externos dentro.
- [ ] Los documentos son cabecera + líneas; lo confirmado no se edita, se corrige con un ajuste. Los consecutivos salen de `nextDocumentNumber`.
- [ ] El dinero va en `Decimal` (o centavos enteros), nunca en `float`.
- [ ] Permisos y límites se validan en el servidor (la pantalla solo oculta).
- [ ] Lo que tiene historia se desactiva, no se borra.
- [ ] Cada cambio de base tiene su migración; cada regla nueva, su prueba (y si cruza negocios, una de aislamiento).

### Si cambia una pantalla

Reglas completas, con ejemplos, en `docs/PANTALLAS.md` (al final hay una
lista de revisión más larga).

- [ ] La pantalla abre mostrando la lista; crear o editar se hace en un `Modal`.
- [ ] Las listas usan `Pagination`; si van a crecer a miles de filas (ventas, movimientos, detalle de reportes), se paginan en el servidor.
- [ ] Las listas que pueden pasar de 20 filas tienen buscador, y filtra mientras se escribe (sin botón «Buscar»).
- [ ] Los filtros se aplican solos (sin botón de consultar), muestran los errores junto al campo y no consultan con datos inválidos.
- [ ] Filtros y botones usan los estilos compartidos (`.filter-bar`, `.toolbar__filter`, `.button`), no estilos nuevos.
- [ ] Si cambia el diseño: la justificación está en este PR y el cambio se aplicó en **todo** el sistema (o se ajustó a lo que ya existe). No queda una parte distinta.
- [ ] Los reportes muestran cifras y gráficos; el detalle va en «Ver detalle» y completo en el PDF y el Excel.
- [ ] Lo secundario va plegado; los avisos aparecen solo cuando aplican.
- [ ] No se quitó ningún criterio de aceptación: se reordenó, y la prueba E2E de la historia se ajustó.

El CI corre solo en el PR: formato, lint, tipos, migraciones, pruebas, build y E2E.
