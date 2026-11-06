# Guía de pantallas: formularios y listas

Reglas para que todas las pantallas se comporten igual, sin importar quién las
programe. Se basan en tres principios de UX y ya están aplicadas en Clientes,
Proveedores, Inventario, Pedidos, Movimientos y Reportes.

## Los tres principios

| Principio | En una frase | Cómo se aplica aquí |
| --- | --- | --- |
| **Revelación progresiva** | Mostrar solo lo que se necesita en ese momento | Formularios en modal tras un botón; detalles plegados (`<details>`) |
| **Paginación y carga diferida** | No dibujar ni pedir todo de una vez | Listas de 20 en 20 (`usePagination` + `Pagination`); selectores que sugieren pocos y buscan el resto |
| **Menos carga cognitiva** | Un objetivo claro por pantalla y buscar antes que recorrer | La pantalla es de consulta; un buscador en cada lista |

## Regla 1: la pantalla es de consulta, el formulario se pide

- La pantalla abre mostrando la **lista**. Nunca un formulario abierto encima.
- Crear o editar se hace con un botón (`+ Nuevo …`, `Editar`) que abre el
  formulario en el componente `Modal` (`frontend/src/components/Modal.tsx`).
- El modal se cierra solo si se guardó. Si hubo error, queda abierto con el
  mensaje.
- Si un formulario necesita un dato que todavía no existe (una categoría o un
  proveedor), se crea **dentro** del mismo modal, sin perder lo escrito
  (ver `CategoryForm` y `QuickSupplierForm`).
- Formularios con muchos campos: separarlos en pestañas (como el producto:
  General, Precios, Existencias).

## Regla 2: toda lista que puede crecer va paginada

```tsx
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../components/use-pagination';

const pages = usePagination(visibles, busqueda); // 20 por página; vuelve a la 1 si cambia la búsqueda

{pages.pageItems.map((item) => <tr key={item.id}>…</tr>)}
<Pagination {...pages} itemLabel="clientes" onPage={pages.setPage} />
```

- `usePagination` recibe la lista **ya filtrada** y una clave que, al cambiar,
  devuelve la lista a la página 1 (la búsqueda, el filtro…).
- `Pagination` muestra «Anterior · 1 2 3 … 20 · Siguiente»: con los números se
  salta a cualquier página sin pasar por todas. Con muchas páginas se ven solo
  la primera, la última y las vecinas de la actual. No dibuja nada si todo cabe
  en una página.

### En el navegador o en el servidor

| | En el navegador (`usePagination`) | En el servidor (`page` y `pageSize`) |
| --- | --- | --- |
| Qué viaja | La lista completa; se muestran 20 | Solo las 20 de la página |
| Cuándo usarlo | Listas que no crecen sin límite: clientes, proveedores, productos | Lo que crece con el tiempo: ventas, movimientos, el detalle de los reportes |

Pregunta guía: **¿esta lista va a tener miles de filas en un año?** Si la
respuesta es sí, se pagina en el servidor. Ejemplos: el historial de
Movimientos y «Ver detalle» de todos los reportes
(`GET /api/reports/commercial/:kind/rows` y `GET /api/reports/inventory/rows`,
con `usePagedRows`). Las dos formas usan el mismo componente `Pagination`.

## Regla 3: buscar antes que recorrer

```tsx
import { ListSearch } from '../../components/ListSearch';
import { matchesSearch } from '../../components/list-search';

const visibles = lista.filter((c) => matchesSearch(busqueda, c.name, c.phone));

<div className="toolbar">
  <ListSearch value={busqueda} onChange={setBusqueda}
    placeholder="Buscar por nombre o teléfono" label="Buscar clientes" />
  <button className="button button--primary">+ Nuevo cliente</button>
</div>
```

- `matchesSearch` ignora mayúsculas y tildes: «jose» encuentra «José».
- El buscador va a la izquierda de la barra (`.toolbar`) y la acción principal
  a la derecha.
