# Classic Fireplace ServiceOps

Operational command centre for Classic Fireplace service intake, customer matching, request triage, schedule visibility, and technician prep.

The primary operator experience is the Apps Script webapp in `apps-script/`. The Next.js app provides local development, tests, and the streaming OpenAI Agents SDK endpoint used by the Apps Script assistant drawer.

## Architecture

- Apps Script webapp: dashboard, Kanban, Webform Inbox, Customer Match, Schedule, request detail drawer, decision log, and Google Workspace data access.
- Next API: `POST /api/agent/stream` runs `CF ServiceOps Assistant` with `@openai/agents` and streams normalized SSE events.
- ChatGPT App MCP: `POST /mcp` exposes safe ServiceOps business tools backed by Supabase cached operational tables and `tool_audit_log`.
- OpenAI: recommendation layer only. It may summarize, draft, inspect, and recommend; it must not create Striven or calendar records.

Apps Script `google.script.run` cannot token-stream to the browser. For real streaming, the Apps Script drawer fetches a configured Next endpoint. If `SERVICEOPS_AGENT_STREAM_URL` is missing, it falls back to the synchronous Apps Script `assistantLookup`.

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Health check:

```bash
curl http://localhost:3000/api/health
```

## Environment Variables

Next `.env.local`:

```bash
OPENAI_API_KEY=
OPENAI_MODEL_MAIN=gpt-5.5
OPENAI_MODEL_FAST=gpt-5.4-mini
SERVICEOPS_AGENT_SHARED_SECRET=
SERVICEOPS_ALLOWED_CALENDAR_DOMAIN=@classicfireplace.ca
SERVICEOPS_TIMEZONE=America/Toronto
OPENAI_APPS_CHALLENGE_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Apps Script Script Properties:

- `SERVICEOPS_AGENT_STREAM_URL`: reachable URL for the Next endpoint, ending in `/api/agent/stream`
- `SERVICEOPS_AGENT_SHARED_SECRET`: same secret as the Next environment value
- `OPENAI_API_KEY`: optional fallback/direct diagnostic key, server-side only

## Streaming Verification

With the Next dev server running and `OPENAI_API_KEY` configured:

```bash
curl -N http://localhost:3000/api/agent/stream \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Why is this request in review?\",\"requestId\":\"REQ-1044\",\"context\":{\"customerDisplay\":\"#NEW - Ron Metrick\",\"locationDisplay\":\"Scarborough\",\"applianceDisplay\":\"Napoleon IR36GN - 20 yrs\",\"issue\":\"Annual service\",\"lane\":\"Review Queue\",\"matchConfidence\":62,\"warnings\":[\"possible duplicate\",\"customer not resolved\"]}}"
```

Expected events:

- `tool_progress`
- `text_delta`
- `final`

If `SERVICEOPS_AGENT_SHARED_SECRET` is set, include a valid Apps Script generated `X-ServiceOps-Agent-Token` header.

## Apps Script Deployment

Configured deployment:

- Script ID: `1x7qcqw5iTlolZAmX7GVSBEe72oHPnSTwvcMsSOs7JZP-XYCyJMVUtSGZ`
- Web app URL: `https://script.google.com/macros/s/AKfycbxf-TfpLBOKIW2I1jCXKF8_6ejXmWEWvPGgAISbLGhAfr9teKlJRQsR5oUYfl5HAEC-0A/exec`
- Source folder: `apps-script/`

Deploy full validation:

```bash
npm run deploy:gas:auto
```

Deploy Apps Script only:

```bash
npm run deploy:gas
```

## Agent Tools

The assistant exposes deterministic read-only tools:

- `extractRequestFacts`
- `scoreCustomerMatch`
- `checkRequestReadiness`
- `classifyRequestStatus`
- `inspectCalendarEvent`
- `generateOperatorChecklist`
- `draftCustomerCallback`
- `draftTechnicianPrep`
- `summarizeServiceHistory`

Add new tools by implementing pure logic in `lib/agents/serviceops-assistant-tools.ts`, wrapping it with `tool(...)`, adding test coverage, and keeping side effects read-only unless an explicit approval path exists.

## ChatGPT App MCP Server

The ChatGPT App endpoint is served at:

```bash
https://<your-host>/mcp
```

It exposes only safe ServiceOps business tools:

- `search_customer`
- `get_customer_summary`
- `get_open_service_requests`
- `get_work_order_summary`
- `get_technician_schedule`
- `create_service_opportunity_from_request`

Supabase is used for cached operational tables and `tool_audit_log`. Striven and Google Apps Script remain external systems of record. The MCP server does not expose raw SQL, arbitrary database access, API secrets, or direct Striven writes. Opportunity creation is queued in Supabase for operator/Apps Script processing instead of calling Striven from ChatGPT.

OpenAI app domain verification is served at:

```bash
https://<your-host>/.well-known/openai-apps-challenge
```

Set `OPENAI_APPS_CHALLENGE_TOKEN` in production to the token from the Platform app submission form.

Apply the Supabase schema in:

```bash
supabase/migrations/20260515133000_serviceops_mcp_cache.sql
```

## Calendar Policy

Calendar integration is read-only. `CalendarServiceReadOnly` may read configured technician calendars and refresh the local mirror, but write methods throw clear errors.

Contractor filtering rule:

- show events when `creator.email` ends with `@classicfireplace.ca`
- show events when `organizer.email` ends with `@classicfireplace.ca`
- hide events when both are external

Hidden contractor personal events must not appear in Today’s Operations, Scheduled Ahead, cache, or assistant context unless the user specifically asks why an event was filtered.

## Testing

```bash
npm test
npx tsc --noEmit
npm run build
```

Current tests cover customer matching, assistant tools, calendar filtering, readiness, status classification, and stream endpoint event shape.

## Known Limitations

- Apps Script cannot provide true token streaming through `google.script.run`; streaming requires the Next API endpoint.
- The assistant is read-only/recommendation-only for Phase 1.
- Production streaming requires hosting the Next endpoint somewhere reachable from the Apps Script webapp browser.

## Phase 2 Roadmap

- Add approved Striven write tools behind explicit operator confirmation.
- Add persisted assistant traces and eval cases from real requests.
- Add richer technician prep from parts/assets history.
- Add hosted production deployment for the Next streaming API.
