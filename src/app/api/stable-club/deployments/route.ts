import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  isValidLocalDeployments,
  type StableClubLocalDeployments,
} from "@/lib/stable-club/deployments";
import { getStableClubServerConfig } from "@/lib/stable-club/config";

const DEPLOYMENTS_PATH = path.join(
  process.cwd(),
  "src/lib/stable-club/generated/local-deployments.json",
);

function readLocalDeployments(): StableClubLocalDeployments | null {
  try {
    const raw = fs.readFileSync(DEPLOYMENTS_PATH, "utf8");
    const parsed = JSON.parse(raw) as StableClubLocalDeployments;
    return isValidLocalDeployments(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const config = getStableClubServerConfig();
  if (!config.devEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deployments = readLocalDeployments();
  if (!deployments) {
    return NextResponse.json(
      {
        configured: false,
        message:
          "Run `npm run node:local` then `npm run deploy:stable-club:local` to generate local deployments.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    configured: true,
    deployments: {
      chainId: deployments.chainId,
      network: deployments.network,
      isTestOnly: deployments.isTestOnly,
      label: deployments.label,
      deployedAt: deployments.deployedAt,
      permissionRegistry: deployments.permissionRegistry,
      feeRouter: deployments.feeRouter,
      executor: deployments.executor,
      testAdapter: deployments.testAdapter,
      usdc: deployments.usdc,
      weth: deployments.weth,
      poolId: deployments.poolId,
      rpcUrl: deployments.rpcUrl,
    },
  });
}
