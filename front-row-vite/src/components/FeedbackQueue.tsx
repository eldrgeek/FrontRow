// ─────────────────────────────────────────────────────────────────────────────
// FeedbackQueue — FrontRow's admin review / build-queue / changelog page.
//
// Ported from Playmaker's src/features/admin/FeedbackQueue.tsx and restyled
// from Tailwind into FrontRow's plain-CSS dark/gold aesthetic (FeedbackQueue.css).
// Gated behind AdminRoute in index.tsx; the functions it calls re-verify
// is_app_admin('frontrow') server-side, so the page can't act on behalf of a
// non-admin even if the route guard were bypassed.
//
// Three tabs, all reading the shared app-scoped tables (feedback,
// build_requests, changelog — filtered app='frontrow'):
//   - Review      — feedback.status='new' (submissions awaiting triage)
//   - Build queue — feedback.status='queued' + the build_requests lifecycle
//                   (build-in-process -> waiting-review) with Start build,
//                   Mark reviewed, Notify Rigg again / Cancel for stale rows
//   - Changelog   — the changelog table, searchable + a per-entry
//                   accept / needs-change / reverted verdict box
//
// Supabase Realtime (postgres_changes) on all three tables, filtered
// app=eq.frontrow, re-loads the page live while it's open.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  listFeedback,
  listChangelog,
  listBuildRequests,
  dispatchFeedback,
  dismissFeedback,
  notifyBuildQueue,
  updateBuildRequest,
  escalateBuildRequest,
  updateChangelogReview,
  type FeedbackItem,
  type ChangelogEntry,
  type BuildRequest,
} from '../lib/guide';
import { useFeedbackArea } from '../lib/useFeedbackArea';
import './FeedbackQueue.css';

type Tab = 'review' | 'queue' | 'changelog';

// A request sitting in 'requested'/'in_progress' past this age gets a visible
// staleness warning + Cancel / Notify-again actions.
const STALE_REQUEST_MS = 2 * 60 * 60 * 1000; // 2 hours

