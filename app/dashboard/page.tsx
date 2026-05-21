import { AppFrame } from "@/components/app-frame";
import { ServiceOpsLivePage } from "@/components/serviceops-live-page";

export default function DashboardPage() {
  return <AppFrame><ServiceOpsLivePage view="command" /></AppFrame>;
}
