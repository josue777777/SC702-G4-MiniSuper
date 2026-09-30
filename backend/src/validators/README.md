# `src/validators/`

Aquí van los esquemas de [Zod](https://zod.dev) que validan lo que envía el
frontend **antes** de que un controller llame a un service.

Un archivo por recurso, mismo nombre que su router:

| Archivo (futuro)              | Valida                               | Historias     |
| ----------------------------- | ------------------------------------ | ------------- |
| `product.validator.ts`        | cuerpo de POST/PATCH producto        | HU-01 … HU-05 |
| `sale.validator.ts`           | carrito, métodos de pago, descuentos | HU-17, HU-18  |
| `credit-payment.validator.ts` | abonos a fiado                       | HU-19         |
| `purchase-order.validator.ts` | pedido a proveedor                   | HU-22, HU-24  |

## Cómo se usa en un router

```ts
import { Router } from 'express';
import { createProductSchema } from '../validators/product.validator.js';

productsRouter.post('/', (req, res) => {
  // parse() lanza ZodError si algo no cumple; errorHandler lo convierte en 400
  const data = createProductSchema.parse(req.body);
  res.status(201).json(productService.create(data));
});
```

No se valida en el frontend y "ya veremos" en el backend: el backend **nunca**
confía en lo que recibe, y el mensaje de error que produce Zod es el que el
usuario ve en el formulario.
