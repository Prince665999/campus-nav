// Timetable viewer. Browse programs, drill into years, see the
// entries, delete what you don't want.

'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export default function TimetablePage() {
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listPrograms()
      .then((data) => {
        if (!cancelled) setPrograms(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function selectProgram(program) {
    setSelectedProgram(program);
    setSelectedYear(null);
    setEntries([]);
    setError(null);
    try {
      const data = await api.listYearsForProgram(program.id);
      setYears(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function selectYear(year) {
    setSelectedYear(year);
    setError(null);
    try {
      const data = await api.getSchedule(year.id);
      setEntries(data.entries || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteEntry(entry) {
    if (!confirm(`Delete ${entry.module_code} at ${entry.start_time}?`)) return;
    try {
      await api.deleteTimetableEntry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteYear(year) {
    if (
      !confirm(
        `Delete Year ${year.year_number} (${year.academic_year} S${year.semester}) and all its entries?`
      )
    )
      return;
    try {
      await api.deleteProgramYear(year.id);
      setYears((prev) => prev.filter((y) => y.id !== year.id));
      if (selectedYear?.id === year.id) {
        setSelectedYear(null);
        setEntries([]);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteProgram(program) {
    if (!confirm(`Delete "${program.name}" and everything under it?`)) return;
    try {
      await api.deleteProgram(program.id);
      setPrograms((prev) => prev.filter((p) => p.id !== program.id));
      if (selectedProgram?.id === program.id) {
        setSelectedProgram(null);
        setYears([]);
        setSelectedYear(null);
        setEntries([]);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  // Group entries by day for display.
  const entriesByDay = {};
  for (const entry of entries) {
    if (!entriesByDay[entry.day_of_week]) entriesByDay[entry.day_of_week] = [];
    entriesByDay[entry.day_of_week].push(entry);
  }

  return (
    <>
      <h1 className="page-title">Timetable</h1>
      <p className="page-subtitle">
        Browse imported timetables. Programs and years are created by the
        CSV import; this page lets you view and delete.
      </p>

      {error ? <div className="error-box">{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, marginTop: 20 }}>
        {/* Programs */}
        <div>
          <div className="faint" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Programs
          </div>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-elevated)',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
          >
            {loading ? (
              <div style={{ padding: 16 }} className="muted">Loading…</div>
            ) : programs.length === 0 ? (
              <div style={{ padding: 16 }} className="muted">
                No programs. Import a CSV first.
              </div>
            ) : (
              programs.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border-subtle)',
                    background:
                      selectedProgram?.id === p.id
                        ? 'var(--border-subtle)'
                        : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => selectProgram(p)}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteProgram(p)}
                    title="Delete"
                    style={{
                      padding: 8,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--danger)',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Years */}
        <div>
          {!selectedProgram ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                Pick a program to see its year levels.
              </p>
            </div>
          ) : (
            <>
              <div className="faint" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Years — {selectedProgram.name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {years.map((y) => (
                  <div
                    key={y.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      borderRadius: '999px',
                      border: '1px solid var(--border)',
                      background:
                        selectedYear?.id === y.id ? 'var(--primary)' : 'var(--bg-elevated)',
                      color:
                        selectedYear?.id === y.id ? '#fff' : 'var(--text)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => selectYear(y)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'inherit',
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      Year {y.year_number} · {y.academic_year} · S{y.semester}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteYear(y)}
                      title="Delete"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'inherit',
                        opacity: 0.6,
                        padding: 0,
                        fontSize: 12,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {years.length === 0 ? (
                  <span className="muted" style={{ fontSize: 14 }}>
                    No year levels.
                  </span>
                ) : null}
              </div>

              {selectedYear ? (
                <>
                  <div className="faint" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Entries ({entries.length})
                  </div>
                  {entries.length === 0 ? (
                    <div className="card">
                      <p className="muted" style={{ margin: 0 }}>
                        No entries for this year.
                      </p>
                    </div>
                  ) : (
                    [0, 1, 2, 3, 4, 5, 6].map((day) => {
                      const dayEntries = entriesByDay[day];
                      if (!dayEntries || dayEntries.length === 0) return null;
                      return (
                        <div key={day} className="card" style={{ marginBottom: 12 }}>
                          <h3 className="card-title">{DAY_NAMES[day]}</h3>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                            <tbody>
                              {dayEntries
                                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                                .map((e) => (
                                  <tr
                                    key={e.id}
                                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                                  >
                                    <td style={{ padding: '8px 0', width: 110, color: 'var(--text-muted)' }}>
                                      {e.start_time}–{e.end_time}
                                    </td>
                                    <td style={{ padding: '8px 0', fontWeight: 600 }}>
                                      {e.module_code}
                                    </td>
                                    <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>
                                      {e.module_name || ''}
                                    </td>
                                    <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>
                                      {e.venue_code || ''}
                                    </td>
                                    <td style={{ padding: '8px 0', textAlign: 'right', width: 60 }}>
                                      <button
                                        className="btn btn-danger"
                                        style={{ fontSize: 12, padding: '4px 8px' }}
                                        onClick={() => deleteEntry(e)}
                                      >
                                        Delete
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })
                  )}
                </>
              ) : (
                <div className="card">
                  <p className="muted" style={{ margin: 0 }}>
                    Pick a year to see its entries.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}