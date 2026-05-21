import { AppFrame } from "@/components/app-frame";
import { ServiceOpsLivePage } from "@/components/serviceops-live-page";

export default async function PipelinePage({ searchParams }: { searchParams?: Promise<{ stage?: string }> }) {
  const params = await searchParams;
  return <AppFrame><ServiceOpsLivePage view="pipeline" pipelineStage={params?.stage} /></AppFrame>;
}
