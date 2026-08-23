/** Single creator-selected strategy attached to a marketplace product. */
export interface ProductSelectedStrategy {
  id: string;
  name: string;
  explanation: string;
  rules: string[];
  triggers: string[];
  thresholds: { label: string; value: string }[];
  automationStatus: "active" | "paused" | "available";
  permissionsDisclosure: string;
}
