import { pool } from '../db.js';
import { ensureInitialData } from '../userSync.js';

await ensureInitialData();
console.log('Seed selesai: Roster Oktober 2026, 6 akun Technician sesuai nama roster, Supervisor, dan Admin siap.');
await pool.end();
