import React from "react";
import { Image, Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../session";
import { Shell } from "../Shell";
import { destinations } from "../domain";
import { Button, Notice, Page, styles } from "../ui";
export default function Home() {
  const { user } = useSession();
  return (
    <Shell>
      <Page>
        <Image
          source={require("../../assets/logo.png")}
          accessibilityLabel="GreenAlert"
          style={{ height: 100, width: "100%", resizeMode: "contain" }}
        />
        <Text style={styles.title}>Hola, {user.nombre}</Text>
        {!destinations(user).length ? (
          <>
            <Notice
              error
              text="Tu cuenta no tiene un rol habilitado. Consulta al administrador."
            />
            <Button
              title="Mi cuenta"
              onPress={() => router.navigate("/cuenta")}
            />
          </>
        ) : (
          <>
            <Text style={styles.text}>
              Cada reporte es un paso hacia un entorno más sano.
            </Text>
            <View style={styles.card}>
              <Text style={styles.heading}>
                {user.rol === "entidad"
                  ? "Atención institucional"
                  : "Tu comunidad ambiental"}
              </Text>
              <Text style={styles.muted}>
                {user.rol === "entidad"
                  ? "Consulta los reportes asignados a tu entidad."
                  : "Consulta problemas ambientales y comparte lo que ocurre cerca de ti."}
              </Text>
              <Button
                title="Consultar reportes"
                onPress={() => router.navigate("/reportes")}
              />
              <Button
                secondary
                title="Crear un reporte"
                onPress={() => router.navigate("/crear")}
              />
            </View>
            {!user.email_verificado && (
              <Button
                secondary
                title="Verificar mi correo"
                onPress={() => router.navigate("/cuenta")}
              />
            )}
          </>
        )}
      </Page>
    </Shell>
  );
}
