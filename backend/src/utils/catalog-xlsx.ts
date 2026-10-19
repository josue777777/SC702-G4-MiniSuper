import ExcelJS from 'exceljs';
import type { ProductDto } from '../types/products.js';

/** Tipo de contenido de un archivo Excel `.xlsx`. */
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Carácter que Excel interpretaría como inicio de fórmula si abriera el texto como tal. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Neutraliza la inyección de fórmulas: un texto que empieza con `=`, `+`, `-` o
 * `@` se guarda con un apóstrofo delante, así ninguna hoja de cálculo lo evalúa.
 */
export function sanitizeCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/**
 * Libro de Excel del catálogo (HU-33): código, nombre, categoría, precio, costo,
 * stock y proveedor. Precio y costo son numéricos con formato de dos decimales:
 * los importes son `Decimal(12, 2)`, que un número de 64 bits representa sin
 * perder precisión.
 */
export async function buildCatalogWorkbook(products: ProductDto[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Catálogo');

  sheet.columns = [
    { header: 'Código', key: 'code', width: 16 },
    { header: 'Nombre', key: 'name', width: 38 },
    { header: 'Categoría', key: 'category', width: 22 },
    { header: 'Precio', key: 'price', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Costo', key: 'cost', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'Proveedor', key: 'supplier', width: 28 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const product of products) {
    sheet.addRow({
      code: sanitizeCell(product.code),
      name: sanitizeCell(product.name),
      category: sanitizeCell(product.categoryName),
      price: Number(product.price),
      cost: Number(product.cost),
      stock: product.stock,
      supplier: sanitizeCell(product.preferredSupplierName ?? ''),
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
