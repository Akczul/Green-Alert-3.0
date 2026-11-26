import * as SecureStore from "expo-secure-store";
const key = "greenalert.session.v1";
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
// URL del servidor elegida en el dispositivo; no es secreta, pero se guarda junto a la sesión.
const serverKey = "greenalert.server.v1";
export const serverPreference = {
  get: () => SecureStore.getItemAsync(serverKey, options),
  set: (url) => SecureStore.setItemAsync(serverKey, url, options),
};
export const secureSession = {
  async get() {
    const raw = await SecureStore.getItemAsync(key, options);
    return raw ? JSON.parse(raw) : null;
  },
  set(session) {
    return SecureStore.setItemAsync(key, JSON.stringify(session), options);
  },
  clear() {
    return SecureStore.deleteItemAsync(key, options);
  },
};
