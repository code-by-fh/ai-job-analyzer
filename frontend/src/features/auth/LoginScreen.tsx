"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { safeNextPath } from "@/api/session";
import { useCurrentUser } from "@/features/shell/useCurrentUser";
import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";
import { LoginForm } from "./LoginForm";

/** Split screen from the prototype: ink brand side, form on paper. */
export function LoginScreen() {
  const { t } = useI18n();
  const showForm = useRedirectWhenSignedIn();
  return (
    <div className="auth">
      <AuthSide />
      <main className="auth-main">
        {showForm ? (
          <div className="auth-box">
            <Masthead title={t("login.title")} small />
            <LoginForm />
          </div>
        ) : null}
      </main>
    </div>
  );
}

/** A visitor with a live session skips the form; returns whether the form should be shown. */
function useRedirectWhenSignedIn(): boolean {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const { data: user, isPending } = useCurrentUser();
  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);
  return !isPending && !user;
}

function AuthSide() {
  const { t } = useI18n();
  return (
    <div className="auth-side">
      <div>
        <p className="auth-word">
          {t("app.name")
            .split(" ")
            .map((word) => (
              <span key={word} className="block">
                {word}
              </span>
            ))}
        </p>
        <p className="auth-deck">{t("app.description")}</p>
      </div>
      <p className="small auth-foot">{t("login.foot")}</p>
    </div>
  );
}
