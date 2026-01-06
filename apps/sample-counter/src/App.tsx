import { useState } from 'react';
import { Counter } from './components/Counter';
import { CreateCounter } from './components/CreateCounter';
import { CounterList } from './components/CounterList';
import './App.css';

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1 className="logo">
            <span className="logo-icon">⚡</span>
            Automata Counter
          </h1>
          <p className="tagline">Real-time state machine demo</p>
        </div>
      </header>

      <main className="main">
        <div className="container">
          <div className="grid">
            {/* Left Panel - Counter List & Create */}
            <aside className="sidebar">
              <CreateCounter onCreated={setSelectedId} />
              <CounterList
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </aside>

            {/* Right Panel - Counter Display */}
            <section className="content">
              {selectedId ? (
                <Counter automataId={selectedId} />
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">🎯</div>
                  <h2>Select a Counter</h2>
                  <p>Choose an existing counter from the list or create a new one</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>
          Built with <span className="heart">♥</span> using{' '}
          <code>@automabase/automata-client</code>
        </p>
      </footer>
    </div>
  );
}

export default App;
