// Photo upload form for a place.

'use client';

import { useState } from 'react';

import { BearingPicker } from '@/components/BearingPicker';

export function PhotoUploader({ placeId, onUploaded }) {
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('approach');
  const [bearing, setBearing] = useState(null);
  const [credit, setCredit] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setFile(null);
    setKind('approach');
    setBearing(null);
    setCredit('');
    setIsPrimary(false);
    setError(null);
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) {
      setError('Pick a photo first.');
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('place_id', String(placeId));
    formData.append('kind', kind);
    if (bearing != null) formData.append('bearing_deg', String(bearing));
    if (credit) formData.append('credit', credit);
    formData.append('is_primary', isPrimary ? 'true' : 'false');

    try {
      const result = await fetch('/api/proxy/api/admin/media', {
        method: 'POST',
        body: formData,
      });
      if (!result.ok) {
        const data = await result.json().catch(() => ({}));
        throw new Error(data.detail || `Upload failed (${result.status})`);
      }
      const uploaded = await result.json();
      reset();
      if (onUploaded) onUploaded(uploaded);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="form-group">
        <label className="form-label">Photo</label>
        <input
          type="file"
          accept="image/*"
          className="form-input"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        {file ? (
          <div className="form-hint">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </div>
        ) : null}
      </div>

      <div className="form-group">
        <label className="form-label">Kind</label>
        <select
          className="form-select"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="approach">Approach (from the footpath)</option>
          <option value="entrance">Entrance (close-up of the door)</option>
          <option value="detail">Detail (interior, signage, other)</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Camera direction</label>
        <BearingPicker value={bearing} onChange={setBearing} />
      </div>

      <div className="form-group">
        <label className="form-label">Credit (optional)</label>
        <input
          type="text"
          className="form-input"
          value={credit}
          onChange={(e) => setCredit(e.target.value)}
          placeholder="Photographer name"
        />
      </div>

      <div className="form-group">
        <label
          className="row"
          style={{ gap: 8, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
          />
          <span>Make this the primary photo for the place</span>
        </label>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <button
        type="submit"
        className="btn"
        disabled={!file || uploading}
      >
        {uploading ? 'Uploading…' : 'Upload photo'}
      </button>
    </form>
  );
}