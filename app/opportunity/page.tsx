import { redirect } from "next/navigation";

export default function OpportunityPage() {
  redirect("/pipeline?stage=Opportunity");
}
