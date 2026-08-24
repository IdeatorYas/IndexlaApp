import "@/components/degen-club/degen-club.css";

export default function DegenClubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="degen-hub">
      <div className="degen-hub-inner">{children}</div>
    </div>
  );
}
