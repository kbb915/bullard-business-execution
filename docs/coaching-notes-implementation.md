# Secure Coaching Notes Implementation Plan

## Current site assessment

The current `bullard-business-execution` repository is a static GitHub Pages site made from standalone HTML files. It currently has:

- No application framework
- No server-side routing
- No database
- No authentication system
- No administrative backend
- No server-side sessions
- No migration system
- No upload processing
- No automated test framework

Because GitHub Pages serves static HTML, CSS, and JavaScript directly, it cannot safely host confidential coaching notes, validate PINs on the server, store HTTP-only cookies, enforce authorization on every query, or rate-limit access attempts by itself.

Do not implement the coaching repository as static HTML, client-side JavaScript, hidden URLs, or password-protected-looking pages in this repository alone.

## Required hosting architecture

Phase One requires moving the private coaching area to an application host that supports server-side code, environment variables, a database, secure cookies, and middleware.

Recommended application stack:

- Next.js or another server-rendered framework
- PostgreSQL database
- Prisma or Drizzle migrations
- Bcrypt or Argon2 PIN hashing
- Server-side sessions with secure, HTTP-only, same-site cookies
- CSRF protection for administrative actions
- Rate limiting backed by database or Redis/KV
- Markdown sanitization before display
- Automated tests for authorization boundaries

Recommended hosting options:

- Vercel + Neon/Supabase Postgres + Upstash Redis
- Render + Postgres + Redis
- Fly.io + Postgres + Redis
- Cloudflare Pages with Workers + D1/Postgres-compatible storage + KV, if the implementation is designed for Workers

The public marketing site can remain on GitHub Pages, but `/coaching/*` and `/admin/*` should route to the secure app by subdomain or reverse proxy. A safer simple deployment is:

- `bullardbusinessexecution.com` remains the public site
- `clients.bullardbusinessexecution.com` hosts the secure coaching app

If the exact required route must remain `/coaching/notes/[client_slug]`, the domain must be served by a host/proxy capable of routing those paths to the secure app.

## Search engine protection

Already added to `robots.txt`:

```txt
User-agent: *
Disallow: /coaching/
Disallow: /admin/
```

The secure application must also set these headers/meta values on every coaching and admin route:

```http
X-Robots-Tag: noindex, nofollow, noarchive
Cache-Control: no-store, private
Pragma: no-cache
```

And include:

```html
<meta name="robots" content="noindex,nofollow,noarchive">
```

## Environment variables

The secure app should document and require these values:

```bash
DATABASE_URL=
SESSION_SECRET=
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
APP_BASE_URL=https://clients.bullardbusinessexecution.com
COOKIE_DOMAIN=.bullardbusinessexecution.com
RATE_LIMIT_WINDOW_SECONDS=900
RATE_LIMIT_MAX_ATTEMPTS=5
PIN_LOCKOUT_MINUTES=30
SESSION_TTL_DAYS=7
UPLOAD_MAX_MB=10
ALLOWED_UPLOAD_TYPES=.txt,.docx,.pdf
OPENAI_API_KEY=
AI_FEATURES_ENABLED=false
```

Do not store Annette's PIN in an environment variable after seeding. Store only a secure hash in the database.

## Data model and migrations

Create migrations for these tables:

### clients

- id
- name
- slug unique
- email nullable
- phone_last_four_hash
- access_enabled boolean default false
- authentication_method default `pin`
- created_at
- updated_at

### administrators

- id
- email unique
- password_hash
- created_at
- updated_at

### client_sessions

- id
- client_id foreign key
- session_token_hash
- expires_at
- created_at
- last_seen_at

### pin_attempts

- id
- client_slug_attempted nullable
- ip_hash
- user_agent_hash
- attempt_count
- locked_until nullable
- created_at
- updated_at

### coaching_sessions

- id
- client_id foreign key
- title
- slug
- session_date
- overview
- status enum: draft, published, archived
- published_at nullable
- created_at
- updated_at
- unique client_id + slug

