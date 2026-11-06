import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const schemaPath = fileURLToPath(new URL('../../sql/schema.sql', import.meta.url));
await pool.query(readFileSync(schemaPath, 'utf8'));
console.log('Skema database siap.');
await pool.end();

