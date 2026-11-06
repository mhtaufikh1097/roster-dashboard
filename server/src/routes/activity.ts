import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../db.js';
import { authenticate, requireRole, type AuthUser } from '../auth.js';

const SHIFTS = ['Pagi', 'Siang', 'Office Hour', 'Libur'];
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

type ReportPayload = {
  date?: string;
  dutyPersonnelId?: number | null;
  dutyPersonnelIds?: number[];
  shift?: string;
  submit?: boolean;
  events?: Array<{ time?: string; contact?: string; location?: string; overview?: string; measures?: string; result?: string }>;
  notifications?: Array<{ person?: string; content?: string }>;
  handover?: {
    sparePartsStatus?: '' | 'Yes' | 'No';
    handoverPersonnelId?: number | null;
    handoverPersonnelIds?: number[];
    takeoverPersonnelId?: number | null;
    takeoverPersonnelIds?: number[];
    handoverMatters?: string;
    handoverTime?: string;
    takeoverTime?: string;
  };
};

type ReportQuery = { from?: string; to?: string; personnelId?: string; shift?: string; status?: string };

const normalizeIds = (list?: number[], single?: number | null): number[] => {
  const raw = Array.isArray(list) && list.length ? list : single ? [single] : [];
  const seen = new Set<number>();
  for (const item of raw) {
    const num = Number(item);
    if (Number.isInteger(num) && num > 0) seen.add(num);
  }
  return [...seen];
};

const formatSupervisorDisplay = (rawName: string): string => {
  const clean = rawName.trim();
  if (!clean) return '';
  if (/\(supervisor\)$/i.test(clean)) return clean;
  return `${clean} (Supervisor)`;
};

const REPORT_SELECT = `
  SELECT r.*, dp.name AS duty_name, hp.name AS handover_name, tp.name AS takeover_name,
         au.full_name AS ack_full_name, au.username AS ack_username,
         ap.name AS ack_personnel_name
  FROM activity_reports r
  JOIN personnel dp ON dp.id = r.duty_personnel_id
  LEFT JOIN personnel hp ON hp.id = r.handover_personnel_id
  LEFT JOIN personnel tp ON tp.id = r.takeover_personnel_id
  LEFT JOIN users au ON au.id = r.acknowledged_by
  LEFT JOIN personnel ap ON ap.id = au.personnel_id`;

const loadReports = async (where: string, params: unknown[]) => {
  const { rows } = await pool.query(`${REPORT_SELECT} ${where} ORDER BY r.report_date, r.created_at`, params);
  if (!rows.length) return [];

  const { rows: allPersonnel } = await pool.query<{ id: number; name: string }>('SELECT id, name FROM personnel');
  const personnelMap = new Map<number, string>(allPersonnel.map((p) => [p.id, p.name]));

  const ids = rows.map((r) => r.id);
  const { rows: events } = await pool.query(
    'SELECT * FROM activity_events WHERE report_id = ANY($1::uuid[]) ORDER BY position',
    [ids],
  );
  const { rows: notifications } = await pool.query(
    'SELECT * FROM activity_notifications WHERE report_id = ANY($1::uuid[]) ORDER BY position',
    [ids],
  );

  const namesFromIds = (idList: number[], fallback: string | null): string => {
    const names = idList.map((id) => personnelMap.get(id)).filter((n): n is string => !!n);
    return names.length ? names.join(', ') : (fallback ?? '');
  };

  return rows.map((r) => {
    const dutyIds = normalizeIds(r.duty_personnel_ids as number[] | undefined, r.duty_personnel_id as number);
    const handoverIds = normalizeIds(
      r.handover_personnel_ids as number[] | undefined,
      r.handover_personnel_id as number | null,
    );
    const takeoverIds = normalizeIds(
      r.takeover_personnel_ids as number[] | undefined,
      r.takeover_personnel_id as number | null,
    );

    const rawAckName =
      (r.acknowledged_by_name as string | null)?.trim() ||
      (r.ack_personnel_name as string | null)?.trim() ||
      (r.ack_full_name as string | null)?.trim() ||
      (r.ack_username as string | null)?.trim() ||
      '';

    return {
      id: r.id as string,
      date: r.report_date as string,
      dutyPersonnelId: dutyIds[0] ?? (r.duty_personnel_id as number),
      dutyPersonnelIds: dutyIds,
      personOnDuty: namesFromIds(dutyIds, r.duty_name as string),
      shift: r.shift as string,
      status: r.status as string,
      createdBy: r.created_by as number | null,
      updatedAt: r.updated_at as string,
      events: events
        .filter((e) => e.report_id === r.id)
        .map((e) => ({
          id: e.id, time: e.time, contact: e.contact, location: e.location,
          overview: e.overview, measures: e.measures, result: e.result,
        })),
      notifications: notifications
        .filter((n) => n.report_id === r.id)
        .map((n) => ({ id: n.id, person: n.person, content: n.content })),
      handover: {
        sparePartsStatus: r.spare_parts_status as string,
        handoverPersonnelId: handoverIds[0] ?? null,
        handoverPersonnelIds: handoverIds,
        handoverPerson: namesFromIds(handoverIds, r.handover_name as string | null),
        takeoverPersonnelId: takeoverIds[0] ?? null,
        takeoverPersonnelIds: takeoverIds,
        takeoverPerson: namesFromIds(takeoverIds, r.takeover_name as string | null),
        handoverMatters: r.handover_matters as string,
        handoverTime: r.handover_time as string,
        takeoverTime: r.takeover_time as string,
        // Diisi oleh supervisor setelah laporan di-submit technician, ditampilkan sebagai "Nama (Supervisor)".
        acknowledgedBy: rawAckName ? formatSupervisorDisplay(rawAckName) : '',
        acknowledgedAt: r.acknowledged_at as string | null,
      },
    };
  });
};

