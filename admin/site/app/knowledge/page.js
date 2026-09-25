// Knowledge base admin page.
//
// Upload documents, view what's been uploaded, and test retrieval.

'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { FileUploader } from '@/components/FileUploader';
import { DocumentList } from '@/components/DocumentList';
import { SearchTester } from '@/components/SearchTester';

export default function KnowledgePage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listKnowledgeDocuments();
      setDocuments(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(
    async (doc) => {
      if (
        !confirm(
          `Delete "${doc.filename}"? Its ${doc.chunk_count} chunks will be removed from the knowledge base.`
        )
      ) {
        return;
      }
      try {
        await api.deleteKnowledgeDocument(doc.id);
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      } catch (err) {
        alert(err.message);
      }
    },
    []
  );

  return (
    <>
      <h1 className="page-title">Knowledge Base</h1>
      <p className="page-subtitle">
        Upload documents the campus AI can answer questions from — the
        handbook, almanac, rules, history, anything students ask about.
      </p>

      {error ? <div className="error-box">{error}</div> : null}

      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 16 }}>
          Upload
        </h2>
        <FileUploader onUploaded={load} />
      </div>

      <div style={{ marginBottom: 32 }}>
        <div
          className="row-between"
          style={{ marginBottom: 16 }}
        >
          <h2 style={{ fontSize: 18, margin: 0 }}>Documents</h2>
          <button
            className="btn btn-secondary"
            onClick={load}
            disabled={loading}
            style={{ fontSize: 13, padding: '6px 14px' }}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {loading && documents.length === 0 ? (
          <div className="loading">Loading…</div>
        ) : (
          <DocumentList documents={documents} onDelete={handleDelete} />
        )}
      </div>

      <SearchTester />
    </>
  );
}