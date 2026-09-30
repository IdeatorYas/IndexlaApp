/**
 * Submit Phantom official dApp review Google Form + mirror to Blowfish mailbox draft.
 * Evidence written to scripts/degen-solana/phantom-review-submit-log.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLSeoSDtQc9CEHG-dC2EUO6ZkDCaFQXq3M92M1csH4WrdCCW-QQ/formResponse";

const answers = {
  projectName: "IndexLa — Degen Club Solana Memecoin Index",
  description:
    "Non-custodial Solana memecoin index on app.indexla.tech. Users buy/sell a fixed 10-asset basket via Jupiter swaps packed into ≤3–4 VersionedTransactions, each confirmed with Phantom signAndSendTransaction. Assets remain in the user’s associated token accounts. Same-origin Solana RPC proxy at /api/degen-solana/rpc.",
  website:
    "https://app.indexla.tech/app/degen-club/product/solana-memecoin-index",
  name: "IndexLa Security",
  email: "security@indexla.tech",
  // Warning often appears at simulation before broadcast; product URL + architecture for review.
  txLink:
    "https://app.indexla.tech/app/degen-club/product/solana-memecoin-index (Phantom simulation warning on signAndSendTransaction of Jupiter-packed v0 swaps; will follow up with Solscan hash from next live buy confirmation)",
  team: "https://indexla.tech · https://app.indexla.tech · security@indexla.tech · https://app.indexla.tech/.well-known/security.txt",
  social: "https://twitter.com/indexla · https://indexla.tech",
  repo: "Private application repository. Execution path is Jupiter-routed non-custodial swaps only (no custodial vault).",
  vouch: "N/A — requesting review based on live product + security contact",
  additional:
    "Request domain allowlisting / transaction simulation warning reduction for app.indexla.tech. We already use one signAndSendTransaction per pack (never signAll), pre-simulate packs, skipPreflight=false, maxRetries=0, direct routes, useSharedAccounts=false. Buy ≤4 packs; Sell All ≤3. We do not ask users to disable Phantom security.",
};

const body = new URLSearchParams({
  "entry.772065945": answers.projectName,
  "entry.148939740": answers.description,
  "entry.562479997": answers.website,
  "entry.212909036": answers.name,
  "entry.1136641386": answers.email,
  "entry.626895701": answers.txLink,
  "entry.2049675840": answers.team,
  "entry.1264318432": answers.social,
  "entry.898809818": answers.repo,
  "entry.1321355851": answers.vouch,
  "entry.741373154": answers.additional,
  fbzx: "8009423781835936233",
  pageHistory: "0",
  fvv: "1",
});

const res = await fetch(FORM, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: "https://docs.google.com",
    Referer:
      "https://docs.google.com/forms/d/e/1FAIpQLSeoSDtQc9CEHG-dC2EUO6ZkDCaFQXq3M92M1csH4WrdCCW-QQ/viewform",
  },
  body,
  redirect: "manual",
});

const log = {
  submittedAt: new Date().toISOString(),
  formStatus: res.status,
  formLocation: res.headers.get("location"),
  answers,
  blowfishMailto: {
    to: "review@blowfish.xyz",
    cc: "review@phantom.com",
    subject: "Domain / dApp review request — app.indexla.tech (IndexLa Degen Club)",
    body: `Hello Blowfish / Phantom review team,

Please review https://app.indexla.tech for allowlisting. Phantom shows “This dApp could be malicious” on transaction simulation for our Solana Degen Club product.

Product: IndexLa — Degen Club Solana Memecoin Index
URL: https://app.indexla.tech/app/degen-club/product/solana-memecoin-index
Contact: security@indexla.tech

We use Phantom signAndSendTransaction (one packed VersionedTransaction per prompt; never signAll). Pre-simulate with sigVerify:false; skipPreflight=false; Jupiter direct routes; user ATAs (no shared accounts).

Official Phantom Google Form also submitted ${new Date().toISOString()}.

Thank you,
IndexLa Security
security@indexla.tech
`,
  },
};

const out = path.join(__dirname, "phantom-review-submit-log.json");
fs.writeFileSync(out, JSON.stringify(log, null, 2));
console.log("Form HTTP", res.status, res.headers.get("location"));
console.log("Log written", out);

// Attempt mailto-less delivery via public Formspree is not configured.
// Blowfish mirror: write .eml for operator send if SMTP unavailable.
const eml = `To: review@blowfish.xyz
Cc: review@phantom.com
From: security@indexla.tech
Subject: Domain / dApp review request — app.indexla.tech (IndexLa Degen Club)
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8

${log.blowfishMailto.body}
`;
fs.writeFileSync(path.join(__dirname, "phantom-blowfish-review.eml"), eml);
console.log("Blowfish .eml prepared for delivery");
