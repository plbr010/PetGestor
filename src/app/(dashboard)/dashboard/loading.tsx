import { LoadingState } from "@/components/shared/loading-state";

export default function DashboardLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <LoadingState message="Carregando dashboard..." />
    </div>
  );
}
