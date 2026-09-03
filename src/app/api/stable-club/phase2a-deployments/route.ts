import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getStableClubServerConfig } from "@/lib/stable-club/config";
import {
  LOCAL_PHASE2A_DEPLOYMENTS_RELATIVE_PATH,
  readLocalPhase2aDeploymentsFromDisk,
  resolvePhase2aDeploymentsApiResponse,
} from "@/lib/stable-club/phase2a-deployments-api";

export async function GET(request: Request) {
  const config = getStableClubServerConfig();
  const host = request.headers.get("host");
  const result = resolvePhase2aDeploymentsApiResponse({
    nodeEnv: process.env.NODE_ENV,
    host,
    devFlagEnabled: config.devEnabled,
    loadLocalDeployments: () =>
      readLocalPhase2aDeploymentsFromDisk({
        filePath: path.join(process.cwd(), LOCAL_PHASE2A_DEPLOYMENTS_RELATIVE_PATH),
        readFileSync: fs.readFileSync,
      }),
  });
  return NextResponse.json(result.body, { status: result.status });
}
