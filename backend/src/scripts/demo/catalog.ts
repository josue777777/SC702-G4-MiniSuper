/**
 * Catálogo de ejemplo del negocio de demostración (`npm run db:seed:demo`).
 *
 * Son nombres genéricos de un minisúper costarricense, sin marcas ni datos de
 * personas reales. Cada categoría combina sus artículos con sus presentaciones
 * («Refresco de cola» × «600 ml»), así salen cientos de productos con pocas
 * líneas.
 */

/** Un artículo y su precio de venta base, en colones (sin céntimos). */
export type BaseItem = readonly [name: string, basePrice: number];

/** Una presentación y cuánto multiplica el precio base. */
export type Presentation = readonly [label: string, priceFactor: number];

export interface DemoCategory {
  name: string;
  /** Prefijo del código del producto: `BEB` → `BEB-001`. */
  prefix: string;
  /** Días que dura el producto; `null` si no vence (limpieza, abarrotes secos). */
  shelfLifeDays: number | null;
  items: readonly BaseItem[];
  presentations: readonly Presentation[];
}

export const DEMO_CATEGORIES: readonly DemoCategory[] = [
  {
    name: 'Bebidas',
    prefix: 'BEB',
    shelfLifeDays: 180,
    items: [
      ['Refresco de cola', 650],
      ['Refresco de naranja', 600],
      ['Refresco de limón', 600],
      ['Refresco de uva', 600],
      ['Agua purificada', 450],
      ['Agua con gas', 550],
      ['Té frío de durazno', 700],
      ['Té frío de limón', 700],
      ['Jugo de naranja', 900],
      ['Jugo de manzana', 900],
      ['Bebida deportiva', 950],
      ['Bebida de malta', 750],
    ],
    presentations: [
      ['355 ml', 1],
      ['600 ml', 1.4],
      ['1,5 L', 2.2],
      ['2,5 L', 3],
    ],
  },
  {
    name: 'Lácteos',
    prefix: 'LAC',
    shelfLifeDays: 25,
    items: [
      ['Leche entera', 950],
      ['Leche semidescremada', 980],
      ['Leche deslactosada', 1150],
      ['Yogurt de fresa', 700],
      ['Yogurt natural', 700],
      ['Queso tierno', 2800],
      ['Queso amarillo', 2400],
      ['Natilla', 1100],
      ['Mantequilla', 1600],
      ['Bebida de chocolate', 750],
    ],
    presentations: [
      ['pequeño', 1],
      ['mediano', 1.8],
      ['grande', 3.2],
      ['familiar', 4.5],
    ],
  },
  {
    name: 'Granos',
    prefix: 'GRA',
    shelfLifeDays: 365,
    items: [
      ['Arroz blanco', 1100],
      ['Arroz integral', 1400],
      ['Frijoles negros', 1300],
      ['Frijoles rojos', 1350],
      ['Lentejas', 1200],
      ['Garbanzos', 1500],
      ['Maíz para palomitas', 900],
      ['Avena en hojuelas', 1250],
    ],
    presentations: [
      ['500 g', 1],
      ['1 kg', 1.8],
      ['2 kg', 3.4],
      ['5 kg', 8],
    ],
  },
  {
    name: 'Abarrotes',
    prefix: 'ABA',
    shelfLifeDays: 540,
    items: [
      ['Azúcar blanca', 1050],
      ['Azúcar morena', 1150],
      ['Sal refinada', 450],
      ['Aceite vegetal', 2100],
      ['Café molido', 2900],
      ['Café instantáneo', 3400],
      ['Harina de trigo', 950],
      ['Harina de maíz', 1100],
      ['Pasta spaghetti', 700],
      ['Pasta coditos', 700],
      ['Salsa de tomate', 850],
      ['Atún en lata', 1300],
      ['Sardinas en lata', 1000],
      ['Mayonesa', 1600],
    ],
    presentations: [
      ['pequeño', 1],
      ['mediano', 1.7],
      ['grande', 2.9],
    ],
  },
  {
    name: 'Panadería',
    prefix: 'PAN',
    shelfLifeDays: 7,
    items: [
      ['Pan cuadrado', 1800],
      ['Pan integral', 2100],
      ['Pan de hot dog', 1300],
      ['Pan de hamburguesa', 1400],
      ['Tortillas de maíz', 900],
      ['Tortillas de harina', 1200],
      ['Galletas de soda', 800],
      ['Galletas dulces', 750],
      ['Queque de vainilla', 1900],
    ],
    presentations: [
      ['unidad', 1],
      ['paquete doble', 1.9],
      ['paquete familiar', 2.7],
    ],
  },
  {
    name: 'Snacks',
    prefix: 'SNK',
    shelfLifeDays: 120,
    items: [
      ['Papas tostadas', 650],
      ['Plátano tostado', 600],
      ['Yuca tostada', 600],
      ['Maní salado', 550],
      ['Palomitas de maíz', 500],
      ['Chocolate en barra', 750],
      ['Confites surtidos', 400],
      ['Chicle de menta', 300],
      ['Galleta rellena', 500],
      ['Barra de cereal', 450],
    ],
    presentations: [
      ['pequeño', 1],
      ['mediano', 1.8],
      ['grande', 2.6],
      ['para compartir', 3.6],
    ],
  },
  {
    name: 'Limpieza',
    prefix: 'LIM',
    shelfLifeDays: null,
    items: [
      ['Detergente en polvo', 2400],
      ['Detergente líquido', 2900],
      ['Cloro', 900],
      ['Desinfectante de pisos', 1500],
      ['Lavaplatos en crema', 1100],
      ['Suavizante de ropa', 2200],
      ['Esponja de cocina', 450],
      ['Bolsas de basura', 1300],
      ['Limpiavidrios', 1400],
    ],
    presentations: [
      ['pequeño', 1],
      ['mediano', 1.8],
      ['grande', 3.1],
      ['económico', 4.4],
    ],
  },
  {
    name: 'Higiene personal',
    prefix: 'HIG',
    shelfLifeDays: null,
    items: [
      ['Jabón de baño', 650],
      ['Champú', 2300],
      ['Acondicionador', 2400],
      ['Pasta dental', 1500],
      ['Cepillo de dientes', 900],
      ['Desodorante', 2100],
      ['Papel higiénico', 1900],
      ['Toallas húmedas', 1600],
      ['Crema corporal', 2600],
    ],
    presentations: [
      ['individual', 1],
      ['doble', 1.8],
      ['paquete de 4', 3.4],
      ['paquete de 6', 4.8],
    ],
  },
  {
    name: 'Carnes y embutidos',
    prefix: 'CAR',
    shelfLifeDays: 12,
    items: [
      ['Salchichón', 2200],
      ['Mortadela', 1600],
      ['Jamón de pavo', 2600],
      ['Salchichas', 1900],
      ['Chorizo', 2300],
      ['Huevos', 2400],
      ['Pollo en trozos', 3600],
      ['Carne molida', 3900],
    ],
    presentations: [
      ['250 g', 1],
      ['500 g', 1.9],
      ['1 kg', 3.6],
    ],
  },
  {
    name: 'Frutas y verduras',
    prefix: 'FRU',
    shelfLifeDays: 10,
    items: [
      ['Banano', 700],
      ['Manzana', 1300],
      ['Naranja', 900],
      ['Papa', 1100],
      ['Cebolla', 1000],
      ['Tomate', 1200],
      ['Chile dulce', 800],
      ['Zanahoria', 750],
      ['Aguacate', 1500],
      ['Limón ácido', 600],
    ],
    presentations: [
      ['por kilo', 1],
      ['bolsa de 2 kg', 1.9],
      ['bolsa de 5 kg', 4.5],
    ],
  },
  {
    name: 'Congelados',
    prefix: 'CON',
    shelfLifeDays: 150,
    items: [
      ['Helado de vainilla', 2400],
      ['Helado de chocolate', 2400],
      ['Papas a la francesa', 2200],
      ['Vegetales mixtos', 1700],
      ['Nuggets de pollo', 3300],
      ['Pizza congelada', 3800],
      ['Paleta de fruta', 500],
    ],
    presentations: [
      ['pequeño', 1],
      ['mediano', 1.8],
      ['grande', 2.8],
    ],
  },
  {
    name: 'Enlatados y conservas',
    prefix: 'ENL',
    shelfLifeDays: 720,
    items: [
      ['Maíz dulce', 850],
      ['Frijoles molidos', 950],
      ['Pasta de tomate', 650],
      ['Champiñones', 1300],
      ['Palmito', 1900],
      ['Duraznos en almíbar', 1700],
      ['Piña en trozos', 1500],
      ['Leche condensada', 1100],
      ['Leche evaporada', 900],
      ['Encurtido mixto', 1200],
    ],
    presentations: [
      ['lata pequeña', 1],
      ['lata mediana', 1.7],
      ['lata grande', 2.6],
    ],
  },
  {
    name: 'Condimentos',
    prefix: 'CND',
    shelfLifeDays: 720,
    items: [
      ['Salsa inglesa', 900],
      ['Salsa picante', 800],
      ['Mostaza', 750],
      ['Consomé de pollo', 600],
      ['Comino molido', 500],
      ['Orégano', 450],
      ['Ajo en polvo', 550],
      ['Pimienta negra', 650],
      ['Achiote', 500],
      ['Vinagre blanco', 700],
    ],
    presentations: [
      ['sobre', 1],
      ['frasco', 2.1],
      ['frasco grande', 3.4],
    ],
  },
  {
    name: 'Cuidado del bebé',
    prefix: 'BBE',
    shelfLifeDays: null,
    items: [
      ['Pañales etapa 1', 5200],
      ['Pañales etapa 3', 5900],
      ['Toallitas para bebé', 1700],
      ['Talco para bebé', 1600],
      ['Champú para bebé', 2100],
      ['Crema para coceduras', 2300],
      ['Compota de manzana', 650],
      ['Cereal infantil', 1900],
    ],
    presentations: [
      ['pequeño', 1],
      ['mediano', 1.8],
      ['grande', 3],
      ['ahorro', 4.2],
    ],
  },
  {
    name: 'Artículos del hogar',
    prefix: 'HOG',
    shelfLifeDays: null,
    items: [
      ['Fósforos', 300],
      ['Candelas', 600],
      ['Baterías AA', 1400],
      ['Bombillo LED', 1800],
      ['Papel aluminio', 1300],
      ['Plástico adherente', 1200],
      ['Servilletas', 700],
      ['Vasos desechables', 900],
    ],
    presentations: [
      ['unidad', 1],
      ['paquete', 2.2],
      ['paquete grande', 3.8],
    ],
  },
  {
    name: 'Mascotas',
    prefix: 'MAS',
    shelfLifeDays: 365,
    items: [
      ['Alimento para perro', 3200],
      ['Alimento para gato', 3400],
      ['Galletas para perro', 1500],
      ['Arena para gato', 2800],
      ['Alimento húmedo para gato', 900],
    ],
    presentations: [
      ['pequeño', 1],
      ['mediano', 2.4],
      ['grande', 4.6],
      ['bulto', 9],
    ],
  },
];