export function FeedbackQueue() {
  useFeedbackArea('admin feedback queue');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [requests, setRequests] = useState<BuildRequest[]>([]);
  const [tab, setTab] = useState<Tab | null>(null); // null = not yet decided
  const [busyId, setBusyId] = useState<string | null>(null);
  const [buildBusy, setBuildBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [changelogQuery, setChangelogQuery] = useState('');
  const defaultTabDecided = useRef(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function load() {
    const [fb, cl, br] = await Promise.all([listFeedback(), listChangelog(), listBuildRequests()]);
    if (fb === null) {
      setForbidden(true);
    } else {
      setFeedback(fb);
    }
    setChangelog(cl);
    setRequests(br);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  // Realtime: re-fetch on any change to the three tables this page reads,
  // scoped to app='frontrow'. A full re-load (not a patch-in-place) keeps this
  // simple and correct — these tables are small, so the round-trip cost is
  // negligible next to always re-deriving from the server's actual state.
  useEffect(() => {
    const channel = supabase
      .channel('frontrow-feedback-queue-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback', filter: 'app=eq.frontrow' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'build_requests', filter: 'app=eq.frontrow' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'changelog', filter: 'app=eq.frontrow' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const reviewItems = feedback.filter((f) => f.status === 'new');
  const queueItems = feedback.filter((f) => f.status === 'queued');
  const dismissedOrShipped = feedback.filter((f) => f.status !== 'new' && f.status !== 'queued');

  const openRequests = requests.filter((r) => r.status === 'requested' || r.status === 'in_progress');
  const completedNotReviewed = requests.filter((r) => r.status === 'completed');

  // Default-open tab: whichever needs attention first (review > queue >
  // changelog), decided once when data first arrives.
  useEffect(() => {
    if (loading || defaultTabDecided.current) return;
    defaultTabDecided.current = true;
    if (reviewItems.length > 0) setTab('review');
    else if (queueItems.length > 0 || completedNotReviewed.length > 0 || openRequests.length > 0) setTab('queue');
    else setTab('changelog');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const filteredChangelog = changelogQuery.trim()
    ? changelog.filter((e) => {
        const q = changelogQuery.trim().toLowerCase();
        return e.title.toLowerCase().includes(q) || (e.body ?? '').toLowerCase().includes(q);
      })
    : changelog;

  async function handleAccept(item: FeedbackItem) {
    setBusyId(item.id);
    try {
      await dispatchFeedback(item.id);
      await load();
      setToast('Accepted into build queue.');
    } catch (err) {
      setToast(errText(err, 'Failed to accept.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(item: FeedbackItem) {
    setBusyId(item.id);
    try {
      await dismissFeedback(item.id);
      await load();
      setToast('Dismissed.');
    } catch (err) {
      setToast(errText(err, 'Failed to dismiss.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleBuild() {
    setBuildBusy(true);
    try {
      const { count, alreadyOpen } = await notifyBuildQueue();
      if (alreadyOpen) {
        setToast('Everything queued is already covered by an open request — see the board.');
      } else {
        setToast(
          count === 0
            ? 'Nothing queued to build.'
            : `Build requested — ${count} item${count === 1 ? '' : 's'} on the board.`,
        );
      }
      await load();
    } catch (err) {
      setToast(errText(err, 'Failed to start build.'));
    } finally {
      setBuildBusy(false);
    }
  }

  async function handleMarkReviewed(request: BuildRequest) {
    setBusyId(request.id);
    try {
      await updateBuildRequest(request.id, 'reviewed');
      await load();
      setToast('Marked reviewed.');
    } catch (err) {
      setToast(errText(err, 'Failed to update.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleEscalate(request: BuildRequest) {
    setBusyId(request.id);
    try {
      await escalateBuildRequest(request.id);
      await load();
      setToast('Rigg notified again.');
    } catch (err) {
      setToast(errText(err, 'Failed to notify Rigg.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(request: BuildRequest) {
    setBusyId(request.id);
    try {
      await updateBuildRequest(request.id, 'cancelled');
      await load();
      setToast('Cancelled — those items are requestable again.');
    } catch (err) {
      setToast(errText(err, 'Failed to cancel.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleChangelogVerdict(entry: ChangelogEntry, verdict: 'accepted' | 'needs-change' | 'reverted') {
    setBusyId(entry.id);
    try {
      await updateChangelogReview(entry.id, verdict);
      await load();
    } catch (err) {
      setToast(errText(err, 'Failed to update.'));
    } finally {
      setBusyId(null);
    }
  }

  if (loading || tab === null) {
    return <div className="fq-loading">Loading…</div>;
  }

  if (forbidden) {
    return (
      <div className="fq-page">
        <div className="fq-inner" style={{ textAlign: 'center', paddingTop: 60 }}>
          <h1 className="fq-title">Admins only</h1>
          <p className="fq-subtitle">
            This page reviews and dispatches feedback for FrontRow. Ask an existing admin to add you.
          </p>
          <Link to="/" className="fq-back" style={{ display: 'inline-block', marginTop: 24 }}>
            Back to Lobby
          </Link>
        </div>
      </div>
    );
  }

  const uncoveredExtra =
    openRequests.length > 0 && queueItems.length > openRequests.reduce((n, r) => n + r.item_count, 0);

  return (
    <div className="fq-page">
      <div className="fq-inner">
        <div className="fq-topbar">
          <div>
            <h1 className="fq-title">Feedback queue</h1>
            <p className="fq-subtitle">
              Review incoming feedback, accept it into the build queue, and start a build when ready.
            </p>
          </div>
          <Link to="/admin" className="fq-back">← Admin</Link>
        </div>

        {toast && (
          <div role="status" className="fq-toast">
            {toast}
          </div>
        )}

        <div className="fq-tabs">
          <CounterTab label="Pending review" value={reviewItems.length} active={tab === 'review'} onClick={() => setTab('review')} />
          <CounterTab label="Build queue" value={queueItems.length} active={tab === 'queue'} onClick={() => setTab('queue')} />
          <CounterTab
            label="Awaiting review"
            value={completedNotReviewed.length}
            accent={completedNotReviewed.length > 0}
            active={tab === 'queue'}
            onClick={() => setTab('queue')}
          />
          <CounterTab label="Changelog" value={changelog.length} active={tab === 'changelog'} onClick={() => setTab('changelog')} />
        </div>

        {tab === 'review' && (
          <div className="fq-body">
            {reviewItems.length === 0 && <EmptyState text="Nothing to review." />}
            {reviewItems.map((item) => (
              <FeedbackCard key={item.id} item={item}>
                <div className="fq-card-actions">
                  <button disabled={busyId === item.id} onClick={() => handleAccept(item)} className="fq-btn fq-btn-primary">
                    Accept into queue
                  </button>
                  <button disabled={busyId === item.id} onClick={() => handleDismiss(item)} className="fq-btn fq-btn-ghost">
                    Dismiss
                  </button>
                </div>
              </FeedbackCard>
            ))}
          </div>
        )}

        {tab === 'queue' && (
          <div className="fq-body">
            {openRequests.length > 0 && <SectionHeader text="Build in process — Rigg is working these" />}
            {openRequests.length > 0 ? (
              <div>
                {openRequests.map((r) => {
                  const stale = Date.now() - new Date(r.requested_at).getTime() > STALE_REQUEST_MS;
                  return (
                    <div key={r.id} className={`fq-request${stale ? ' stale' : ''}`}>
                      <div className="fq-request-row">
                        <div className="fq-request-main">
                          Build requested — {r.item_count} item{r.item_count === 1 ? '' : 's'}
                          <span className="fq-request-sub">
                            {new Date(r.requested_at).toLocaleString()} · status:{' '}
                            <span className="fq-request-status">{r.status.replace('_', ' ')}</span> · Rigg is working
                            this — check the SOMA board.
                          </span>
                        </div>
                        {stale && (
                          <div className="fq-request-actions">
                            <button disabled={busyId === r.id} onClick={() => handleEscalate(r)} className="fq-btn fq-btn-sm fq-btn-gold-outline">
                              Notify Rigg again
                            </button>
                            <button disabled={busyId === r.id} onClick={() => handleCancel(r)} className="fq-btn fq-btn-sm fq-btn-danger">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                      {stale && (
                        <div className="fq-stale-note">
                          No progress for over 2 hours — this may be stuck. A scheduled check re-notifies Rigg
                          automatically every 2 hours, or notify now. Cancel is the last resort — it releases these
                          items back to the queue without losing them (they stay queued, nothing is discarded).
                          {r.last_escalated_at && <> Last notified {new Date(r.last_escalated_at).toLocaleString()}.</>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="fq-buildbar">
                <div className="fq-request-main">
                  {queueItems.length} item{queueItems.length === 1 ? '' : 's'} ready to build.
                </div>
                <button disabled={buildBusy || queueItems.length === 0} onClick={handleBuild} className="fq-btn fq-btn-primary">
                  {buildBusy ? 'Starting…' : `Start build (${queueItems.length})`}
                </button>
              </div>
            )}

            {uncoveredExtra && (
              <div className="fq-buildbar">
                <div className="fq-request-main">More items have queued up since the request above went out.</div>
                <button disabled={buildBusy} onClick={handleBuild} className="fq-btn fq-btn-sm fq-btn-gold-outline">
                  {buildBusy ? 'Starting…' : 'Start a new build for those'}
                </button>
              </div>
            )}

            {completedNotReviewed.length > 0 && (
              <>
                <SectionHeader text="Waiting review — Rigg finished these, not yet signed off" />
                <div>
                  {completedNotReviewed.map((r) => (
                    <div key={r.id} className="fq-request review fq-request-row">
                      <div className="fq-request-main">
                        Completed — {r.item_count} item{r.item_count === 1 ? '' : 's'}, awaiting your review
                        <span className="fq-request-sub">
                          shipped {r.completed_at ? new Date(r.completed_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <button disabled={busyId === r.id} onClick={() => handleMarkReviewed(r)} className="fq-btn fq-btn-sm fq-btn-primary">
                        Mark reviewed
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <SectionHeader text="All accepted items (detail)" />
            <div>
              {queueItems.length === 0 && <EmptyState text="Nothing queued." />}
              {queueItems.map((item) => (
                <FeedbackCard key={item.id} item={item} />
              ))}
            </div>

            {dismissedOrShipped.length > 0 && (
              <details className="fq-resolved">
                <summary>
                  {dismissedOrShipped.length} resolved item{dismissedOrShipped.length === 1 ? '' : 's'}
                </summary>
                <div style={{ marginTop: 12 }}>
                  {dismissedOrShipped.map((item) => (
                    <FeedbackCard key={item.id} item={item} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {tab === 'changelog' && (
          <div className="fq-body">
            <input
              type="search"
              value={changelogQuery}
              onChange={(e) => setChangelogQuery(e.target.value)}
              placeholder="Search changelog…"
              className="fq-search"
            />
            <div>
              {filteredChangelog.length === 0 && (
                <EmptyState text={changelogQuery ? 'No matching entries.' : 'No changelog entries yet.'} />
              )}
              {filteredChangelog.map((entry) => (
                <div key={entry.id} className="fq-card">
                  <div className="fq-cl-head">
                    <div className="fq-cl-title">{entry.title}</div>
                    <div className="fq-cl-meta">
                      {entry.review_status && entry.review_status !== 'pending' && <ReviewBadge status={entry.review_status} />}
                      {new Date(entry.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  {entry.body && <p className="fq-cl-body">{entry.body}</p>}
                  <div className="fq-cl-verdicts">
                    <button
                      disabled={busyId === entry.id}
                      onClick={() => handleChangelogVerdict(entry, 'accepted')}
                      className={`fq-verdict${entry.review_status === 'accepted' ? ' on-accept' : ''}`}
                    >
                      Accept
                    </button>
                    <button
                      disabled={busyId === entry.id}
                      onClick={() => handleChangelogVerdict(entry, 'needs-change')}
                      className={`fq-verdict${entry.review_status === 'needs-change' ? ' on-change' : ''}`}
                    >
                      Change
                    </button>
                    <button
                      disabled={busyId === entry.id}
                      onClick={() => handleChangelogVerdict(entry, 'reverted')}
                      className={`fq-verdict${entry.review_status === 'reverted' ? ' on-revert' : ''}`}
                    >
                      Revert
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FeedbackQueue;

function errText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function SectionHeader({ text }: { text: string }) {
  return <div className="fq-section-header">{text}</div>;
}

function CounterTab({
  label,
  value,
  active,
  accent,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'true' : undefined} className={`fq-tab${active ? ' active' : ''}${accent ? ' accent' : ''}`}>
      <div className="fq-tab-value">{value}</div>
      <div className="fq-tab-label">{label}</div>
    </button>
  );
}

function ReviewBadge({ status }: { status: NonNullable<ChangelogEntry['review_status']> }) {
  const labels: Record<string, string> = {
    accepted: 'Accepted',
    'needs-change': 'Needs change',
    reverted: 'Reverted',
    pending: 'Pending',
  };
  return <span className={`fq-badge ${status}`}>{labels[status]}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="fq-empty">{text}</div>;
}

function FeedbackCard({ item, children }: { item: FeedbackItem; children?: ReactNode }) {
  return (
    <div className="fq-card">
      <div className="fq-card-meta">
        <span className="fq-pill">{item.type}</span>
        {item.is_admin && <span className="fq-pill admin">admin</span>}
        {item.area && <span className="fq-card-area">{item.area}</span>}
        <span className="fq-card-time">{new Date(item.created_at).toLocaleString()}</span>
      </div>
      <p className="fq-card-desc">{item.description}</p>
      {(item.reporter_name || item.reporter_email) && (
        <p className="fq-card-reporter">
          {item.reporter_name}
          {item.reporter_email ? ` <${item.reporter_email}>` : ''}
        </p>
      )}
      {children}
    </div>
  );
}
