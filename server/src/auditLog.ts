import { pool } from './db.js';
import type { AuthUser, Role } from './auth.js';

export type AuditAction = 'LOGIN' | 'LOGOUT' | 'EDIT' | 'DELETE';

export type AuditLogInput = {
  user?: AuthUser | null;
  userId?: number | null;
  username?: string;
  fullName?: string;
  role?: Role | string;
  action: AuditAction;
  module: string;
  description: string;
};

let initialized = false;

export const ensureAuditTable = async (): Promise<void> => {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username     TEXT NOT NULL DEFAULT '',
      full_name    TEXT NOT NULL DEFAULT '',
      role         TEXT NOT NULL DEFAULT 'user',
      action       TEXT NOT NULL CHECK (action IN ('LOGIN', 'LOGOUT', 'EDIT', 'DELETE')),
      module       TEXT NOT NULL DEFAULT '',
      description  TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
  `);
  initialized = true;
};

export const recordAuditLog = async (input: AuditLogInput): Promise<void> => {
  try {
    await ensureAuditTable();

    const userId = input.user?.id ?? input.userId ?? null;
    let username = input.user?.username ?? input.username ?? '';
    let fullName = input.fullName ?? '';
    let role = input.user?.role ?? input.role ?? 'user';

    if (userId && (!fullName || !username)) {
      const { rows } = await pool.query<{ username: string; full_name: string; role: string; personnel_name: string | null }>(
        `SELECT u.username, u.full_name, u.role, p.name AS personnel_name
         FROM users u
         LEFT JOIN personnel p ON p.id = u.personnel_id
         WHERE u.id = $1`,
        [userId],
      );
      if (rows[0]) {
        username = username || rows[0].username;
        fullName = fullName || rows[0].personnel_name || rows[0].full_name || rows[0].username;
        role = role || rows[0].role;
      }
    }

    await pool.query(
      `INSERT INTO audit_logs (user_id, username, full_name, role, action, module, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        username,
        fullName || username || 'System',
        role,
        input.action,
        input.module,
        input.description,
      ],
    );
  } catch (err) {
    console.error('Gagal mencatat audit log:', err);
  }
};

