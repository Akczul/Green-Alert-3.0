import React from "react";
import { router } from "expo-router";
import { useSession } from "../session";
import { Shell } from "../Shell";
import { CreateScreen } from "../CreateScreen";
export default function Create() {
  const { client } = useSession();
  return (
    <Shell>
      <CreateScreen
        client={client}
        onCreated={() => router.replace("/propios")}
      />
    </Shell>
  );
}
