// waitForLocalReverification against a local stand-in for the Proofline API.
// Loopback only: no Proofline account, and the token is a placeholder.
// From the repository root, after `pnpm build`:  node demo.mjs
// From anywhere else, name the built entry:      node demo.mjs path/to/dist/index.js
import { once } from "node:events";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { ProoflineClient } = await import(
  pathToFileURL(resolve(process.argv[2] ?? "dist/index.js")).href
);
const organizationId = "00000000-0000-7000-8000-000000000001";
const repositoryId = "00000000-0000-7000-8000-000000000004";
const reviewId = "00000000-0000-7000-8000-000000000002";
// Three findings an agent believes its patch fixed.
const [a1, a2, a3] = ["a1", "a2", "a3"].map(
  (name) => `00000000-0000-7000-8000-0000000000${name}`,
);
const findingIds = [a1, a2, a3];
const name = (id) => id.slice(-2);

// The stand-in re-verifies a1 and a2 and does not list a3. Its review runs
// until this script settles it, between steps 2 and 3.
let settled = false;
let patchReviewRequests = 0;
function review() {
  const entry = (finding_id, iteration, outcome) => ({
    finding_id,
    iteration,
    outcome: settled ? outcome : "PENDING",
    checks: [],
  });
  return {
    id: reviewId,
    kind: "PATCH",
    status: settled ? "COMPLETED" : "RUNNING",
    assessment_count: 1,
    assessments: [
      {
        id: "00000000-0000-7000-8000-000000000003",
        status: "COMPLETED",
        findings: [],
        checks: { receipt_recorded: true, status: "READY", families: [] },
      },
    ],
    local_reverifications: [
      entry(a1, 1, "RESOLVED_VERIFIED"),
      entry(a2, 2, "STILL_PRESENT"),
    ],
  };
}
const requestedReview = {
  review_id: reviewId,
  existing: false,
  patch_digest: "d".repeat(64),
  verify: [
    { finding_id: a1, iteration: 1 },
    { finding_id: a2, iteration: 2 },
  ],
};
const http = createServer(async (request, response) => {
  for await (const _ of request);
  const post = request.method === "POST";
  if (post) patchReviewRequests += 1;
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(post ? requestedReview : review()));
});
http.listen(0, "127.0.0.1");
await once(http, "listening");
const client = new ProoflineClient({
  baseUrl: `http://127.0.0.1:${http.address().port}`,
  token: "placeholder-for-the-local-stand-in",
});

function show(result) {
  console.log(`   review status: ${result.status}`);
  for (const item of result.reverifications) {
    const request =
      item.iteration === null ? "no request" : `request ${item.iteration} of 3`;
    const reason = item.reason === null ? "" : `  (${item.reason})`;
    console.log(
      `   ${name(item.findingId)}  ${item.outcome.padEnd(17)}  ${request}${reason}`,
    );
  }
}

console.log("1. Request the patch review once, naming three findings.");
const requested = await client.requestPatchReview(
  { path: { org_id: organizationId, repo_id: repositoryId } },
  {
    base_commit_sha: "b".repeat(40),
    patch: "diff --git a/queue.ts b/queue.ts\n",
    verify_finding_ids: findingIds,
  },
);
console.log(
  `   the server re-verifies: ${requested.verify
    .map((item) => `${name(item.finding_id)} (request ${item.iteration} of 3)`)
    .join(", ")}`,
);

console.log("\n2. Wait 200 ms. The review is still running.");
const wait = (options) =>
  client.waitForLocalReverification(
    organizationId,
    requested.review_id,
    findingIds,
    options,
  );
show(await wait({ timeoutMs: 200 }));

console.log("\n3. The review settles. Wait again for the same review ID.");
settled = true;
const result = await wait();
show(result);

console.log("\n4. The same settled review, read by hand for a3.");
const listed = result.review.local_reverifications.filter(
  (item) => item.finding_id === a3,
);
for (const [reading, answer] of [
  [
    "list.filter(a3).every(resolved)",
    listed.every((item) => item.outcome === "RESOLVED_VERIFIED"),
  ],
  [
    'list.find(a3)?.outcome !== "STILL_PRESENT"',
    listed[0]?.outcome !== "STILL_PRESENT",
  ],
  ["waitForLocalReverification", result.reverifications[2].outcome],
])
  console.log(`   ${reading.padEnd(42)} -> ${answer}`);

console.log(
  `\n5. Patch review requests the stand-in received: ${patchReviewRequests}`,
);
http.close();
http.closeAllConnections();
