import { createClient } from "../src/api";
const token = (exp) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
const user = { nombre: "Ana", rol: "ciudadano" };
const session = {
  accessToken: token(9999999999),
  refreshToken: "r".repeat(64),
  user,
};
const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });
const fail = (status) => ({
  ok: false,
  status,
  json: async () => ({ message: `Error ${status}` }),
});

test("revocación 403 del contrato final limpia SecureStore cuando refresh es rechazado", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(ok({ user }));
  await f.client.restore();
  f.fetcher.mockResolvedValueOnce({ ok: false, status: 403,
    json: async () => ({ message: "token inválido o expirado." }) });
  f.fetcher.mockResolvedValueOnce(fail(401));
  await expect(f.client.request("/reportes/mis-reportes")).rejects.toMatchObject({ status: 401 });
  expect(f.storage.clear).toHaveBeenCalled();
});

test("permiso 403 de un objeto conserva sesión y no intenta renovarla", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(ok({ user }));
  await f.client.restore();
  f.fetcher.mockResolvedValueOnce(fail(403));
  await expect(f.client.request("/admin/usuarios")).rejects.toMatchObject({ status: 403 });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(f.storage.clear).not.toHaveBeenCalled();
});
test("el servidor elegido en el dispositivo se valida y no cambia con sesión abierta", async () => {
  const f = fixture();
  expect(() => f.client.useServer("http://localhost:8080/api")).toThrow();
  expect(() => f.client.useServer("http://192.168.1.20:8080/api")).toThrow(/HTTPS/);
  expect(f.client.useServer("https://lab.example.org/api/")).toBe("https://lab.example.org/api");
  f.fetcher.mockResolvedValueOnce(ok({ user }));
  await f.client.restore();
  expect(f.fetcher.mock.calls[0][0]).toBe("https://lab.example.org/api/auth/perfil");
  expect(() => f.client.useServer("https://otro.example.org/api")).toThrow(/Cierra sesión/);
});
function fixture(saved = session, fetcher = jest.fn()) {
  const storage = {
    get: jest.fn(async () => saved),
    set: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
  const onExpired = jest.fn();
  const client = createClient({
    baseUrl: "https://api.example.org/api",
    storage,
    fetcher,
    onExpired,
  });
  return { client, storage, fetcher, onExpired };
}
test("recupera perfil y envía bearer sin credenciales en URL", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValue(ok({ user }));
  expect(await f.client.restore()).toEqual(user);
  expect(f.fetcher.mock.calls[0][0]).toBe(
    "https://api.example.org/api/auth/perfil",
  );
  expect(f.fetcher.mock.calls[0][1].headers.Authorization).toBe(
    `Bearer ${session.accessToken}`,
  );
});
test("login normaliza contrato token legado y no guarda password", async () => {
  const f = fixture(null);
  f.fetcher.mockResolvedValue(
    ok({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      user,
    }),
  );
  await f.client.authenticate(
    { email: " ANA@EXAMPLE.ORG ", password: "secreto" },
    false,
  );
  expect(f.storage.set).toHaveBeenCalledWith(session);
  expect(JSON.stringify(f.storage.set.mock.calls)).not.toContain("secreto");
});
test("restauración sin credenciales no toca la red", async () => {
  const f = fixture(null);
  expect(await f.client.restore()).toBeNull();
  expect(f.fetcher).not.toHaveBeenCalled();
});
test("rechazo de login no persiste sesión", async () => {
  const f = fixture(null);
  f.fetcher.mockResolvedValue(fail(401));
  await expect(
    f.client.authenticate({ email: "a@b.co", password: "mala" }),
  ).rejects.toMatchObject({ status: 401 });
  expect(f.storage.set).not.toHaveBeenCalled();
});
test("renovaciones concurrentes se agrupan y persisten rotación", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(ok({ user }));
  await f.client.restore();
  f.fetcher.mockImplementation(async (url) =>
    url.endsWith("/refresh")
      ? ok({ accessToken: session.accessToken, refreshToken: "nuevo" })
      : f.fetcher.mock.calls.filter(([u]) => u.endsWith("/refresh")).length
        ? ok({ reportes: [] })
        : fail(401),
  );
  await Promise.all([
    f.client.request("/reportes"),
    f.client.request("/reportes"),
  ]);
  expect(
    f.fetcher.mock.calls.filter(([u]) => u.endsWith("/refresh")),
  ).toHaveLength(1);
  expect(f.storage.set).toHaveBeenLastCalledWith({
    ...session,
    refreshToken: "nuevo",
  });
});
test("sesión caducada renueva antes de enviar multipart", async () => {
  const f = fixture({ ...session, accessToken: token(1) });
  f.fetcher.mockImplementation(async (url) =>
    url.endsWith("/refresh") ? ok(session) : ok({ user }),
  );
  await f.client.restore();
  expect(f.fetcher.mock.calls[0][0]).toMatch(/refresh$/);
});
test("refresh revocado borra almacenamiento y comunica expiración", async () => {
  const f = fixture({ ...session, accessToken: token(1) });
  f.fetcher.mockResolvedValue(fail(401));
  await expect(f.client.restore()).rejects.toMatchObject({ status: 401 });
  expect(f.storage.clear).toHaveBeenCalled();
  expect(f.onExpired).toHaveBeenCalled();
});
test("conexión perdida no borra credenciales recuperables", async () => {
  const f = fixture();
  f.fetcher.mockRejectedValue(new TypeError("Network request failed"));
  await expect(f.client.restore()).rejects.toThrow(/conexión/);
  expect(f.storage.clear).not.toHaveBeenCalled();
});
test("timeout aborta petición", async () => {
  jest.useFakeTimers();
  const f = fixture();
  f.fetcher.mockImplementation(
    (url, options) =>
      new Promise((resolve, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(new Error("abort")),
        ),
      ),
  );
  const result = f.client.restore();
  const assertion = expect(result).rejects.toThrow(/espera/);
  await jest.advanceTimersByTimeAsync(16000);
  await assertion;
  jest.useRealTimers();
});
test("logout revoca refresh antes de borrar sesión local", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValue(ok({ user }));
  await f.client.restore();
  await f.client.logout();
  expect(f.fetcher.mock.calls.at(-1)[0]).toMatch(/auth\/logout$/);
  expect(JSON.parse(f.fetcher.mock.calls.at(-1)[1].body)).toEqual({
    refreshToken: session.refreshToken,
    allDevices: false,
  });
  expect(f.storage.clear).toHaveBeenCalled();
});
test("logout offline informa fallo y permite reintentar revocación", async () => {
  const f = fixture();
  f.fetcher
    .mockResolvedValueOnce(ok({ user }))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(ok({}));
  await f.client.restore();
  await expect(f.client.logout()).rejects.toThrow(/conexión/);
  expect(f.storage.clear).not.toHaveBeenCalled();
  await f.client.logout();
  expect(f.storage.clear).toHaveBeenCalled();
});
test("403 no intenta renovar ni eleva permisos", async () => {
  const f = fixture();
  f.fetcher
    .mockResolvedValueOnce(ok({ user }))
    .mockResolvedValueOnce(fail(403));
  await f.client.restore();
  await expect(f.client.request("/reportes/7")).rejects.toMatchObject({
    status: 403,
  });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
test("POST no se reenvía automáticamente tras 401", async () => {
  const f = fixture();
  f.fetcher
    .mockResolvedValueOnce(ok({ user }))
    .mockResolvedValueOnce(fail(401))
    .mockResolvedValueOnce(ok(session));
  await f.client.restore();
  await expect(
    f.client.request("/reportes", { method: "POST", body: {} }),
  ).rejects.toThrow(/revisa/i);
  expect(
    f.fetcher.mock.calls.filter(([u]) => u.endsWith("/reportes")),
  ).toHaveLength(1);
});
test("respuesta inválida informa fallo de servidor", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error();
    },
  });
  await expect(f.client.restore()).rejects.toThrow(/respuesta no válida/);
});

test("respuesta de perfil pendiente no restaura la identidad tras logout", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(ok({ user }));
  await f.client.restore();
  let complete;
  f.fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const pending = f.client.profile();
  f.fetcher.mockResolvedValueOnce(ok({}));
  await f.client.logout();
  complete(ok({ user }));
  await expect(pending).rejects.toMatchObject({ status: 401 });
  expect(f.storage.clear).toHaveBeenCalled();
});
