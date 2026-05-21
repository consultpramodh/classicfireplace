export default function Loading() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1><span className="skeleton-mark" /> <span>Classic Fireplace</span></h1>
          <p>ServiceOps prototype</p>
        </div>
      </aside>
      <main className="main">
        <div className="workspace-nav loading-nav" />
        <div className="prototype-page">
          <div className="loading-title" />
          <div className="ops-kpi-grid">
            {Array.from({ length: 4 }).map((_, index) => <div className="loading-card" key={index} />)}
          </div>
          <div className="dashboard-grid">
            <div className="loading-panel" />
            <div className="loading-panel" />
          </div>
        </div>
      </main>
    </div>
  );
}
