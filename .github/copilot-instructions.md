# Instrucciones para GitHub Copilot

Sigue las reglas obligatorias del equipo de [`AGENTS.md`](../AGENTS.md) y
[`CONTRIBUTING.md`](../CONTRIBUTING.md), y las guías que enlazan
([`docs/PANTALLAS.md`](../docs/PANTALLAS.md) para pantallas y
[`docs/ESCALABILIDAD.md`](../docs/ESCALABILIDAD.md) para datos, permisos, dinero y
stock). Valen igual para el código escrito con IA.

Lo más importante:

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
