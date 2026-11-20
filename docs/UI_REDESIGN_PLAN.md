# SyncSpace application redesign — 2026-11-16

Kind: software; existing authenticated collaboration application.

Design system: keep the existing semantic token API and component architecture, with graphite navigation, cobalt actions, warm neutral surfaces, locally hosted Inter variable type, a consistent radius scale, restrained elevation and reduced-motion support. Palette/hero dealers and cinematic marketing sections from Taste are not used: the user's explicit requirement to preserve application architecture, functionality and workflows governs. This is a refinement of Phase 4, not a new roadmap phase.

Voice: short, direct product labels; actual task/workspace/member counts; no fabricated growth metrics, testimonials, read receipts or unread counts. Primary actions remain existing create, save, send and navigation operations.

## Inspection and implementation map

| Area | Existing workflow preserved | Presentation change |
|---|---|---|
| Shell/navigation | Router links, phase availability, theme and account menus | Graphite rail, real workspace switcher, contextual header, skip link and focus-managed mobile drawer |
| Login/register | Existing validation, auth provider and token/cookie lifecycle | Split layout, focused forms and product feature panel |
| Dashboard | Existing summary/tasks/workspaces/activity queries | Personal focus list, real status distribution, workspace shortcuts and collapsible roadmap |
| Workspaces | Create and navigate, ownership/role gates | Summary strip, team identity cards and clearer empty states |
| Workspace detail | Projects, members, roles/removal, activity and settings/deletion | Workspace overview panel, metrics, tabs and member/form layout |
| Projects | Grouped listing and permission-scoped creation | Project summaries, progress cards and clearer grouping |
| Board | Filters, drag/drop, optimistic moves, version conflicts and URL-driven task detail | Work toolbar, structured columns and task cards, refined sheets |
| My Tasks | Existing urgency grouping and scope toggle | Personal summary and readable task rows |
| Chat | HTTP persistence, retry IDs, history, socket signals/typing/presence | Match the new app surfaces and typography; preserve prior two-panel layout |
| Settings | Profile update, theme persistence, session revocation | Section navigation, profile forms, appearance options and device rows |
| Health | Real polling, dependencies, replicas, load demo and scoped event table | Runtime metrics, service panels and consistent diagnostic tables |
| Architecture | Existing nodes, edges, flows, playback and explanations | Flow toolbar, canvas, inspector and playback surfaces |
| Shared UI | Radix semantics, labels, API props and event handlers | Buttons, cards, inputs, selects, tabs, badges, dialogs and dropdowns |

## Data and state boundaries

React Router continues to own routes and URL selection. TanStack Query continues to own server data; the sidebar reuses the workspace query cache. AuthProvider and RealtimeProvider remain unchanged. The only shared API extension is a left-side variant of the existing Dialog used for mobile navigation. No backend, SQL migration, API schema or dependency changes are needed. Inter font files are served locally with their upstream SIL Open Font License.

## Verification plan

- Existing frontend unit tests, TypeScript and production build.
- Existing backend unit/integration tests and TypeScript against isolated test data stores.
- Existing cross-container Playwright collaboration test for board drag, reconnect, chat and proxy upgrades.
- Real-service Playwright workflow scenario covering every route, create/edit forms, workspace tabs, theme, sessions, mobile navigation and overflow at 1440, 1024, 768, 390 and 320 px.
- Review screenshots and retain actual tool errors separately from verified checks in IMPLEMENTATION_TRACKER.md.

No Phase 5 work, production deployment, volume reset or changes to existing users' domain data are authorized by this redesign request. Browser checks create isolated verification accounts and clean up their workspace; accounts remain local as in the existing collaboration suite.


## Skill/application scope decisions

Taste's browser gate also checks marketing layouts: a full-screen hero, `.wrap` containers, product claims, an image/effect in every section, final sales CTAs and a dealt cinematic moment. Those prescriptions conflict with preserving an authenticated application's form-first workflows. They are recorded as open checker findings rather than adding decorative content or replacing app layouts to satisfy them. Real focus visibility, text contrast, semantic main regions and keyboard access findings are addressed in application code. No checker or installed library source is modified, and no gate pass is claimed unless actually reported.
