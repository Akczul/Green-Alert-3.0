import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../session";
import { styles } from "../ui";
import { destinations } from "../domain";
function Routes() {
  const { user } = useSession();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="index" />
        <Stack.Screen name="cuenta" />
        <Stack.Protected guard={destinations(user).length > 0}>
          <Stack.Screen name="reportes" />
          <Stack.Screen name="propios" />
          <Stack.Screen name="crear" />
          <Stack.Screen name="reporte/[id]" />
        </Stack.Protected>
      </Stack.Protected>
    </Stack>
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.page}>
        <StatusBar style="light" />
        <SessionProvider>
          <Routes />
        </SessionProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
