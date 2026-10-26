'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

type TabKey = 'daily' | 'monthly' | 'activity';
type PersonRow = {
  id: string;
  name: string;
  department: string;
  shift: string;
};

const DEMO_USERNAME = 'admin';
const DEMO_PASSWORD = 'Admin123!';

const defaultPeople: PersonRow[] = [
  { id: '1', name: 'Adit', department: 'IT Support', shift: 'PAGI' },
  { id: '2', name: 'Bima', department: 'Network', shift: 'SIANG' },
  { id: '3', name: 'Citra', department: 'Infrastructure', shift: 'Office Hour' },
  { id: '4', name: 'Dewi', department: 'Helpdesk', shift: 'Libur' },
  { id: '5', name: 'Eko', department: 'Security', shift: 'PAGI' },
  { id: '6', name: 'Fani', department: 'Systems', shift: 'SIANG' },
];

const summaryCards = [
  { label: 'Personel aktif', value: '24', tone: 'blue' },
  { label: 'Shift pagi', value: '9', tone: 'green' },
  { label: 'Siang', value: '7', tone: 'amber' },
  { label: 'Office hour', value: '3', tone: 'purple' },
];

export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('daily');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [rosterRows, setRosterRows] = useState<PersonRow[]>(defaultPeople);
  const [fileName, setFileName] = useState('default-roster.xlsx');

  useEffect(() => {
    const savedAuth = window.sessionStorage.getItem('roster-dashboard-next.auth');
    if (savedAuth === 'true') {
      setAuthenticated(true);
    }
  }, []);

  const stats = useMemo(
    () => ({
      total: rosterRows.length,
      pagi: rosterRows.filter((row) => row.shift === 'PAGI').length,
      siang: rosterRows.filter((row) => row.shift === 'SIANG').length,
      office: rosterRows.filter((row) => row.shift === 'Office Hour').length,
      libur: rosterRows.filter((row) => row.shift === 'Libur').length,
    }),
    [rosterRows],
  );

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (username === DEMO_USERNAME && password === DEMO_PASSWORD) {
      setAuthenticated(true);
      window.sessionStorage.setItem('roster-dashboard-next.auth', 'true');
      setError('');
      return;
    }

    setError('Username atau password tidak valid.');
  };

  const handleLogout = () => {
    setAuthenticated(false);
    window.sessionStorage.removeItem('roster-dashboard-next.auth');
    setUsername('');
    setPassword('');
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { raw: false });

    const parsed = rows
      .map((row, index) => ({
        id: String(index + 1),
        name: String(row.Nama ?? row.name ?? `Personel ${index + 1}`),
        department: String(row.Divisi ?? row.department ?? 'IT'),
        shift: String(row.Shift ?? row.shift ?? 'PAGI'),
      }))
      .slice(0, 12);

    setRosterRows(parsed.length ? parsed : defaultPeople);
  };

  return (
    <main className="page-shell">
      {!authenticated ? (
        <section className="login-screen">
          <div className="login-shell">
            <div className="login-panel">
              <div className="brand-row">
                <div className="brand-mark">R</div>
                <div>
                  <p className="brand-title">Roster</p>
                  <small>IT Technician</small>
                </div>
              </div>

              <div className="login-copy">
                <p className="eyebrow">Access portal</p>
                <h1>Masuk ke dashboard</h1>
                <p>Kelola roster harian dan bulanan dengan kontrol akses yang sederhana.</p>
              </div>

              <form className="login-form" onSubmit={handleLogin} noValidate>
                <label className="login-field">
                  <span>Username</span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                    required
                  />
                </label>

                <label className="login-field">
                  <span>Password</span>
                  <div className="password-wrap">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan password"
                      autoComplete="current-password"
                      required
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <button type="submit" className="login-button">
                  Login
                </button>

                {error ? <p className="login-error" role="alert">{error}</p> : null}
              </form>
            </div>

            <aside className="login-aside">
              <div className="login-aside-card">
                <p className="eyebrow">Demo access</p>
                <h2>Credential sementara</h2>
                <ul className="credential-list">
                  <li>
                    <span>Username</span>
                    <strong>admin</strong>
                  </li>
                  <li>
                    <span>Password</span>
                    <strong>Admin123!</strong>
                  </li>
                </ul>
                <small>Prototype lokal untuk validasi migrasi Next.js.</small>
              </div>
            </aside>
          </div>
        </section>
      ) : (
        <div className="dashboard-shell">
          <aside className="sidebar">
            <div className="brand-wrap">
              <div className="brand-mark">R</div>
              <div>
                <p className="brand-title">Roster</p>
                <small>IT Technician</small>
              </div>
            </div>

            <nav className="sidebar-nav" aria-label="Navigation utama">
              {(['daily', 'monthly', 'activity'] as TabKey[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={activeTab === tab ? 'nav-button is-active' : 'nav-button'}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'daily' ? 'Dashboard Harian' : tab === 'monthly' ? 'Roster Bulanan' : 'Daily Activity'}
                </button>
              ))}
            </nav>

            <div className="sidebar-card">
              <p className="card-kicker">Upload</p>
              <p className="card-copy">Pilih file Excel untuk memperbarui roster aktif.</p>
              <label className="primary-button upload-button">
                Upload Excel
                <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />
              </label>
              <p className="file-name">{fileName}</p>
            </div>

            <div className="sidebar-card">
              <p className="card-kicker">Legenda</p>
              <div className="legend-list">
                <span className="legend-badge pagi">PAGI</span>
                <span className="legend-badge siang">SIANG</span>
                <span className="legend-badge office">Office Hour</span>
                <span className="legend-badge empty">Libur</span>
              </div>
            </div>
          </aside>

          <main className="main-panel">
            <header className="topbar">
              <div>
                <p className="eyebrow">Monitoring Personel HPIO</p>
                <h1>Dashboard Roster IT HPIO</h1>
              </div>

              <div className="topbar-actions">
                <button type="button" className="secondary-button">
                  Print
                </button>
                <button type="button" className="logout-button" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </header>

            <section className="summary-grid">
              {summaryCards.map((card) => (
                <article key={card.label} className={`summary-card ${card.tone}`}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </section>

            <section className="work-hours-panel" aria-label="Informasi jam kerja">
              <div className="panel-header compact-header">
                <div>
                  <p className="panel-kicker">Informasi</p>
                  <h2>INFORMASI JAM KERJA</h2>
                </div>
              </div>

              <div className="work-hours-grid">
                <div className="work-hours-item pagi">
                  <span className="work-hours-label">PAGI</span>
                  <strong>06:00–15:00</strong>
                </div>
                <div className="work-hours-item siang">
                  <span className="work-hours-label">SIANG</span>
                  <strong>13:00–22:00</strong>
                </div>
                <div className="work-hours-item office">
                  <span className="work-hours-label">OFFICE HOUR</span>
                  <strong>08:00–17:00</strong>
                </div>
                <div className="work-hours-item empty">
                  <span className="work-hours-label">LIBUR</span>
                  <strong>OFF Duty</strong>
                </div>
              </div>
            </section>

            <section className="roster-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Roster</p>
                  <h2>{activeTab === 'daily' ? 'Jadwal harian' : activeTab === 'monthly' ? 'Roster bulanan' : 'Daily activity'}</h2>
                </div>
              </div>

              <div className="roster-table-wrap">
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Department</th>
                      <th>Shift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterRows.map((person) => (
                      <tr key={person.id}>
                        <td>{person.name}</td>
                        <td>{person.department}</td>
                        <td>
                          <span className={`shift-pill ${person.shift.toLowerCase().replace(/\s+/g, '-')}`}>
                            {person.shift}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="stats-footer">
                <div>
                  <span>Total personel</span>
                  <strong>{stats.total}</strong>
                </div>
                <div>
                  <span>Pagi</span>
                  <strong>{stats.pagi}</strong>
                </div>
                <div>
                  <span>Siang</span>
                  <strong>{stats.siang}</strong>
                </div>
                <div>
                  <span>Office</span>
                  <strong>{stats.office}</strong>
                </div>
              </div>
            </section>
          </main>
        </div>
      )}
    </main>
  );
}
