# CF ServiceOps Assistant Validation Checklist

## Frontend / Apps Script

- [ ] Sidebar loads in the Apps Script webapp.
- [ ] Today’s Operations dashboard loads.
- [ ] Kanban board loads.
- [ ] Webform Inbox loads.
- [ ] Customer Match view loads.
- [ ] Schedule view loads.
- [ ] Header Assistant button opens the right-side drawer.
- [ ] Card assistant icon opens the drawer with selected request context.
- [ ] Card click opens the request detail drawer.
- [ ] Detail drawer Discuss action switches to the assistant drawer.
- [ ] Tool activity timeline displays progress events.
- [ ] Text deltas stream into the Assistant answer section.
- [ ] Final structured answer displays as operational cards.

## Agent

- [ ] Can summarize a selected request.
- [ ] Can score a customer match.
- [ ] Can identify missing information.
- [ ] Can explain why a request is in review.
- [ ] Can generate an operator checklist.
- [ ] Can draft a customer callback.
- [ ] Can draft technician prep notes.
- [ ] Does not hallucinate Customer#, SO#, Opp#, or Task#.
- [ ] Does not claim any Striven or calendar write happened.

## Calendar

- [ ] Reads only configured technician calendars.
- [ ] Event from `@classicfireplace.ca` creator is visible.
- [ ] Event from contractor Gmail/personal creator and organizer is hidden.
- [ ] Event with external creator and `@classicfireplace.ca` organizer is visible.
- [ ] Hidden contractor-created events do not appear in Today’s Operations.
- [ ] Hidden contractor-created events do not appear in Scheduled Ahead.
- [ ] Calendar write methods fail clearly.

## E2E Streaming

- [ ] Next dev server starts.
- [ ] `/api/health` reports `openaiConfigured: true`.
- [ ] Real `POST /api/agent/stream` works.
- [ ] At least one `tool_progress` event is received.
- [ ] At least one `text_delta` event is received.
- [ ] One `final` event is received.
- [ ] Apps Script `SERVICEOPS_AGENT_STREAM_URL` is configured.
- [ ] Apps Script `SERVICEOPS_AGENT_SHARED_SECRET` matches the Next environment.
- [ ] Apps Script assistant drawer renders streamed events from the Next endpoint.
- [ ] Missing/unreachable stream endpoint falls back to Apps Script lookup with a clear timeline message.
