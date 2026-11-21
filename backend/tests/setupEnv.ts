// Carga .env.test antes que src/config/env.ts lea .env (dotenv no sobrescribe variables ya definidas).
import { config } from 'dotenv';

config({ path: '.env.test' });

// Las pruebas nunca llaman a la pasarela real: sin claves de Stripe (cada prueba que la necesita inyecta una falsa).
// Se fijan vacías antes de que dotenv lea .env, que no sobrescribe variables ya definidas.
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = '';
