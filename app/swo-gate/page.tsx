import { redirect } from "next/navigation";

export default function SwoGatePage() {
  redirect("/pipeline?stage=Approved%20for%20SWO");
}
