# EduClar

**A clearer next step in education.**

EduClar is a Romanian-language education platform prototype for exploring schools, comparing academic results, discovering teachers, and connecting with tutors. It brings school information, moderated community reviews, and alumni stories into one place.

> **Local demo:** seeded institutions, people, and statistics are fictional and labeled as demo data. Authentication uses simulated SMS codes. Live mode is intentionally disabled.

## Features

- **School discovery:** search without Romanian diacritics, filter the catalog, explore results by year and exam session, and compare up to three schools.
- **Teacher profiles and reviews:** separate classroom and tutoring feedback, profile claims, verification, and moderation. Scores appear after at least five approved reviews in the same context.
- **Accounts and guardianship:** phone-code sign-in, role-based access, parent–child links, guardian invitations, contribution authorization, and withdrawal.
- **Tutoring:** claimed teachers can publish offers and accept or decline requests. Contact details become available privately after acceptance.
- **Alumni stories:** adult alumni can publish or withdraw their profiles; profiles remain private until publication.
- **Administration:** review verification evidence, moderate reviews and replies, handle reports and privacy requests, and validate and publish JSON imports.
- **Preferences and transparency:** light, dark, and system themes; cookie preferences; methodology, terms, privacy, and cookie pages.

## Tech stack

| Area | Tools |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript |
| Styling and icons | Tailwind CSS 4, Lucide React |
| Database | PGlite for local PostgreSQL, Drizzle ORM; optional PostgreSQL connection via `pg` |
| Authentication and validation | Better Auth, Zod |
| Testing | Vitest, Playwright |

## Getting started

Install **Node.js 22 or newer** and npm, then run these commands from the repository root:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Server startup applies database migrations, seeds the demo data and starts the hourly retention job. PGlite runs locally without Docker or a separate database server. Runtime data and generated local secrets are stored in `.data/`, which Git ignores.

Only run one process against a given PGlite database directory. Stop the app before running database checks or CLI imports.

### Configuration

The defaults work without an environment file. For overrides, copy [`.env.example`](.env.example) to `.env.local` and adjust the relevant values:

| Variable | Default / behavior |
| --- | --- |
| `APP_MODE` | `local`; live mode refuses to start |
| `BETTER_AUTH_URL` | `http://127.0.0.1:3000`; must match the browser address and use a loopback host |
| `DATA_DIR` | `.data` |
| `BETTER_AUTH_SECRET` | Generated and saved locally when omitted |
| `DOCUMENT_KEY` | Generated locally when omitted; an explicit value uses 64 hexadecimal characters |
| `DATABASE_URL` | Unset; provide a PostgreSQL connection string to use PostgreSQL instead of PGlite |

For a different port, update `BETTER_AUTH_URL` to match the URL used in your browser. Shell commands such as database checks and imports read environment variables from the process; set any overrides in your shell when running them.

### Run a production build locally

```sh
npm run build
npm start
```

This uses Next.js's production build while keeping the application in local demo mode.

## Try the demo

Visit `/autentificare`, choose a demo role, request a code, and click the displayed local code to fill it in. No SMS is sent.

| Fictional phone number | Role |
| --- | --- |
| `+40700000001` | Administrator |
| `+40700000002` | Parent |
| `+40700000003` | Student aged 16+ |
| `+40700000004` | Teacher with a claimed profile |
| `+40700000005` | Child with a guardian |
| `+40700000006` | Alumnus |
| `+40700000007` | Moderator |

The demo student has classroom verifications for Ana Popescu for the 2025–2026 school year. The demo family has verifications for Sorin Luca. Administrators can explore approval workflows at `/admin`; moderators have access to moderation and reports only.

| Route | Purpose |
| --- | --- |
| `/scoli` | School catalog and filters |
| `/compara` | School comparison |
| `/profesori` | Teacher directory and profiles |
| `/meditatii` | Tutoring offers and requests |
| `/absolventi` | Published alumni profiles |
| `/cont` | Account and contribution workflows |
| `/admin` | Administration and moderation |
| `/admin/privacy` | Privacy fulfillment, exports and retention history |
| `/admin/replies` | Moderation of replies against the displayed review version |
| `/metodologie` | Data and review methodology |
| `/solicitari` | Public privacy request form |

## Checks and tests

```sh
npm run typecheck
npm test
npm run build
npm run test:retention
npm run test:e2e
```

Server tests use separate temporary databases. Browser tests run against a local production build on port 3000 with a separate database at `.data/browser-test`. Build first and stop your existing server before running them so Playwright uses the isolated test environment.

To keep an existing app running, set `TEST_BASE_URL` to a separate loopback URL (for example `http://127.0.0.1:3123`) and `TEST_DATA_DIR` to a separate test directory before running browser tests. With a custom test URL, Playwright starts its own server. `test:retention` uses a temporary database and free port and verifies cleanup without HTTP requests.

On Windows, browser tests use installed Microsoft Edge. On other platforms, install Chromium first:

```sh
npx playwright install chromium
```

Browser coverage includes navigation, cookie and theme preferences, school search and comparison, privacy requests, authentication, review moderation, and tutoring acceptance. Screenshots and retained failure traces are written to `test-results/`.

## Database checks and imports

With the app stopped:

```sh
npm run db:check
npm run import:json -- schools examples/schools-demo.json demo
```

The import command stages a batch for validation and review. Publish it from `/admin`, or append `--publish` to the command. Supported import types are `schools`, `teachers`, and `statistics`.

The [example import](examples/schools-demo.json) uses the synthetic `demo` source. For real sources, register the publisher, HTTPS URL, year, and reuse conditions, validate the source, then upload normalized JSON. Automatic ingestion of a real national catalog is not implemented.

## Project structure

```text
src/
  app/          Pages, API routes, and server actions
  components/   Shared interface components and forms
  lib/          Authentication, database, domain logic, imports, and seed data
migrations/     SQL migrations
scripts/        Database checks and JSON import CLI
tests/          Domain and service tests, plus browser flows
examples/       Sample import data
```

## Prototype limitations

This project is intended for local exploration with fictional data. Do not upload real personal documents to the demo.

- SMS delivery, payments, bookings, real-time chat and automatic email delivery are not implemented. Administrators can generate private data exports after verifying the subject.
- The operator identity and contact details in `src/lib/legal.ts` are fictional. Public privacy requests are recorded locally; no emails are sent, and requests require manual review and response.
- Verification evidence is private and encrypted. A retention job runs at server startup and hourly without user traffic, records failures and retries deletion. `npm run maintenance` supports a one-shot run while the local app is stopped.
- Account deletion and profile withdrawal are distinct operations. Erasure scrubs contributions, replies and private decision text, revokes permissions and tracks evidence deletion until completion. Minimized technical references remain; see [data/privacy operations](docs/privacy-operations.md) for fulfillment, retention, migration and verification details.
- `APP_MODE=live` deliberately refuses to start. Real-user deployment requires service integrations, an actual operator identity, legal review, and assessment of risks involving minors.

## Contributing

For changes to this prototype, keep demo data clearly labeled, update documentation when behavior changes, and run the checks relevant to your changes. Follow [AGENTS.md](AGENTS.md) when using coding agents; it includes instructions for the installed Next.js version.
