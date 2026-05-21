import { redirect } from "next/navigation";

export default function RequestsPage() {
  redirect("/pipeline?stage=New%20Requests");
}
