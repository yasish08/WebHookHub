import { useEffect, useMemo, useState } from "react";

const initialDeliveries = [
  { id: "evt_8f2a91", destination: "payments-prod", event: "payment.succeeded", status: "Delivered", code: 200, time: "Just now", latency: "124 ms" },
  { id: "evt_8f2a88", destination: "analytics-pipeline", event: "user.created", status: "Delivered", code: 202, time: "2 min ago", latency: "86 ms" },
  { id: "evt_8f2a73", destination: "crm-sync", event: "customer.updated", status: "Retrying", code: 503, time: "4 min ago", latency: "2.4 s" },
  { id: "evt_8f2a61", destination: "payments-prod", event: "invoice.paid", status: "Delivered", code: 200, time: "7 min ago", latency: "143 ms" },
  { id: "evt_8f2a42", destination: "warehouse-hook", event: "order.fulfilled", status: "Failed", code:  timeoutCode(), time: "11 min ago", latency: "10.0 s" },
];

function timeoutCode() { return "TIMEOUT"; }

const navItems = [
  { label: "Overview", icon: "◫" },
  { label: "Endpoints", icon: "⌁", count: "4" },
  { label: "Event log", icon: "≋" },
  { label: "Deliveries", icon: "↗" },
];

function Icon({ children, className = "" }) {
  return <span aria-hidden="true" className={`icon ${className}`}>{children}</span>;
}

