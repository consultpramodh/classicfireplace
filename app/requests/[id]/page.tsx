import { AppFrame } from "@/components/app-frame";
import { ServiceOpsLivePage } from "@/components/serviceops-live-page";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppFrame><ServiceOpsLivePage view="work-item" requestId={decodeURIComponent(id)} /></AppFrame>;
}
