import * as SecureStore from "expo-secure-store";
import { secureSession } from "../src/storage";
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
}));
test("persistencia de sesión usa SecureStore con accesibilidad restringida", async () => {
  const session = { accessToken: "acceso", refreshToken: "renovacion" };
  await secureSession.set(session);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    "greenalert.session.v1",
    JSON.stringify(session),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  );
});
test("recupera y elimina la misma entrada segura", async () => {
  SecureStore.getItemAsync.mockResolvedValue(
    JSON.stringify({ accessToken: "acceso" }),
  );
  expect(await secureSession.get()).toEqual({ accessToken: "acceso" });
  await secureSession.clear();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
    "greenalert.session.v1",
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  );
});
