import React from "react";
import { useSession } from "../session";
import { Shell } from "../Shell";
import { Account } from "../AccountScreen";
export default function AccountRoute() {
  const session = useSession();
  return (
    <Shell>
      <Account {...session} />
    </Shell>
  );
}
