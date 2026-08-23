---
status: accepted
---

# Multi-winner Vacancy and Incomplete results

Multi-winner Selection Votes treat `vacancyCount` as explicit per-position support. Vacancy can fill multiple positions, regular options win equal-support ties, and mixed results such as an option plus vacant positions are valid. Omitted positions are not automatically Vacancy. A Vote with no selected option or explicit Vacancy support, including an Abstention-only Vote, has no result; a Vote with at least one resolved position and a remaining unfilled position is Incomplete. After Close, the Organizer must accept the Incomplete result, mark all remaining unfilled positions as Vacancy, or start the existing Rerun before Reveal. The resolution may change until Reveal, then becomes immutable. Participant counts remain unchanged, resolution metadata is Organizer-only, and no automatic runoff or Vacancy default is added.
