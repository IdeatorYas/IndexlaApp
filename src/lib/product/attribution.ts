export function formatProductAttribution({
  creatorName,
  creatorHandle,
  verified = true,
}: {
  creatorName: string | null | undefined;
  creatorHandle?: string | null;
  verified?: boolean;
}): string {
  const isIndexla =
    (creatorName ?? "").toUpperCase() === "INDEXLA" ||
    (creatorHandle ?? "").toLowerCase() === "indexla";

  if (isIndexla) {
    return verified ? "INDEXLA · Verified" : "INDEXLA";
  }

  const name = creatorName?.trim() || "Creator";
  const handle = creatorHandle?.replace(/^@/, "").trim();
  const parts = [name];
  if (verified) parts.push("Verified");
  if (handle) parts.push(`@${handle}`);
  return parts.join(" · ");
}
