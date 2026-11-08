import { SEED, TARGET_TERM } from '@yottaflex/shared';

export function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">YottaFlex AI</p>
        <h1>Course Demand &amp; Faculty Allocation</h1>
        <p>
          The analytics dashboard scaffold is ready. The pipeline, API, and dashboards are being
          built phase by phase.
        </p>
        <dl className="fact-grid">
          <div>
            <dt>Seed</dt>
            <dd>{SEED}</dd>
          </div>
          <div>
            <dt>Target term</dt>
            <dd>{TARGET_TERM}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