/** Proveedores de ejemplo: nombre y contacto (todo inventado). */
export const DEMO_SUPPLIERS: readonly (readonly [name: string, contact: string])[] = [
  ['Distribuidora Central', 'Marta Solís'],
  ['Comercial del Valle', 'Luis Araya'],
  ['Lácteos La Pradera', 'Ana Quesada'],
  ['Bebidas del Norte', 'Jorge Mora'],
  ['Granos y Más', 'Sofía Vargas'],
  ['Panificadora El Trigal', 'Diego Rojas'],
  ['Limpieza Total', 'Carla Jiménez'],
  ['Higiene Hogar', 'Pablo Castro'],
  ['Embutidos La Finca', 'Laura Chaves'],
  ['Frutas Frescas del Campo', 'Andrés Solano'],
  ['Congelados Polar', 'Valeria Méndez'],
  ['Mascotas Felices', 'Ricardo Ulate'],
];

/**
 * Proveedor principal de cada categoría (índice en `DEMO_SUPPLIERS`) y el que
 * también la surte como segunda opción (otro proveedor, otro costo).
 */
export const CATEGORY_SUPPLIERS: Record<string, readonly [main: number, alternative: number]> = {
  Bebidas: [3, 0],
  Lácteos: [2, 1],
  Granos: [4, 0],
  Abarrotes: [0, 1],
  Panadería: [5, 1],
  Snacks: [0, 3],
  Limpieza: [6, 0],
  'Higiene personal': [7, 6],
  'Carnes y embutidos': [8, 1],
  'Frutas y verduras': [9, 1],
  Congelados: [10, 0],
  'Enlatados y conservas': [0, 1],
  Condimentos: [1, 0],
  'Cuidado del bebé': [7, 1],
  'Artículos del hogar': [6, 0],
  Mascotas: [11, 0],
};

/** Nombres y apellidos para clientes inventados. */
export const FIRST_NAMES = [
  'Ana',
  'Carlos',
  'María',
  'José',
  'Laura',
  'Luis',
  'Sofía',
  'Diego',
  'Valeria',
  'Andrés',
  'Daniela',
  'Jorge',
  'Paola',
  'Ricardo',
  'Gabriela',
  'Esteban',
  'Natalia',
  'Fernando',
  'Lucía',
  'Mauricio',
] as const;

export const LAST_NAMES = [
  'Rodríguez',
  'Mora',
  'Vargas',
  'Jiménez',
  'Rojas',
  'Solís',
  'Araya',
  'Chaves',
  'Castro',
  'Quesada',
  'Alfaro',
  'Ulate',
  'Méndez',
  'Salazar',
  'Brenes',
] as const;
