"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, CalendarDays, GripVertical, Loader2, Map, MapPin, RefreshCw, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import type { MapProvider, PlannedStop, RouteEndpointMode, RoutePlan, TechnicianPlan } from "@/lib/serviceops/route-planner";
import { technicianProfileHref } from "@/lib/serviceops/technician-links";

export function RoutePlannerView({ initialPlan }: { initialPlan: RoutePlan }) {
  const [plan, setPlan] = useState(initialPlan);
  const [date, setDate] = useState(initialPlan.date);
  const [capacityByTech, setCapacityByTech] = useState<Record<string, number>>(initialPlan.capacityByTech || {});
  const [startMode, setStartMode] = useState<RouteEndpointMode>(initialPlan.startMode);
  const [endMode, setEndMode] = useState<RouteEndpointMode>(initialPlan.endMode);
  const [officeAddress, setOfficeAddress] = useState(initialPlan.officeAddress);
  const [mapProvider, setMapProvider] = useState<MapProvider>("google");
  const [techHomeAddresses, setTechHomeAddresses] = useState<Record<string, string>>(initialPlan.techHomeAddresses || {});
  const [activeTech, setActiveTech] = useState(initialPlan.plans[0]?.technician || "");
  const [draggedStop, setDraggedStop] = useState<{ technician: string; index: number } | null>(null);
  const [draggedBackup, setDraggedBackup] = useState<{ technician: string; index: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "refreshing" | "error">("idle");
  const [error, setError] = useState("");
  const firstAutoBuild = useRef(true);

  const selectedPlan = useMemo(
    () => plan.plans.find((item) => item.technician === activeTech) || plan.plans[0],
    [activeTech, plan.plans]
  );

  const autoBuildKey = useMemo(() => JSON.stringify({
    date,
    startMode,
    endMode,
    officeAddress,
    techHomeAddresses,
    capacityByTech
  }), [date, startMode, endMode, officeAddress, techHomeAddresses, capacityByTech]);

  useEffect(() => {
    const stored = window.localStorage.getItem("serviceops.route.defaultMap");
    if (stored === "apple" || stored === "osm" || stored === "google") {
      setMapProvider(stored);
      setPlan((current) => recalculatePlanMaps(current, stored));
      return;
    }
    setMapProvider(initialPlan.mapProvider || "google");
  }, [initialPlan.mapProvider]);

  useEffect(() => {
    window.localStorage.setItem("serviceops.route.defaultMap", mapProvider);
    setPlan((current) => recalculatePlanMaps(current, mapProvider));
  }, [mapProvider]);

  useEffect(() => {
    if (firstAutoBuild.current) {
      firstAutoBuild.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void regenerate(false, false);
    }, 550);

    return () => window.clearTimeout(timer);
  }, [autoBuildKey]);

  async function regenerate(refreshFirst = false, useAi = false) {
    setStatus(refreshFirst ? "refreshing" : "loading");
    setError("");

    try {
      if (refreshFirst) {
        await fetch("/api/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh_reports" })
        });
      }

      const response = await fetch("/api/route-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, startMode, endMode, officeAddress, techHomeAddresses, capacityByTech, mapProvider, useAi })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Could not build route plan.");
      setPlan(result.plan);
      setCapacityByTech(result.plan.capacityByTech || {});
      setActiveTech((current) => result.plan.plans.some((item: TechnicianPlan) => item.technician === current) ? current : result.plan.plans[0]?.technician || "");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function updateTechHome(technician: string, address: string) {
    setTechHomeAddresses((current) => ({ ...current, [technician]: address }));
  }

  function updateTechCapacity(technician: string, capacity: number) {
    setCapacityByTech((current) => ({ ...current, [technician]: Math.max(1, Math.min(8, Number(capacity || 1))) }));
  }

  function cancelAndPromote(technician: string, stopIndex: number) {
    setPlan((current) => updateTechnicianPlan(current, technician, (techPlan) => {
      const stops = techPlan.stops.filter((_, index) => index !== stopIndex);
      const backups = techPlan.backups.slice();
      const promoted = backups.shift();
      if (promoted) stops.splice(stopIndex, 0, promoted);
      return recalculateTechPlan({ ...techPlan, stops, backups }, mapProvider);
    }));
  }

  function moveBackupToRoute(technician: string, backupIndex: number, targetIndex?: number) {
    setPlan((current) => updateTechnicianPlan(current, technician, (techPlan) => {
      const backups = techPlan.backups.slice();
      const [backup] = backups.splice(backupIndex, 1);
      if (!backup) return techPlan;

      const stops = techPlan.stops.slice();
      stops.splice(targetIndex ?? stops.length, 0, backup);
      return recalculateTechPlan({ ...techPlan, stops, backups }, mapProvider);
    }));
  }

  function reorderStop(technician: string, from: number, to: number) {
    if (from === to) return;
    setPlan((current) => updateTechnicianPlan(current, technician, (techPlan) => {
      const stops = techPlan.stops.slice();
      const [item] = stops.splice(from, 1);
      if (!item) return techPlan;
      stops.splice(to, 0, item);
      return recalculateTechPlan({ ...techPlan, stops }, mapProvider);
    }));
  }

  return (
    <div className="route-planner">
      <section className="panel route-command">
        <div className="route-controls">
          <label>
            <span><CalendarDays size={14} /> Day</span>
            <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span><MapPin size={14} /> Office</span>
            <select className="select" value={officeAddress} onChange={(event) => setOfficeAddress(event.target.value)}>
              {plan.officeOptions.map((office) => <option value={office.address} key={office.address}>{office.name}</option>)}
            </select>
          </label>
          <label className="route-address-input">
            <span><MapPin size={14} /> Office address</span>
            <input className="input" value={officeAddress} onChange={(event) => setOfficeAddress(event.target.value)} />
          </label>
          <label>
            <span><Map size={14} /> Default map</span>
            <select className="select" value={mapProvider} onChange={(event) => setMapProvider(event.target.value as MapProvider)}>
              <option value="google">Google Maps</option>
              <option value="apple">Apple Maps</option>
              <option value="osm">OpenStreetMap</option>
            </select>
          </label>
          <label>
            <span><MapPin size={14} /> Start</span>
            <select className="select" value={startMode} onChange={(event) => setStartMode(event.target.value as RouteEndpointMode)}>
              <option value="office">Office</option>
              <option value="home">Tech home</option>
              <option value="first_stop">First stop</option>
            </select>
          </label>
          <label>
            <span><MapPin size={14} /> End</span>
            <select className="select" value={endMode} onChange={(event) => setEndMode(event.target.value as RouteEndpointMode)}>
              <option value="last_stop">Last stop</option>
              <option value="office">Office</option>
              <option value="home">Tech home</option>
            </select>
          </label>
          <span className="route-auto-status">
            {status === "loading" ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}
            {status === "loading" ? "Updating" : "Auto"}
          </span>
          <button className="btn" type="button" onClick={() => regenerate(true, false)} disabled={status === "loading" || status === "refreshing"}>
            {status === "refreshing" ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
            Refresh
          </button>
        </div>
        <div className="route-stats">
          <span><strong>{plan.plannedCount}</strong> planned</span>
          <span><strong>{plan.unassignedCount}</strong> waiting</span>
          <span><strong>{plan.totalCandidates}</strong> candidates</span>
          <span><strong>{plan.bufferCandidateCount}</strong> buffer</span>
          <span><strong>{plan.outsideCandidateCount}</strong> outside</span>
          <span><strong>{Object.values(capacityByTech).reduce((sum, value) => sum + Number(value || 0), 0)}</strong> capacity</span>
          <span><Brain size={14} /> {plan.aiUsed ? "AI notes on" : "Fast mode"}</span>
        </div>
        {error ? <p className="route-error">{error}</p> : null}
      </section>

      <section className="panel route-home-settings">
        <div className="panel-header compact"><h3>Technician Settings</h3><span className="badge info">Auto applied</span></div>
        <div className="route-home-grid">
          {plan.plans.map((techPlan) => (
            <label key={techPlan.technician}>
              <span>{techPlan.technician}</span>
              <input className="input route-capacity-input" type="number" min={1} max={8} value={capacityByTech[techPlan.technician] || techPlan.stops.length || 5} onChange={(event) => updateTechCapacity(techPlan.technician, Number(event.target.value || 1))} title="Stops for this technician" />
              <input className="input" value={techHomeAddresses[techPlan.technician] || ""} onChange={(event) => updateTechHome(techPlan.technician, event.target.value)} placeholder="Optional home/start address" />
            </label>
          ))}
        </div>
      </section>

      <section className="panel route-notes">
        <div className="panel-header compact">
          <h3>Dispatch Notes</h3>
          <Brain size={15} />
        </div>
        <div className="route-note-grid">
          {plan.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      </section>

      {selectedPlan ? (
        <section className="panel route-map-panel">
          <div className="panel-header">
            <h3><Link className="inline-link subtle" href={technicianProfileHref(selectedPlan.technician)}>{selectedPlan.technician}</Link> Route</h3>
            <div className="route-map-actions">
              {plan.plans.map((item) => (
                <button
                  type="button"
                  className={item.technician === selectedPlan.technician ? "route-tech-pill active" : "route-tech-pill"}
                  onClick={() => setActiveTech(item.technician)}
                  key={item.technician}
                >
                  {item.technician}
                </button>
              ))}
              {selectedPlan.mapUrl ? <a className="btn" href={selectedPlan.mapUrl} target="_blank" rel="noreferrer"><Map size={15} /> Open route</a> : null}
            </div>
          </div>
          <div className="route-summary-strip">
            <span><strong>Start</strong>{selectedPlan.startLabel}: {selectedPlan.startAddress || "First scheduled stop"}</span>
            <span><strong>End</strong>{selectedPlan.endLabel}: {selectedPlan.endAddress || "Last scheduled stop"}</span>
          </div>
          {selectedPlan.embedUrl ? (
            <iframe className="route-map-frame" src={selectedPlan.embedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          ) : (
            <div className="route-map-fallback">
              <Map size={18} />
              <span>OpenStreetMap preview appears after route points are available.</span>
            </div>
          )}
        </section>
      ) : null}

      <section className="route-grid">
        {plan.plans.map((techPlan) => (
          <article className="panel tech-route" key={techPlan.technician}>
            <div className="panel-header">
              <h3><Link className="inline-link subtle" href={technicianProfileHref(techPlan.technician)}>{techPlan.technician}</Link></h3>
              <span className="badge info">{techPlan.totalDistanceKm.toFixed(1)} km</span>
            </div>
            <ol className="stop-list" onDragOver={(event) => event.preventDefault()} onDrop={() => {
              if (draggedBackup) moveBackupToRoute(draggedBackup.technician, draggedBackup.index);
              setDraggedBackup(null);
            }}>
              {techPlan.stops.map((stop, index) => (
                <li
                  draggable
                  key={stop.row.id}
                  onDragStart={() => setDraggedStop({ technician: techPlan.technician, index })}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedStop?.technician === techPlan.technician) reorderStop(techPlan.technician, draggedStop.index, index);
                    if (draggedBackup) moveBackupToRoute(draggedBackup.technician, draggedBackup.index, index);
                    setDraggedStop(null);
                    setDraggedBackup(null);
                  }}
                >
                  <div className="stop-index">{index + 1}</div>
                  <div className="stop-body">
                    <strong><GripVertical size={12} /> {[stop.row.firstName, stop.row.lastName].filter(Boolean).join(" ") || `Row ${stop.row.sourceRow}`}</strong>
                    <span>{stop.address || "Address missing"}</span>
                    <small>
                      Row {displaySourceRow(stop.row.sourceRow)} · {formatDate(stop.row.submittedAt)} · {stop.distanceFromPreviousKm ? `${stop.distanceFromPreviousKm.toFixed(1)} km from previous` : "Start here"}
                    </small>
                  </div>
                  <button className="btn icon-only" type="button" onClick={() => cancelAndPromote(techPlan.technician, index)} title="Cancel/reschedule and promote next backup">
                    <XCircle size={15} />
                  </button>
                  <a className="btn icon-only" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(stop.address)}`} target="_blank" rel="noreferrer" title="Open address in OpenStreetMap">
                    <MapPin size={15} />
                  </a>
                </li>
              ))}
              {!techPlan.stops.length ? <li className="empty-stop">No stops assigned. Drop a backup here.</li> : null}
            </ol>
            <div className="backup-list">
              <strong>Backup queue</strong>
              {techPlan.backups.map((backup, index) => (
                <button
                  className="backup-stop"
                  draggable
                  type="button"
                  onDragStart={() => setDraggedBackup({ technician: techPlan.technician, index })}
                  onClick={() => moveBackupToRoute(techPlan.technician, index)}
                  key={backup.row.id}
                >
                  <span>{[backup.row.firstName, backup.row.lastName].filter(Boolean).join(" ") || `Row ${backup.row.sourceRow}`}</span>
                  <small>{backup.address} · {backup.distanceFromPreviousKm.toFixed(1)} km from route</small>
                </button>
              ))}
              {!techPlan.backups.length ? <small className="empty-stop">No backup candidates nearby.</small> : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function updateTechnicianPlan(plan: RoutePlan, technician: string, updater: (techPlan: TechnicianPlan) => TechnicianPlan): RoutePlan {
  const plans = plan.plans.map((techPlan) => techPlan.technician === technician ? updater(techPlan) : techPlan);
  return {
    ...plan,
    plans,
    plannedCount: plans.reduce((sum, item) => sum + item.stops.length, 0),
    unassignedCount: plans.reduce((sum, item) => sum + item.backups.length, 0)
  };
}

function recalculatePlanMaps(plan: RoutePlan, provider: MapProvider): RoutePlan {
  return {
    ...plan,
    mapProvider: provider,
    plans: plan.plans.map((techPlan) => recalculateTechPlan(techPlan, provider))
  };
}

function recalculateTechPlan(plan: TechnicianPlan, provider: MapProvider): TechnicianPlan {
  let total = 0;
  let previous = pointFromEndpoint(plan.startLat, plan.startLng) || pointFromStop(plan.stops[0]);
  const stops = plan.stops.map((stop, index) => {
    const distance = index === 0 || !previous ? 0 : haversineKm(previous, stop);
    total += distance;
    previous = stop;
    return { ...stop, distanceFromPreviousKm: Math.round(distance * 10) / 10 };
  });

  const end = pointFromEndpoint(plan.endLat, plan.endLng);
  if (previous && end) total += haversineKm(previous, end);

  return {
    ...plan,
    stops,
    totalDistanceKm: Math.round(total * 10) / 10,
    mapUrl: buildMapUrl(provider, plan, stops),
    embedUrl: buildOpenStreetMapEmbed(plan, stops)
  };
}

function buildMapUrl(provider: MapProvider, plan: TechnicianPlan, stops: PlannedStop[]) {
  const points = [pointFromEndpoint(plan.startLat, plan.startLng), ...stops, pointFromEndpoint(plan.endLat, plan.endLng)].filter(Boolean) as { lat: number; lng: number }[];
  const addresses = [plan.startAddress, ...stops.map((stop) => stop.address), plan.endAddress].filter(Boolean);
  if (provider === "google") {
    if (!addresses.length) return "";
    if (addresses.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
    const params = new URLSearchParams({ api: "1", origin: addresses[0], destination: addresses[addresses.length - 1], travelmode: "driving" });
    const waypoints = addresses.slice(1, -1);
    if (waypoints.length) params.set("waypoints", waypoints.join("|"));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }
  if (provider === "apple") {
    if (!addresses.length) return "";
    if (addresses.length === 1) return `https://maps.apple.com/?q=${encodeURIComponent(addresses[0])}`;
    return `https://maps.apple.com/?saddr=${encodeURIComponent(addresses[0])}&daddr=${encodeURIComponent(addresses[addresses.length - 1])}&dirflg=d`;
  }
  if (points.length < 2) return "";
  const route = points.map((point) => `${point.lat},${point.lng}`).join(";");
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`;
}

function buildOpenStreetMapEmbed(plan: TechnicianPlan, stops: PlannedStop[]) {
  const points = [pointFromEndpoint(plan.startLat, plan.startLng), ...stops, pointFromEndpoint(plan.endLat, plan.endLng)].filter(Boolean) as { lat: number; lng: number }[];
  if (!points.length) return "";
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats) - 0.04;
  const maxLat = Math.max(...lats) + 0.04;
  const minLng = Math.min(...lngs) - 0.04;
  const maxLng = Math.max(...lngs) + 0.04;
  const first = points[0];
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik&marker=${first.lat}%2C${first.lng}`;
}

function pointFromEndpoint(lat: number | null, lng: number | null) {
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
}

function pointFromStop(stop?: PlannedStop) {
  return stop ? { lat: stop.lat, lng: stop.lng } : null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radius = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function toRad(value: number) {
  return value * Math.PI / 180;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function displaySourceRow(value: number) {
  return value < 0 ? `M${Math.abs(value)}` : String(value);
}
