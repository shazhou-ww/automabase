import { useState } from 'react';
import { useCreateAutomata } from '@automabase/automata-client';
import { COUNTER_SCHEMA } from '../automata';
import './CreateCounter.css';

interface CreateCounterProps {
  onCreated: (id: string) => void;
}

export function CreateCounter({ onCreated }: CreateCounterProps) {
  const { create, loading, error } = useCreateAutomata();
  const [initialValue, setInitialValue] = useState('0');

  const handleCreate = async () => {
    const value = parseInt(initialValue, 10) || 0;
    
    const id = await create({
      ...COUNTER_SCHEMA,
      initialState: {
        count: value,
        lastUpdated: null,
      },
    });

    if (id) {
      onCreated(id);
      setInitialValue('0');
    }
  };

  return (
    <div className="create-counter card">
      <div className="card-header">
        <h2 className="card-title">
          <span>✨</span>
          Create Counter
        </h2>
      </div>

      <div className="create-form">
        <div className="form-group">
          <label className="form-label">Initial Value</label>
          <input
            type="number"
            className="input"
            value={initialValue}
            onChange={(e) => setInitialValue(e.target.value)}
            placeholder="0"
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" style={{ width: 16, height: 16 }} />
              Creating...
            </>
          ) : (
            'Create New Counter'
          )}
        </button>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