### session_sections

- id
- session_id foreign key
- section_type
- heading
- content
- display_order
- client_visible boolean default false
- created_at
- updated_at

### categories

- id
- name
- slug unique

### session_categories

- session_id foreign key
- category_id foreign key

### leadership_source_model_stages

- id
- name
- slug unique
- source_type
- description
- display_order

### session_leadership_source_model_stages

- session_id foreign key
- lsm_stage_id foreign key

### actions

- id
- session_id foreign key
- description
- due_date nullable
- status enum: open, completed, canceled
- completed_at nullable
- client_visible boolean default true
- created_at
- updated_at

### client_reflections

- id
- client_id foreign key
- session_id nullable foreign key
- content
- created_at
- updated_at

### client_questions

- id
- client_id foreign key
- session_id nullable foreign key
- question
- answer nullable
- source_session_ids json nullable
- status enum: submitted, answered, archived
- created_at
- answered_at nullable

### resources

- id
- client_id foreign key
- session_id nullable foreign key
- title
- description nullable
- url nullable
- file_path nullable
- approved_for_ai boolean default false
- client_visible boolean default false
- created_at
- updated_at

### audit_log

- id
- administrator_id nullable foreign key
- client_id nullable foreign key
- session_id nullable foreign key
- action
- created_at

## Seed data

Seed the Leadership Source Model as structured database content.

### Limiting Story

Definition: A limiting story is a belief or interpretation that feels true and familiar but keeps a person stuck. It often appears as an explanation for why something cannot change, why another person will not change, or why the person has no available choice.

Destination: More of the Same

Behaviors:

- Wait: I stay still when the moment calls for me to move.
- Hold Back: I stay quiet and keep myself small, even when I have something to give.
- Conform: I match what is happening around me.
- Defend: I assume I am right without questioning my certainty.

### Commitment

Definition: A commitment is what a person is out to cause and who the person will be while causing it. It is more than a task. It shapes how the person acts, speaks, listens, asks questions, and leads.

Destination: Breakthrough

Behaviors:

- Look: I put my certainty to the test by exploring and asking questions.
- Influence: I shape what is happening around me.
- Contribute: I bring my full voice, effort, and presence to what matters.
- Move Forward: I take action on what I can do next.

### Destination definitions

More of the Same: More of the Same is the destination produced when leadership is sourced from a limiting story. The result may include repeated effort, recurring problems, stalled progress, or familiar outcomes without meaningful change.

Breakthrough: A breakthrough is a meaningful and visible result that was unlikely to occur without a shift in personal leadership and a stand in one's commitment.

### First client seed

Create Annette Rogers with:

- Name: Annette Rogers
- Slug: annette-rogers
- Temporary PIN: 6694
- Access enabled: true

Hash `6694` with the application's password-hashing library before storing it. Do not commit the hash to this repository until the backend is private and migration/seed handling is confirmed.

Do not seed coaching notes for Annette.

## Phase One scope

Build first:

- Client records
- Secure PIN access
- Annette's protected client page at `/coaching/notes/annette-rogers`
- Server-side session creation after successful PIN entry
- Secure HTTP-only same-site cookies
- Seven-day client session expiration
- Rate limiting and lockout for failed PIN attempts
- Sign out
- Session cards
- Dedicated session pages at `/coaching/notes/[client_slug]/[session_slug]`
- Search within authenticated client's published notes only
- Category filtering
- Leadership Source Model filtering
- Open/completed action filters if action records exist
- Admin login
- Admin coaching dashboard at `/admin/coaching`
- Admin client page at `/admin/coaching/clients/[client_slug]`
- Create/edit/preview/publish/unpublish/archive/delete session workflow
- Internal-only sections
- Draft/published/archived status
- Responsive styling based on the existing BBE visual system
- Noindex/nofollow/noarchive headers and metadata
- No-store cache headers
- Authorization tests

