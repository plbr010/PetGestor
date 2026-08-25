import { WhatsAppFloatingButton } from "@/components/whatsapp-floating-button";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <WhatsAppFloatingButton />
    </>
  );
}
