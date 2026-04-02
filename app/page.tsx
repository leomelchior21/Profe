import { DashboardApp } from "@/components/dashboard-app";
import { loadSchoolIntelligenceData } from "@/lib/data-loader";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await loadSchoolIntelligenceData();

  return <DashboardApp data={data} />;
}

