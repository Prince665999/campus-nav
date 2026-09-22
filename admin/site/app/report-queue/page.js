// Report queue. List, filter, and triage student reports.

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

import { api } from '@/lib/api';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { formatRelative } from '@/lib/format';

const STATUSES = ['new', 'in_progress', 'resolved'];

function ReportQueueInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get('status') || '';
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openReport, setOpenReport] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const data = await api.listReports(params);
      setReports(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function setStatusFilter(next) {
    if (next) {
      router.push(`/report-queue?status=${next}`);
    } else {
      router.push('/report-queue');
    }
  }

  async function updateStatus(report, newStatus) {
    try {
      const updated = await api.updateReportStatus(report.id, newStatus);
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? updated : r))
      );
      if (openReport?.id === report.id) setOpenReport(updated);
    } catch (err) {
      alert(err.message);
    }
  }

  const columns = [
    {
      key: 'kind',
      label: 'Kind',
      render: (r) => r.kind.replace('_', ' '),
    },
    {
      key: 'place',
      label: 'Place',
      render: (r) => r.place_name || <span className="faint">—</span>,
    },
    {
      key: 'body',
      label: 'Details',
      render: (r) => (
        <span className="muted" style={{ fontSize: 14 }}>
          {r.body ? (r.body.length > 60 ? r.body.slice(0, 60) + '…' : r.body) : '—'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'When',
      width: 120,
      render: (r) => (
        <span className="faint" style={{ fontSize: 13 }}>
          {formatRelative(r.created_at)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 130,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      label: '',
      width: 100,
      align: 'right',
      render: (r) => (
        <button
          className="btn btn-secondary"
          style={{ fontSize: 13, padding: '4px 10px' }}
          onClick={(e) => {
            e.stopPropagation();
            setOpenReport(r);
          }}
        >
          Open
        </button>
      ),
    },
  ];

  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="page-subtitle">
        Student-submitted problems and feedback.
      </p>

      <div className="row" style={{ marginBottom: 20, gap: 8 }}>
        <button
          className={`btn ${statusFilter === '' ? '' : 'btn-secondary'}`}
          onClick={() => setStatusFilter('')}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`btn ${statusFilter === s ? '' : 'btn-secondary'}`}
            onClick={() => setStatusFilter(s)}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={reports}
          emptyMessage="No reports match those filters."
        />
      )}

      {openReport ? (
        <ReportDrawer
          report={openReport}
          onClose={() => setOpenReport(null)}
          onUpdateStatus={updateStatus}
        />
      ) : null}
    </>
  );
}

function ReportDrawer({ report, onClose, onUpdateStatus }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          width: 500,
          maxWidth: '100%',
          height: '100%',
          overflowY: 'auto',
          padding: 32,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row-between" style={{ marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>
            Report #{report.id}
          </h2>
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 12px' }}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="stack">
          <Row label="Status">
            <StatusBadge status={report.status} />
          </Row>
          <Row label="Kind">
            {report.kind.replace('_', ' ')}
          </Row>
          {report.place_name ? (
            <Row label="Place">
              {report.place_name}{' '}
              <span className="faint">(id {report.place_id})</span>
            </Row>
          ) : null}
          <Row label="Submitted">
            {formatRelative(report.created_at)}
          </Row>
          <Row label="Device">
            <span className="mono faint" style={{ fontSize: 12 }}>
              {report.session_hash.slice(0, 16)}…
            </span>
          </Row>
          {report.body ? (
            <Row label="Details">
              <div style={{ whiteSpace: 'pre-wrap' }}>{report.body}</div>
            </Row>
          ) : null}
          {report.photo_url ? (
            <Row label="Photo">
              <a href={report.photo_url} target="_blank" rel="noreferrer">
                Open photo
              </a>
            </Row>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 32,
            paddingTop: 24,
            borderTop: '1px solid var(--border)',
          }}
        >
          <div
            className="faint"
            style={{
              fontSize: 13,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 12,
            }}
          >
            Change status
          </div>
          <div className="row" style={{ gap: 8 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                className={`btn ${report.status === s ? '' : 'btn-secondary'}`}
                onClick={() => onUpdateStatus(report, s)}
                disabled={report.status === s}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <div
        className="faint"
        style={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function ReportQueuePage() {
  return (
    <Suspense fallback={<div className="loading">Loading…</div>}>
      <ReportQueueInner />
    </Suspense>
  );
}