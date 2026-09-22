// Place Editor. Edit place metadata without touching JOSM.

'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

export default function PlaceEditorPage() {
  const [places, setPlaces] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listPlaces({ limit: 200 })
      .then(setPlaces)
      .catch((err) => setError(err.message));
  }, []);

  function selectPlace(place) {
    setSelected(place);
    setForm({
      name: place.name || '',
      name_sw: place.name_sw || '',
      alt_names: place.alt_names || '',
      description: place.description || '',
      category: place.category || '',
      ref: place.ref || '',
      wheelchair: place.wheelchair || '',
      opening_hours: place.opening_hours || '',
      is_landmark: !!place.is_landmark,
      has_wifi: !!place.has_wifi,
      wifi_ssid: place.wifi_ssid || '',
      wifi_password: place.wifi_password || '',
    });
    setSaved(false);
    setError(null);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    // Only send fields that changed.
    const changed = {};
    for (const key of Object.keys(form)) {
      // Compare against the original place value.
      const original = selected[key];
      const current = form[key];
      // Normalise: null and '' both mean "empty".
      const origNorm = original ?? '';
      const currNorm = current ?? '';
      if (origNorm !== currNorm) {
        changed[key] = current;
      }
    }

    if (Object.keys(changed).length === 0) {
      setSaved(true);
      setSaving(false);
      return;
    }

    try {
      const updated = await api.updatePlace(selected.id, changed);
      // Refresh both the form and the list entry.
      setPlaces((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, ...changed } : p))
      );
      setSelected({ ...selected, ...changed });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = places.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <h1 className="page-title">Place Editor</h1>
      <p className="page-subtitle">
        Edit descriptions, aliases, and other database-managed fields.
        OSM-sourced fields update from re-import; hand edits here survive.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
        {/* List */}
        <div>
          <input
            type="text"
            className="form-input"
            placeholder="Search places…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
          >
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPlace(p)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 16px',
                  background:
                    selected?.id === p.id
                      ? 'var(--border-subtle)'
                      : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <div>
          {!selected || !form ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                Pick a place on the left to edit its fields.
              </p>
            </div>
          ) : (
            <div className="card">
              <h2 style={{ margin: '0 0 20px 0', fontSize: 20 }}>
                {selected.name}
              </h2>

              {error ? <div className="error-box">{error}</div> : null}
              {saved ? <div className="success-box">Saved.</div> : null}

              <div className="stack">
                <FormField
                  label="Name (English)"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                />
                <FormField
                  label="Name (Kiswahili)"
                  value={form.name_sw}
                  onChange={(v) => setForm({ ...form, name_sw: v })}
                  hint="Shown below the English name in the app."
                />
                <FormField
                  label="Alternative names"
                  value={form.alt_names}
                  onChange={(v) => setForm({ ...form, alt_names: v })}
                  hint="Semicolon-separated. What students actually call it."
                />
                <FormField
                  label="Description"
                  value={form.description}
                  onChange={(v) => setForm({ ...form, description: v })}
                  textarea
                />
                <FormField
                  label="Category"
                  value={form.category}
                  onChange={(v) => setForm({ ...form, category: v })}
                  hint="Like amenity=library or building=university."
                />
                <FormField
                  label="Reference"
                  value={form.ref}
                  onChange={(v) => setForm({ ...form, ref: v })}
                  hint="Room or block code, like LT3."
                />
                <FormField
                  label="Wheelchair access"
                  value={form.wheelchair}
                  onChange={(v) => setForm({ ...form, wheelchair: v })}
                  hint="yes, no, or limited."
                />
                <FormField
                  label="Opening hours"
                  value={form.opening_hours}
                  onChange={(v) => setForm({ ...form, opening_hours: v })}
                />

                <div className="form-group">
                  <label
                    className="row"
                    style={{ gap: 8, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={form.is_landmark}
                      onChange={(e) =>
                        setForm({ ...form, is_landmark: e.target.checked })
                      }
                    />
                    <span>Is a landmark</span>
                  </label>
                  <div className="form-hint">
                    Marks this as something worth mentioning in narration.
                  </div>
                </div>

                <div className="form-group">
                  <label
                    className="row"
                    style={{ gap: 8, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={form.has_wifi}
                      onChange={(e) =>
                        setForm({ ...form, has_wifi: e.target.checked })
                      }
                    />
                    <span>Has Wi-Fi</span>
                  </label>
                </div>

                {form.has_wifi ? (
                  <>
                    <FormField
                      label="Wi-Fi SSID"
                      value={form.wifi_ssid}
                      onChange={(v) => setForm({ ...form, wifi_ssid: v })}
                    />
                    <FormField
                      label="Wi-Fi password"
                      value={form.wifi_password}
                      onChange={(v) => setForm({ ...form, wifi_password: v })}
                    />
                  </>
                ) : null}
              </div>

              <div style={{ marginTop: 24 }}>
                <button
                  className="btn"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FormField({ label, value, onChange, hint, textarea }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {textarea ? (
        <textarea
          className="form-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          className="form-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint ? <div className="form-hint">{hint}</div> : null}
    </div>
  );
}