import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useSession } from "../../session";
import { DetailScreen } from "../../ReportsScreen";
import { Button, Notice, Page } from "../../ui";
export default function Detail() {
  const { client } = useSession();
  const { id } = useLocalSearchParams();
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/reportes");
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id))
    return (
      <Page>
        <Notice error text="Identificador de reporte inválido." />
        <Button title="Volver a reportes" onPress={back} />
      </Page>
    );
  return <DetailScreen key={id} client={client} id={id} onBack={back} />;
}
