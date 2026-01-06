import { useState } from 'react';
import { useAutomata, useAutomataHistory } from '@automabase/automata-client';
import './Counter.css';

interface CounterState {
  count: number;
  lastUpdated: string | null;
}

interface CounterProps {
  automataId: string;
}

export function Counter({ automataId }: CounterProps) {
  const {
    state,
    version,
    loading,
    error,
    connected,
    send,
    refresh,
  } = useAutomata<CounterState>(automataId);

  const [customAmount, setCustomAmount] = useState('1');
  const [showHistory, setShowHistory] = useState(false);

  if (loading && !state) {
    return (
      <div className="counter-card">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="counter-card">
        <div className="error">{error}</div>
        <button className="btn btn-secondary" onClick={refresh}>
          Retry
        </button>
      </div>
    );
  }

  const amount = parseInt(customAmount, 10) || 1;

  return (
    <div className="counter-card">
      {/* Header */}
      <div className="counter-header">
        <div className="counter-meta">
          <span className="counter-id" title={automataId}>
            {automataId.slice(0, 8)}...
          </span>
          <span className="status">
            <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
        <div className="counter-version">
          v{version}
        </div>
      </div>

      {/* Count Display */}
      <div className="counter-display">
        <div className="count-value">{state?.count ?? 0}</div>
        <div className="count-label">Current Count</div>
      </div>

      {/* Controls */}
      <div className="counter-controls">
        <div className="control-row">
          <button
            className="btn btn-secondary btn-lg"
            onClick={() => send('DECREMENT', { amount })}
            disabled={loading}
          >
            − {amount}
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => send('INCREMENT', { amount })}
            disabled={loading}
          >
            + {amount}
          </button>
        </div>

        <div className="control-row">
          <input
            type="number"
            className="input amount-input"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            min="1"
            placeholder="Amount"
          />
          <button
            className="btn btn-secondary"
            onClick={() => send('RESET')}
            disabled={loading}
          >
            Reset
          </button>
        </div>

        <div className="control-row">
          <button
            className="btn btn-ghost"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? '▲ Hide History' : '▼ Show History'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={refresh}
            disabled={loading}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Last Updated */}
      {state?.lastUpdated && (
        <div className="counter-footer">
          Last updated: {new Date(state.lastUpdated).toLocaleTimeString()}
        </div>
      )}

      {/* History Panel */}
      {showHistory && <EventHistory automataId={automataId} />}

      {/* Error Toast */}
      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}

function EventHistory({ automataId }: { automataId: string }) {
  const { events, loading, hasMore, loadMore } = useAutomataHistory(automataId, {
    direction: 'backtrace',
    limit: 10,
  });

  return (
    <div className="history-panel">
      <h3 className="history-title">Event History</h3>
      
      {events.length === 0 && !loading ? (
        <div className="history-empty">No events yet</div>
      ) : (
        <div className="history-list">
          {events.map((event) => (
            <div key={event.version} className="history-item">
              <div className="history-event">
                <span className="event-type">{event.type}</span>
                <span className="event-version">v{event.version}</span>
              </div>
              <div className="history-state">
                → count: {(event.nextState as CounterState).count}
              </div>
              <div className="history-time">
                {new Date(event.createdAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
        </div>
      )}

      {hasMore && !loading && (
        <button className="btn btn-ghost btn-sm" onClick={loadMore}>
          Load more...
        </button>
      )}
    </div>
  );
}
