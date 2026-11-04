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
- `Pagination` no dibuja nada si todo cabe en una página.
- Hoy se pagina en el navegador: el servidor manda la lista y se muestra de 20
  en 20. Alcanza para el tamaño de un minisúper. Si una lista llega a miles de
  filas (como el historial de ventas), se pagina **en el servidor** con
  `page` y `pageSize`, y se reutiliza el mismo componente `Pagination`.

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

## Lista de revisión para una pantalla nueva

- [ ] ¿Abre mostrando la lista y no un formulario?
- [ ] ¿El formulario abre en `Modal` desde un botón y se cierra solo al guardar?
- [ ] ¿La lista usa `usePagination` + `Pagination`?
- [ ] ¿Tiene buscador (`ListSearch`) si puede tener más de 20 filas?
- [ ] ¿Muestra el total y un mensaje cuando no hay resultados?
- [ ] ¿Los detalles largos están plegados?
- [ ] ¿Las tablas de pocas columnas usan `list-narrow`?
- [ ] ¿Hacer y consultar están en pestañas separadas?
- [ ] ¿Los documentos abren en `Modal`?
- [ ] ¿Las explicaciones están plegadas y los avisos aparecen solo cuando aplican?
- [ ] ¿Se mantienen los colores y estilos existentes (`global.css`)?
