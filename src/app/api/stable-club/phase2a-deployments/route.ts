import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  isValidPhase2aDeployments,
  toPublicPhase2aDeploymentsPayload,
  type StableClubPhase2aDeployments,
} from "@/lib/stable-club/phase2a-deployments";
import { getStableClubServerConfig } from "@/lib/stable-club/config";

const DEPLOYMENTS_PATH = path.join(
  process.cwd(),
  "src/lib/stable-club/generated/local-phase2a-deployments.json",
);

function readPhase2aDeployments(): StableClubPhase2aDeployments | null {
  try {
    const raw = fs.readFileSync(DEPLOYMENTS_PATH, "utf8");
    const parsed = JSON.parse(raw) as StableClubPhase2aDeployments;
    return isValidPhase2aDeployments(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const config = getStableClubServerConfig();
  if (!config.devEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deployments = readPhase2aDeployments();
  if (!deployments) {
    return NextResponse.json(
      {
        configured: false,
        message:
          "Phase 2a local deployments not found. Deploy the five-pool stack and generate local-phase2a-deployments.json.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    configured: true,
    deployments: toPublicPhase2aDeploymentsPayload(deployments),
  });
}
