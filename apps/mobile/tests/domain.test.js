import {
  destinations,
  canVisit,
  validateAuth,
  validateReport,
  reportPayload,
  singleFlight,
  validateApiUrl,
} from "../src/domain";
const auth = {
  email: "ana@example.org",
  password: "una frase segura muy larga",
  nombre: "Ana",
  apellido: "Pérez",
  confirmar: "una frase segura muy larga",
};
const report = {
  titulo: "Río contaminado",
  direccion: "Calle 10",
  tipo_contaminacion: "agua",
  nivel_severidad: "alto",
};
test("registro acepta frases de más de 64 caracteres sin truncar", () =>
  expect(
    validateAuth(
      { ...auth, password: "x".repeat(100), confirmar: "x".repeat(100) },
      true,
    ),
  ).toBeNull());
test("registro requiere 15 caracteres y confirmación", () => {
  expect(validateAuth({ ...auth, password: "corta" }, true)).toMatch(/15/);
  expect(validateAuth({ ...auth, confirmar: "otra" }, true)).toMatch(
    /coinciden/,
  );
});
test("acceso valida email sin imponer política nueva a cuentas existentes", () => {
  expect(validateAuth({ ...auth, email: "mal" })).toMatch(/correo/);
  expect(validateAuth({ ...auth, password: "legacy" })).toBeNull();
});
test.each(["ciudadano", "moderador", "admin"])(
  "navegación de %s no expone acciones administrativas",
  (rol) => {
    expect(destinations({ rol })).toContain("Crear");
    expect(canVisit({ rol }, "Admin")).toBe(false);
  },
);
test("entidad muestra asignados y bloquea navegación pública incorrecta", () => {
  expect(destinations({ rol: "entidad" })).toContain("Asignados");
  expect(canVisit({ rol: "entidad" }, "Reportes")).toBe(false);
});
test("usuarios desconocidos o inactivos no acceden a detalle", () => {
  expect(canVisit({ rol: "root" }, "Detalle")).toBe(false);
  expect(destinations({ rol: "admin", activo: false })).toEqual([]);
});
test("valida campos requeridos y coordenadas reales", () => {
  expect(validateReport(report)).toBeNull();
  expect(validateReport({ ...report, titulo: "x" })).toMatch(/título/);
  expect(
    validateReport({ ...report, location: { latitude: 91, longitude: 0 } }),
  ).toMatch(/ubicación/);
});
test("rechaza evidencia sin tamaño, demasiado grande o de tipo no admitido", () => {
  for (const file of [
    { mimeType: "image/jpeg" },
    { mimeType: "image/jpeg", fileSize: 11000000 },
    { mimeType: "text/html", fileSize: 1 },
  ])
    expect(validateReport(report, [file])).toMatch(/imagen/);
});
test("multipart conserva nombres files, latitud y longitud", () => {
  const append = jest.fn();
  reportPayload(
    { ...report, location: { latitude: 1, longitude: -73 } },
    [{ uri: "file:///foto.jpg", mimeType: "image/jpeg" }],
    () => ({ append }),
  );
  expect(append).toHaveBeenCalledWith("longitud", "-73");
  expect(append).toHaveBeenCalledWith(
    "files",
    expect.objectContaining({ uri: "file:///foto.jpg", type: "image/jpeg" }),
  );
});
test("doble pulsación comparte una sola operación", async () => {
  const fn = jest.fn(async () => 1);
  const once = singleFlight(fn);
  await Promise.all([once(), once()]);
  expect(fn).toHaveBeenCalledTimes(1);
  await once();
  expect(fn).toHaveBeenCalledTimes(2);
});
test("URL prohíbe loopback, credenciales y HTTP implícito", () => {
  for (const url of [
    "http://localhost:3000/api",
    "https://user:secret@api.org",
    "http://192.168.1.2:3000/api",
  ])
    expect(() => validateApiUrl(url)).toThrow();
  expect(validateApiUrl("http://192.168.1.2:3000/api/", true)).toBe(
    "http://192.168.1.2:3000/api",
  );
});