Phase One empty state for Annette:

```txt
Your coaching notes will appear here after your first published session.
```

## Phase Two scope

Add after Phase One is stable:

- Document upload
- Text extraction from `.txt`, `.docx`, and `.pdf`
- AI-assisted draft summaries
- AI-assisted category suggestions
- AI-assisted Leadership Source Model tagging
- Client questions
- AI answers grounded in the authenticated client's published notes
- Session citations
- Action tracking
- Client reflections
- Data export
- Approved client resources

Uploaded, extracted, summarized, or AI-generated content must remain draft until Kevin approves it.

## Authorization rules

Every server-side query must include the authenticated client id or administrator authorization. Do not authorize only at the route level.

Client pages may only read:

- Their own client record
- Their own published coaching sessions
- Their own client-visible session sections
- Their own client-visible resources
- Their own actions marked client-visible
- Their own reflections
- Leadership Source Model content

Client pages must never read:

- Draft sessions
- Archived sessions unless intentionally exposed later
- Internal coach notes
- Internal-only sections
- Another client's sessions
- Another client's search results
- Another client's uploaded files
- Another client's reflections
- Another client's AI answers
- Another client's resources
- Another client's action items

## Required tests

Add automated tests proving:

- `/coaching/notes/annette-rogers` cannot be viewed without authentication
- Correct PIN grants access
- Incorrect PIN fails with a general message
- Repeated failed attempts trigger lockout
- PIN hash is never exposed in HTML, JavaScript, or API responses
- Authenticated client cannot access another client's page by changing the URL
- Authenticated client cannot retrieve another client's session by slug or API request
- Search only returns authenticated client's published notes
- Draft content is never shown to clients
- Internal-only content is never shown to clients
- Protected pages set noindex/nofollow/noarchive and no-store headers
- Sign out clears the session
- Admin routes require administrator authentication
- Admin publishing workflow hides drafts until published

## Client-facing copy

Access screen:

```txt
Private Coaching Notes

Enter the last four digits of your phone number to access your coaching notes.

[PIN field]
[Access Notes]

These notes are private to your coaching work. Access is limited to the client and Kevin Bullard.
```

Use a general failed-access message:

```txt
We could not verify access. Please check the number and try again.
```

Do not reveal whether the client page exists.

Client page header:

```txt
Annette Rogers
Coaching Notes

This private space contains the observations, questions, commitments, and next steps from our coaching work.
```

Search placeholder:

```txt
Search your coaching notes
```

Category default:

```txt
All categories
```

Match counts:

```txt
1 session
4 sessions
No matching sessions
```

## Styling direction

Use the existing BBE visual system:

- Off-white page background
- White cards
- Light borders
- Subtle shadows
- Generous spacing
- Existing serif headings
- Existing navy/steel/accent palette
- Rounded cards only in the private application surface where appropriate
- Responsive layouts for desktop, tablet, and mobile

## AI assistant guardrails for Phase Two

The coaching assistant may only use:

1. The authenticated client's published coaching notes
2. Bullard Business Execution's Leadership Source Model
3. Resources Kevin approved for that client
4. Reflections submitted by that authenticated client

It must never retrieve, summarize, infer, or reference another client's content.

It should cite source sessions, link back to cited sessions, distinguish notes from inference, say when information is unavailable, avoid diagnosis and professional advice, and keep answers practical and concise.

## Deployment notes

Before any confidential client content is added:

1. Choose and configure the secure application host.
2. Configure database and migration tooling.
3. Configure administrator authentication.
4. Configure secure cookies and session storage.
5. Configure rate limiting.
6. Configure HTTPS.
7. Configure noindex and no-store headers.
8. Run authorization tests.
9. Confirm that protected route source is not exposed as static site files.
10. Confirm that logs and analytics do not contain coaching-note content.

Do not publish real coaching notes to GitHub Pages.
