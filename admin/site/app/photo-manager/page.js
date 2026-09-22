// Photo Manager. Browse places, upload photos, and delete existing ones.

'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { PhotoUploader } from '@/components/PhotoUploader';

export default function PhotoManagerPage() {
  const [places, setPlaces] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listPlaces({ limit: 200 })
      .then(setPlaces)
      .catch((err) => setError(err.message));
  }, []);

  async function selectPlace(place) {
    setSelected(place);
    setPhotos([]);
    setLoadingPhotos(true);
    setError(null);
    try {
      const data = await api.listMediaForPlace(place.id);
      setPhotos(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPhotos(false);
    }
  }

  async function deletePhoto(media) {
    if (!confirm('Delete this photo?')) return;
    try {
      await api.deleteMedia(media.id);
      setPhotos((prev) => prev.filter((p) => p.id !== media.id));
    } catch (err) {
      alert(err.message);
    }
  }

  async function onUploaded() {
    // Refresh the photo list.
    if (selected) {
      try {
        const data = await api.listMediaForPlace(selected.id);
        setPhotos(data);
      } catch (err) {
        setError(err.message);
      }
    }
  }

  const filtered = places.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <h1 className="page-title">Photo Manager</h1>
      <p className="page-subtitle">
        Pick a place on the left, upload photos on the right.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
        {/* Place list */}
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
            {filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                No places match.
              </div>
            ) : (
              filtered.map((p) => (
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
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div>
          {error ? <div className="error-box">{error}</div> : null}

          {!selected ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                Select a place to see and upload photos.
              </p>
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 24 }}>
                <h2 style={{ margin: '0 0 20px 0', fontSize: 20 }}>
                  {selected.name}
                </h2>
                <PhotoUploader
                  placeId={selected.id}
                  onUploaded={onUploaded}
                />
              </div>

              <div className="card">
                <h3 className="card-title">
                  Existing photos ({photos.length})
                </h3>

                {loadingPhotos ? (
                  <div className="loading">Loading…</div>
                ) : photos.length === 0 ? (
                  <p className="faint" style={{ margin: 0 }}>
                    No photos yet.
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: 16,
                    }}
                  >
                    {photos.map((photo) => (
                      <div
                        key={photo.id}
                        style={{
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={photo.url_card}
                          alt=""
                          style={{
                            width: '100%',
                            height: 120,
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                        <div style={{ padding: 10 }}>
                          <div
                            style={{
                              fontSize: 12,
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>{photo.kind}</span>
                            {photo.is_primary ? (
                              <span
                                style={{
                                  color: 'var(--warning)',
                                  fontWeight: 600,
                                }}
                              >
                                ★
                              </span>
                            ) : null}
                          </div>
                          {photo.bearing_deg != null ? (
                            <div
                              className="faint"
                              style={{ fontSize: 11, marginTop: 2 }}
                            >
                              {photo.bearing_deg}°
                            </div>
                          ) : null}
                          <button
                            className="btn btn-danger"
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              padding: '4px 10px',
                              width: '100%',
                            }}
                            onClick={() => deletePhoto(photo)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}