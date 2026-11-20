# Taste review notes — 2026-11-16

Final gate: `GATE: OPEN 17 (rounds used up)`. No PASS is claimed.

The initial run reported 21 findings. Application focus/contrast/main-region improvements reduced that to 17 in the second round; the third round retained 17 findings and marked the gate OPEN. A URL version parameter was needed because the checker reused its previous report for an unchanged URL after an application rebuild. No checks, kit files, installed library files or DOM visibility rules were changed to manipulate results.

The user explicitly requires the existing application architecture, routing and workflows. Marketing-only hero, visual, sales-copy and wrapper rules remain inapplicable to a sign-in form. Four static focus-reset findings refer to React Flow vendor CSS; application overrides now restore graph node/selection/edge focus indicators without editing that dependency. The browser suite checks actual graph node focus and provides the component picker as an additional keyboard-accessible way to open explanations.

## Open checker findings

| Check | Target | Checker message |
|---|---|---|
| copy-headline | main#auth-content > div.page-arrive.w-full > h1.font-semibold "Welcome back" | "Welcome back" does not name what is sold (team collaboration application, team, collaboration, application, from flags) |
| copy-fact | main#auth-content > div.page-arrive.w-full > h1.font-semibold "Welcome back" | the first screen holds no number, price, date, place, platform or genre |
| focus-ring | .react-flow__nodesselection-rect:focus, .react-flow__nodesselection-rect:focus-visible | ".react-flow__nodesselection-rect:focus, .react-flow__nodesselection-rect:focus-visible" in react-flow-DLioOiRN.css removes the focus outline and sets nothing in its place |
| focus-ring | .react-flow__edge.selected, .react-flow__edge:focus, .react-flow__edge:focus-visible | ".react-flow__edge.selected, .react-flow__edge:focus, .react-flow__edge:focus-visible" in react-flow-DLioOiRN.css removes the focus outline and sets nothing in its place |
| focus-ring | .react-flow__node.selectable:focus, .react-flow__node.selectable:focus-visible | ".react-flow__node.selectable:focus, .react-flow__node.selectable:focus-visible" in react-flow-DLioOiRN.css removes the focus outline and sets nothing in its place |
| focus-ring | .react-flow__nodesselection-rect:focus, .react-flow__nodesselection-rect:focus-visible, .r | ".react-flow__nodesselection-rect:focus, .react-flow__nodesselection-rect:focus-visible, .r" in react-flow-DLioOiRN.css removes the focus outline and sets nothing in its place |
| moment-none | (the page) | a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md) |
| hero-screen | main#auth-content > div.page-arrive.w-full "Your team, in syncWelcome backSign in to" | the hero ends at 665px on a 900px screen, 235px above the fold: it ends at the fold, 1px either way (SR-1) |
| section-height | main#auth-content > div.page-arrive.w-full "Your team, in syncWelcome backSign in to" | the section starts at 258px, 258px below the screen grid (0 x 900px): sections start on whole screens (SR-2) |
| one-section | main#auth-content > div.page-arrive.w-full "Your team, in syncWelcome backSign in to" | a <div> sits directly in <main>: every part of <main> is a <section> (SR-4) |
| container-edges | div#root "Skip to account formSyncSpaceYour team, " | a <div> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6) |
| container-edges | main#auth-content > div.page-arrive.w-full "Your team, in syncWelcome backSign in to" | the section needs exactly one in-flow child .wrap (it has 4 in-flow children, 0 .wrap) (SR-6) |
| container-edges | main#auth-content > div.page-arrive.w-full > div.mt-8 > p.mt-6.text-center "New to SyncSpace? Create an account" | 1 text block starts on a left line at x 220, 220px from the container's left: text starts on the container's left, or on one split line (x 610, 732, 854) (SR-6) |
| container-edges | main#auth-content > div.page-arrive.w-full > p.page-eyebrow "Your team, in sync" | 5 text blocks start on a left line at x 171, 171px from the container's left: text starts on the container's left, or on one split line (x 610, 732, 854) (also "Welcome back", "Sign in to your SyncSpace accoun", "Email") (SR-6) |
| container-edges | main#auth-content > div.page-arrive.w-full > h1.font-semibold "Welcome back" | the h1 starts 171px right of the container's left: every h1 and h2 starts on it, 2px either way (SR-6) |
| text-only | main#auth-content > div.page-arrive.w-full "Welcome back" | the closing section is only text: no picture, icon, mock or effect in it |
| container | page | no .wrap |

## Warnings and limits

The gate also reports six warnings: asset checks, one focus-visibility warning, share metadata, form-field heuristics and tap-size heuristics. These are retained as checker findings. There is no blanket WCAG compliance or performance certification. The application browser tests verify workflows, actual graph focus, navigation focus restoration and responsive page/control bounds; they do not replace a full assistive-technology audit.

No formal waivers were submitted. No stock photographs, fabricated statistics, fictional product data or extra marketing sections were added. The existing product name, logo structure and actual workflows remain. Inter is served locally with its license.
