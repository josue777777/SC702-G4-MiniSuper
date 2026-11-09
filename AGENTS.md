# Instrucciones para asistentes de IA

Este archivo lo leen las herramientas de IA (Codex, Cursor, Windsurf, el agente de
Copilot y otras) al trabajar en este repositorio; las que buscan su propio archivo
(`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) llegan aquí desde él. Las reglas del equipo viven en un solo lugar;
aquí solo se indica dónde están y que son obligatorias.

Antes de proponer o escribir cualquier cambio:

1. Lee y cumple [`CONTRIBUTING.md`](CONTRIBUTING.md): son las reglas del
   equipo y valen igual para el código escrito con IA.
2. Si el cambio toca una pantalla, sigue [`docs/PANTALLAS.md`](docs/PANTALLAS.md).
3. Si toca datos, permisos, dinero o stock, sigue
   [`docs/ESCALABILIDAD.md`](docs/ESCALABILIDAD.md).

Lo más importante, por si solo lees esto:

<!-- reglas-criticas:inicio — copia idéntica en todos los archivos de IA; la revisa `npm run check:ai` -->

- Nunca quites un criterio de aceptación que ya se cumple; nunca desactives
  ni te saltes una prueba para que el CI pase.
- Usa los componentes y estilos que ya existen. Todo el sistema se ve y se
  comporta igual; un cambio de diseño se justifica y se aplica en todo el
  sistema, nunca en una sola parte.
- El negocio sale siempre de la sesión; los permisos se validan en el
  servidor.
- Nunca subas `.env`, contraseñas ni datos reales.
- Todo lo que escribas queda comentado: JSDoc en cada archivo y en cada función
  exportada (con `@example` si calcula algo), y la página del módulo en
  `docs/guia/` actualizada.
- Antes de dar algo por terminado: `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm run check:ai` y las pruebas de lo que se tocó.
- La descripción del PR debe marcar «Leí y cumplo `CONTRIBUTING.md`» (el CI
  lo exige).

<!-- reglas-criticas:fin -->

## Si agregas o cambias una regla

La regla vive en `CONTRIBUTING.md`. Si es crítica, va también en el bloque de
arriba, y el bloque se copia igual en `CLAUDE.md`, `GEMINI.md` y
`.github/copilot-instructions.md`. Si alguien del equipo empieza a usar otra IA que
busca su propio archivo, ese archivo se crea en el mismo PR y se agrega a la lista
de `scripts/check-ai-instructions.mjs`. `npm run check:ai` (también en el CI) falla
si falta un archivo, si no enlaza a `AGENTS.md` y `CONTRIBUTING.md` o si su bloque
no es idéntico.
