import { useDeleteAutomata } from '@automabase/automata-client';
import { useCallback, useEffect, useState } from 'react';
import { getClient } from '../automata';
import './CounterList.css';

interface CounterListProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface CounterItem {
  id: string;
  count: number;
  version: string;
}

export function CounterList({ selectedId, onSelect }: CounterListProps) {
  const [counters, setCounters] = useState<CounterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { deleteAutomata, loading: deleting } = useDeleteAutomata();

  // Load counters from local cache
  const loadCounters = useCallback(async () => {
    try {
      setLoading(true);
      const client = getClient();
      const ids = await client.store.listIds();

      const items: CounterItem[] = [];
      for (const id of ids) {
        const cached = await client.getCached(id);
        if (cached) {
          items.push({
            id,
            count: (cached.state as { count: number }).count ?? 0,
            version: cached.version,
          });
        }
      }

      setCounters(items);
    } catch (err) {
      console.error('Failed to load counters:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCounters();

    // Refresh list periodically
    const interval = setInterval(loadCounters, 5000);
    return () => clearInterval(interval);
  }, [loadCounters]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Delete this counter?')) return;

    const success = await deleteAutomata(id);
    if (success) {
      setCounters((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) {
        onSelect(null);
      }
    }
  };

  if (loading && counters.length === 0) {
    return (
      <div className="counter-list card">
        <div className="card-header">
          <h2 className="card-title">
            <span>📋</span>
            Counters
          </h2>
        </div>
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="counter-list card">
      <div className="card-header">
        <h2 className="card-title">
          <span>📋</span>
          Counters
        </h2>
        <span className="counter-count">{counters.length}</span>
      </div>

      {counters.length === 0 ? (
        <div className="list-empty">
          <p>No counters yet</p>
          <p className="hint">Create one above!</p>
        </div>
      ) : (
        <div className="list-items">
          {counters.map((counter) => (
            // biome-ignore lint/a11y/useSemanticElements: complex list item layout with nested button requires div
            <div
              key={counter.id}
              role="button"
              tabIndex={0}
              className={`list-item ${selectedId === counter.id ? 'selected' : ''}`}
              onClick={() => onSelect(counter.id)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(counter.id)}
            >
              <div className="item-info">
                <span className="item-id">{counter.id.slice(0, 8)}...</span>
                <span className="item-count">{counter.count}</span>
              </div>
              <div className="item-actions">
                <span className="item-version">v{counter.version}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={(e) => handleDelete(counter.id, e)}
                  disabled={deleting}
                  title="Delete"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-ghost btn-sm refresh-btn" onClick={loadCounters}>
        ↻ Refresh List
      </button>
    </div>
  );
}
