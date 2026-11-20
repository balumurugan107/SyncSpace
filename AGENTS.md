# SyncSpace working instructions

Read `PROJECT_UNDERSTANDING.md`, `SYSTEM_DESIGN_GUIDE.md` and `IMPLEMENTATION_TRACKER.md` before making changes. `AGENT_HANDOFF.md` provides historical context; its eight-phase roadmap predates the user's current eleven-phase roadmap recorded in these documents.

Maintain the three documents throughout development, in the same work session as relevant changes:

- `PROJECT_UNDERSTANDING.md`: verified codebase facts, module/API/schema/UI/infrastructure changes, gaps and risks.
- `SYSTEM_DESIGN_GUIDE.md`: actual architecture, component communication, diagrams, request/event flows, failure behavior and practical trade-offs.
- `IMPLEMENTATION_TRACKER.md`: completed/pending work, files and infrastructure changed, test commands/results/dates, known limits and explicit user approvals.

Keep implementation, test evidence and approval separate. Never claim verification that was not performed or integration of planned technologies. Never copy `.env` secrets into documentation, logs or examples.

Preserve existing functionality, API contracts, UI design tokens/components, TypeScript conventions and SQL migration approach. Inspect and reuse existing implementations. Add new migrations instead of editing applied ones.

Work on one phase at a time: inspect, plan, explain data flow, implement, test, explain changes, update documentation, verify regressions, report. The user's attached brief requires assessment review and explicit approval before Phase 4 and before proceeding to each subsequent phase. Record decisions in the tracker; do not infer approval from test success. Later explicit user authorization governs.

When a phase ships, synchronize the guide, Explorer data/tests, navigation availability, API docs and health reporting as applicable. `CURRENT_PHASE` remains 3 until a later phase is actually implemented and verified. Do not change source just to relabel future roadmap items during documentation-only work.
