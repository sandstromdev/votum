# Meeting voting domain

## Glossary

- **Meeting** — A bounded meeting session that owns an ordered sequence of Votes and provides the stable participant entry point after explicit opening.
- **Vote** — One decision or candidate election conducted within a Meeting.
- **Active Vote** — The one Vote currently presented for participation. A Meeting may have no Active Vote between Votes.
- **Meeting link** — The stable public locator for a Meeting, resolving participants to the Active Vote or to a waiting state when none is active.
- **Presentation view** — The public, organizer-controlled screen for showing the current Meeting state to a room without exposing participant Ballots or Organizer controls.
- **Presentation QR code** — An optional invitation displayed on the Presentation view that leads to the Meeting link. The Organizer may enable it while the Meeting is a Draft Meeting or open; it is hidden after the Meeting ends.
- **Waiting state** — The participant-facing state shown whenever a Meeting has no Active Vote, both before the first Vote and between Votes.
- **Draft Meeting** — A newly created Meeting that has not been opened. It is organizer-only and may be deleted.
- **Closed Meeting** — A Meeting explicitly ended by its organizer after opening. Its Meeting link remains available as a read-only ended state.
- **Organizer account** — An authenticated user account used to operate Meetings and Votes. In v1, every persisted user account is an Organizer account.
- **Participant** — An anonymous person who takes part in a Vote without a user account or saved participant identity.
- **Ballot** — A Participant's current choice in a Vote. The Participant holding the associated token may read it back, replace it, or withdraw it while the Vote is open; it becomes fixed and no longer participant-readable at Close.
- **Participant token** — An opaque token scoped to one Meeting and one browser, retained across that Meeting's Votes and used only to enforce the one-current-Ballot rule and read that browser's current Ballot. A recognized token with no Ballot for the Active Vote is a normal no-ballot state. It is not identity proof or an authentication credential. If it is lost, the Ballot cannot be recovered or linked to a replacement token.
- **Decision Vote**: An approval Vote asking whether one proposal should pass. Support must meet the Vote's Majority rule; if it does not, the proposal is rejected rather than treating Oppose as an independently qualified alternative.
- **Majority rule**: The approval standard a Decision Vote uses to decide whether Support passes. A Decision Vote uses Simple majority by default or a fixed Qualified majority, and a Qualified majority may include Abstentions when the Organizer enables that rule for the Vote.
- **Simple majority**: A Decision Vote rule where Support passes when it exceeds Oppose. Abstentions do not count toward this comparison.
- **Qualified majority**: A Decision Vote rule where Support must reach two-thirds of the counted Support, Oppose, and optionally Abstention Ballots. It is fixed at two-thirds in v1 and has no custom percentage.
- **Single-winner selection** — A Vote where one configured selection option can fill one position, with Abstention always available and Vacancy optionally included as a competing outcome. A Candidate election is one possible use of this shape, not a required user-facing term.
- **Multi-winner selection** — A Vote with a fixed number of positions where each Participant may select distinct options up to that number and may explicitly assign some positions to Vacancy. Omitted positions are neither selected nor assigned to Vacancy. The highest-supported options and explicit Vacancy support fill positions; mixed results are valid. Rankings, weighted votes, proportional allocation, and automatic runoffs are out of scope.
- **Selection option** — A labeled option in a Single-winner selection. It may represent a Candidate, proposal, or other choice.
- **Selection Ballot** — A Participant's current choice in a Single- or Multi-winner selection. It contains zero or more distinct selected options and, for a Multi-winner selection, a Vacancy count; zero selections and zero Vacancy count is Abstention.
- **Vacancy count** — The number of positions a Participant explicitly assigns to remain unfilled in a Multi-winner selection. It is bounded with the selected-option count by the Vote's total positions; an omitted position does not count as Vacancy.
- **Abstention** — A Participant's explicit decision not to support or oppose a Decision Vote proposal, or not to express a preference among Selection options and Vacancy outcomes. It is recorded separately and does not compete for the result unless a Qualified majority includes it in the threshold.
- **Vacancy** — An optional competing outcome in a position-related selection that leaves a position unfilled. In a Multi-winner selection it is represented as explicit per-position support rather than repeated identical options; it can fill multiple positions, while a regular option wins equal-support ties.
- **Vacancy tie-break** — When a regular Selection option and Vacancy have equal support at a selection cutoff, the regular option wins automatically. Ties among regular Selection options remain unresolved.
- **Rerun** — A new Vote started by the Organizer after any closed or Invalidated Vote. It is a separate attempt; the original Vote and its outcome remain unchanged.
- **Invalidated Vote** — A terminal Vote declared procedurally unusable. It has no valid Final result, remains read-only, and may be replaced by a Rerun without rewriting the original Vote.
- **Expected participant count** — The Organizer's editable estimate of how many people are expected to participate in the Meeting. It is a public progress reference, not a closing rule.
- **Final result** — The immutable outcome state of a closed Vote that the Organizer deliberately discloses. It may be a winner, an accepted Incomplete result, a Vacancy, a tie, or no result.
- **Outcome snapshot** — A self-contained historical record of a Vote's configuration and aggregate outcome. It contains no raw Ballots, ParticipantTokens, or participant-identifying data and is not rewritten after creation. Organizer resolution is recorded separately from the Participant counts.
- **Close snapshot** — The immutable Outcome snapshot created when a Vote closes.
- **Outcome history** — A compact record of closed Vote outcomes and their Rerun relationships, not the full history model of the broader Vote product.
- **Public result breakdown** — The optional participant- and Presentation-facing disclosure of aggregate result counts after a Final result is revealed. It is hidden by default for both Decision Votes and Candidate elections.
- **Vote configuration** — The organizer-facing nested shape of a Vote: Decision labels and Majority rule, or Single-/Multi-winner selection with Selection options, position count, and Vacancy. Distinct from the flat draft form used at the HTML form seam.
- **Incomplete result** — A Multi-winner Selection result where at least one position has a resolved option or explicit Vacancy outcome, while another position remains unfilled. The Organizer must accept the result, mark all remaining positions as Vacancy, or start a Rerun before Reveal.
- **Organizer resolution** — The Organizer's pre-Reveal choice for an Incomplete result: accept the unfilled positions, mark them as Vacancy, or start a Rerun. It may change before Reveal and is immutable after Reveal; it does not change Participant counts.
