/*
 * 039_Route_Planner.ts
 * Fast proximity-based daily assignment planner. OpenAI is used only for
 * concise planning notes; deterministic distance grouping owns the schedule.
 */

import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getCalendarTechnicians, getEnv } from "@/lib/config/serviceops-config";
import { listTechnicianProfiles } from "@/lib/db/repository";
import type { IntakeRow } from "@/lib/serviceops/types";

export type PlannedStop = {
  row: IntakeRow;
  address: string;
  lat: number;
  lng: number;
  priority: number;
  distanceFromPreviousKm: number;
};

export type RouteEndpointMode = "office" | "home" | "first_stop" | "last_stop";

export type DispatchOffice = {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
};

export type MapProvider = "google" | "apple" | "osm";

export type ServiceZone = "in-radius" | "buffer" | "outside";

export type TechnicianPlan = {
  technician: string;
  startLabel: string;
  startAddress: string;
  startLat: number | null;
  startLng: number | null;
  endLabel: string;
  endAddress: string;
  endLat: number | null;
  endLng: number | null;
  stops: PlannedStop[];
  backups: PlannedStop[];
  totalDistanceKm: number;
  mapUrl: string;
  embedUrl: string;
};

export type RoutePlan = {
  generatedAt: string;
  date: string;
  tasksPerTech: number;
  capacityByTech: Record<string, number>;
  totalCandidates: number;
  plannedCount: number;
  unassignedCount: number;
  startMode: RouteEndpointMode;
  endMode: RouteEndpointMode;
  officeAddress: string;
  officeOptions: DispatchOffice[];
  techHomeAddresses: Record<string, string>;
  mapProvider: MapProvider;
  serviceRadiusKm: number;
  bufferRadiusKm: number;
  bufferCandidateCount: number;
  outsideCandidateCount: number;
  plans: TechnicianPlan[];
  notes: string[];
  aiUsed: boolean;
};

const RoutePlanNotes = z.object({
  notes: z.array(z.string()).max(6)
});

const cityCentroids: Record<string, { lat: number; lng: number }> = {
  ajax: { lat: 43.8509, lng: -79.0204 },
  aurora: { lat: 44.0065, lng: -79.4504 },
  barrie: { lat: 44.3894, lng: -79.6903 },
  bolton: { lat: 43.8795, lng: -79.7379 },
  brampton: { lat: 43.7315, lng: -79.7624 },
  burlington: { lat: 43.3255, lng: -79.7990 },
  etobicoke: { lat: 43.6205, lng: -79.5132 },
  markham: { lat: 43.8561, lng: -79.3370 },
  mississauga: { lat: 43.5890, lng: -79.6441 },
  newmarket: { lat: 44.0592, lng: -79.4613 },
  oakville: { lat: 43.4675, lng: -79.6877 },
  oshawa: { lat: 43.8971, lng: -78.8658 },
  pickering: { lat: 43.8384, lng: -79.0868 },
  richmondhill: { lat: 43.8828, lng: -79.4403 },
  scarborough: { lat: 43.7764, lng: -79.2318 },
  toronto: { lat: 43.6532, lng: -79.3832 },
  vaughan: { lat: 43.8372, lng: -79.5083 },
  whitby: { lat: 43.8975, lng: -78.9429 }
};

const postalSeeds: Record<string, { lat: number; lng: number }> = {
  l1: { lat: 43.8700, lng: -78.9600 },
  l3: { lat: 43.8800, lng: -79.2600 },
  l4: { lat: 43.7800, lng: -79.5200 },
  l5: { lat: 43.5900, lng: -79.6500 },
  l6: { lat: 43.5000, lng: -79.8100 },
  l7: { lat: 43.3400, lng: -79.8200 },
  l9: { lat: 43.9200, lng: -79.8300 },
  m1: { lat: 43.7800, lng: -79.2500 },
  m2: { lat: 43.7700, lng: -79.4100 },
  m3: { lat: 43.7400, lng: -79.4900 },
  m4: { lat: 43.7000, lng: -79.3900 },
  m5: { lat: 43.6500, lng: -79.3900 },
  m6: { lat: 43.6800, lng: -79.4700 },
  m8: { lat: 43.6200, lng: -79.5200 },
  m9: { lat: 43.6900, lng: -79.5700 }
};

type RoutePoint = { lat: number; lng: number; label?: string; address?: string };

type DispatchLocationSettings = {
  office: RoutePoint;
  officeOptions: DispatchOffice[];
  homes: Record<string, RoutePoint>;
};

type StoreServiceMatch = {
  office: DispatchOffice;
  distanceKm: number;
  zone: ServiceZone;
};

