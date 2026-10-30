# 0101. Raise the page budget to 150 KB

- Status: Proposed
- Date: 2026-10-30
- Deciders: eFAILution

## Context

`budgets.json` caps the built page at 110,000 bytes gzipped and 320,000 raw (ADR-0076). Fourteen games are on `main`, and the page is 104.6 KB gzipped and 268 KB raw. Bug Belt (#94) brings it to 108.7 KB and 280 KB, which leaves 1.3 KB: not enough for another game, since each one costs 4 to 6 KB gzipped and about 12 KB raw.

The page no longer has to fit a Webflow Code Embed. Since ADR-0069 the Webflow page loads the bundle from GitHub Pages, and the owner is thinking about redirecting to the Pages site instead of embedding at all. Either way, the cap is about load time, not a host limit.

## Decision

- `total` goes from 110,000 to 150,000 gzip bytes.
- `totalRaw` goes from 320,000 to 440,000 bytes, in step with the gzip limit, so the raw cap doesn't become the one that blocks.
- The per-part budgets stay as they are: shell 30,000, fonts 28,000, each game 16,000, each theme 4,000.

## Alternatives considered

- **200 KB.** Room for about fifteen more games, but a cap the page never gets near stops catching anything (ADR-0020).
- **No page total.** Each part keeps its own cap, but nothing would stop the page from growing one game at a time.
- **Move games out of the bundle.** Keeps the page small, but needs a picker that loads games on demand. The page loads nothing after it opens (ADR-0008), so that is a bigger change.

## Consequences

- With Bug Belt, the page has about 41 KB of gzip headroom, enough for about seven more games of today's size.
- 150 KB gzipped is one request and loads quickly on a phone. The page is still a single file with no requests after it opens.
- The next raise needs its own decision, like this one.
