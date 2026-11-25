import React from "react";
import { router } from "expo-router";
import { AuthScreen } from "../AuthScreen";
import { useSession } from "../session";
export default function Login() {
  const { client, onUser } = useSession();
  return (
    <AuthScreen
      client={client}
      onUser={(user) => {
        onUser(user);
        router.replace("/");
      }}
    />
  );
}
