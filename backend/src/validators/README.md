# `src/validators/`

Aquí van los esquemas de [Zod](https://zod.dev) que validan lo que envía el
frontend **antes** de que un controller llame a un service.

Un archivo por recurso, mismo nombre que su router:

| Archivo                        | Valida                                | Historias     | Estado       |
| ------------------------------ | ------------------------------------- | ------------- | ------------ |
| `products.validator.ts`        | cuerpo de POST/PATCH producto y `:id` | HU-01 … HU-03 | implementado |
| `categories.validator.ts`      | cuerpo de POST/PATCH categoría        | HU-04         | pendiente    |
| `sales.validator.ts`           | carrito, métodos de pago              | HU-16, HU-17  | pendiente    |
| `credit-payments.validator.ts` | abonos a fiado                        | HU-19         | pendiente    |
| `purchase-orders.validator.ts` | pedido a proveedor                    | HU-22, HU-24  | pendiente    |

## Cómo se usa en un controller

```ts
import { createProductSchema } from '../validators/products.validator.js';

// parse() lanza ZodError si algo no cumple; errorHandler lo convierte en 400
const input = createProductSchema.parse(req.body);
const created = await this.service.createProduct(input);
res.status(201).json({ data: created });
```

El tipo de la entrada se deriva del esquema (`z.infer<typeof createProductSchema>`) y se
comprueba contra el contrato de `src/types/`, así que el esquema y el tipo no se pueden
separar sin que falle `npm run typecheck`.

No se valida en el frontend y "ya veremos" en el backend: el backend **nunca** confía en lo
que recibe, y el mensaje de error que produce Zod es el que el usuario ve en el formulario.
