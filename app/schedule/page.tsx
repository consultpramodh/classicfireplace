import { AppFrame } from "@/components/app-frame";
import { ServiceOpsLivePage } from "@/components/serviceops-live-page";

export default function SchedulePage() {
  return <AppFrame><ServiceOpsLivePage view="calendar" /></AppFrame>;
}
