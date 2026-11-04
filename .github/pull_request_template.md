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

El CI corre solo en el PR: formato, lint, tipos, migraciones, pruebas, build y E2E.