export async function buildDailyRoutePlan(rows: IntakeRow[], input?: {
  date?: string;
  tasksPerTech?: number;
  technicianNames?: string[];
  startMode?: RouteEndpointMode;
  endMode?: RouteEndpointMode;
  officeAddress?: string;
  techHomeAddresses?: Record<string, string>;
  capacityByTech?: Record<string, number>;
  mapProvider?: MapProvider;
  useAi?: boolean;
}): Promise<RoutePlan> {
  const date = input?.date || new Date().toISOString().slice(0, 10);
  const tasksPerTech = Math.max(1, Math.min(8, Number(input?.tasksPerTech || 5)));
  const startMode = input?.startMode || "office";
  const endMode = input?.endMode || "last_stop";
  const technicianProfiles = listTechnicianProfiles().filter((profile) => profile.active);
  const technicianNames = (input?.technicianNames || technicianProfiles.map((tech) => tech.name) || getCalendarTechnicians().map((tech) => tech.name)).filter(Boolean);
  const techs = technicianNames.length ? technicianNames : ["Technician 1"];
  const profileCapacityByTech = Object.fromEntries(technicianProfiles.map((profile) => [profile.name, profile.capacityPerDay || tasksPerTech]));
  const capacityByTech = Object.fromEntries(techs.map((tech) => [
    tech,
    Math.max(1, Math.min(8, Number(input?.capacityByTech?.[tech] || profileCapacityByTech[tech] || tasksPerTech)))
  ]));
  const capacity = techs.reduce((sum, tech) => sum + Math.max(1, Math.min(8, Number(capacityByTech[tech] || tasksPerTech))), 0);
  const profileHomeAddresses = Object.fromEntries(
    technicianProfiles
      .map((profile) => [profile.name, profile.preferredStartAddress || profile.homeAddress] as const)
      .filter((entry) => !!entry[1])
  );
  const settings = getDispatchLocationSettings(input?.officeAddress, { ...profileHomeAddresses, ...(input?.techHomeAddresses || {}) });
  const mapProvider = input?.mapProvider || "google";
  const serviceRadiusKm = 25;
  const bufferRadiusKm = 35;

  const allCandidates = rows
    .filter(isSchedulableRequest)
    .map((row) => {
      const geo = estimateLocation(row);
      const service = geo ? nearestStoreServiceZone(geo, settings.officeOptions, serviceRadiusKm, bufferRadiusKm) : null;
      return { row, geo, service, priority: priorityScore(row, service?.zone) };
    })
    .filter((item) => item.geo)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return submittedTime(a.row) - submittedTime(b.row);
    });

  const candidates = allCandidates
    .filter((item) => item.service?.zone !== "outside")
    .slice(0, Math.max(capacity * 2, capacity));
  const bufferCandidateCount = allCandidates.filter((item) => item.service?.zone === "buffer").length;
  const outsideCandidateCount = allCandidates.filter((item) => item.service?.zone === "outside").length;

  const plans: TechnicianPlan[] = techs.map((technician) => ({
    technician,
    startLabel: "",
    startAddress: "",
    startLat: null,
    startLng: null,
    endLabel: "",
    endAddress: "",
    endLat: null,
    endLng: null,
    stops: [] as PlannedStop[],
    backups: [] as PlannedStop[],
    totalDistanceKm: 0,
    mapUrl: "",
    embedUrl: ""
  }));
  const remaining = candidates.slice();

  const maxRounds = Math.max(...techs.map((tech) => Math.max(1, Math.min(8, Number(capacityByTech[tech] || tasksPerTech)))));
  for (let round = 0; round < maxRounds; round++) {
    for (const plan of plans) {
      const techCapacity = Math.max(1, Math.min(8, Number(capacityByTech[plan.technician] || tasksPerTech)));
      if (plan.stops.length >= techCapacity) continue;
      if (!remaining.length) break;

      const previous = plan.stops[plan.stops.length - 1] || endpointForTechnician(plan.technician, startMode, settings);
      const nextIndex = chooseNextStopIndex(remaining, previous);
      const [picked] = remaining.splice(nextIndex, 1);
      const distance = previous ? haversineKm(previous, picked.geo!) : 0;

      plan.stops.push({
        row: picked.row,
        address: formatAddress(picked.row),
        lat: picked.geo!.lat,
        lng: picked.geo!.lng,
        priority: picked.priority,
        distanceFromPreviousKm: Math.round(distance * 10) / 10
      });
      plan.totalDistanceKm = Math.round((plan.totalDistanceKm + distance) * 10) / 10;
    }
  }

  plans.forEach((plan) => {
    const start = endpointForTechnician(plan.technician, startMode, settings, plan.stops);
    const end = endpointForTechnician(plan.technician, endMode, settings, plan.stops);
    const endDistance = plan.stops.length && end ? haversineKm(plan.stops[plan.stops.length - 1], end) : 0;
    const backupPool = remaining
      .map((item) => ({
        row: item.row,
        address: formatAddress(item.row),
        lat: item.geo!.lat,
        lng: item.geo!.lng,
        priority: item.priority,
        distanceFromPreviousKm: Math.round(haversineKm(plan.stops[plan.stops.length - 1] || start || item.geo!, item.geo!) * 10) / 10
      }))
      .sort((a, b) => {
        if (a.distanceFromPreviousKm !== b.distanceFromPreviousKm) return a.distanceFromPreviousKm - b.distanceFromPreviousKm;
        return b.priority - a.priority;
      })
      .slice(0, 4);

    plan.startLabel = start?.label || "First stop";
    plan.startAddress = start?.address || plan.stops[0]?.address || "";
    plan.startLat = start?.lat ?? null;
    plan.startLng = start?.lng ?? null;
    plan.endLabel = end?.label || "Last stop";
    plan.endAddress = end?.address || plan.stops[plan.stops.length - 1]?.address || "";
    plan.endLat = end?.lat ?? null;
    plan.endLng = end?.lng ?? null;
    plan.backups = backupPool;
    plan.totalDistanceKm = Math.round((plan.totalDistanceKm + endDistance) * 10) / 10;
    plan.mapUrl = buildMapRouteUrl(mapProvider, start, end, plan.stops);
    plan.embedUrl = buildOpenStreetMapEmbedUrl(start, end, plan.stops);
  });

  const fallbackNotes = buildDeterministicNotes(plans);
  const aiNotes = input?.useAi === false ? [] : await buildAiRouteNotes(plans, date, fallbackNotes);

  return {
    generatedAt: new Date().toISOString(),
    date,
    tasksPerTech,
    capacityByTech,
    totalCandidates: candidates.length,
    plannedCount: plans.reduce((sum, plan) => sum + plan.stops.length, 0),
    unassignedCount: Math.max(0, candidates.length - plans.reduce((sum, plan) => sum + plan.stops.length, 0)),
    startMode,
    endMode,
    officeAddress: settings.office.address || "",
    officeOptions: settings.officeOptions,
    techHomeAddresses: Object.fromEntries(Object.entries(settings.homes).map(([tech, point]) => [tech, point.address || ""])),
    mapProvider,
    serviceRadiusKm,
    bufferRadiusKm,
    bufferCandidateCount,
    outsideCandidateCount,
    plans,
    notes: aiNotes.length ? aiNotes : fallbackNotes,
    aiUsed: aiNotes.length > 0
  };
}

