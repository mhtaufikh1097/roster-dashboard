import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { withTransaction, type Queryable } from './db.js';

export const DEFAULT_TECH_PASSWORD = 'Admin123!';
export const DEFAULT_SUPERVISOR_PASSWORD = 'Supervisor123!';

const PREFERRED_USERNAMES: Record<string, string> = {
  urwah: 'urwah',
  'm noer avian dwijaya': 'avian',
  'tsany sutia': 'tsany',
  'm fadel yudistira': 'fadel',
  'rizal rabby radhiyya': 'rizal',
  'muhammad taufik hidayat': 'taufik',
  zigmahara: 'zigmahara',
  'muhammad syaeful': 'syaeful',
};

export const toUsernameFromName = (name: string): string => {
  const lower = name.trim().toLowerCase();
  if (PREFERRED_USERNAMES[lower]) return PREFERRED_USERNAMES[lower];
  const parts = lower
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return `tech${Date.now()}`;
  if ((parts[0] === 'm' || parts[0] === 'muhammad') && parts[1]) {
    return parts[1] === 'noer' && parts[2] ? parts[2] : parts[1];
  }
  return parts[0];
};

let cachedDefaultHash: string | null = null;
const getDefaultPasswordHash = async (): Promise<string> => {
  if (!cachedDefaultHash) {
    cachedDefaultHash = await bcrypt.hash(DEFAULT_TECH_PASSWORD, 10);
  }
  return cachedDefaultHash;
};

/**
 * Pastikan setiap personel di roster memiliki akun login technician (role = 'user')
 * yang tertaut ke personnel_id-nya.
 */
export const ensureTechnicianAccount = async (
  db: Queryable,
  personnelId: number,
  fullName: string,
): Promise<void> => {
  const cleanName = fullName.trim();
  if (!cleanName) return;

  const existingByPersonnel = await db.query<{ id: number }>(
    'SELECT id FROM users WHERE personnel_id = $1 LIMIT 1',
    [personnelId],
  );
  if (existingByPersonnel.rows[0]) {
    await db.query('UPDATE users SET full_name = $2 WHERE id = $1', [existingByPersonnel.rows[0].id, cleanName]);
    return;
  }

  const baseUsername = toUsernameFromName(cleanName);
  const hash = await getDefaultPasswordHash();

  const existingByName = await db.query<{ id: number; role: string }>(
    'SELECT id, role FROM users WHERE lower(username) = lower($1) OR lower(full_name) = lower($2) LIMIT 1',
    [baseUsername, cleanName],
  );
  if (existingByName.rows[0]) {
    await db.query(
      'UPDATE users SET personnel_id = COALESCE(personnel_id, $2), full_name = $3 WHERE id = $1',
      [existingByName.rows[0].id, personnelId, cleanName],
    );
    return;
  }

  let candidate = baseUsername;
  for (let suffix = 1; suffix < 50; suffix += 1) {
    const taken = await db.query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [candidate]);
    if (!taken.rowCount) break;
    candidate = `${baseUsername}${suffix}`;
  }

  await db.query(
    `INSERT INTO users (username, password_hash, full_name, role, personnel_id, is_active)
     VALUES ($1, $2, $3, 'user', $4, TRUE)`,
    [candidate, hash, cleanName, personnelId],
  );
};

const INITIAL_SUPERVISORS = [
  { username: 'zigmahara', fullName: 'Zigmahara' },
  { username: 'syaeful', fullName: 'Muhammad Syaeful' },
];

