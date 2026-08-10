import { DashboardHeader } from "@/components/layout/dashboard-header";
import { EmptyState } from "@/components/shared/empty-state";
import { sectionLabels } from "@/config/navigation";
import { brand } from "@/config/brand";

type SectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export default async function DashboardSectionPage({ params }: SectionPageProps) {
  const { section } = await params;
  const sectionLabel = sectionLabels[section] ?? "Seção";

  return (
    <>
      <DashboardHeader
        title={sectionLabel}
        description="Área reservada para implementação futura"
      />
      <main className="flex-1 p-4 sm:p-6">
        <EmptyState
          title={`${sectionLabel} em desenvolvimento`}
          description={`Esta seção faz parte do roadmap do ${brand.name}. Por enquanto, apenas a página inicial do dashboard está disponível.`}
        />
      </main>
    </>
  );
}
