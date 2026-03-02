import { useCallback, useEffect, useMemo, useState } from "react";
import { LandingPage } from "./pages/LandingPage";
import { NotesPage } from "./pages/NotesPage";
import { apiRequest, ApiRequestError } from "./lib/api";
import type { SessionViewModel } from "./types";
import { ToastStack, type ToastMessage, type ToastTone } from "./components/ToastStack";

type SessionLoadState = {
  loading: boolean;
  value: SessionViewModel | null;
};

export default function App() {
  const [sessionState, setSessionState] = useState<SessionLoadState>({ loading: true, value: null });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [authError, setAuthError] = useState<string>("");
  const [authMessage, setAuthMessage] = useState<string>("");

  const pushToast = useCallback((tone: ToastTone, text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, text }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const readAndClearAuthQuery = useCallback(() => {
    const current = new URL(window.location.href);
    const auth = current.searchParams.get("auth");
    const error = current.searchParams.get("auth_error") || "";
    const message = current.searchParams.get("auth_message") || "";

    setAuthError(error);
    setAuthMessage(message);
    if (auth === "success") {
      pushToast("success", "Secure sign-in complete.");
    }

    if (auth || error || message) {
      current.searchParams.delete("auth");
      current.searchParams.delete("auth_error");
      current.searchParams.delete("auth_message");
      const nextQuery = current.searchParams.toString();
      window.history.replaceState({}, "", `${current.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
    }
  }, [pushToast]);

  const loadSession = useCallback(async () => {
    setSessionState((current) => ({ ...current, loading: true }));
    try {
      const session = await apiRequest<SessionViewModel>("/api/session");
      setSessionState({ loading: false, value: session });
      return;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        setSessionState({
          loading: false,
          value: {
            authenticated: false,
            login_url: "/login"
          }
        });
        return;
      }
      setSessionState({
        loading: false,
        value: {
          authenticated: false,
          login_url: "/login"
        }
      });
      pushToast("error", "Unable to verify session right now.");
    }
  }, [pushToast]);

  useEffect(() => {
    readAndClearAuthQuery();
    void loadSession();
  }, [loadSession, readAndClearAuthQuery]);

  const loginUrl = useMemo(() => {
    return sessionState.value?.login_url || "/login";
  }, [sessionState.value]);

  if (sessionState.loading) {
    return (
      <>
        <main className="screen">
          <section className="shell loading-shell">
            <div className="loading-spinner" aria-hidden="true" />
            <h1>Finishing secure sign-in...</h1>
            <p>Preparing your Z Notes workspace.</p>
          </section>
        </main>
        <ToastStack toasts={toasts} />
      </>
    );
  }

  const session = sessionState.value;
  const isAuthenticated = Boolean(session?.authenticated && session.user && session.assurance);

  return (
    <>
      {isAuthenticated && session ? (
        <NotesPage
          session={session}
          onLoggedOut={loadSession}
          onSessionExpired={loadSession}
          onNotify={pushToast}
        />
      ) : (
        <LandingPage loginUrl={loginUrl} authError={authError || undefined} authMessage={authMessage || undefined} />
      )}
      <ToastStack toasts={toasts} />
    </>
  );
}
