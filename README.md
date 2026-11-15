# Demonstration: waitForLocalReverification

For the pull request "Add waitForLocalReverification for checking fixes before a push" on prooflinedev/sdk-typescript.

- `recording.gif`: the terminal text of one run of `demo.mjs`, rendered as a GIF.
- `transcript.txt`: the same output as text.
- `demo.mjs`: requests one patch review that names three findings, waits while it runs and again once it has settled, against a stand-in for the API on 127.0.0.1. It needs no account.

Run it from the root of a checkout of the pull request branch:

```sh
pnpm install --frozen-lockfile && pnpm build
node demo.mjs
```
