import React, { useEffect, useMemo, useState } from "react";

const navItems = [
  { label: "Overview", icon: "◫" },
  { label: "Endpoints", icon: "⌁" },
  { label: "Event log", icon: "≋" },
  { label: "Deliveries", icon: "↗" },
];

function Icon({ children, className = "" }) {
  return <span aria-hidden="true" className={`icon ${className}`}>{children}</span>;
}

function ParticleField() {
  const canvasRef = React.useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    let particles = [];
    const pointer = { x: -1000, y: -1000 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(105, Math.max(38, Math.floor((width * height) / 10500)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.34,
        vy: (Math.random() - 0.5) * 0.34,
        radius: Math.random() * 1.5 + 0.6,
        alpha: Math.random() * 0.42 + 0.18,
      }));
    };

    const onPointerMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    };
    const onPointerLeave = () => { pointer.x = -1000; pointer.y = -1000; };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        if (!reduceMotion) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 125 && distance > 0) {
            const force = (125 - distance) / 125;
            p.vx += (dx / distance) * force * 0.018;
            p.vy += (dy / distance) * force * 0.018;
          }
          p.vx += (Math.random() - 0.5) * 0.006;
          p.vy += (Math.random() - 0.5) * 0.006;
          p.vx *= 0.994;
          p.vy *= 0.994;
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -4) p.x = width + 4;
          if (p.x > width + 4) p.x = -4;
          if (p.y < -4) p.y = height + 4;
          if (p.y > height + 4) p.y = -4;
        }
        for (let j = i + 1; j < particles.length; j += 1) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 94) {
            const alpha = (1 - distance / 94) * 0.15;
            context.strokeStyle = `rgba(169, 139, 255, ${alpha})`;
            context.lineWidth = 0.7;
            context.beginPath();
            context.moveTo(p.x, p.y);
            context.lineTo(q.x, q.y);
            context.stroke();
          }
        }
        const glow = Math.hypot(p.x - pointer.x, p.y - pointer.y) < 125;
        context.beginPath();
        context.fillStyle = glow
          ? `rgba(205, 185, 255, ${Math.min(1, p.alpha + 0.4)})`
          : `rgba(166, 139, 255, ${p.alpha})`;
        context.shadowBlur = glow ? 11 : 4;
        context.shadowColor = "rgba(153, 115, 255, .65)";
        context.arc(p.x, p.y, glow ? p.radius + 0.5 : p.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.shadowBlur = 0;
      if (!reduceMotion) frame = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="auth-particle-field" aria-hidden="true" />;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(sessionStorage.getItem("webhookhub_access_token")));
  const [activeNav, setActiveNav] = useState("Overview");
  const [apiState, setApiState] = useState("checking");
  const [overviewData, setOverviewData] = useState(null);
  const [overviewError, setOverviewError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All events");
  const [copied, setCopied] = useState(false);
  const [testEventState, setTestEventState] = useState("idle");

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => { if (alive) setApiState(data.status === "ok" ? "online" : "degraded"); })
      .catch(() => { if (alive) setApiState("offline"); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const token = sessionStorage.getItem("webhookhub_access_token");
    if (!token) {
      setOverviewData(null);
      setOverviewError("");
      return () => { alive = false; };
    }
    fetch("/api/overview", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Dashboard metrics could not be loaded.");
        return data;
      })
      .then((data) => { if (alive) { setOverviewData(data); setOverviewError(""); } })
      .catch((error) => { if (alive) setOverviewError(error.message); });
    return () => { alive = false; };
  }, [activeNav, isAuthenticated]);

  const dashboardDeliveries = useMemo(() => overviewData
    ? overviewData.recentDeliveries.map((delivery) => ({
        id: delivery.id,
        destination: delivery.endpoint.name,
        event: delivery.event.eventType,
        status: delivery.status === "DELIVERED" ? "Delivered" : delivery.status === "RETRYING" ? "Retrying" : delivery.status === "FAILED" ? "Failed" : delivery.status === "PROCESSING" ? "Processing" : "Pending",
        code: delivery.responseStatus ?? (delivery.errorMessage ? "ERR" : "—"),
        time: delivery.timeLabel,
        latency: delivery.latencyLabel,
      }))
    : [], [overviewData]);

  const visibleDeliveries = useMemo(() => dashboardDeliveries.filter((item) => {
    const matchesSearch = `${item.id} ${item.destination} ${item.event}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All events" || item.status === filter;
    return matchesSearch && matchesFilter;
  }), [dashboardDeliveries, search, filter]);

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText("http://localhost:4000/api/events");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const sendTestEvent = async () => {
    const token = sessionStorage.getItem("webhookhub_access_token");
    if (!token) { setActiveNav("Endpoints"); return; }
    setTestEventState("sending");
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `dashboard-test-${Date.now()}`,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventType: "payment.created",
          payload: {
            paymentId: `pay_test_${Date.now()}`,
            amount: 499,
            currency: "INR",
            status: "success",
            source: "webhookhub-dashboard-test",
            sentAt: new Date().toISOString(),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Event ingestion failed");
      setTestEventState("sent");
      fetch("/api/overview", { headers: { Authorization: `Bearer ${token}` } })
        .then((overviewResponse) => overviewResponse.ok ? overviewResponse.json() : null)
        .then((overview) => { if (overview) setOverviewData(overview); })
        .catch(() => {});
      window.setTimeout(() => setTestEventState("idle"), 2500);
    } catch {
      setTestEventState("error");
      window.setTimeout(() => setTestEventState("idle"), 3000);
    }
  };

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => { setIsAuthenticated(true); setActiveNav("Overview"); }} />;
  }

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
              <Icon>{item.icon}</Icon><span>{item.label}</span>{item.label === "Endpoints" && isAuthenticated && <span className="nav-count">{overviewData?.metrics?.endpointCount ?? "—"}</span>}
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
          {activeNav === "Endpoints" ? <EndpointsManager onSignOut={() => { setIsAuthenticated(false); setActiveNav("Overview"); }} /> : activeNav === "Deliveries" ? <DeliveriesManager onNavigate={setActiveNav} /> : activeNav === "Event log" ? <EventLogManager onNavigate={setActiveNav} /> : <>
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> WEBHOOK INFRASTRUCTURE</div>
              <h1>{activeNav === "Overview" ? "Good evening, Yasish" : activeNav}<span className="heading-period">.</span></h1>
              <p className="subtitle">Here's what's happening with your webhook delivery pipeline.</p>
            </div>
            <button className="primary-button" onClick={sendTestEvent} disabled={testEventState === "sending"}><Icon>{testEventState === "sent" ? "✓" : testEventState === "error" ? "!" : "＋"}</Icon> {testEventState === "sending" ? "Sending event…" : testEventState === "sent" ? "Event accepted" : testEventState === "error" ? "Send failed — retry" : "Send test event"}</button>
          </section>

          <section className="endpoint-banner">
            <div className="endpoint-symbol"><Icon>⌁</Icon></div>
            <div className="endpoint-info"><span className="mini-label">YOUR INGESTION ENDPOINT</span><code>POST <b>http://localhost:4000/api/events</b></code></div>
            <button className="copy-button" onClick={copyEndpoint} aria-label="Copy event endpoint"><Icon>{copied ? "✓" : "▢"}</Icon><span>{copied ? "Copied" : "Copy"}</span></button>
            <div className="endpoint-divider" />
            <div className="endpoint-status"><span className="status-dot" /><span>Ready to receive</span></div>
          </section>

          <section className="metrics-grid" aria-label="Delivery metrics">
            <Metric title="Events received" value={overviewData ? overviewData.metrics.eventCount.toLocaleString() : "—"} delta={overviewData ? `${overviewData.metrics.eventsLast7Days} this week` : "Loading"} detail="total events received" icon="↙" tone="violet" />
            <Metric title="Successful deliveries" value={overviewData ? overviewData.metrics.deliveredCount.toLocaleString() : "—"} delta={overviewData ? `${overviewData.metrics.successRate}%` : "Loading"} detail="successful deliveries" icon="✓" tone="green" />
            <Metric title="Pending retries" value={overviewData ? overviewData.metrics.pendingCount.toLocaleString() : "—"} delta="current queue" detail="pending / processing" icon="↻" tone="amber" />
            <Metric title="Avg. response time" value={overviewData?.metrics.averageDurationMs == null ? "—" : `${overviewData.metrics.averageDurationMs} ms`} delta="measured" detail="average delivery duration" icon="ϟ" tone="blue" />
          </section>

          <section className="middle-grid">
            <div className="panel activity-panel">
              <div className="panel-heading"><div><h2>Delivery activity</h2><p>Events processed over the last 7 days</p></div><button className="select-button">Last 7 days <Icon>⌄</Icon></button></div>
              <div className="chart-summary"><strong>{overviewData ? overviewData.metrics.eventsLast7Days.toLocaleString() : "—"}</strong><span className="chart-change">{overviewData ? "last 7 days" : "Loading real metrics"}</span><span className="chart-caption">events received</span></div>
              <ActivityChart data={overviewData?.activityByDay} />
              <div className="chart-axis">{(overviewData?.activityByDay || []).map((day) => <span key={day.date || day.label}>{day.label}</span>)}</div>
            </div>
            <div className="panel endpoint-panel">
              <div className="panel-heading"><div><h2>Endpoints</h2><p>Destination status at a glance</p></div><button className="text-button" onClick={() => setActiveNav("Endpoints")}>View all <Icon>→</Icon></button></div>
              {(overviewData?.endpoints || []).map((endpoint, index) => <EndpointRow key={endpoint.id} name={endpoint.name} url={endpoint.url} initials={endpoint.name.slice(0, 1).toUpperCase()} tone={["purple", "blue", "orange", "green"][index % 4]} state={endpoint.status === "ACTIVE" ? "Active" : "Paused"} />)}
              <button className="add-endpoint" onClick={() => setActiveNav("Endpoints")}><Icon>＋</Icon> Add endpoint <span>→</span></button>
            </div>
          </section>

          <section className="panel deliveries-panel">
            <div className="panel-heading deliveries-heading">
              <div><h2>Recent deliveries <span className="count-chip">{overviewData ? overviewData.recentDeliveries.length : 0}</span></h2><p>Monitor the latest attempts across your endpoints</p></div>
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
                  {visibleDeliveries.length === 0 && <tr><td colSpan="7" className="empty-state">No real deliveries yet. Send an event matching an active endpoint to create a delivery.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span>Showing <strong>{visibleDeliveries.length}</strong> of {overviewData ? overviewData.recentDeliveries.length : 0} recent deliveries</span><div className="pagination"><button disabled>←</button><button className="page-current">1</button><button>2</button><button>3</button><span>…</span><button>5</button><button>→</button></div></div>
          </section>

          <footer className="page-footer"><span>© 2026 WebHookHub</span><span><span className="footer-live-dot" /> All systems operational <span className="footer-separator">·</span> Built for reliable delivery</span><a href="https://github.com/yasish08/WebHookHub" target="_blank" rel="noreferrer">GitHub <Icon>↗</Icon></a></footer>
          </>}
        </div>
      </main>
    </div>
  );
}



function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, ...(mode === "register" ? { name: name.trim() } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Authentication failed. Please try again.");
      if (!data.accessToken) throw new Error("The server did not return an access token.");
      sessionStorage.setItem("webhookhub_access_token", data.accessToken);
      onAuthenticated();
    } catch (err) {
      setError(err.message || "Could not connect to WebHookHub. Check that the API is running.");
    } finally {
      setBusy(false);
    }
  };

  const moveShowcase = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    event.currentTarget.style.setProperty("--pointer-x", `${x}%`);
    event.currentTarget.style.setProperty("--pointer-y", `${y}%`);
    event.currentTarget.style.setProperty("--pointer-tilt-x", `${((y - 50) / 50) * -3}deg`);
    event.currentTarget.style.setProperty("--pointer-tilt-y", `${((x - 50) / 50) * 4}deg`);
  };

  return (
    <main className="auth-screen">
      <section className="auth-showcase" onPointerMove={moveShowcase}>
        <ParticleField />
        <a className="brand auth-brand" href="/" aria-label="WebHookHub home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>webhook<span className="brand-light">hub</span></span>
        </a>
        <div className="auth-showcase-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> RELIABLE WEBHOOK INFRASTRUCTURE</div>
          <h1>Every event.<br /><span>Delivered.</span></h1>
          <p>One place to manage endpoints, observe delivery attempts, and recover from failures with confidence.</p>
          <div className="auth-feature-list">
            <div><span>✓</span><div><strong>Reliable delivery</strong><p>Automatic retries and delivery history.</p></div></div>
            <div><span>↗</span><div><strong>Full visibility</strong><p>Track events from ingestion to response.</p></div></div>
            <div><span>⌘</span><div><strong>Built for developers</strong><p>Secure endpoints with signed webhooks.</p></div></div>
          </div>
          <div className="hero-live-preview" aria-label="Illustration of webhook event delivery">
            <div className="preview-orbit preview-orbit-one" />
            <div className="preview-orbit preview-orbit-two" />
            <div className="preview-glow" />
            <div className="preview-topline"><span><i /> LIVE PIPELINE</span><span className="preview-live"><b /> OPERATIONAL</span></div>
            <div className="preview-flow">
              <div className="preview-node preview-source"><span>↗</span><small>EVENT</small><strong>payment.created</strong><em>Incoming event</em></div>
              <div className="preview-connector"><i /><i /><i /><span>→</span></div>
              <div className="preview-node preview-target"><span>⌁</span><small>DELIVERY</small><strong>your-endpoint</strong><em><b /> HTTP 200 · 84 ms</em></div>
            </div>
            <div className="preview-bottomline"><span><i /> Signed payload verified</span><span>RETRY READY <b>↻</b></span></div>
          </div>
        </div>
        <p className="auth-showcase-footer"><span>✳</span> © 2026 WebHookHub <i /> BUILT FOR RELIABLE DELIVERY</p>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand"><span className="brand-mark"><span /><span /><span /></span> webhook<span className="brand-light">hub</span></div>
          <div className="auth-form-heading">
            <span className="auth-kicker">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</span>
            <h2>{mode === "login" ? "Sign in to your workspace" : "Create your account"}</h2>
            <p>{mode === "login" ? "Enter your details to continue to WebHookHub." : "Start managing reliable webhook delivery in minutes."}</p>
          </div>
          {error && <div className="manager-alert error-alert" role="alert">{error}</div>}
          <form className="manager-form auth-form auth-screen-form" onSubmit={submit}>
            {mode === "register" && <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder="Your name" autoComplete="name" /></label>}
            <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="you@company.com" autoComplete="email" /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={128} placeholder="At least 10 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
            <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"} <span>→</span></button>
          </form>
          <p className="auth-switch">{mode === "login" ? "Don't have an account?" : "Already have an account?"} <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in instead"}</button></p>
          <p className="auth-security-note"><span>⌑</span> Your workspace data is protected by authenticated API access.</p>
        </div>
      </section>
    </main>
  );
}

function EndpointsManager({ onSignOut }) {
  const [token, setToken] = useState(() => sessionStorage.getItem("webhookhub_access_token") || "");
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [endpoints, setEndpoints] = useState([]);
  const [endpointName, setEndpointName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [eventTypes, setEventTypes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revealedSecret, setRevealedSecret] = useState("");

  const request = async (path, options = {}, accessToken = token) => {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(data?.message || "Request failed.");
    return data;
  };

  const loadEndpoints = async (accessToken = token) => {
    const data = await request("/api/endpoints", {}, accessToken);
    setEndpoints(data.endpoints || []);
  };

  useEffect(() => {
    if (!token) return;
    loadEndpoints().catch((err) => {
      setError(err.message);
      if (/token|unauthorized|account/i.test(err.message)) {
        sessionStorage.removeItem("webhookhub_access_token");
        setToken("");
      }
    });
  }, [token]);

  const submitAuth = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await request(`/api/auth/${authMode === "register" ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ email, password, ...(authMode === "register" ? { name } : {}) }),
      }, "");
      sessionStorage.setItem("webhookhub_access_token", data.accessToken);
      setToken(data.accessToken);
      setPassword("");
      setNotice(`Signed in as ${data.user.email}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createEndpoint = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setRevealedSecret("");
    try {
      const data = await request("/api/endpoints", {
        method: "POST",
        body: JSON.stringify({
          name: endpointName,
          url: endpointUrl,
          eventTypes: eventTypes.split(",").map((item) => item.trim()).filter(Boolean),
        }),
      });
      setEndpoints((current) => [data.endpoint, ...current]);
      setEndpointName("");
      setEndpointUrl("");
      setEventTypes("");
      setRevealedSecret(data.signingSecret);
      setNotice("Endpoint created. Copy the signing secret now; it will not be shown again.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleEndpoint = async (endpoint) => {
    setError("");
    setNotice("");
    try {
      const data = await request(`/api/endpoints/${endpoint.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: endpoint.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }),
      });
      setEndpoints((current) => current.map((item) => item.id === endpoint.id ? data.endpoint : item));
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteEndpoint = async (endpoint) => {
    if (!window.confirm(`Delete endpoint "${endpoint.name}"? This also removes its delivery history.`)) return;
    setError("");
    try {
      await request(`/api/endpoints/${endpoint.id}`, { method: "DELETE" });
      setEndpoints((current) => current.filter((item) => item.id !== endpoint.id));
      setNotice("Endpoint deleted.");
    } catch (err) {
      setError(err.message);
    }
  };

  const rotateSecret = async (endpoint) => {
    setError("");
    setNotice("");
    try {
      const data = await request(`/api/endpoints/${endpoint.id}/rotate-secret`, { method: "POST", body: JSON.stringify({}) });
      setRevealedSecret(data.signingSecret);
      setNotice(`Signing secret rotated for ${endpoint.name}. Update the receiver before sending production events.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const signOut = () => {
    sessionStorage.removeItem("webhookhub_access_token");
    setToken("");
    setEndpoints([]);
    setRevealedSecret("");
    setNotice("Signed out.");
    setError("");
    onSignOut?.();
  };

  return (
    <div className="endpoint-manager">
      <section className="page-heading endpoint-manager-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> DESTINATION CONFIGURATION</div>
          <h1>Endpoints<span className="heading-period">.</span></h1>
          <p className="subtitle">Manage secure webhook destinations for your workspace.</p>
        </div>
        {token && <button className="secondary-button" onClick={signOut}>Sign out</button>}
      </section>

      {error && <div className="manager-alert error-alert" role="alert">{error}</div>}
      {notice && <div className="manager-alert success-alert" role="status">{notice}</div>}
      {revealedSecret && <div className="secret-reveal"><div><strong>Signing secret — shown once</strong><code>{revealedSecret}</code></div><button className="secondary-button" onClick={() => navigator.clipboard.writeText(revealedSecret).then(() => setNotice("Signing secret copied."))}>Copy secret</button></div>}

      {!token ? (
        <section className="panel auth-panel">
          <div className="panel-heading"><div><h2>{authMode === "login" ? "Welcome back" : "Create your account"}</h2><p>{authMode === "login" ? "Sign in to manage your endpoints." : "Create a workspace account to get started."}</p></div></div>
          <form className="manager-form auth-form" onSubmit={submitAuth}>
            {authMode === "register" && <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Your name" autoComplete="name" /></label>}
            <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="you@company.com" autoComplete="email" /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={128} placeholder="At least 10 characters" autoComplete={authMode === "login" ? "current-password" : "new-password"} /></label>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          <p className="auth-switch">{authMode === "login" ? "New to WebHookHub?" : "Already have an account?"} <button onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setError(""); }}>{authMode === "login" ? "Create an account" : "Sign in"}</button></p>
          <p className="auth-note">Requires a running API, PostgreSQL, and configured JWT_SECRET.</p>
        </section>
      ) : (
        <>
          <section className="panel endpoint-create-panel">
            <div className="panel-heading"><div><h2>Add an endpoint</h2><p>We validate the destination before saving it.</p></div><span className="endpoint-count">{endpoints.length} configured</span></div>
            <form className="manager-form endpoint-form" onSubmit={createEndpoint}>
              <label>Endpoint name<input value={endpointName} onChange={(event) => setEndpointName(event.target.value)} required maxLength={80} placeholder="payments-prod" /></label>
              <label>Destination URL<input type="url" value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} required maxLength={2048} placeholder="https://api.example.com/webhooks" /></label>
              <label>Event types <span className="optional-label">optional · comma-separated</span><input value={eventTypes} onChange={(event) => setEventTypes(event.target.value)} placeholder="payment.succeeded, invoice.paid" /></label>
              <button className="primary-button" type="submit" disabled={busy}><Icon>＋</Icon>{busy ? "Saving…" : "Create endpoint"}</button>
            </form>
          </section>
          <section className="panel endpoint-list-panel">
            <div className="panel-heading"><div><h2>Your destinations</h2><p>Signing secrets are never included in endpoint list responses.</p></div><button className="text-button" onClick={() => loadEndpoints().catch((err) => setError(err.message))}>Refresh <Icon>↻</Icon></button></div>
            {endpoints.length === 0 ? <div className="manager-empty"><span className="empty-mark">⌁</span><strong>No endpoints yet</strong><p>Create your first destination above to start configuring webhook delivery.</p></div> : endpoints.map((endpoint) => (
              <article className="managed-endpoint" key={endpoint.id}>
                <div className="endpoint-avatar purple">{endpoint.name.slice(0, 1).toUpperCase()}</div>
                <div className="managed-endpoint-main"><strong>{endpoint.name}</strong><code>{endpoint.url}</code><div className="managed-tags">{(endpoint.eventTypes || []).length ? endpoint.eventTypes.map((type) => <span key={type}>{type}</span>) : <span>All event types</span>}<span className={endpoint.status === "ACTIVE" ? "active-tag" : "paused-tag"}>{endpoint.status}</span></div></div>
                <div className="managed-endpoint-actions"><button className="secondary-button" onClick={() => toggleEndpoint(endpoint)}>{endpoint.status === "ACTIVE" ? "Pause" : "Activate"}</button><button className="secondary-button" onClick={() => rotateSecret(endpoint)}>Rotate secret</button><button className="danger-button" onClick={() => deleteEndpoint(endpoint)}>Delete</button></div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}



function EventLogManager({ onNavigate }) {
  const [token] = useState(() => sessionStorage.getItem("webhookhub_access_token") || "");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState("");

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/events?limit=50", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Event history could not be loaded.");
      setEvents(data.events || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const visibleEvents = events.filter((event) => `${event.id} ${event.eventType} ${event.status}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="endpoint-manager event-log-manager">
      <section className="page-heading endpoint-manager-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> EVENT INGESTION</div><h1>Event log<span className="heading-period">.</span></h1><p className="subtitle">Inspect accepted events, payloads and their delivery outcomes.</p></div>
        <button className="secondary-button" onClick={load} disabled={loading}><Icon>↻</Icon>{loading ? "Refreshing…" : "Refresh"}</button>
      </section>
      {error && <div className="manager-alert error-alert" role="alert">{error}</div>}
      {!token ? (
        <section className="panel manager-empty"><strong>Sign in to view event history</strong><p>Your event log is scoped to your workspace endpoints.</p><button className="secondary-button" onClick={() => onNavigate("Endpoints")}>Go to endpoints</button></section>
      ) : (
        <section className="panel endpoint-list-panel">
          <div className="panel-heading"><div><h2>Recent events <span className="count-chip">{visibleEvents.length}</span></h2><p>Showing up to 50 events associated with your endpoints.</p></div><label className="search-field event-search"><Icon>⌕</Icon><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event type or ID…" aria-label="Search events" /></label></div>
          {visibleEvents.length === 0 ? <div className="manager-empty"><span className="empty-mark">≋</span><strong>{loading ? "Loading events…" : "No matching events"}</strong><p>Send a test event or ingest an event matching one of your active endpoints.</p></div> : (
            <div className="event-log-list">{visibleEvents.map((event) => (
              <article className="event-log-row" key={event.id}>
                <button className="event-log-summary" onClick={() => setExpandedId(expandedId === event.id ? "" : event.id)} aria-expanded={expandedId === event.id}>
                  <span className="event-log-symbol"><Icon>≋</Icon></span>
                  <span className="event-log-main"><strong>{event.eventType}</strong><code>{event.id}</code></span>
                  <span className={`event-status status-${event.status.toLowerCase()}`}>{event.status}</span>
                  <span className="event-log-counts">{event.deliveredCount}/{event.deliveryCount} delivered{event.failedCount ? ` · ${event.failedCount} failed` : ""}</span>
                  <span className="event-log-date">{new Date(event.createdAt).toLocaleString()}</span>
                  <Icon>{expandedId === event.id ? "⌃" : "⌄"}</Icon>
                </button>
                {expandedId === event.id && <div className="event-log-details"><div><span className="mini-label">PAYLOAD</span><pre>{JSON.stringify(event.payload, null, 2)}</pre></div><div><span className="mini-label">MATCHED ENDPOINTS</span>{event.deliveries.length ? event.deliveries.map((delivery) => <div className="event-endpoint-chip" key={delivery.id}><span>{delivery.endpoint.name}</span><span className={`delivery-state state-${delivery.status.toLowerCase()}`}>{delivery.status}</span></div>) : <p className="auth-note">No matching endpoint delivery was created.</p>}</div></div>}
              </article>
            ))}</div>
          )}
        </section>
      )}
    </div>
  );
}

function DeliveriesManager({ onNavigate }) {
  const [token] = useState(() => sessionStorage.getItem("webhookhub_access_token") || "");
  const [deliveries, setDeliveries] = useState([]);
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [attempts, setAttempts] = useState([]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (status !== "ALL") params.set("status", status);
      const query = `?${params.toString()}`;
      const response = await fetch(`/api/deliveries${query}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Delivery history could not be loaded.");
      setDeliveries(data.deliveries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, status]);

  const viewAttempts = async (deliveryId) => {
    if (selectedId === deliveryId) {
      setSelectedId("");
      setAttempts([]);
      return;
    }
    setSelectedId(deliveryId);
    setError("");
    try {
      const response = await fetch(`/api/deliveries/${deliveryId}/attempts`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Attempts could not be loaded.");
      setAttempts(data.attempts || []);
    } catch (err) { setError(err.message); }
  };

  const replay = async (deliveryId) => {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/deliveries/${deliveryId}/replay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Replay failed.");
      setNotice(data.message || "Replay queued.");
      await load();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="endpoint-manager delivery-manager">
      <section className="page-heading endpoint-manager-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> DELIVERY OBSERVABILITY</div>
          <h1>Delivery history<span className="heading-period">.</span></h1>
          <p className="subtitle">Inspect real delivery attempts, response codes and retry state.</p>
        </div>
        <button className="secondary-button" onClick={load} disabled={loading}><Icon>↻</Icon>{loading ? "Refreshing…" : "Refresh"}</button>
      </section>
      {error && <div className="manager-alert error-alert" role="alert">{error}</div>}
      {notice && <div className="manager-alert success-alert" role="status">{notice}</div>}
      {!token ? (
        <section className="panel manager-empty"><strong>Sign in to view delivery history</strong><p>Open Endpoints to register or sign in, then return here.</p><button className="secondary-button" onClick={() => onNavigate("Endpoints")}>Go to endpoints</button></section>
      ) : (
        <section className="panel endpoint-list-panel">
          <div className="panel-heading">
            <div><h2>Recent attempts <span className="count-chip">{deliveries.length}</span></h2><p>Showing up to 50 of your most recent deliveries.</p></div>
            <label className="filter-select"><span className="sr-only">Filter delivery status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="PROCESSING">Processing</option><option value="DELIVERED">Delivered</option><option value="RETRYING">Retrying</option><option value="FAILED">Failed</option></select><Icon>⌄</Icon></label>
          </div>
          {deliveries.length === 0 ? <div className="manager-empty"><span className="empty-mark">↗</span><strong>{loading ? "Loading deliveries…" : "No deliveries yet"}</strong><p>When an event matches an active endpoint, its delivery and every attempt will appear here.</p></div> : (
            <div className="real-delivery-list">
              {deliveries.map((delivery) => (
                <article className="real-delivery" key={delivery.id}>
                  <div className="real-delivery-main">
                    <div className="real-delivery-title"><strong>{delivery.event.eventType}</strong><span className={`delivery-state state-${delivery.status.toLowerCase()}`}>{delivery.status}</span></div>
                    <div className="real-delivery-meta"><span>{delivery.endpoint.name}</span><code>{delivery.id}</code></div>
                    <div className="real-delivery-meta"><span>{delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : delivery.errorMessage || "Waiting for attempt"}</span><span>{delivery.durationMs == null ? "—" : `${delivery.durationMs} ms`}</span><span>{delivery.attemptCount} attempt(s)</span><span>{new Date(delivery.createdAt).toLocaleString()}</span></div>
                    {delivery.errorMessage && <p className="delivery-error-text">{delivery.errorMessage}</p>}
                    {selectedId === delivery.id && <div className="attempt-timeline">{attempts.length ? attempts.map((attempt) => <div className="attempt-entry" key={attempt.id}><span className="attempt-number">#{attempt.attemptNumber}</span><div><strong>{attempt.responseStatus ? `HTTP ${attempt.responseStatus}` : "Request error"}</strong><p>{attempt.errorMessage || attempt.responseBody || "No response body"}</p></div><span>{attempt.durationMs == null ? "—" : `${attempt.durationMs} ms`}</span></div>) : <p className="auth-note">No recorded attempts yet.</p>}</div>}
                  </div>
                  <div className="real-delivery-actions">
                    <button className="secondary-button" onClick={() => viewAttempts(delivery.id)}>{selectedId === delivery.id ? "Hide attempts" : "View attempts"}</button>
                    <button className="secondary-button" onClick={() => replay(delivery.id)} disabled={delivery.status === "PROCESSING" || delivery.status === "PENDING"}>Replay</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Metric({ title, value, delta, detail, icon, tone }) {
  return <article className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${tone}`}><Icon>{icon}</Icon></span></div><div className="metric-value">{value}</div><div className="metric-bottom"><span className={`metric-delta ${tone}`}>{delta}</span><span>{detail}</span></div><div className={`metric-sparkline ${tone}`}><svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true"><path d={tone === "amber" ? "M0 8 C12 10 18 4 28 11 S45 22 58 12 S80 5 92 11 S108 9 120 15" : "M0 19 C12 18 17 8 29 13 S44 5 56 10 S72 17 83 7 S102 11 120 2"} /></svg></div></article>;
}

function EndpointRow({ name, url, initials, tone, state }) {
  return <div className="endpoint-row"><div className={`endpoint-avatar ${tone}`}>{initials}</div><div className="endpoint-row-copy"><strong>{name}</strong><span>{url}</span></div><span className={`endpoint-health ${state === "Active" ? "healthy" : "degraded"}`}><span />{state}</span></div>;
}

function StatusPill({ status }) {
  const icon = status === "Delivered" ? "✓" : status === "Retrying" ? "↻" : "×";
  return <span className={`status-pill ${status.toLowerCase()}`}><span>{icon}</span>{status}</span>;
}

function ActivityChart({ data }) {
  const actual = Array.isArray(data) && data.length > 0;
  const values = actual ? data.map((day) => day.count) : [];
  const maxValue = Math.max(1, ...values);
  return <div className="activity-chart" role="img" aria-label="Bar chart showing event volume over the last seven days">
    <div className="chart-grid"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div>
    <div className="bar-area">{values.map((value, index) => {
      const height = Math.max(value > 0 ? 5 : 2, Math.round((value / maxValue) * 100));
      return <span key={data[index].date} className={index >= values.length - 2 ? "bar bar-highlight" : "bar"} style={{ height: `${height}%` }} title={`${data[index].label}: ${value} events`} />;
    })}</div>
  </div>;
}

export default App;
