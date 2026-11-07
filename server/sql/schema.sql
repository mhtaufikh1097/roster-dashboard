CREATE TABLE IF NOT EXISTS personnel (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  department  TEXT NOT NULL DEFAULT '',
  position    TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL DEFAULT '',
  position       TEXT NOT NULL DEFAULT '',
  role           TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'user')),
  personnel_id   INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roster_periods (
  id           SERIAL PRIMARY KEY,
  month_label  TEXT NOT NULL,
  filename     TEXT NOT NULL DEFAULT '',
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hanya baris dengan status terisi yang disimpan; tidak ada baris = Libur.
CREATE TABLE IF NOT EXISTS roster_entries (
  period_id     INTEGER NOT NULL REFERENCES roster_periods(id) ON DELETE CASCADE,
  personnel_id  INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  work_date     DATE NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('PAGI', 'SIANG', 'Office Hour')),
  PRIMARY KEY (period_id, personnel_id, work_date)
);

CREATE TABLE IF NOT EXISTS activity_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date            DATE NOT NULL,
  duty_personnel_id      INTEGER NOT NULL REFERENCES personnel(id),
  duty_personnel_ids     INTEGER[] NOT NULL DEFAULT '{}',
  shift                  TEXT NOT NULL CHECK (shift IN ('Pagi', 'Siang', 'Office Hour', 'Libur')),
  status                 TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Reviewed', 'Closed')),
  spare_parts_status     TEXT NOT NULL DEFAULT '' CHECK (spare_parts_status IN ('', 'Yes', 'No')),
  handover_personnel_id  INTEGER REFERENCES personnel(id),
  handover_personnel_ids INTEGER[] NOT NULL DEFAULT '{}',
  takeover_personnel_id  INTEGER REFERENCES personnel(id),
  takeover_personnel_ids INTEGER[] NOT NULL DEFAULT '{}',
  handover_matters      TEXT NOT NULL DEFAULT '',
  handover_time         TEXT NOT NULL DEFAULT '',
  takeover_time         TEXT NOT NULL DEFAULT '',
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_by_name  TEXT NOT NULL DEFAULT '',
  acknowledged_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_reports_date ON activity_reports (report_date);

CREATE TABLE IF NOT EXISTS activity_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  UUID NOT NULL REFERENCES activity_reports(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  time       TEXT NOT NULL DEFAULT '',
  contact    TEXT NOT NULL DEFAULT '',
  location   TEXT NOT NULL DEFAULT '',
  overview   TEXT NOT NULL DEFAULT '',
  measures   TEXT NOT NULL DEFAULT '',
  result     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS activity_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  UUID NOT NULL REFERENCES activity_reports(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  person     TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT ''
);

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


