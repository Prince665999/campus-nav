// Timetable CSV import. Drag-and-drop a CSV, preview the first rows,
// then confirm the import. The parser runs on the server — this page
// just sends the file and shows the result.

'use client';

import { useCallback, useRef, useState } from 'react';

import { api } from '@/lib/api';
import { CsvPreview } from '@/components/CsvPreview';

// Preview-only parser. Doesn't validate — that's the server's job.
// Splits on commas and handles quoted fields. Enough for the kinds
// of CSVs we care about.
function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { columns: [], rows: [] };

  function splitLine(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  }

  const columns = splitLine(lines[0]).map((c) => c.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row = {};
    for (let j = 0; j < columns.length; j++) {
      row[columns[j]] = (cells[j] ?? '').trim();
    }
    rows.push(row);
  }
  return { columns, rows };
}

export default function TimetableImportPage() {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [replace, setReplace] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = useCallback(async (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    try {
      const text = await f.text();
      setPreview(parseCsvText(text));
    } catch (err) {
      setError(`Could not read file: ${err.message}`);
      setPreview(null);
    }
  }, []);

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }
  function onDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave(e) {
    e.preventDefault();
    setDragging(false);
  }
  function onChooseClick() {
    inputRef.current?.click();
  }
  function onFileChosen(e) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  }

  async function confirmImport() {
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.importTimetableCsv(file, { replace });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setReplace(false);
  }

  return (
    <>
      <h1 className="page-title">Import Timetable</h1>
      <p className="page-subtitle">
        Upload a timetable CSV. Every row becomes one class slot. The
        file is validated before anything is written — if any row is
        bad, the whole import is rejected.
      </p>

      {/* Drop zone */}
      {!result ? (
        <>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={onChooseClick}
            className={`drop-zone ${dragging ? 'drop-zone-active' : ''}`}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              {file ? file.name : 'Drop a CSV here'}
            </div>
            <div className="muted" style={{ fontSize: 14 }}>
              {file
                ? `${preview?.rows.length ?? 0} data rows parsed.`
                : 'or click to choose. Must be a .csv file.'}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChosen}
              style={{ display: 'none' }}
            />
          </div>

          {preview && preview.rows.length > 0 ? (
            <div style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 16, marginBottom: 12 }}>
                Preview ({preview.rows.length} row
                {preview.rows.length === 1 ? '' : 's'})
              </h2>
              <CsvPreview rows={preview.rows} columns={preview.columns} />
            </div>
          ) : null}

          {error ? (
            <div className="error-box" style={{ marginTop: 20 }}>
              {error}
            </div>
          ) : null}

          {file ? (
            <div style={{ marginTop: 24 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 16,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                <span>
                  Replace existing entries for the program-years this CSV
                  mentions
                </span>
              </label>
              <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Without this, existing rows are updated in place. With this,
                they are deleted and reinserted. Use it when a department
                sends a corrected full timetable for the same program.
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn"
                  onClick={confirmImport}
                  disabled={importing}
                >
                  {importing ? 'Importing…' : 'Confirm import'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={reset}
                  disabled={importing}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="success-box">
            <strong>Import complete.</strong>
          </div>
          <div className="card" style={{ marginTop: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Programs created', result.programs_created],
                  ['Program-years created', result.program_years_created],
                  ['Program-years wiped', result.program_years_wiped],
                  ['Entries created', result.entries_created],
                  ['Entries updated', result.entries_updated],
                  ['Entries unchanged', result.entries_unchanged],
                ].map(([label, value]) => (
                  <tr
                    key={label}
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    <td style={{ padding: '10px 0', color: 'var(--text-muted)' }}>
                      {label}
                    </td>
                    <td
                      style={{
                        padding: '10px 0',
                        textAlign: 'right',
                        fontWeight: 600,
                      }}
                    >
                      {value ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <a href="/timetable" className="btn">
              View timetable
            </a>
            <button className="btn btn-secondary" onClick={reset}>
              Import another
            </button>
          </div>
        </>
      )}
    </>
  );
}