- Mostrar cuántos hay: «24 proveedor(es)» o, al buscar, «3 de 24».
- Sin resultados, decirlo: «Ningún cliente coincide con «…»».
- Los selectores grandes (como «Elegir un producto» en Movimientos) sugieren
  pocos y piden escribir para encontrar el resto.

## Regla 4: lo secundario, plegado

Detalles largos dentro de una fila o textos de ayuda se pliegan con
`<details className="disclosure">`:

```tsx
<details className="disclosure">
  <summary>14 productos</summary>
  <ul>…</ul>
</details>
```

Pregunta guía: **¿el usuario necesita esto para la tarea principal de la
pantalla, o solo si quiere ir más a fondo?** Si es lo segundo, se pliega.

Ejemplos ya aplicados:

| Pantalla | Se muestra de entrada | Se abre a pedido |
| --- | --- | --- |
| Proveedores | «14 productos» | El detalle de cada producto y su costo |
| Pedidos | El producto, si es uno; si son varios, «2 productos» | La lista de productos (y todo en «Ver detalle») |
| Conteo físico | El formulario para contar | «Historial de conteos (4)» |
| Inicio | «Todo funciona correctamente» | Datos técnicos del servidor y la base (se abren solos si hay un problema) | Si una historia de usuario pide que
un texto se vea siempre (como «Cómo leer este reporte»), se deja con `open`:
visible de entrada, pero se puede plegar. La historia manda sobre la guía.

## Regla 5: el ancho sigue al contenido

Una tabla de 3 columnas estirada a 1400 px deja el nombre lejos de su dato y
el ojo se pierde de fila. Las listas de pocas columnas van dentro de
`<div className="list-narrow">` (máximo 860 px, con su barra de búsqueda).
Las de muchas columnas (Inventario, Pedidos) usan el ancho completo.

## Regla 6: dos objetivos, dos pestañas

Si una pantalla sirve para **hacer** algo y para **consultar** lo hecho, cada
parte va en su pestaña (`.tabs`, con `role="tab"`). Ejemplo: Ventas tiene
«Caja» (escáner, carrito y cobro) e «Historial del día». La pestaña de trabajo
es la que abre siempre.

## Regla 7: los documentos se abren en una ventana

Un documento (pedido, comprobante, reporte imprimible) se abre en `Modal`
(`size="wide"` si tiene tabla), con «Imprimir» y «Cerrar» abajo. Nunca se
inserta dentro de la página: empujaría la lista y se perdería la fila desde
donde se abrió. El botón dice qué abre: «Ver pedido», «Ver comprobante».

## Regla 8: poco texto; la ayuda a pedido; los avisos solo cuando aplican

Lo que el usuario lee una vez y después solo le ocupa espacio no va abierto en
pantalla.

| Tipo de texto | Dónde va | Ejemplo |
| --- | --- | --- |
| Explicación de cómo se calcula algo | Plegada: `ⓘ Cómo se calcula`, en el lenguaje del usuario y en 2 o 3 frases | Reportes, «ⓘ Qué incluye este total» en Ventas |
| Detalle técnico o límites del sistema | Dentro de esa ayuda, en «Notas técnicas», y en el Excel; nunca abierto | «LIMITACIÓN (HU-19)…» |
| Advertencia | Visible, pero **solo si aplica a lo que se está viendo**, y diciendo qué hacer | «2 productos sin costo registrado: … Registre su costo en Inventario.» |
| Tareas del equipo («Pendiente de implementar») | Solo en desarrollo (`PendingWork`) | Clientes, Pedidos, Reportes |

Además:

- **Un dato principal destacado** y el resto como detalle (Reportes: la ganancia
  grande; ingresos, costos y conteos en una fila compacta).
- **Solo los filtros que se usaron**: «Categoría actual: Granos», no «Precio
  mínimo: Sin mínimo».
- Nunca se quita información que pide un criterio de aceptación: se reordena
  (se pliega, se resume o se muestra cuando aplica), y la prueba de la historia
  se ajusta para abrirla.