function isSchedulableRequest(row: IntakeRow) {
  if (row.strivenSoId || row.taskMatched) return false;
  if (/done|service_so_created/i.test(row.pipelineState || "")) return false;
  return !!(formatAddress(row) && (row.street || row.city || row.postalCode));
}

function priorityScore(row: IntakeRow, zone?: ServiceZone) {
  const ageDays = Math.max(0, (Date.now() - submittedTime(row)) / 86400000);
  const ageScore = Math.min(100, Math.round(ageDays * 7));
  const stageScore = row.strivenOppId ? 25 : row.strivenCustomerId ? 15 : 0;
  const reviewPenalty = row.needsReview || row.lastError ? -25 : 0;
  const zoneScore = zone === "in-radius" ? 20 : zone === "buffer" ? -5 : -1000;
  return ageScore + stageScore + reviewPenalty + zoneScore;
}

function chooseNextStopIndex(
  candidates: { row: IntakeRow; geo: { lat: number; lng: number } | null; priority: number }[],
  previous?: RoutePoint
) {
  if (!previous) return 0;

  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  candidates.forEach((candidate, index) => {
    const distance = haversineKm(previous, candidate.geo!);
    const priorityCredit = candidate.priority / 25;
    const score = distance - priorityCredit;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function getDispatchLocationSettings(officeAddressOverride?: string, techHomeAddressOverrides?: Record<string, string>): DispatchLocationSettings {
  const env = getEnv();
  const officeOptions = getOfficeOptions().map((office) => ({
    ...office,
    ...estimatePointFromAddress(office.address)
  }));
  const officeAddress = officeAddressOverride || env.serviceOpsOfficeAddress || officeOptions[0]?.address || "";
  const office = {
    label: "Office",
    address: officeAddress,
    ...estimatePointFromAddress(officeAddress)
  };

  const homes: Record<string, RoutePoint> = {};
  try {
    const parsed = {
      ...(JSON.parse(env.serviceOpsTechHomeAddressesJson || "{}") as Record<string, string>),
      ...(techHomeAddressOverrides || {})
    };
    Object.entries(parsed).forEach(([name, address]) => {
      if (!address) return;
      homes[name] = {
        label: `${name} home`,
        address,
        ...estimatePointFromAddress(address)
      };
    });
  } catch {
    // Keep office fallback.
  }

  return { office, officeOptions, homes };
}

function getOfficeOptions(): DispatchOffice[] {
  const env = getEnv();
  try {
    const parsed = JSON.parse(env.serviceOpsOfficeAddressesJson || "[]") as DispatchOffice[];
    const valid = parsed
      .map((item) => ({ name: String(item.name || "").trim(), address: String(item.address || "").trim() }))
      .filter((item) => item.name && item.address);
    if (valid.length) return valid;
  } catch {
    // Fall through to single-office setting.
  }

  return [{ name: "Office", address: env.serviceOpsOfficeAddress }];
}

function nearestStoreServiceZone(point: { lat: number; lng: number }, offices: DispatchOffice[], serviceRadiusKm: number, bufferRadiusKm: number): StoreServiceMatch | null {
  let nearest: StoreServiceMatch | null = null;

  offices.forEach((office) => {
    if (typeof office.lat !== "number" || typeof office.lng !== "number") return;
    const distanceKm = haversineKm(point, { lat: office.lat, lng: office.lng });
    const zone: ServiceZone =
      distanceKm <= serviceRadiusKm ? "in-radius" :
      distanceKm <= bufferRadiusKm ? "buffer" :
      "outside";

    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { office, distanceKm: Math.round(distanceKm * 10) / 10, zone };
    }
  });

  return nearest;
}

function endpointForTechnician(
  technician: string,
  mode: RouteEndpointMode,
  settings: DispatchLocationSettings,
  stops: PlannedStop[] = []
): RoutePoint | undefined {
  if (mode === "first_stop") {
    const stop = stops[0];
    return stop ? { lat: stop.lat, lng: stop.lng, label: "First stop", address: stop.address } : undefined;
  }

  if (mode === "last_stop") {
    const stop = stops[stops.length - 1];
    return stop ? { lat: stop.lat, lng: stop.lng, label: "Last stop", address: stop.address } : undefined;
  }

  if (mode === "home") {
    return settings.homes[technician] || settings.office;
  }

  return settings.office;
}

function estimatePointFromAddress(address: string) {
  const text = String(address || "").toLowerCase();
  const city = Object.keys(cityCentroids).find((key) => text.includes(key));
  if (city) return cityCentroids[city];

  const postal = text.replace(/\s+/g, "");
  const prefix = Object.keys(postalSeeds).find((key) => postal.includes(key));
  return prefix ? postalSeeds[prefix] : cityCentroids.toronto;
}

function estimateLocation(row: IntakeRow) {
  const cityKey = normalizePlace(row.city);
  if (cityKey && cityCentroids[cityKey]) return jitter(cityCentroids[cityKey], row);

  const postal = String(row.postalCode || "").toLowerCase().replace(/\s+/g, "");
  const seed = postalSeeds[postal.slice(0, 2)];
  return seed ? jitter(seed, row) : null;
}

function jitter(point: { lat: number; lng: number }, row: IntakeRow) {
  const seed = Math.abs(hashCode(`${row.sourceRow}-${row.street}-${row.postalCode}`));
  const latOffset = ((seed % 100) - 50) / 10000;
  const lngOffset = (((Math.floor(seed / 100)) % 100) - 50) / 10000;
  return { lat: point.lat + latOffset, lng: point.lng + lngOffset };
}

function normalizePlace(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z]/g, "");
}