const INITIAL_ROSTER_PERSONNEL: Array<{
  name: string;
  department: string;
  position: string;
  pattern: Array<'PAGI' | 'SIANG' | 'Office Hour' | ''>;
}> = [
  {
    name: 'Urwah',
    department: 'HPIO',
    position: 'IT Technician',
    pattern: [
      'PAGI', '', '', 'SIANG', 'SIANG', 'PAGI', 'SIANG', 'PAGI', '', '',
      'SIANG', 'SIANG', 'PAGI', 'SIANG', 'PAGI', '', '', 'SIANG', 'SIANG', 'PAGI',
      'SIANG', 'PAGI', '', '', 'SIANG', 'SIANG', 'PAGI', 'SIANG', 'PAGI', '', '',
    ],
  },
  {
    name: 'M Noer Avian Dwijaya',
    department: 'HPIO',
    position: 'IT Technician',
    pattern: [
      '', 'SIANG', 'PAGI', 'PAGI', 'PAGI', '', '', 'SIANG', 'PAGI', 'SIANG',
      'PAGI', 'PAGI', '', '', 'SIANG', 'PAGI', 'SIANG', 'PAGI', 'PAGI', '',
      '', 'SIANG', 'PAGI', 'SIANG', 'PAGI', 'PAGI', '', '', 'SIANG', 'PAGI', 'SIANG',
    ],
  },
  {
    name: 'Tsany Sutia',
    department: 'HPIO',
    position: 'IT Technician',
    pattern: [
      'SIANG', 'SIANG', 'PAGI', '', '', 'SIANG', 'SIANG', 'PAGI', 'SIANG', 'PAGI',
      '', '', 'SIANG', 'SIANG', 'PAGI', 'SIANG', 'PAGI', '', '', 'SIANG',
      'SIANG', 'PAGI', 'SIANG', 'PAGI', '', '', 'SIANG', 'SIANG', 'PAGI', 'SIANG', 'PAGI',
    ],
  },
  {
    name: 'M Fadel Yudistira',
    department: 'HPIO',
    position: 'IT Technician',
    pattern: [
      'SIANG', 'PAGI', '', '', 'SIANG', 'SIANG', 'PAGI', 'SIANG', 'PAGI', '',
      '', 'SIANG', 'SIANG', 'PAGI', 'SIANG', 'PAGI', '', '', 'SIANG', 'SIANG',
      'PAGI', 'SIANG', 'PAGI', '', '', 'SIANG', 'SIANG', 'PAGI', 'SIANG', 'PAGI', '',
    ],
  },
  {
    name: 'Rizal Rabby Radhiyya',
    department: 'HPIO',
    position: 'IT Technician',
    pattern: [
      '', '', 'SIANG', 'SIANG', 'PAGI', 'PAGI', '', '', 'SIANG', 'SIANG',
      'SIANG', 'PAGI', 'PAGI', '', '', 'SIANG', 'SIANG', 'SIANG', 'PAGI', 'PAGI',
      '', '', 'SIANG', 'SIANG', 'SIANG', 'PAGI', 'PAGI', '', '', 'SIANG', 'SIANG',
    ],
  },
  {
    name: 'Muhammad Taufik Hidayat',
    department: 'HPIO',
    position: 'IT Technician',
    pattern: [
      'Office Hour', 'Office Hour', '', '', 'Office Hour', 'Office Hour', 'Office Hour', 'Office Hour', 'Office Hour', '',
      '', 'Office Hour', 'Office Hour', 'Office Hour', 'Office Hour', 'Office Hour', '', '', 'Office Hour', 'Office Hour',
      'Office Hour', 'Office Hour', 'Office Hour', '', '', 'Office Hour', 'Office Hour', 'Office Hour', 'Office Hour', 'Office Hour', '',
    ],
  },
];

export const ensureInitialData = async (): Promise<void> => {
  await withTransaction(async (client: PoolClient) => {
    const adminHash = await bcrypt.hash('Admin123!', 10);
    const supHash = await bcrypt.hash(DEFAULT_SUPERVISOR_PASSWORD, 10);

    await client.query(
      `INSERT INTO users (username, password_hash, full_name, role, is_active)
       VALUES ('admin', $1, 'Administrator', 'admin', TRUE)
       ON CONFLICT (username) DO NOTHING`,
      [adminHash],
    );

    // Pastikan akun Supervisor Zigmahara & Muhammad Syaeful tersedia
    for (const sup of INITIAL_SUPERVISORS) {
      await client.query(
        `INSERT INTO users (username, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, 'supervisor', TRUE)
         ON CONFLICT (username) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           role = 'supervisor',
           is_active = TRUE`,
        [sup.username, supHash, sup.fullName],
      );
    }

    // Nonaktifkan akun dummy 'supervisor' dan 'user' bawaan awal jika masih ada agar daftar user bersih
    await client.query(
      "UPDATE users SET is_active = FALSE WHERE username IN ('supervisor', 'user') AND personnel_id IS NULL",
    );

    const personnelIds = new Map<string, number>();
    for (const person of INITIAL_ROSTER_PERSONNEL) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO personnel (name, department, position, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (name) DO UPDATE SET
           department = EXCLUDED.department,
           position = EXCLUDED.position
         RETURNING id`,
        [person.name, person.department, person.position],
      );
      personnelIds.set(person.name, rows[0].id);
      await ensureTechnicianAccount(client, rows[0].id, person.name);
    }

    const { rows: allPersonnel } = await client.query<{ id: number; name: string }>(
      'SELECT id, name FROM personnel WHERE is_active',
    );
    for (const p of allPersonnel) {
      await ensureTechnicianAccount(client, p.id, p.name);
    }

    const existingPeriods = await client.query('SELECT 1 FROM roster_periods LIMIT 1');
    if (!existingPeriods.rowCount) {
      const { rows: periodRows } = await client.query<{ id: number }>(
        `INSERT INTO roster_periods (month_label, filename, start_date, end_date, is_active)
         VALUES ('Oktober 2026', 'Roster-Ranger-Oct-2026.xlsx', '2026-10-01', '2026-10-31', TRUE)
         RETURNING id`,
      );
      const periodId = periodRows[0].id;

      for (const person of INITIAL_ROSTER_PERSONNEL) {
        const pid = personnelIds.get(person.name)!;
        for (let day = 1; day <= 31; day += 1) {
          const status = person.pattern[day - 1] ?? '';
          if (status) {
            const dateKey = `2026-10-${String(day).padStart(2, '0')}`;
            await client.query(
              'INSERT INTO roster_entries (period_id, personnel_id, work_date, status) VALUES ($1, $2, $3, $4)',
              [periodId, pid, dateKey, status],
            );
          }
        }
      }
    }
  });
};
