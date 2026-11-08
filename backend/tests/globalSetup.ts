import { execSync } from 'node:child_process';
import { config } from 'dotenv';

/** Deja la base de pruebas vacía, con todas las migraciones y el seed aplicados. */
export default function setup() {
  const { parsed } = config({ path: '.env.test' });
  if (!parsed?.DATABASE_URL?.includes('test')) {
    throw new Error('.env.test debe apuntar a una base de datos de pruebas (su nombre debe contener "test").');
  }
  execSync('npx prisma migrate reset --force --skip-generate', { stdio: 'ignore', env: { ...process.env, ...parsed } });
}
