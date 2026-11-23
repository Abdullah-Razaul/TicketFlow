import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({PORT:z.coerce.number().default(4000),DATABASE_URL:z.string().min(1),JWT_SECRET:z.string().min(24),JWT_EXPIRES_IN:z.string().default('1d'),HOLD_MINUTES:z.coerce.number().int().positive().default(5),CLIENT_ORIGIN:z.string().default('http://localhost:5173')});
export const env=schema.parse(process.env);
