import { redirect } from "next/navigation";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/api/session";

export default function HomePage() {
  redirect(DEFAULT_AFTER_LOGIN_PATH);
}
