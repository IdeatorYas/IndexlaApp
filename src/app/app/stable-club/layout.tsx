import "@/components/stable-club/stable-club.css";

export default function StableClubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="stable-club-hub">{children}</div>;
}