## Regla 9: los reportes muestran conclusiones, no listas

Un reporte en pantalla no repite la lista que ya se ve en su módulo
(Inventario, Ventas, Clientes). Muestra lo que ayuda a decidir:

| En pantalla | En el PDF y el Excel |
| --- | --- |
| Cifras destacadas (`report-totals`) y gráficos de una sola serie (`ReportChartView`: barras para comparar, columnas por día) | Todo el detalle fila por fila |
| El detalle en «Ver detalle (N filas)», cerrado y paginado | — |

Cómo viajan los datos de un reporte (los comerciales y el de inventario):

1. **Al generarlo** llega el resumen: totales, avisos y los gráficos ya
   calculados en el servidor. **No** llegan las filas, solo cuántas son.
2. **Al abrir «Ver detalle»** se piden las filas de a 20 (`/rows?page=`); en
   inventario, cada sección (productos, vencimientos, stock bajo) por su lado.
   Si nadie lo abre, no se descarga ninguna.
3. **El PDF y el Excel** son el documento completo y piden todas. Si el PDF
   pasaría de 1.000 filas, primero se pregunta y se ofrece el Excel.

Así, un reporte de un año (decenas de miles de líneas) abre tan rápido como uno
de un día.

- Gráficos: un solo color, cada barra con su etiqueta y su valor escritos (no
  depende del color) y el valor exacto al pasar el cursor.
- Todo reporte tiene las mismas acciones (`ReportActions`): PDF, Excel y
  Personalizar; sin datos, no se exporta un archivo vacío.

## Regla 10: los filtros se aplican solos

Los filtros de un reporte van en una barra compacta (`.filter-bar`), en una
fila, **sin botón de consultar**: cada cambio se aplica solo, como en los
sistemas de reportes habituales.

| Pieza | Cómo funciona |
| --- | --- |
| Período rápido | «Hoy», «Este mes», «Mes pasado»… llenan Desde y Hasta. Si se cambia una fecha a mano, pasa a «Personalizado» (`report-periods.ts`). |
| Aplicación automática | Se espera un instante (`AUTO_APPLY_DELAY_MS`, 400 ms) por si el usuario sigue escribiendo, y se consulta una sola vez. |
| Errores | Se muestran junto al campo mientras se escribe; con un error, **no** se consulta. |
| Sin parpadeo | Mientras llega el resultado nuevo, el anterior queda a la vista, atenuado, con «Actualizando…». «Ver detalle» no se cierra. |
| Filtros activos | Etiquetas que se quitan con ×, y «Limpiar filtros». |
| ↻ Actualizar | Vuelve a consultar con los mismos filtros (trae, por ejemplo, una venta recién hecha). |

Los filtros de las listas (Inventario, Pedidos, Historial de ventas) usan el
mismo aspecto con `.toolbar__filter` (etiqueta pequeña en un `<span>` y campo
de 36 px), y los buscadores filtran mientras se escribe, sin botón «Buscar».
Todos los botones son botones (`.button`), nunca un texto subrayado.

En las pruebas E2E, `consult(page)` espera a que la barra diga «Al día»
(`data-report-sync="done"`).

## Regla 11: una subsección del menú se gana su lugar

Cada entrada del menú lateral tiene que tener contenido propio suficiente. Si
dos subsecciones comparten datos (y permiso) y una de ellas es pequeña, van
como **pestañas de una sola pantalla**, no como dos entradas del menú.

| Pregunta | Si la respuesta es sí… |
| --- | --- |
| ¿Se usan juntas y con el mismo permiso? | Candidatas a unirse |
| ¿Una de las dos es solo una lista corta con su formulario? | Se unen: pestañas en una pantalla |
| ¿Cada una tiene su propio mundo (varias tareas, historial, fichas, reportes)? | Se quedan separadas |

