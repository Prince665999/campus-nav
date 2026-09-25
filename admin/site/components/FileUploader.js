// A drag-and-drop file uploader with a fallback click-to-choose.
//
// Sends the file to the backend as multipart form data. Shows a
// progress state while the upload is in flight — for a large PDF,
// extraction takes a few seconds.

'use client';

import { useRef, useState } from 'react';

export function FileUploader({ onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  async function uploadFile(file) {
    if (!file) return;

    const allowed = ['.pdf', '.txt', '.md'];
    const suffix = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(suffix)) {
      setError(`Unsupported file type: ${suffix}. Use .pdf, .txt, or .md.`);
      return;
    }

    setUploading(true);
    setError(null);
    setLastResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/proxy/api/admin/knowledge/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || `Upload failed (${response.status})`);
      }

      setLastResult(data);
      if (onUploaded) onUploaded(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
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
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset the input so choosing the same file again works.
    e.target.value = '';
  }

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onChooseClick}
        style={{
          border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
          background: dragging ? 'var(--info-bg)' : 'var(--bg)',
          borderRadius: 'var(--radius)',
          padding: '40px 20px',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          transition: 'all 0.15s',
          opacity: uploading ? 0.6 : 1,
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onChooseClick();
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          {uploading ? 'Uploading…' : 'Drop a file here'}
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          {uploading
            ? 'Extracting text and tables, then embedding. This takes a few seconds.'
            : 'or click to choose. PDF, TXT, or MD.'}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md"
        onChange={onFileChosen}
        style={{ display: 'none' }}
      />

      {error ? (
        <div className="error-box" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}

      {lastResult ? (
        <div className="success-box" style={{ marginTop: 16 }}>
          <strong>{lastResult.filename}</strong> uploaded —{' '}
          {lastResult.chunk_count} chunks extracted.
        </div>
      ) : null}
    </div>
  );
}