const validatePayload = (body: ReportPayload | undefined): string | null => {
  if (!body?.date || !DATE_KEY.test(body.date)) return 'Tanggal laporan wajib diisi.';
  const dutyIds = normalizeIds(body.dutyPersonnelIds, body.dutyPersonnelId);
  if (!dutyIds.length) return 'Minimal 1 Person on Duty wajib dipilih.';
  if (!body.shift || !SHIFTS.includes(body.shift)) return 'Shift tidak valid.';
  return null;
};

const writeChildren = async (client: PoolClient, reportId: string, body: ReportPayload): Promise<void> => {
  await client.query('DELETE FROM activity_events WHERE report_id = $1', [reportId]);
  await client.query('DELETE FROM activity_notifications WHERE report_id = $1', [reportId]);

  const events = (body.events ?? []).filter((e) => Object.values(e).some((v) => String(v ?? '').trim()));
  for (const [index, e] of events.entries()) {
    await client.query(
      `INSERT INTO activity_events (report_id, position, time, contact, location, overview, measures, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [reportId, index, e.time?.trim() ?? '', e.contact?.trim() ?? '', e.location?.trim() ?? '',
        e.overview?.trim() ?? '', e.measures?.trim() ?? '', e.result?.trim() ?? ''],
    );
  }

  const notifications = (body.notifications ?? []).filter((n) => n.person?.trim() || n.content?.trim());
  for (const [index, n] of notifications.entries()) {
    await client.query(
      'INSERT INTO activity_notifications (report_id, position, person, content) VALUES ($1, $2, $3, $4)',
      [reportId, index, n.person?.trim() ?? '', n.content?.trim() ?? ''],
    );
  }
};

const isReportParticipant = (
  user: AuthUser,
  report: { createdBy: number | null; dutyPersonnelIds: number[] },
): boolean =>
  report.createdBy === user.id || (!!user.personnelId && report.dutyPersonnelIds.includes(user.personnelId));

const canEdit = (
  user: AuthUser,
  report: { status: string; createdBy: number | null; dutyPersonnelIds: number[] },
): boolean => user.role === 'admin' || (report.status === 'Draft' && isReportParticipant(user, report));

const resolveSupervisorName = async (userId: number, customName?: string): Promise<string> => {
  if (customName?.trim()) return customName.trim();
  const { rows } = await pool.query<{ full_name: string; username: string; personnel_name: string | null }>(
    `SELECT u.full_name, u.username, p.name AS personnel_name
     FROM users u
     LEFT JOIN personnel p ON p.id = u.personnel_id
     WHERE u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return 'Supervisor';
  return row.personnel_name?.trim() || row.full_name?.trim() || row.username;
};

export const activityRoutes = async (app: FastifyInstance): Promise<void> => {
  await pool.query(`
    ALTER TABLE activity_reports ADD COLUMN IF NOT EXISTS acknowledged_by_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE activity_reports ADD COLUMN IF NOT EXISTS duty_personnel_ids INTEGER[] NOT NULL DEFAULT '{}';
    ALTER TABLE activity_reports ADD COLUMN IF NOT EXISTS handover_personnel_ids INTEGER[] NOT NULL DEFAULT '{}';
    ALTER TABLE activity_reports ADD COLUMN IF NOT EXISTS takeover_personnel_ids INTEGER[] NOT NULL DEFAULT '{}';
  `);

  // Dipakai untuk list, filter, dan cetak per periode (from/to).
  app.get<{ Querystring: ReportQuery }>('/api/activity', { preHandler: authenticate }, async (request) => {
    const { from, to, personnelId, shift, status } = request.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace(/\?/g, `$${params.length}`));
    };
    if (from && DATE_KEY.test(from)) add('r.report_date >= ?', from);
    if (to && DATE_KEY.test(to)) add('r.report_date <= ?', to);
    if (personnelId) add('(r.duty_personnel_id = ? OR ? = ANY(r.duty_personnel_ids))', Number(personnelId));
    if (shift) add('r.shift = ?', shift);
    if (status) add('r.status = ?', status);
    return loadReports(conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params);
  });

  app.get<{ Params: { id: string } }>('/api/activity/:id', { preHandler: authenticate }, async (request, reply) => {
    const [report] = await loadReports('WHERE r.id = $1', [request.params.id]);
    return report ?? reply.code(404).send({ message: 'Laporan tidak ditemukan.' });
  });

  app.post<{ Body: ReportPayload }>('/api/activity', { preHandler: authenticate }, async (request, reply) => {
    const error = validatePayload(request.body);
    if (error) return reply.code(400).send({ message: error });
    const body = request.body;
    const h = body.handover ?? {};
    const dutyIds = normalizeIds(body.dutyPersonnelIds, body.dutyPersonnelId);
    const handoverIds = normalizeIds(h.handoverPersonnelIds, h.handoverPersonnelId);
    const takeoverIds = normalizeIds(h.takeoverPersonnelIds, h.takeoverPersonnelId);
    const initialStatus = body.submit ? 'Submitted' : 'Draft';

    const id = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO activity_reports
           (report_date, duty_personnel_id, duty_personnel_ids, shift, status, spare_parts_status,
            handover_personnel_id, handover_personnel_ids, takeover_personnel_id, takeover_personnel_ids,
            handover_matters, handover_time, takeover_time, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [
          body.date,
          dutyIds[0],
          dutyIds,
          body.shift,
          initialStatus,
          h.sparePartsStatus ?? '',
          handoverIds[0] ?? null,
          handoverIds,
          takeoverIds[0] ?? null,
          takeoverIds,
          h.handoverMatters?.trim() ?? '',
          h.handoverTime ?? '',
          h.takeoverTime ?? '',
          request.user.id,
        ],
      );
      await writeChildren(client, rows[0].id, body);
      return rows[0].id;
    });
    return reply.code(201).send({ id, status: initialStatus });
  });

  // Edit: pemilik / personel on duty hanya saat Draft; setelah itu hanya admin.
  app.put<{ Params: { id: string }; Body: ReportPayload }>(
    '/api/activity/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const error = validatePayload(request.body);
      if (error) return reply.code(400).send({ message: error });
      const [existing] = await loadReports('WHERE r.id = $1', [request.params.id]);
      if (!existing) return reply.code(404).send({ message: 'Laporan tidak ditemukan.' });
      if (!canEdit(request.user, existing)) {
        return reply.code(403).send({ message: 'Laporan yang sudah disubmit hanya dapat diubah oleh admin.' });
      }
      const body = request.body;
      const h = body.handover ?? {};
      const dutyIds = normalizeIds(body.dutyPersonnelIds, body.dutyPersonnelId);
      const handoverIds = normalizeIds(h.handoverPersonnelIds, h.handoverPersonnelId);
      const takeoverIds = normalizeIds(h.takeoverPersonnelIds, h.takeoverPersonnelId);
      const nextStatus = body.submit && existing.status === 'Draft' ? 'Submitted' : existing.status;

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE activity_reports SET
             report_date = $2, duty_personnel_id = $3, duty_personnel_ids = $4, shift = $5, status = $6,
             spare_parts_status = $7, handover_personnel_id = $8, handover_personnel_ids = $9,
             takeover_personnel_id = $10, takeover_personnel_ids = $11,
             handover_matters = $12, handover_time = $13, takeover_time = $14, updated_at = now()
           WHERE id = $1`,
          [
            request.params.id,
            body.date,
            dutyIds[0],
            dutyIds,
            body.shift,
            nextStatus,
            h.sparePartsStatus ?? '',
            handoverIds[0] ?? null,
            handoverIds,
            takeoverIds[0] ?? null,
            takeoverIds,
            h.handoverMatters?.trim() ?? '',
            h.handoverTime ?? '',
            h.takeoverTime ?? '',
          ],
        );
        await writeChildren(client, request.params.id, body);
      });
      return { ok: true, status: nextStatus };
    },
  );

  // Technician submit laporan Draft -> Submitted
  app.post<{ Params: { id: string } }>(
    '/api/activity/:id/submit',
    { preHandler: requireRole('admin', 'supervisor', 'user') },
    async (request, reply) => {
      const [report] = await loadReports('WHERE r.id = $1', [request.params.id]);
      if (!report) return reply.code(404).send({ message: 'Laporan tidak ditemukan.' });
      if (report.status !== 'Draft') {
        return reply.code(409).send({ message: `Laporan sudah berstatus ${report.status}.` });
      }
      if (request.user.role !== 'admin' && !isReportParticipant(request.user, report)) {
        return reply.code(403).send({ message: 'Hanya technician yang bertugas pada laporan ini yang dapat men-submit.' });
      }
      await pool.query("UPDATE activity_reports SET status = 'Submitted', updated_at = now() WHERE id = $1", [
        request.params.id,
      ]);
      return { ok: true, status: 'Submitted' };
    },
  );

  // Supervisor acknowledge laporan yang sudah Submitted -> Reviewed + isi nama supervisor
  app.post<{ Params: { id: string }; Body: { acknowledgedByName?: string } }>(
    '/api/activity/:id/acknowledge',
    { preHandler: requireRole('admin', 'supervisor') },
    async (request, reply) => {
      const [report] = await loadReports('WHERE r.id = $1', [request.params.id]);
      if (!report) return reply.code(404).send({ message: 'Laporan tidak ditemukan.' });
      if (report.status !== 'Submitted') {
        return reply.code(409).send({
          message: 'Hanya laporan yang sudah di-submit oleh technician yang dapat di-acknowledge supervisor.',
        });
      }
      const supervisorName = await resolveSupervisorName(request.user.id, request.body?.acknowledgedByName);
      await pool.query(
        `UPDATE activity_reports
         SET status = 'Reviewed', acknowledged_by = $2, acknowledged_by_name = $3, acknowledged_at = now(), updated_at = now()
         WHERE id = $1`,
        [request.params.id, request.user.id, supervisorName],
      );
      return { ok: true, status: 'Reviewed', acknowledgedBy: formatSupervisorDisplay(supervisorName) };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/activity/:id/close',
    { preHandler: requireRole('admin', 'supervisor') },
    async (request, reply) => {
      const [report] = await loadReports('WHERE r.id = $1', [request.params.id]);
      if (!report) return reply.code(404).send({ message: 'Laporan tidak ditemukan.' });
      if (report.status !== 'Reviewed') {
        return reply.code(409).send({ message: 'Laporan harus di-acknowledge terlebih dahulu sebelum ditutup.' });
      }
      await pool.query("UPDATE activity_reports SET status = 'Closed', updated_at = now() WHERE id = $1", [
        request.params.id,
      ]);
      return { ok: true, status: 'Closed' };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/activity/:id/reject',
    { preHandler: requireRole('admin', 'supervisor') },
    async (request, reply) => {
      const [report] = await loadReports('WHERE r.id = $1', [request.params.id]);
      if (!report) return reply.code(404).send({ message: 'Laporan tidak ditemukan.' });
      if (!['Submitted', 'Reviewed'].includes(report.status)) {
        return reply.code(409).send({ message: `Aksi tidak dapat dilakukan pada laporan berstatus ${report.status}.` });
      }
      await pool.query(
        `UPDATE activity_reports
         SET status = 'Draft', acknowledged_by = NULL, acknowledged_by_name = '', acknowledged_at = NULL, updated_at = now()
         WHERE id = $1`,
        [request.params.id],
      );
      return { ok: true, status: 'Draft' };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/activity/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const result = await pool.query('DELETE FROM activity_reports WHERE id = $1', [request.params.id]);
    return result.rowCount ? { ok: true } : reply.code(404).send({ message: 'Laporan tidak ditemukan.' });
  });
};
