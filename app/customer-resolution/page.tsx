import { redirect } from "next/navigation";

export default function CustomerResolutionPage() {
  redirect("/pipeline?stage=New%20Requests");
}
