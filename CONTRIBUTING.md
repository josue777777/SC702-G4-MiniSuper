# Reglas del equipo

Lectura obligatoria antes de abrir un PR: la plantilla pide confirmarlo y el CI
no deja pasar un PR sin esa confirmación. Valen igual para el código escrito a
mano o con IA (las herramientas de IA las encuentran por `AGENTS.md`, `CLAUDE.md`,
`GEMINI.md` y `.github/copilot-instructions.md`; ver la regla 8). Son pocas a propósito; el detalle y
los ejemplos están en las guías enlazadas.

## 1. Las historias de usuario mandan

- Nunca se quita un criterio de aceptación que ya se cumple. Si algo cambia de
  lugar (se pliega, se resume, pasa a otra pantalla), el criterio se sigue
  cumpliendo y su prueba se ajusta.
- Se suma, no se resta: si una mejora agrega algo, se agrega como criterio
  nuevo en su historia.
- Un criterio se marca solo cuando el sistema lo cumple y hay una prueba que lo
  demuestra.

## 2. Todo el sistema se ve y se comporta igual

- Lo mismo se resuelve de la misma forma en todas las pantallas: listas,
  formularios, filtros, buscadores, documentos y reportes.
- Se usan los componentes y estilos que ya existen (`Modal`, `Pagination`,
  `ListSearch`, `ReportActions`, `.filter-bar`, `.toolbar__filter`, `.button`)
  y los colores de `global.css`. No se crea un estilo nuevo para algo que ya
  tiene uno.
- **Diseño neutro** (ver «Diseño del sistema» en `docs/PANTALLAS.md`): fondos
  grises, texto casi negro, esquinas redondeadas y el **color solo para los
  estados** (rojo crítico, ámbar atención, verde éxito), siempre con su palabra.
  Los colores y radios salen de los tokens de `:root` (`var(--color-…)`,
  `var(--radius)`); nunca un color fijo nuevo en una regla.
- Si algo se necesita en dos lugares, se vuelve compartido; no se copia.
- Una pantalla que se ve distinta a las demás es un error de diseño, aunque
  funcione.
- Un cambio de diseño se hace con una justificación escrita en el PR, y nunca
  queda a medias: o el cambio se ajusta a lo que ya existe, o **todo** el
  sistema se actualiza al diseño nuevo en ese mismo trabajo (y se documenta en
  `docs/PANTALLAS.md`). Nunca queda una parte con un diseño y otra con otro.

## 3. Pantallas claras y livianas

Guía completa: [`docs/PANTALLAS.md`](docs/PANTALLAS.md).

- La pantalla abre mostrando la información; los formularios se piden con un
  botón y abren en una ventana (`Modal`).
- Toda lista va paginada, con las mismas medidas en todo el sistema: 15 filas en
  una pantalla, 4 dentro de una ventana y 6 sugerencias en un buscador
  (`components/use-pagination.ts`). Lo que crece sin límite (ventas,
  movimientos, detalle de reportes) se pagina en el servidor.
- Buscadores y filtros se aplican solos, sin botón «Buscar» ni «Generar».
- Lo secundario va plegado; los avisos aparecen solo cuando aplican. Dentro de una
  celda de tabla no se despliega nada: el resumen («12 productos») abre una ventana.
  Dentro de una ventana tampoco: lo que es otra tarea va a su lugar con un enlace.
- El inicio muestra lo urgente (como mucho tres cosas, cada una con su acción) y
  dice «¡Está al día!» cuando no hay nada; el análisis va en Reportes.
- Una entrada del menú se gana su lugar: si dos secciones se usan juntas y una
  es pequeña, van como pestañas de una sola pantalla; se separan cuando una
  crece hasta ser un mundo propio.
- Lo que el usuario ya eligió no se le vuelve a preguntar (contexto): una ventana
  que se abre desde un producto o un pedido trabaja solo con ese producto o
  pedido, sin buscador ni lista del catálogo. Buscar y elegir es para cuando se
  abre sin nada elegido.
- Poco texto en pantalla; la ayuda, a pedido.

## 4. Datos y seguridad

Guía completa: [`docs/ESCALABILIDAD.md`](docs/ESCALABILIDAD.md).

- Cada negocio ve solo lo suyo: el negocio sale siempre de la sesión, nunca de
  la URL ni del cuerpo de la petición.
- Los permisos se validan en el servidor; la pantalla solo oculta.
- El dinero nunca va en `float`; lo que mueve dinero o stock va en una
  transacción.
- Lo que tiene historia se desactiva, no se borra.
- Nunca se suben `.env`, contraseñas ni datos reales.

## 5. Código y pruebas

- Antes de subir: `npm run format:check`, `npm run lint`,
  `npm run typecheck` y las pruebas de lo que se tocó.
- Cada regla nueva lleva su prueba; cada criterio de una historia, su prueba
  E2E.
- Nunca se desactiva ni se salta una prueba para que el CI pase: se arregla la
  causa.
- Sin código muerto ni comentarios que ya no son ciertos.
- **Todo lo que se programa queda comentado y explicado**, para que cualquiera del
  equipo lo entienda y encuentre rápido dónde está un problema:
  - cada archivo empieza con un comentario que dice qué hace y a qué historia
    responde;
  - cada función, clase o componente exportado tiene su JSDoc: qué hace, `@param` y
    `@returns` cuando no es obvio, y `@example` con números si hace un cálculo;
  - los comentarios explican el **porqué** (la regla, el caso borde), no repiten lo
    que el código ya dice.
- Cada módulo tiene su página en la [guía del código](docs/guia/README.md): qué hace,
  flujo de información, librerías, cálculos y dónde buscar cuando algo falla. Quien
  cambia el módulo actualiza su página en el mismo PR.

## 6. Ramas y PR

- Se trabaja en una rama desde `develop` y se abre el PR hacia `develop`;
  `develop` pasa a `main` cuando todo está en verde.
- Un PR se integra solo con el CI en verde y sin conflictos.
- La descripción del PR dice qué historia toca y cómo se probó.

## 7. Documentación

- Todo documento está enlazado desde el README (sección «Documentación») o desde
  estas reglas. Si nadie lo enlaza, no suma: se integra en otro o se borra.
- Las notas de una historia (cómo se probó, qué falta) van en su issue o en su PR,
  no en un `.md` suelto. Lo que sirve a futuro (reglas de cálculo, contratos de la
  API) va a `docs/ARCHITECTURE.md`.
- Un documento que ya no dice la verdad se corrige en el mismo PR que cambió el
  código.

## 8. Las reglas llegan a todas las IA

- Todos los caminos llevan a estas reglas: cada herramienta de IA que el equipo usa
  tiene su archivo de instrucciones (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
  `.github/copilot-instructions.md`), y cada uno enlaza a `AGENTS.md` y a este
  documento.
- Las reglas críticas van en un bloque de `AGENTS.md` que se copia **idéntico** en
  los demás archivos, por si una IA lee solo el suyo.
- Una regla nueva o cambiada se escribe aquí; si es crítica, se actualiza el bloque
  en todos los archivos en el mismo PR. Una IA nueva en el equipo trae su archivo y
  se agrega a `scripts/check-ai-instructions.mjs`.
- `npm run check:ai` lo revisa y el CI no deja pasar un PR si un archivo falta, no
  enlaza o tiene un bloque distinto.
