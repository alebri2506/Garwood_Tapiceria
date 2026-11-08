// Carga .env.test antes que src/config/env.ts lea .env (dotenv no sobrescribe variables ya definidas).
import { config } from 'dotenv';

config({ path: '.env.test' });
