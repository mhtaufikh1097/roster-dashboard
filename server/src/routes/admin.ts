import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { authenticate, requireRole, type Role } from '../auth.js';
import { ensureAuditTable, recordAuditLog } from '../auditLog.js';
import { ensureTechnicianAccount } from '../userSync.js';

const ROLES: Role[] = ['admin', 'supervisor', 'user'];

type PersonnelBody = { name?: string; department?: string; position?: string; isActive?: boolean };
type UserBody = {
  username?: string;
  password?: string;
  fullName?: string;
  position?: string;
  role?: Role;
  personnelId?: number | null;
  isActive?: boolean;
};

const defaultPositionForRole = (role: Role): string => {
  if (role === 'supervisor') return 'IT Engineer';
  if (role === 'admin') return 'Administrator';
  return 'IT Technician';
};

const mapUser = (row: Record<string, unknown>) => {
  const role = (row.role as Role) || 'user';
  const rawPos = String(row.position ?? row.personnel_position ?? '').trim();
  const position = rawPos && rawPos.toLowerCase() !== 'supervisor' ? rawPos : defaultPositionForRole(role);
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    position,
    role,
    personnelId: row.personnel_id,
    personnelName: row.personnel_name ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
};

export const adminRoutes = async (app: FastifyInstance): Promise<void> => {
  // ---- Personel ----
  app.get<{ Querystring: { all?: string } }>('/api/personnel', { preHandler: authenticate }, async (request) => {
    const onlyActive = request.query.all === 'true' && request.user.role === 'admin' ? '' : 'WHERE is_active';
    const { rows } = await pool.query(
      `SELECT id, name, department, position, is_active FROM personnel ${onlyActive} ORDER BY name`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      department: row.department,
      position: row.position,
      isActive: row.is_active,
    }));
  });

  app.post<{ Body: PersonnelBody }>('/api/personnel', { preHandler: requireRole('admin') }, async (request, reply) => {
    const name = request.body?.name?.trim();
    if (!name) return reply.code(400).send({ message: 'Nama personel wajib diisi.' });
    try {
      const { rows } = await pool.query(
        'INSERT INTO personnel (name, department, position) VALUES ($1, $2, $3) RETURNING id',
        [name, request.body.department?.trim() ?? '', request.body.position?.trim() ?? ''],
      );
      await ensureTechnicianAccount(pool, rows[0].id, name);
      await recordAuditLog({
        user: request.user,
        action: 'EDIT',
        module: 'Master Personel',
        description: `Menambahkan personel baru: ${name}`,
      });
      return reply.code(201).send({ id: rows[0].id });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ message: 'Nama personel sudah ada.' });
      }
      throw error;
    }
  });

  app.put<{ Params: { id: string }; Body: PersonnelBody }>(
    '/api/personnel/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { name, department, position, isActive } = request.body ?? {};
      const result = await pool.query(
        `UPDATE personnel SET
           name = COALESCE($2, name),
           department = COALESCE($3, department),
           position = COALESCE($4, position),
           is_active = COALESCE($5, is_active)
         WHERE id = $1`,
        [request.params.id, name?.trim() || null, department?.trim() ?? null, position?.trim() ?? null, isActive ?? null],
      );
      if (!result.rowCount) return reply.code(404).send({ message: 'Personel tidak ditemukan.' });
      if (name?.trim()) {
        await pool.query('UPDATE users SET full_name = $2 WHERE personnel_id = $1', [request.params.id, name.trim()]);
      }
      await recordAuditLog({
        user: request.user,
        action: 'EDIT',
        module: 'Master Personel',
        description: `Mengedit data personel ID #${request.params.id}${name?.trim() ? ` (${name.trim()})` : ''}`,
      });
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/personnel/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    try {
      const prev = await pool.query<{ name: string }>('SELECT name FROM personnel WHERE id = $1', [request.params.id]);
      const result = await pool.query('DELETE FROM personnel WHERE id = $1', [request.params.id]);
      if (!result.rowCount) return reply.code(404).send({ message: 'Personel tidak ditemukan.' });
      await recordAuditLog({
        user: request.user,
        action: 'DELETE',
        module: 'Master Personel',
        description: `Menghapus personel: ${prev.rows[0]?.name ?? `#${request.params.id}`}`,
      });
      return { ok: true };
    } catch {
      return reply.code(409).send({
        message: 'Personel sudah terhubung pada laporan activity. Gunakan fitur Nonaktifkan.',
      });
    }
  });

  // ---- Pengguna (Admin Control) ----
  app.get('/api/users', { preHandler: requireRole('admin') }, async () => {
    const { rows } = await pool.query(
      `SELECT u.*, p.name AS personnel_name, p.position AS personnel_position FROM users u
       LEFT JOIN personnel p ON p.id = u.personnel_id
       ORDER BY u.is_active DESC, CASE u.role WHEN 'admin' THEN 1 WHEN 'supervisor' THEN 2 ELSE 3 END, u.full_name, u.username`,
    );
    return rows.map(mapUser);
  });

  app.post<{ Body: UserBody }>('/api/users', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { username, password, fullName, position, role, personnelId } = request.body ?? {};
    if (!username?.trim() || !password || !role || !ROLES.includes(role)) {
      return reply.code(400).send({ message: 'Username, password, dan role wajib diisi dengan benar.' });
    }
    if (password.length < 6) {
      return reply.code(400).send({ message: 'Password minimal 6 karakter.' });
    }
    try {
      const hash = await bcrypt.hash(password, 10);
      const cleanPosition = position?.trim() || defaultPositionForRole(role);
      const { rows } = await pool.query(
        `INSERT INTO users (username, password_hash, full_name, position, role, personnel_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
        [username.trim(), hash, fullName?.trim() || username.trim(), cleanPosition, role, personnelId ?? null],
      );
      await recordAuditLog({
        user: request.user,
        action: 'EDIT',
        module: 'Manajemen User',
        description: `Menambahkan akun pengguna baru: ${fullName?.trim() || username.trim()} (@${username.trim()}, jabatan: ${cleanPosition})`,
      });
      return reply.code(201).send({ id: rows[0].id });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ message: 'Username sudah dipakai.' });
      }
      throw error;
    }
  });

  app.put<{ Params: { id: string }; Body: UserBody }>(
    '/api/users/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { username, password, fullName, position, role, personnelId, isActive } = request.body ?? {};
      if (role && !ROLES.includes(role)) return reply.code(400).send({ message: 'Role tidak valid.' });
      if (password !== undefined && password.length < 6) {
        return reply.code(400).send({ message: 'Password minimal 6 karakter.' });
      }
      if (Number(request.params.id) === request.user.id && (isActive === false || (role && role !== 'admin'))) {
        return reply.code(400).send({ message: 'Anda tidak dapat menonaktifkan atau menurunkan role akun sendiri.' });
      }

      const hash = password ? await bcrypt.hash(password, 10) : null;
      try {
        const result = await pool.query(
          `UPDATE users SET
             username = COALESCE($2, username),
             password_hash = COALESCE($3, password_hash),
             full_name = COALESCE($4, full_name),
             position = COALESCE($5, position),
             role = COALESCE($6, role),
             personnel_id = CASE WHEN $7::boolean THEN $8::integer ELSE personnel_id END,
             is_active = COALESCE($9, is_active)
           WHERE id = $1`,
          [
            request.params.id,
            username?.trim() || null,
            hash,
            fullName !== undefined ? fullName.trim() : null,
            position !== undefined ? position.trim() : null,
            role ?? null,
            personnelId !== undefined,
            personnelId ?? null,
            isActive ?? null,
          ],
        );
        if (!result.rowCount) return reply.code(404).send({ message: 'Pengguna tidak ditemukan.' });
        await recordAuditLog({
          user: request.user,
          action: 'EDIT',
          module: 'Manajemen User',
          description: `Mengedit akun pengguna ID #${request.params.id}${username ? ` (@${username.trim()})` : ''}${password ? ' [Reset Password]' : ''}`,
        });
        return { ok: true };
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.code(409).send({ message: 'Username sudah digunakan oleh akun lain.' });
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/users/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    if (Number(request.params.id) === request.user.id) {
      return reply.code(400).send({ message: 'Tidak dapat menghapus akun yang sedang Anda gunakan.' });
    }
    const prev = await pool.query<{ username: string; full_name: string }>(
      'SELECT username, full_name FROM users WHERE id = $1',
      [request.params.id],
    );
    const result = await pool.query('DELETE FROM users WHERE id = $1', [request.params.id]);
    if (!result.rowCount) return reply.code(404).send({ message: 'Pengguna tidak ditemukan.' });
    await recordAuditLog({
      user: request.user,
      action: 'DELETE',
      module: 'Manajemen User',
      description: `Menghapus akun pengguna: ${prev.rows[0]?.full_name || ''} (@${prev.rows[0]?.username || request.params.id})`,
    });
    return { ok: true };
  });

  // ---- Audit Logs (Log Aktivitas Pengguna: Login/Logout, Edit, Hapus) ----
  app.get<{
    Querystring: {
      action?: string;
      module?: string;
      search?: string;
      date?: string;
      page?: string;
      limit?: string;
    };
  }>('/api/audit-logs', { preHandler: requireRole('admin') }, async (request) => {
    await ensureAuditTable();

    const { action, module, search, date } = request.query;
    const limit = Math.min(Math.max(Number(request.query.limit) || 5, 1), 50);
    const page = Math.max(Number(request.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace(/\?/g, `$${params.length}`));
    };

    if (action && ['LOGIN', 'LOGOUT', 'EDIT', 'DELETE'].includes(action)) {
      add('action = ?', action);
    }
    if (module?.trim()) {
      add('module = ?', module.trim());
    }
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      add('(created_at AT TIME ZONE \'Asia/Jakarta\')::date = ?::date', date);
    }
    if (search?.trim()) {
      add(
        '(lower(full_name) LIKE ? OR lower(username) LIKE ? OR lower(description) LIKE ?)',
        `%${search.trim().toLowerCase()}%`,
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM audit_logs ${whereClause}`,
      params,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const listParams = [...params, limit, offset];
    const { rows } = await pool.query(
      `SELECT id, user_id, username, full_name, role, action, module, description, created_at
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams,
    );

    return {
      items: rows.map((r) => ({
        id: r.id as number,
        userId: r.user_id as number | null,
        username: r.username as string,
        fullName: r.full_name as string,
        role: r.role as Role,
        action: r.action as 'LOGIN' | 'LOGOUT' | 'EDIT' | 'DELETE',
        module: r.module as string,
        description: r.description as string,
        createdAt: r.created_at as string,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  });
};
