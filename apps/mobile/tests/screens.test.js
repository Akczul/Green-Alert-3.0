import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { AuthScreen } from "../src/AuthScreen";
import { ReportsScreen } from "../src/ReportsScreen";
import { CreateScreen } from "../src/CreateScreen";
import { Button, useAction } from "../src/ui";
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("expo-file-system", () => ({ File: jest.fn() }));
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
test("login nativo muestra validación y éxito; nunca envía correo inválido", async () => {
  const client = { authenticate: jest.fn(async () => ({ nombre: "Ana" })) };
  const onUser = jest.fn();
  await render(<AuthScreen client={client} onUser={onUser} />);
  await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
  expect(await screen.findByText("Introduce un correo válido.")).toBeTruthy();
  expect(client.authenticate).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText("Correo electrónico"),
    "ana@example.org",
  );
  await fireEvent.changeText(screen.getByLabelText("Contraseña"), "contraseña");
  await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
  await waitFor(() => expect(onUser).toHaveBeenCalledWith({ nombre: "Ana" }));
});
test("navega de login a registro y permite regresar", async () => {
  await render(<AuthScreen client={{}} onUser={jest.fn()} />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Crear una cuenta" }),
  );
  expect(screen.getByLabelText("Confirmar contraseña")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Ya tengo una cuenta" }),
  );
  expect(screen.queryByLabelText("Confirmar contraseña")).toBeNull();
});
test("guardia síncrona evita doble envío antes del render", async () => {
  let resolve;
  const action = jest.fn(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  function Test() {
    const { run } = useAction();
    return (
      <Button
        title="Guardar"
        onPress={() => {
          run(action);
        }}
      />
    );
  }
  await render(<Test />);
  const button = screen.getByRole("button");
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(action).toHaveBeenCalledTimes(1);
  resolve();
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
});
test("listado nativo permite abrir detalle y paginar con offset real", async () => {
  const onDetail = jest.fn();
  const client = {
    request: jest
      .fn()
      .mockResolvedValueOnce({
        reportes: [
          {
            id_reporte: 7,
            titulo: "Agua contaminada",
            direccion: "Calle 5",
            estado: "pendiente",
          },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({
        reportes: [{ id_reporte: 8, titulo: "Residuos", estado: "pendiente" }],
        total: 2,
      }),
  };
  await render(<ReportsScreen client={client} onDetail={onDetail} />);
  await fireEvent.press(
    await screen.findByRole("button", { name: "Ver reporte 7" }),
  );
  expect(onDetail).toHaveBeenCalledWith(7);
  await fireEvent.press(screen.getByRole("button", { name: "Cargar más" }));
  await screen.findByText("Residuos");
  expect(client.request).toHaveBeenLastCalledWith(
    "/reportes?limit=20&offset=1",
  );
});
test("listado vacío y fallo recuperable de API", async () => {
  const client = {
    request: jest
      .fn()
      .mockRejectedValueOnce(new Error("Sin red"))
      .mockResolvedValueOnce({ reportes: [], total: 0 }),
  };
  await render(<ReportsScreen client={client} own />);
  expect(await screen.findByText("Sin red")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
  expect(
    await screen.findByText("Aún no hay reportes para mostrar."),
  ).toBeTruthy();
  expect(client.request).toHaveBeenLastCalledWith(
    "/reportes/mis-reportes?limit=20&offset=0",
  );
});
test("ubicación denegada muestra mensaje y no inventa coordenadas", async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({
    granted: false,
  });
  await render(
    <CreateScreen
      client={{ request: jest.fn(async () => ({ categorias: [] })) }}
    />,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Usar ubicación del teléfono" }),
  );
  expect(await screen.findByText(/Permiso de ubicación denegado/)).toBeTruthy();
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
});
test("cámara denegada no captura ni envía evidencia", async () => {
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({
    granted: false,
  });
  await render(
    <CreateScreen
      client={{ request: jest.fn(async () => ({ categorias: [] })) }}
    />,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Tomar foto" }));
  expect(await screen.findByText(/Permiso de cámara denegado/)).toBeTruthy();
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
});

test("alta válida envía multipart y muestra confirmación del servidor", async () => {
  const client = {
    request: jest
      .fn()
      .mockResolvedValueOnce({
        categorias: [{ codigo: "agua", nombre: "Agua" }],
      })
      .mockResolvedValueOnce({ reporte: { id_reporte: 7 } }),
  };
  const onCreated = jest.fn();
  await render(<CreateScreen client={client} onCreated={onCreated} />);
  await screen.findByRole("button", { name: "Agua" });
  await fireEvent.changeText(
    screen.getByLabelText("Título"),
    "Río contaminado",
  );
  await fireEvent.changeText(screen.getByLabelText("Dirección"), "Calle 10");
  await fireEvent.press(screen.getByRole("button", { name: "Agua" }));
  await fireEvent.press(screen.getByRole("button", { name: "Enviar reporte" }));
  expect(await screen.findByText("Reporte enviado")).toBeTruthy();
  expect(client.request).toHaveBeenLastCalledWith(
    "/reportes",
    expect.objectContaining({
      method: "POST",
      multipart: true,
      timeoutMs: 60000,
    }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Consultar mis reportes" }),
  );
  expect(onCreated).toHaveBeenCalledTimes(1);
});