function formatAddress(row: IntakeRow) {
  return [row.street, row.city, row.province, row.postalCode].filter(Boolean).join(", ");
}

function buildMapRouteUrl(provider: MapProvider, start: RoutePoint | undefined, end: RoutePoint | undefined, stops: PlannedStop[]) {
  if (provider === "google") return buildGoogleMapsRouteUrl(start, end, stops);
  if (provider === "apple") return buildAppleMapsRouteUrl(start, end, stops);
  return buildOpenStreetMapRouteUrl(start, end, stops);
}

function routePoints(start: RoutePoint | undefined, end: RoutePoint | undefined, stops: PlannedStop[]) {
  return [start, ...stops, end].filter((point): point is RoutePoint => !!point);
}

function routeAddressPoints(start: RoutePoint | undefined, end: RoutePoint | undefined, stops: PlannedStop[]) {
  const points = routePoints(start, end, stops);
  return points.map((point) => point.address || `${point.lat},${point.lng}`).filter(Boolean);
}

function buildGoogleMapsRouteUrl(start: RoutePoint | undefined, end: RoutePoint | undefined, stops: PlannedStop[]) {
  const addresses = routeAddressPoints(start, end, stops);
  if (!addresses.length) return "";
  if (addresses.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;

  const origin = addresses[0];
  const destination = addresses[addresses.length - 1];
  const waypoints = addresses.slice(1, -1);
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving"
  });
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildAppleMapsRouteUrl(start: RoutePoint | undefined, end: RoutePoint | undefined, stops: PlannedStop[]) {
  const addresses = routeAddressPoints(start, end, stops);
  if (!addresses.length) return "";
  if (addresses.length === 1) return `https://maps.apple.com/?q=${encodeURIComponent(addresses[0])}`;

  const origin = addresses[0];
  const destination = addresses[addresses.length - 1];
  return `https://maps.apple.com/?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}&dirflg=d`;
}

