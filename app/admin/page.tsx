import { AppFrame } from "@/components/app-frame";
import { ServiceOpsLivePage } from "@/components/serviceops-live-page";

export default function AdminPage() {
  return <AppFrame><ServiceOpsLivePage view="admin" /></AppFrame>;
}