Ejemplo aplicado: **Pedidos** tiene las pestañas «Pedidos» y «Proveedores»
(`/orders?seccion=proveedores`; la dirección vieja `/suppliers` lleva ahí).
Proveedores, sola, era una pantalla casi vacía. Si crece (por ejemplo, con la
comparación de costos de HU-39 y una ficha por proveedor), vuelve a tener su
propia entrada en el menú.

## Regla 12: lo que el usuario ya eligió no se le vuelve a preguntar (contexto)

Una ventana trabaja con lo que la persona eligió **antes** de abrirla. Si llegó
desde un producto, un pedido o un cliente, la ventana es de ESE producto, pedido
o cliente: no le ofrece buscar en todo el catálogo ni elegirlo otra vez.

**Por qué:** preguntar de nuevo es ruido (más pasos para lo mismo) y es un riesgo
(se puede elegir otro sin querer y, por ejemplo, imprimir la etiqueta equivocada).

| Se abre desde | La ventana… |
| --- | --- |
| Un botón general de la pantalla, sin nada elegido | Ofrece buscar y elegir (uno o varios) |
| Un elemento ya elegido (fila, ficha, documento) | Trabaja solo con ese elemento; el título dice cuál |
| Un documento con varias líneas (un pedido, una venta) | Trabaja solo con esas líneas |

Ejemplo aplicado: las **etiquetas** (HU-07) son un solo componente con un
`scope` (`catalog`, `product` u `order`). «Etiquetas» de Inventario busca en el
catálogo; «🏷 Etiqueta» de la barra de acciones es solo del producto marcado, sin
buscador; «Ver pedido» → «Etiquetas» trae solo lo del pedido. Un solo componente
con modos, y no tres copias, para que la impresión se corrija en un solo lugar.

**Barra de acciones de una lista.** Las acciones sobre UN elemento (Modificar,
Desactivar, Etiqueta, Ver movimientos…) se ven **apagadas** hasta que se marca uno,
con la pista «Seleccione un producto…». Apagadas y no ocultas: la barra no salta de
tamaño y se sabe qué se puede hacer. Las que no dependen de un elemento («Crear»,
los botones de arriba de la lista) siempre están activas.

**Una tarea, un lugar.** Si algo ya se hace dentro de otra acción, no lleva botón
propio en la barra. Ejemplo: generar o reemplazar el código de barras se hace en
«Modificar» › Etiquetas, donde ya se ven y descargan el código de barras y el QR.

## Lista de revisión para una pantalla nueva

- [ ] ¿Abre mostrando la lista y no un formulario?
- [ ] ¿El formulario abre en `Modal` desde un botón y se cierra solo al guardar?
- [ ] ¿La lista usa `Pagination`? ¿Y si va a crecer a miles de filas, se pagina en el servidor?
- [ ] ¿Tiene buscador (`ListSearch`) si puede tener más de 20 filas?
- [ ] ¿Muestra el total y un mensaje cuando no hay resultados?
- [ ] ¿Los detalles largos están plegados?
- [ ] ¿Las tablas de pocas columnas usan `list-narrow`?
- [ ] ¿Hacer y consultar están en pestañas separadas?
- [ ] ¿Los documentos abren en `Modal`?
- [ ] ¿Las explicaciones están plegadas y los avisos aparecen solo cuando aplican?
- [ ] Si es un reporte: ¿muestra gráficos y deja el detalle a pedido y en el PDF/Excel?
- [ ] Si tiene filtros: ¿se aplican solos, sin botón, y muestran los activos?
- [ ] Si es una entrada nueva del menú: ¿tiene contenido propio suficiente, o va mejor como pestaña de una pantalla relacionada?
- [ ] Si se abre desde algo ya elegido (un producto, un pedido): ¿trabaja solo con eso, sin volver a buscarlo?
- [ ] En la barra de acciones: ¿lo que necesita un elemento se ve apagado hasta elegirlo, y ninguna tarea está repetida en dos botones?
- [ ] ¿Se mantienen los colores y estilos existentes (`global.css`)?
