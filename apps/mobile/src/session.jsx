import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState, Text } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useFonts } from "expo-font";
import { createClient } from "./api";
import { secureSession } from "./storage";
import { Button, Loading, Notice, Page, styles } from "./ui";
const Context = createContext(null);
export const useSession = () => useContext(Context);
export function SessionProvider({ children }) {
  const [fonts, fontError] = useFonts({
    Inter: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    InterBold: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
  });
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(false);
  const client = useMemo(
    () =>
      createClient({
        baseUrl: process.env.EXPO_PUBLIC_API_URL || "",
        allowHttp: process.env.EXPO_PUBLIC_ALLOW_HTTP === "true",
        storage: secureSession,
        onExpired: () => {
          setUser(null);
          setNotice("Sesión cerrada. Inicia sesión para continuar.");
        },
      }),
    [],
  );
  const recover = useCallback(
    () =>
      client
        .restore()
        .then(setUser)
        .catch((e) => setBootError(e.message))
        .finally(() => setBooting(false)),
    [client],
  );
  const restore = () => {
    setBooting(true);
    setBootError("");
    return recover();
  };
  useEffect(() => {
    recover();
    return NetInfo.addEventListener((state) =>
      setOffline(
        state.isConnected === false || state.isInternetReachable === false,
      ),
    );
  }, [recover]);
  const authenticated = Boolean(user);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && authenticated)
        client
          .profile()
          .then(setUser)
          .catch((e) => setNotice(e.message));
    });
    return () => sub.remove();
  }, [client, authenticated]);
  const onUser = (next) => {
    setUser(next);
    setNotice("");
  };
  if ((!fonts && !fontError) || booting)
    return (
      <Page>
        <Loading />
        <Text style={styles.text}>Preparando GreenAlert…</Text>
      </Page>
    );
  if (bootError)
    return (
      <Page>
        <Text style={styles.title}>No se pudo recuperar la sesión</Text>
        <Notice error text={bootError} />
        <Button title="Reintentar conexión" onPress={restore} />
        <Button
          secondary
          title="Ir al inicio de sesión"
          onPress={() => {
            setBootError("");
            setUser(null);
          }}
        />
      </Page>
    );
  return (
    <Context.Provider value={{ client, user, onUser }}>
      <Notice
        error={offline}
        text={
          offline
            ? "Sin conexión. Los cambios requieren acceso al servidor."
            : notice
        }
      />
      {children}
    </Context.Provider>
  );
}
