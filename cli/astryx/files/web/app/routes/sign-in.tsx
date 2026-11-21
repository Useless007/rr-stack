import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
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
    <VStack gap={6} maxWidth={384} paddingBlockStart={10}>
      <VStack gap={3}>
        <Heading level={1}>{creating ? "Create an account" : "Sign in"}</Heading>
        <Text color="secondary">
          Reading is open to everyone. Adding and changing todos needs an account. Passwords are hashed with Argon2id;
          the session lives in an HttpOnly cookie.
        </Text>
      </VStack>
      <VStack
        as="form"
        gap={4}
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          action.mutate({ body: { email, password } });
        }}
      >
        <TextInput label="Email" type="email" autoComplete="email" isRequired value={email} onChange={setEmail} />
        <TextInput
          label="Password"
          type="password"
          autoComplete={creating ? "new-password" : "current-password"}
          description={creating ? "At least 8 characters." : undefined}
          isRequired
          value={password}
          onChange={setPassword}
        />
        {cookieRefused && (
          <Banner
            status="warning"
            title="Signed in, but this browser did not keep the session cookie"
            description="The cookie is Secure, so it needs HTTPS or localhost. On plain HTTP elsewhere, set COOKIE_SECURE=false in .env."
          />
        )}
        {action.error && <Banner status="error" title={errorMessage(action.error)} />}
        <Button type="submit" variant="primary" label={creating ? "Create account" : "Sign in"} isLoading={action.isPending} />
      </VStack>
      <Text color="secondary">
        {creating ? "Already have an account? " : "No account yet? "}
        <Link href={`/sign-in?${new URLSearchParams({ ...(creating ? {} : { new: "1" }), next })}`}>
          {creating ? "Sign in" : "Create one"}
        </Link>
      </Text>
    </VStack>
  );
}
