# `src/features/`

Un folder por dominio funcional, con la misma división que el backend y que los
módulos de `docs/ARCHITECTURE.md`:

```
features/
├── products/     (HU-01 … HU-05)   ProductosPage, InventoryPage (HU-06 … HU-10)
├── sales/        (HU-16, HU-17, HU-20)
├── credits/      (HU-18, HU-19)    cuentas fiadas y abonos
├── suppliers/    (HU-21 … HU-24)
└── reports/      (HU-25 … HU-30)
```

Dentro de cada feature viven sus componentes, sus hooks y sus tipos propios:

```
features/products/
├── ProductTable.tsx     tabla con búsqueda (HU-05)
├── ProductForm.tsx      crear / editar producto (HU-01, HU-02)
├── use-products.ts      estado + llamadas a product.service.ts
└── product.types.ts     tipos propios de la pantalla
```

Reglas para que el folder no se convierta en un second backend:

1. **La lógica de negocio no va en el componente**: se llama a
   `src/services/<dominio>.service.ts` y el backend decide.
2. Un componente de feature **solo** lo usan las páginas de su dominio. Si lo
   necesita otra feature, se sube a `src/components/`.
3. Los hooks de data fetching se quedan con el estado de carga y error; las
   páginas deciden cómo mostrarlo.

Al empezar el Sprint 1, `ProductsPage` dejará de renderizar `PagePlaceholder` y
pasará a componer `features/products/*`.