function buildOpenStreetMapRouteUrl(start: RoutePoint | undefined, end: RoutePoint | undefined, stops: PlannedStop[]) {
  const points = routePoints(start, end, stops);
  if (points.length < 2) {
    const one = points[0];
    return one ? `https://www.openstreetmap.org/?mlat=${one.lat}&mlon=${one.lng}#map=13/${one.lat}/${one.lng}` : "";
  }

  const route = points.map((point) => `${point.lat},${point.lng}`).join(";");
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`;
}

function buildOpenStreetMapEmbedUrl(start: RoutePoint | undefined, end: RoutePoint | undefined, stops: PlannedStop[]) {
  const points = routePoints(start, end, stops);
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

function submittedTime(row: IntakeRow) {
  const parsed = new Date(row.submittedAt || "").getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
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

function hashCode(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function buildDeterministicNotes(plans: TechnicianPlan[]) {
  const busiest = plans.slice().sort((a, b) => b.totalDistanceKm - a.totalDistanceKm)[0];
  return [
    "Oldest open requests are prioritized before newer requests.",
    "Default planning uses requests within 25 km of a store first; 25-35 km requests stay available as buffer candidates.",
    "Stops are grouped by city/postal proximity to reduce backtracking.",
    busiest ? `${busiest.technician} has the longest estimated route at ${busiest.totalDistanceKm.toFixed(1)} km between planned stops.` : "No route distance available.",
    "Distances are estimated from cached address fields; confirm exact drive times before dispatch."
  ];
}

async function buildAiRouteNotes(plans: TechnicianPlan[], date: string, fallbackNotes: string[]) {
  const env = getEnv();
  if (!env.openaiApiKey) return [];

  try {
    const client = new OpenAI({ apiKey: env.openaiApiKey });
    const response = await client.responses.parse({
      model: process.env.OPENAI_SERVICEOPS_MODEL || "gpt-5.5",
      reasoning: { effort: "low" as never },
      input: [
        {
          role: "system",
          content: "You are a concise service dispatch assistant. Explain route grouping and priority in plain operational language."
        },
        {
          role: "user",
          content: JSON.stringify({
            date,
            rules: [
              "Prioritize older service requests first.",
              "Prefer requests within 25 km of any store; treat 25-35 km as buffer range.",
              "Prefer nearby addresses on the same technician route.",
              "Do not invent drive times.",
              "Keep notes short and actionable."
            ],
            fallbackNotes,
            routes: plans.map((plan) => ({
              technician: plan.technician,
              totalDistanceKm: plan.totalDistanceKm,
              stops: plan.stops.map((stop) => ({
                row: stop.row.sourceRow,
                customer: [stop.row.firstName, stop.row.lastName].filter(Boolean).join(" "),
                submittedAt: stop.row.submittedAt,
                city: stop.row.city,
                address: stop.address,
                priority: stop.priority
              }))
            }))
          })
        }
      ],
      text: {
        format: zodTextFormat(RoutePlanNotes, "serviceops_route_plan_notes"),
        verbosity: "low"
      }
    });

    for (const output of response.output) {
      if (output.type !== "message") continue;
      for (const item of output.content) {
        if ("parsed" in item && item.parsed) return item.parsed.notes;
      }
    }
  } catch {
    return [];
  }

  return [];
}
