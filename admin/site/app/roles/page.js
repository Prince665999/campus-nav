// Roles. Manage admin accounts.

'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/lib/format';

export default function RolesPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    email: '',
    role: 'contributor',
    password: '',
  });

  async function load() {
    setLoading(true);
    try {
      const data = await api.listUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createUser(form);
      setForm({ email: '', role: 'contributor', password: '' });
      setCreating(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteUser(user) {
    if (!confirm('Remove this admin account?')) return;
    try {
      await api.deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      alert(err.message);
    }
  }

  const columns = [
    {
      key: 'email',
      label: 'Account',
      render: (u) => (
        <span className="mono" style={{ fontSize: 13 }}>
          {u.email}
        </span>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      width: 120,
      render: (u) => (
        <StatusBadge status={u.role === 'owner' ? 'ok' : 'new'}>
          {u.role}
        </StatusBadge>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      width: 180,
      render: (u) => (
        <span className="faint" style={{ fontSize: 13 }}>
          {formatDateTime(u.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: 100,
      align: 'right',
      render: (u) => (
        <button
          className="btn btn-danger"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => deleteUser(u)}
        >
          Remove
        </button>
      ),
    },
  ];

  return (
    <>
      <h1 className="page-title">Roles</h1>
      <p className="page-subtitle">
        Admin accounts. Students never appear here — their identity is
        an anonymous device hash.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="row-between" style={{ marginBottom: creating ? 20 : 0 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Admin accounts</div>
            <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
              Owner can do everything. Contributor can edit places and
              photos but not manage accounts.
            </div>
          </div>
          {!creating ? (
            <button className="btn" onClick={() => setCreating(true)}>
              Add account
            </button>
          ) : null}
        </div>

        {creating ? (
          <form onSubmit={createUser} className="stack">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select
                className="form-select"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="contributor">Contributor</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                required
                minLength={8}
              />
              <div className="form-hint">
                At least 8 characters. Login is coming in Phase 17.
              </div>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn">
                Create
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setCreating(false);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={users}
          emptyMessage="No admin accounts yet."
        />
      )}
    </>
  );
}