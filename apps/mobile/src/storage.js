import * as SecureStore from "expo-secure-store";
const key = "greenalert.session.v1";
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
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
