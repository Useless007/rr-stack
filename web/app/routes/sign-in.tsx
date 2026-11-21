import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { me } from "~/api";
import { loginMutation, registerMutation } from "~/api/@tanstack/react-query.gen";
import { errorMessage } from "~/lib/errors";
import { safeNext } from "~/lib/safe-next";

export function meta() {
  return [{ title: "Sign in · RR stack" }];
}

export default function SignIn() {
  const [params] = useSearchParams();
  const creating = params.get("new") === "1";
  const next = safeNext(params.get("next"), typeof window === "undefined" ? "http://localhost" : window.location.origin);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cookieRefused, setCookieRefused] = useState(false);
  const done = {
    onSuccess: async () => {
      // The server set a Secure cookie; a browser on plain HTTP (not localhost) silently drops it.
      const check = await me();
      if (check.error) return setCookieRefused(true);
      await queryClient.invalidateQueries();
      navigate(next);
    },
  };
  const login = useMutation({ ...loginMutation(), ...done });
  const register = useMutation({ ...registerMutation(), ...done });
  const action = creating ? register : login;

  return (
    <div className="mt-16 max-w-sm">
      <h1 className="text-4xl font-semibold tracking-tight">{creating ? "Create an account" : "Sign in"}</h1>
      <p className="muted mt-3">
        Reading is open to everyone. Adding and changing todos needs an account. Passwords are hashed with Argon2id;
        the session lives in an HttpOnly cookie.
      </p>
      <form
        className="mt-8 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate({ body: { email, password } });
        }}
      >
        <label className="grid gap-1.5 text-sm font-medium">
          Email
          <input className="field font-normal" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Password
          <input
            className="field font-normal"
            type="password"
            autoComplete={creating ? "new-password" : "current-password"}
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {creating && <span className="muted font-normal">At least 8 characters.</span>}
        </label>
        {cookieRefused && (
          <p className="text-sm text-fault-deep dark:text-fault" role="alert">
            Signed in, but this browser did not keep the session cookie. The cookie is Secure, so it needs
            HTTPS or localhost. On plain HTTP elsewhere, set COOKIE_SECURE=false in .env.
          </p>
        )}
        {action.error && (
          <p className="text-sm text-fault-deep dark:text-fault" role="alert">
            {errorMessage(action.error)}
          </p>
        )}
        <button className="btn mt-2" type="submit" disabled={action.isPending}>
          {action.isPending ? "Please wait" : creating ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="muted mt-6 text-sm">
        {creating ? "Already have an account? " : "No account yet? "}
        <Link
          className="text-ink underline decoration-patina underline-offset-4 dark:text-paper"
          to={`/sign-in?${new URLSearchParams({ ...(creating ? {} : { new: "1" }), next })}`}
        >
          {creating ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
