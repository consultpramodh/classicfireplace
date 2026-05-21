import { redirect } from "next/navigation";

export default function WorkOrdersPage() {
  redirect("/pipeline?stage=Work%20Order%20Created");
}
