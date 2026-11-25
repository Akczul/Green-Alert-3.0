import React from "react";
import {
  renderRouter,
  screen,
  fireEvent,
  waitFor,
} from "expo-router/testing-library";
import Layout from "../src/app/_layout";
import Home from "../src/app/index";
import Login from "../src/app/login";
import Reports from "../src/app/reportes";
import Own from "../src/app/propios";
import Create from "../src/app/crear";
import Account from "../src/app/cuenta";
import Detail from "../src/app/reporte/[id]";
const mockClient = {
  restore: jest.fn(),
  request: jest.fn(),
  logout: jest.fn(),
  profile: jest.fn(),
};
jest.mock("../src/api", () => ({ createClient: () => mockClient }));
jest.mock("../src/storage", () => ({ secureSession: {} }));
jest.mock("expo-font", () => ({
  ...jest.requireActual("expo-font"),
  useFonts: () => [true, null],
}));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: () => () => {},
}));
jest.mock("expo-location", () => ({}));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-file-system", () => ({}));
const routes = {
  _layout: Layout,
  index: Home,
  login: Login,
  reportes: Reports,
  propios: Own,
  crear: Create,
  cuenta: Account,
  "reporte/[id]": Detail,
};
beforeEach(() => {
  mockClient.restore.mockResolvedValue({
    nombre: "Ana",
    rol: "ciudadano",
    email_verificado: true,
  });
  mockClient.request.mockResolvedValue({
    reportes: [],
    total: 0,
    categorias: [],
  });
});
test("sin sesión solo permite autenticación", async () => {
  mockClient.restore.mockResolvedValue(null);
  await renderRouter(routes);
  expect(
    await screen.findByRole("button", { name: "Iniciar sesión" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Crear" })).toBeNull();
});
test("navega inicio, reportes propios y cuenta en componentes nativos", async () => {
  await renderRouter(routes);
  expect(await screen.findByText("Hola, Ana")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Mis reportes" }));
  expect(
    await screen.findByText("Aún no hay reportes para mostrar."),
  ).toBeTruthy();
  expect(mockClient.request).toHaveBeenCalledWith(
    "/reportes/mis-reportes?limit=20&offset=0",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Cuenta" }));
  expect(await screen.findByText("Mi cuenta")).toBeTruthy();
});
test("entidad usa alcance de API y menú Asignados", async () => {
  mockClient.restore.mockResolvedValue({
    nombre: "Entidad",
    rol: "entidad",
    email_verificado: true,
  });
  await renderRouter(routes);
  await screen.findByText("Hola, Entidad");
  expect(screen.queryByRole("button", { name: "Reportes" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Asignados" }));
  expect(await screen.findByText("Reportes asignados")).toBeTruthy();
  await waitFor(() =>
    expect(mockClient.request).toHaveBeenCalledWith(
      "/reportes?limit=20&offset=0",
    ),
  );
});
test("enlace profundo a detalle sin sesión vuelve al acceso sin consultar objetos", async () => {
  mockClient.restore.mockResolvedValue(null);
  await renderRouter(routes, { initialUrl: "/reporte/17" });
  expect(
    await screen.findByRole("button", { name: "Iniciar sesión" }),
  ).toBeTruthy();
  expect(mockClient.request).not.toHaveBeenCalled();
});
test("enlace profundo de rol desconocido no abre objetos", async () => {
  mockClient.restore.mockResolvedValue({ nombre: "Desconocido", rol: "root" });
  await renderRouter(routes, { initialUrl: "/reporte/17" });
  expect(
    await screen.findByText(/Tu cuenta no tiene un rol habilitado/),
  ).toBeTruthy();
  expect(mockClient.request).not.toHaveBeenCalled();
});
