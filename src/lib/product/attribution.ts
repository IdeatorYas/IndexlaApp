export function formatProductAttribution({
  creatorName,
  creatorHandle,
}: {
  creatorName: string | null | undefined;
  creatorHandle?: string | null;
  verified?: boolean;
}): string {
  const isIndexla =
    (creatorName ?? "").toUpperCase() === "INDEXLA" ||
    (creatorHandle ?? "").toLowerCase() === "indexla";

  if (isIndexla) {
    return "INDEXLA";
  }

  return creatorName?.trim() || "Creator";
}

export function formatCreatorDisplayName({
  creatorName,
  creatorHandle,
}: {
  creatorName: string | null | undefined;
  creatorHandle?: string | null;
}): string {
  return formatProductAttribution({ creatorName, creatorHandle });
}
