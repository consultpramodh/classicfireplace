import { redirect } from "next/navigation";

export default function IntakePage() {
  redirect("/pipeline?stage=New%20Requests");
}
