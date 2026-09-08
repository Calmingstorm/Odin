# Computer-use documentation

Start with [OPERATOR.md](OPERATOR.md), [PACKAGING.md](PACKAGING.md) and
[RECOVERY.md](RECOVERY.md). These three files are the explicit installed handoff.

All other documents here are repository-only engineering records. R1 through R10
reports describe dated fixtures, decisions and limitations. Old app allowlists,
key restrictions and qualifications are historical evidence, not the R11 offering.
No historical authorization extends to a new user's machine. Historical paths use
symbolic roots: `${EVIDENCE_ROOT}` holds retained artifacts, `${SOURCE_ROOT}` is a
source checkout, and `${REVIEW_ROOT}` holds private reviews/worktrees. These are
placeholders, not install defaults or literal host instructions. The referenced
private artifacts and reviews are **not shipped in this repository or package**;
basenames, dated results and checksums preserve provenance, not public availability.
Choose authorized local roots when reproducing an experiment. Real host process
identifiers and irrelevant desktop inventory are omitted; private-namespace fixture
identities and generic install paths remain where they explain the test.

The [static tool catalog](../reference/tools.md) does not enumerate dynamically
registered native computer tools. `computer_session`, `computer_observe` and
`computer_act` are documented in [OPERATOR.md](OPERATOR.md); their availability
depends on configured capabilities, consent and permissions, not the catalog count.

R11's general attached-app/action, independent-pointer and compositor work is an
implementation contract until its validation arrives. Do not turn registry entries
or old application samples into new qualification claims. See
[REMOTE-FEASIBILITY-R11.md](REMOTE-FEASIBILITY-R11.md) for assessment only.
