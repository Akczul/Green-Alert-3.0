import React from "react";
import { router, useFocusEffect } from "expo-router";
import { useSession } from "../session";
import { Shell } from "../Shell";
import { ReportsScreen } from "../ReportsScreen";
export default function Own() {
  const { client } = useSession();
  const [focused, setFocused] = React.useState(false);
  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return (
    <Shell>
      {focused && (
        <ReportsScreen
          client={client}
          own
          onDetail={(id) =>
            router.push({ pathname: "/reporte/[id]", params: { id } })
          }
        />
      )}
    </Shell>
  );
}
