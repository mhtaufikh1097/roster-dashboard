import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { ensureTechnicianAccount } from '../userSync.js';

type Status = 'PAGI' | 'SIANG' | 'Office Hour' | '';
const VALID_STATUS = new Set(['PAGI', 'SIANG', 'Office Hour']);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

type RosterPayload = {
  monthLabel?: string;
  filename?: string;
  dates?: string[];
  personnel?: Array<{
    name?: string;
    department?: string;
    position?: string;
    schedule?: Record<string, Status>;
  }>;
  activate?: boolean;
};

const validatePayload = (body: RosterPayload | undefined): string | null => {
  if (!body?.monthLabel?.trim()) return 'Label bulan wajib diisi.';
  if (!Array.isArray(body.dates) || !body.dates.length || !body.dates.every((d) => DATE_KEY.test(d))) {
    return 'Daftar tanggal tidak valid.';
  }
  if (!Array.isArray(body.personnel) || !body.personnel.length) return 'Minimal satu personel diperlukan.';
  if (body.personnel.some((p) => !p.name?.trim())) return 'Nama personel tidak boleh kosong.';
  return null;
};

const writeEntries = async (client: PoolClient, periodId: number, body: RosterPayload): Promise<void> => {
  await client.query('DELETE FROM roster_entries WHERE period_id = $1', [periodId]);

  for (const person of body.personnel ?? []) {
    const name = person.name!.trim();
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO personnel (name, department, position) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET
         department = COALESCE(NULLIF(EXCLUDED.department, ''), personnel.department),
         position = COALESCE(NULLIF(EXCLUDED.position, ''), personnel.position)
       RETURNING id`,
      [name, person.department?.trim() ?? '', person.position?.trim() ?? ''],
    );
    const personnelId = rows[0].id;
    await ensureTechnicianAccount(client, personnelId, name);

    for (const dateKey of body.dates ?? []) {
      const status = person.schedule?.[dateKey] ?? '';
      if (VALID_STATUS.has(status)) {
        await client.query(
          'INSERT INTO roster_entries (period_id, personnel_id, work_date, status) VALUES ($1, $2, $3, $4)',
          [periodId, personnelId, dateKey, status],
        );
      }
    }
  }
};

const loadRoster = async (periodId: number) => {
  const periodResult = await pool.query('SELECT * FROM roster_periods WHERE id = $1', [periodId]);
  const period = periodResult.rows[0];
  if (!period) return null;

  const { rows: entries } = await pool.query<{ personnel_id: number; work_date: string; status: Status }>(
    'SELECT personnel_id, work_date, status FROM roster_entries WHERE period_id = $1 ORDER BY work_date',
    [periodId],
  );
  const { rows: people } = await pool.query(
    `SELECT DISTINCT p.id, p.name, p.department, p.position FROM personnel p
     JOIN roster_entries e ON e.personnel_id = p.id WHERE e.period_id = $1 ORDER BY p.name`,
    [periodId],
  );
  // Personel tanpa satu pun jadwal tetap harus muncul: ambil semua personel aktif.
  const { rows: allActive } = await pool.query(
    'SELECT id, name, department, position FROM personnel WHERE is_active ORDER BY name',
  );
  const merged = new Map<number, { id: number; name: string; department: string; position: string }>();
  [...allActive, ...people].forEach((p) => merged.set(p.id, p));

  // Daftar tanggal: seluruh hari dari start_date sampai end_date.
  const dates: string[] = [];
  const cursor = new Date(`${period.start_date}T00:00:00Z`);
  const end = new Date(`${period.end_date}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const scheduleByPerson = new Map<number, Record<string, Status>>();
  entries.forEach((entry) => {
    const schedule = scheduleByPerson.get(entry.personnel_id) ?? {};
    schedule[entry.work_date] = entry.status;
    scheduleByPerson.set(entry.personnel_id, schedule);
  });

  return {
    id: period.id,
    filename: period.filename,
    monthLabel: period.month_label,
    isActive: period.is_active,
    updatedAt: period.updated_at,
    dates,
    personnel: [...merged.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => {
        const schedule: Record<string, Status> = {};
        dates.forEach((d) => {
          schedule[d] = scheduleByPerson.get(p.id)?.[d] ?? '';
        });
        return { id: p.id, name: p.name, department: p.department, position: p.position, schedule };
      }),
  };
};

export const rosterRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/api/roster/active', { preHandler: authenticate }, async (_request, reply) => {
    const { rows } = await pool.query<{ id: number }>(
      'SELECT id FROM roster_periods WHERE is_active ORDER BY updated_at DESC LIMIT 1',
    );
    if (!rows[0]) return reply.code(404).send({ message: 'Belum ada roster aktif.' });
    return loadRoster(rows[0].id);
  });

  app.get('/api/roster/periods', { preHandler: requireRole('admin') }, async () => {
    const { rows } = await pool.query(
      'SELECT id, month_label, filename, start_date, end_date, is_active, updated_at FROM roster_periods ORDER BY start_date DESC',
    );
    return rows.map((r) => ({
      id: r.id,
      monthLabel: r.month_label,
      filename: r.filename,
      startDate: r.start_date,
      endDate: r.end_date,
      isActive: r.is_active,
      updatedAt: r.updated_at,
    }));
  });

  app.get<{ Params: { id: string } }>('/api/roster/periods/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const roster = await loadRoster(Number(request.params.id));
    return roster ?? reply.code(404).send({ message: 'Periode roster tidak ditemukan.' });
  });

  // Dipakai oleh input manual maupun import Excel (payload sama).
  app.post<{ Body: RosterPayload }>('/api/roster/periods', { preHandler: requireRole('admin') }, async (request, reply) => {
    const error = validatePayload(request.body);
    if (error) return reply.code(400).send({ message: error });
    const body = request.body;
    const sorted = [...body.dates!].sort();

    const id = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO roster_periods (month_label, filename, start_date, end_date, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [body.monthLabel!.trim(), body.filename ?? '', sorted[0], sorted[sorted.length - 1], request.user.id],
      );
      await writeEntries(client, rows[0].id, body);
      if (body.activate !== false) {
        await client.query('UPDATE roster_periods SET is_active = (id = $1)', [rows[0].id]);
      }
      return rows[0].id;
    });
    return reply.code(201).send({ id });
  });

  app.put<{ Params: { id: string }; Body: RosterPayload }>(
    '/api/roster/periods/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const error = validatePayload(request.body);
      if (error) return reply.code(400).send({ message: error });
      const body = request.body;
      const sorted = [...body.dates!].sort();

      const found = await withTransaction(async (client) => {
        const result = await client.query(
          `UPDATE roster_periods SET month_label = $2, start_date = $3, end_date = $4, updated_at = now()
           WHERE id = $1`,
          [request.params.id, body.monthLabel!.trim(), sorted[0], sorted[sorted.length - 1]],
        );
        if (!result.rowCount) return false;
        await writeEntries(client, Number(request.params.id), body);
        return true;
      });
      return found ? { ok: true } : reply.code(404).send({ message: 'Periode roster tidak ditemukan.' });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/roster/periods/:id/activate',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const exists = await pool.query('SELECT 1 FROM roster_periods WHERE id = $1', [request.params.id]);
      if (!exists.rowCount) return reply.code(404).send({ message: 'Periode roster tidak ditemukan.' });
      await pool.query('UPDATE roster_periods SET is_active = (id = $1)', [request.params.id]);
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/roster/periods/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const result = await pool.query('DELETE FROM roster_periods WHERE id = $1', [request.params.id]);
    return result.rowCount ? { ok: true } : reply.code(404).send({ message: 'Periode roster tidak ditemukan.' });
  });
};

