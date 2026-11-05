# Instrucciones para asistentes de IA

Este archivo lo leen las herramientas de IA (Codex, Cursor y otras) al
trabajar en este repositorio. Las reglas del equipo viven en un solo lugar;
aquí solo se indica dónde están y que son obligatorias.

Antes de proponer o escribir cualquier cambio:

1. Lee y cumple [`CONTRIBUTING.md`](CONTRIBUTING.md): son las reglas del
   equipo y valen igual para el código escrito con IA.
2. Si el cambio toca una pantalla, sigue [`docs/PANTALLAS.md`](docs/PANTALLAS.md).
3. Si toca datos, permisos, dinero o stock, sigue
   [`docs/ESCALABILIDAD.md`](docs/ESCALABILIDAD.md).

Lo más importante, por si solo lees esto:

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
  [`docs/guia/`](docs/guia/README.md) actualizada.
- Antes de dar algo por terminado: `npm run format:check`, `npm run lint`,
  `npm run typecheck` y las pruebas de lo que se tocó.
- La descripción del PR debe marcar «Leí y cumplo `CONTRIBUTING.md`» (el CI
  lo exige).
