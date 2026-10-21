"use client";

import { useActionState } from "react";
import { Button, PasswordInput } from "@/components/atoms";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <label className="text-small text-text-secondary flex flex-col gap-1 font-medium">
        Password
        <PasswordInput
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          error={Boolean(state.error)}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-small text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" loading={pending} className="w-full">
        View dashboard
      </Button>
    </form>
  );
}