function App() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [apiState, setApiState] = useState("checking");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All events");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => { if (alive) setApiState(data.status === "ok" ? "online" : "degraded"); })
      .catch(() => { if (alive) setApiState("offline"); });
    return () => { alive = false; };
  }, []);

  const visibleDeliveries = useMemo(() => initialDeliveries.filter((item) => {
    const matchesSearch = `${item.id} ${item.destination} ${item.event}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All events" || item.status === filter;
    return matchesSearch && matchesFilter;
  }), [search, filter]);

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText("http://localhost:4000/api/events");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="WebHookHub home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>webhook<span className="brand-light">hub</span></span>
        </a>

        <div className="workspace-switcher">
          <div className="workspace-avatar">W</div>
          <div className="workspace-copy"><strong>Workspace</strong><span>Acme, Inc. <span className="muted-dot">·</span> Free plan</span></div>
          <Icon>⌄</Icon>
        </div>

        <div className="nav-label">PLATFORM</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button key={item.label} className={`nav-item ${activeNav === item.label ? "active" : ""}`} onClick={() => setActiveNav(item.label)}>
              <Icon>{item.icon}</Icon><span>{item.label}</span>{item.count && <span className="nav-count">{item.count}</span>}
            </button>
          ))}
        </nav>

        <div className="nav-label settings-label">DEVELOP</div>
        <button className="nav-item" onClick={() => setActiveNav("API keys")}><Icon>⌘</Icon><span>API keys</span></button>
        <button className="nav-item" onClick={() => setActiveNav("Documentation")}><Icon>▤</Icon><span>Documentation</span><Icon className="external-icon">↗</Icon></button>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><Icon>✳</Icon></div>
            <strong>Need a hand?</strong>
            <p>Get your first webhook flowing in minutes.</p>
            <button onClick={() => setActiveNav("Documentation")}>Read the quickstart <span>→</span></button>
          </div>
          <button className="profile-button">
            <div className="profile-avatar">Y</div>
            <div className="profile-copy"><strong>Yasish</strong><span>Personal workspace</span></div>
            <Icon>···</Icon>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><Icon>›</Icon><strong>{activeNav}</strong></div>
          <div className="topbar-actions">
            <div className={`connection-pill ${apiState}`}><span className="status-dot" />API {apiState === "checking" ? "checking" : apiState}</div>
            <button className="icon-button" aria-label="Notifications"><Icon>♧</Icon><i /></button>
            <div className="top-avatar">Y</div>
          </div>
        </header>

        <div className="page-wrap">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> WEBHOOK INFRASTRUCTURE</div>
              <h1>{activeNav === "Overview" ? "Good evening, Yasish" : activeNav}<span className="heading-period">.</span></h1>
              <p className="subtitle">Here's what's happening with your webhook delivery pipeline.</p>
            </div>
            <button className="primary-button" onClick={copyEndpoint}><Icon>＋</Icon> {copied ? "Copied endpoint" : "Send test event"}</button>
          </section>

          <section className="endpoint-banner">
            <div className="endpoint-symbol"><Icon>⌁</Icon></div>
            <div className="endpoint-info"><span className="mini-label">YOUR INGESTION ENDPOINT</span><code>POST <b>http://localhost:4000/api/events</b></code></div>
            <button className="copy-button" onClick={copyEndpoint} aria-label="Copy event endpoint"><Icon>{copied ? "✓" : "▢"}</Icon><span>{copied ? "Copied" : "Copy"}</span></button>
            <div className="endpoint-divider" />
            <div className="endpoint-status"><span className="status-dot" /><span>Ready to receive</span></div>
          </section>

          <section className="metrics-grid" aria-label="Delivery metrics">
            <Metric title="Events received" value="2,840" delta="+12.8%" detail="vs. last 7 days" icon="↙" tone="violet" />
            <Metric title="Successful deliveries" value="2,716" delta="95.6%" detail="delivery success rate" icon="✓" tone="green" />
            <Metric title="Pending retries" value="18" delta="−4.2%" detail="vs. last 7 days" icon="↻" tone="amber" />
            <Metric title="Avg. response time" value="142 ms" delta="−18 ms" detail="vs. last 7 days" icon="ϟ" tone="blue" />
          </section>

          <section className="middle-grid">
            <div className="panel activity-panel">
              <div className="panel-heading"><div><h2>Delivery activity</h2><p>Events processed over the last 7 days</p></div><button className="select-button">Last 7 days <Icon>⌄</Icon></button></div>
              <div className="chart-summary"><strong>2,840</strong><span className="chart-change">↗ 12.8%</span><span className="chart-caption">events processed</span></div>
              <ActivityChart />
              <div className="chart-axis"><span>Oct 07</span><span>Oct 08</span><span>Oct 09</span><span>Oct 10</span><span>Oct 11</span><span>Oct 12</span><span>Oct 13</span></div>
            </div>
            <div className="panel endpoint-panel">
              <div className="panel-heading"><div><h2>Active endpoints</h2><p>Destination health at a glance</p></div><button className="text-button" onClick={() => setActiveNav("Endpoints")}>View all <Icon>→</Icon></button></div>
              <EndpointRow name="payments-prod" url="api.acme.com/hooks/payments" initials="P" tone="purple" state="Healthy" />
              <EndpointRow name="analytics-pipeline" url="events.acme.io/ingest" initials="A" tone="blue" state="Healthy" />
              <EndpointRow name="crm-sync" url="hooks.acme.io/crm" initials="C" tone="orange" state="Degraded" />
              <EndpointRow name="warehouse-hook" url="data.acme.io/webhooks" initials="W" tone="green" state="Healthy" />
              <button className="add-endpoint" onClick={() => setActiveNav("Endpoints")}><Icon>＋</Icon> Add endpoint <span>→</span></button>
            </div>
          </section>

          <section className="panel deliveries-panel">
            <div className="panel-heading deliveries-heading">
              <div><h2>Recent deliveries <span className="count-chip">24</span></h2><p>Monitor the latest attempts across your endpoints</p></div>
              <button className="text-button" onClick={() => setActiveNav("Deliveries")}>View delivery log <Icon>→</Icon></button>
            </div>
            <div className="table-toolbar">
              <label className="search-field"><Icon>⌕</Icon><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events, IDs..." aria-label="Search deliveries" /><kbd>⌘ K</kbd></label>
              <label className="filter-select"><span className="sr-only">Filter delivery status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All events</option><option>Delivered</option><option>Retrying</option><option>Failed</option></select><Icon>⌄</Icon></label>
              <button className="table-icon-button" aria-label="More delivery filters"><Icon>☷</Icon></button>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>EVENT / ID</th><th>ENDPOINT</th><th>STATUS</th><th>HTTP CODE</th><th>TIME</th><th>LATENCY</th><th /></tr></thead>
                <tbody>
                  {visibleDeliveries.map((delivery) => <tr key={delivery.id}>
                    <td><div className="event-name">{delivery.event}</div><code className="event-id">{delivery.id}</code></td>
                    <td><span className="destination-name">{delivery.destination}</span></td>
                    <td><StatusPill status={delivery.status} /></td>
                    <td><code className={`http-code ${delivery.code === 200 || delivery.code === 202 ? "code-good" : "code-bad"}`}>{delivery.code}</code></td>
                    <td className="time-cell">{delivery.time}</td><td><code className="latency">{delivery.latency}</code></td>
                    <td><button className="row-more" aria-label={`Actions for ${delivery.id}`}>···</button></td>
                  </tr>)}
                  {visibleDeliveries.length === 0 && <tr><td colSpan="7" className="empty-state">No deliveries match your search.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span>Showing <strong>{visibleDeliveries.length}</strong> of 24 deliveries</span><div className="pagination"><button disabled>←</button><button className="page-current">1</button><button>2</button><button>3</button><span>…</span><button>5</button><button>→</button></div></div>
          </section>

          <footer className="page-footer"><span>© 2026 WebHookHub</span><span><span className="footer-live-dot" /> All systems operational <span className="footer-separator">·</span> Built for reliable delivery</span><a href="https://github.com/yasish08/WebHookHub" target="_blank" rel="noreferrer">GitHub <Icon>↗</Icon></a></footer>
        </div>
      </main>
    </div>
  );
}

function Metric({ title, value, delta, detail, icon, tone }) {
  return <article className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${tone}`}><Icon>{icon}</Icon></span></div><div className="metric-value">{value}</div><div className="metric-bottom"><span className={`metric-delta ${tone}`}>{delta}</span><span>{detail}</span></div><div className={`metric-sparkline ${tone}`}><svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true"><path d={tone === "amber" ? "M0 8 C12 10 18 4 28 11 S45 22 58 12 S80 5 92 11 S108 9 120 15" : "M0 19 C12 18 17 8 29 13 S44 5 56 10 S72 17 83 7 S102 11 120 2"} /></svg></div></article>;
}

function EndpointRow({ name, url, initials, tone, state }) {
  return <div className="endpoint-row"><div className={`endpoint-avatar ${tone}`}>{initials}</div><div className="endpoint-row-copy"><strong>{name}</strong><span>{url}</span></div><span className={`endpoint-health ${state === "Healthy" ? "healthy" : "degraded"}`}><span />{state}</span></div>;
}

function StatusPill({ status }) {
  const icon = status === "Delivered" ? "✓" : status === "Retrying" ? "↻" : "×";
  return <span className={`status-pill ${status.toLowerCase()}`}><span>{icon}</span>{status}</span>;
}

function ActivityChart() {
  const bars = [32, 45, 38, 56, 48, 65, 42, 53, 71, 60, 49, 76, 57, 68, 47, 63, 82, 66, 52, 72, 60, 88, 69, 77, 55, 70, 93, 73, 83, 64, 78, 100, 75, 89, 67, 80, 96, 74, 87, 70, 82, 94, 76, 88, 71, 98, 84, 91];
  return <div className="activity-chart" role="img" aria-label="Bar chart showing daily webhook event activity trending upward"><div className="chart-grid"><span>800</span><span>600</span><span>400</span><span>200</span><span>0</span></div><div className="bar-area">{bars.map((height, index) => <span key={index} className={index > 39 ? "bar bar-highlight" : "bar"} style={{ height: `${height}%` }} />)}</div></div>;
}

export default App;
