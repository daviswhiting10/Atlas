import { redirect } from "next/navigation";

/** Retired: the coach's home is Log session now. Old links land there. */
export default function Retired() {
  redirect("/log");
}
