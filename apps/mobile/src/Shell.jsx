import React from "react";
import { ScrollView, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSession } from "./session";
import { colors, destinations } from "./domain";
import { Button, styles } from "./ui";
const paths = {
  Inicio: "/",
  Reportes: "/reportes",
  Asignados: "/reportes",
  Crear: "/crear",
  "Mis reportes": "/propios",
  Cuenta: "/cuenta",
};
export function Shell({ children }) {
  const { user } = useSession();
  const path = usePathname();
  return (
    <View style={styles.page}>
      {children}
      <View style={{ borderTopWidth: 1, borderColor: colors.border }}>
        <ScrollView
          horizontal
          contentContainerStyle={{ padding: 8, gap: 8 }}
          showsHorizontalScrollIndicator={false}
        >
          {destinations(user).map((label) => (
            <Button
              key={label}
              title={`${paths[label] === path ? "● " : ""}${label}`}
              secondary={paths[label] !== path}
              onPress={() => router.navigate(paths[label])}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
