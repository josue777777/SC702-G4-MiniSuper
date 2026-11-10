import 'dotenv/config';
import { disconnectPrisma, prisma } from '../config/prisma.js';
import { hashPassword } from '../utils/password.js';
import { newPasswordSchema } from '../validators/auth.validator.js';
import { generateDemo, LARGE_DEMO } from './demo/generate-demo.js';
import { DEMO_USERS, writeDemo } from './demo/write-demo.js';

/**
 * `npm run db:seed:demo` — llena la base con un negocio de DEMOSTRACIÓN,
 * «Minisúper Demo», para probar todo el sistema con datos realistas:
 * ~500 productos, proveedores, clientes con fiados y un año de ventas, pedidos,
 * devoluciones y conteos físicos (ver `demo/generate-demo.ts`).
 *
 *   - No toca los demás negocios; si el demo ya existía, lo rehace.
 *   - Los usuarios (Encargado, Cajero y Bodega) entran con DEMO_PASSWORD del
 *     `.env`, que no se sube al repositorio. Nunca se imprime.
 *   - No corre con NODE_ENV=production: son datos de prueba.
 */
async function main(): Promise<number> {
  if (process.env['NODE_ENV'] === 'production') {
    console.error('❌ El negocio de demostración no se crea en producción.');

    return 1;
  }

  const password = newPasswordSchema.safeParse(process.env['DEMO_PASSWORD']);

  if (!password.success) {
    console.error('❌ Defina DEMO_PASSWORD en backend/.env para los usuarios de prueba:');

    for (const issue of password.error.issues) {
      console.error(`   - ${issue.message}`);
    }

    return 1;
  }

  const started = Date.now();
  const plan = generateDemo({ ...LARGE_DEMO, now: new Date() });

  console.log('⏳ Guardando el negocio «Minisúper Demo» (puede tardar un minuto)…');
  await writeDemo(prisma, plan, await hashPassword(password.data));

  const seconds = ((Date.now() - started) / 1000).toFixed(0);

  console.log(`✅ Listo en ${seconds} s:`);
  console.log(
    `   ${plan.products.length} productos · ${plan.suppliers.length} proveedores · ` +
      `${plan.customers.length} clientes · ${plan.sales.length} ventas · ` +
      `${plan.purchaseOrders.length} pedidos · ${plan.movements.length} movimientos`,
  );
  console.log('   Usuarios (contraseña: la de DEMO_PASSWORD):');

  for (const user of DEMO_USERS) {
    console.log(`     - ${user.username}  (${user.role})`);
  }

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // P2021/P2022: falta una tabla o columna. Casi siempre es una migración sin aplicar.
    const code = (error as { code?: unknown }).code;

    if (code === 'P2021' || code === 'P2022') {
      console.error(
        '❌ La base no tiene todas las migraciones. Corra primero `npm run db:migrate` y repita.',
      );
    } else {
      console.error('❌ No se pudo crear el negocio de demostración:', error);
    }

    process.exitCode = 1;
  })
  .finally(() => void disconnectPrisma());
