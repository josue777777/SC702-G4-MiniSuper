import 'dotenv/config';
import { disconnectPrisma } from '../config/prisma.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { ensureInitialAdmin } from '../services/initial-admin.service.js';
import { initialAdminSchema } from '../validators/auth.validator.js';

/**
 * `npm run db:seed` — crea el administrador inicial (HU-12) con ADMIN_NAME,
 * ADMIN_EMAIL y ADMIN_PASSWORD del `.env`. Se puede correr varias veces: si ya
 * hay un administrador activo, no hace nada. Nunca imprime la contraseña.
 */
async function main(): Promise<number> {
  const parsed = initialAdminSchema.safeParse({
    name: process.env['ADMIN_NAME'],
    email: process.env['ADMIN_EMAIL'],
    password: process.env['ADMIN_PASSWORD'],
  });

  if (!parsed.success) {
    console.error(
      '❌ No se creó el administrador inicial. Revise ADMIN_NAME, ADMIN_EMAIL y ADMIN_PASSWORD en backend/.env:',
    );

    for (const issue of parsed.error.issues) {
      const variable = { name: 'ADMIN_NAME', email: 'ADMIN_EMAIL', password: 'ADMIN_PASSWORD' }[
        String(issue.path[0]) as 'name' | 'email' | 'password'
      ];
      console.error(`   - ${variable ?? 'ADMIN'}: ${issue.message}`);
    }

    return 1;
  }

  const result = await ensureInitialAdmin(new UsersRepository(), parsed.data);

  switch (result.status) {
    case 'created':
      console.log(`✅ Administrador inicial creado: ${result.email}`);
      console.log(
        '   Inicie sesión con la contraseña de ADMIN_PASSWORD; el sistema le pedirá cambiarla.',
      );
      return 0;
    case 'exists':
      console.log(
        'ℹ️  Ya existe un administrador activo: no se creó otro ni se cambió su contraseña.',
      );
      return 0;
    case 'email-in-use':
      console.error(
        `❌ El correo ${result.email} ya pertenece a otro usuario. Use otro en ADMIN_EMAIL.`,
      );
      return 1;
  }
}

main()
  .then(async (code) => {
    await disconnectPrisma();
    process.exitCode = code;
  })
  .catch(async (error: unknown) => {
    console.error('❌ Error al crear el administrador inicial:', error);
    await disconnectPrisma();
    process.exitCode = 1;
  });
