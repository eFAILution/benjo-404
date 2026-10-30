# 0066. Beast Code owns the code, all rights reserved

- Status: Accepted
- Date: 2026-10-30
- Deciders: eFAILution

## Context

The repo started with an MIT license in the name of `eFAILution`. Beast Code owns the hackathon work, so that license names the wrong owner and grants rights the owner never agreed to give.

MIT lets anyone use, copy, change, and sell everything it covers. Today the repo is private, so nobody outside the team can get the code and the license does nothing. If the repo ever goes public, MIT would cover the Benjo logo paths in `src/assets/benjo.js` too. A-8.2 only approved using the logo on the page, not giving it away.

The fonts in `assets/fonts/` are subsets of Inter and Geist Mono under the SIL Open Font License, and must keep that license.

## Decision

1. Replace `LICENSE` with an all rights reserved notice in Beast Code's name. No license is granted without written permission from Beast Code.
2. The notice lists the two font subsets and points at their OFL texts, which stay byte-exact in `assets/fonts/`.
3. `package.json` sets `"license": "UNLICENSED"`, the npm marker for code that is not licensed for reuse.
4. Making the repo public is Beast Code's call. This license does not change that and does not depend on it.

## Alternatives considered

- **Keep MIT and leave the logo out with a note.** Keeps the code reusable, but Beast Code owns the work and has not chosen to share it.
- **Apache 2.0.** It holds back trademark rights, but the logo artwork would still be licensed, so it needs the same note as MIT and has the same ownership problem.
- **No `LICENSE` file at all.** Legally close to all rights reserved, but it does not name the owner and leaves readers guessing.

## Consequences

- Nobody outside Beast Code may reuse the code, even if the repo goes public. Opening it up later needs a new ADR.
- The built page carries no license text, because the build drops legal comments (`legalComments: 'none'` in `build/build.js`). Hosting the built files does not change who owns them.
- Earlier commits still hold the MIT `LICENSE` file. History is never rewritten, so those old copies stay as they are. The repo has always been private, so nobody outside the team received them.
