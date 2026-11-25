import { jwtDecode } from "jwt-decode";
import { validateApiUrl } from "./domain";

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}
// Único punto de adaptación al contrato de seguridad. Nunca persiste contraseñas.
export function createClient({
  baseUrl,
  allowHttp = false,
  storage,
  fetcher = fetch,
  onExpired = () => {},
  now = Date.now,
  timeout = 15000,
}) {
  let session = null,
    refreshing = null,
    generation = 0;
  let writes = Promise.resolve();
  const persist = (value) => {
    writes = writes
      .catch(() => {})
      .then(() => (value ? storage.set(value) : storage.clear()));
    return writes;
  };
  const clear = async () => {
    generation++;
    session = null;
    try {
      await persist(null);
    } finally {
      onExpired();
    }
  };
  async function wire(
    path,
    {
      method = "GET",
      body,
      token,
      multipart = false,
      timeoutMs = timeout,
    } = {},
  ) {
    const url = validateApiUrl(baseUrl, allowHttp);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${url}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(!multipart && body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new ApiError(
          "El servidor devolvió una respuesta no válida.",
          response.status,
        );
      }
      if (!response.ok)
        throw new ApiError(
          payload.message || `Error HTTP ${response.status}`,
          response.status,
        );
      return payload.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        controller.signal.aborted
          ? "Tiempo de espera agotado. Comprueba tu conexión."
          : "No hay conexión con el servidor. Comprueba la red e intenta de nuevo.",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  function normalize(data, previous = {}) {
    const next = {
      accessToken: data?.accessToken || data?.token,
      refreshToken: data?.refreshToken || previous.refreshToken,
      user: data?.user || previous.user,
    };
    if (
      typeof next.accessToken !== "string" ||
      !next.accessToken ||
      typeof next.refreshToken !== "string" ||
      !next.refreshToken ||
      !next.user ||
      typeof next.user.rol !== "string"
    )
      throw new ApiError(
        "Contrato de sesión incompleto. Revisa la integración de seguridad.",
      );
    return next;
  }
  async function refresh() {
    if (!refreshing) {
      const version = generation,
        previous = session;
      refreshing = (async () => {
        if (!previous?.refreshToken) {
          await clear();
          throw new ApiError("Inicia sesión de nuevo.", 401);
        }
        try {
          const data = await wire("/auth/refresh", {
            method: "POST",
            body: { refreshToken: previous.refreshToken },
          });
          if (version !== generation)
            throw new ApiError(
              "La sesión cambió. Inicia sesión de nuevo.",
              401,
            );
          const next = normalize(data, previous);
          await persist(next);
          session = next;
        } catch (error) {
          if (version === generation && [400, 401, 403].includes(error.status))
            await clear();
          throw error;
        }
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }
  async function request(path, options = {}) {
    if (!session) throw new ApiError("Inicia sesión de nuevo.", 401);
    const version = generation;
    const current = (value) => {
      if (version !== generation)
        throw new ApiError("La sesión cambió. Inicia sesión de nuevo.", 401);
      return value;
    };
    let exp = 0;
    try {
      exp = jwtDecode(session.accessToken).exp || 0;
    } catch {
      /* El servidor verifica el JWT. */
    }
    if (!exp || exp * 1000 - now() < 120000) await refresh();
    try {
      return current(
        await wire(path, { ...options, token: session.accessToken }),
      );
    } catch (error) {
      if (version !== generation || error.status !== 401) throw error;
      await refresh();
      // No repetir escrituras: una respuesta perdida puede ocultar un alta persistida.
      if (options.method && options.method !== "GET")
        throw new ApiError(
          "Sesión renovada. Revisa tus reportes antes de volver a enviar.",
          401,
        );
      try {
        return current(
          await wire(path, { ...options, token: session.accessToken }),
        );
      } catch (retryError) {
        if (version === generation && retryError.status === 401) await clear();
        throw retryError;
      }
    }
  }
  return {
    request,
    async authenticate(form, register) {
      const data = await wire(register ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: {
          email: form.email.trim().toLowerCase(),
          password: form.password,
          ...(register
            ? { nombre: form.nombre.trim(), apellido: form.apellido.trim() }
            : {}),
        },
      });
      const next = normalize(data);
      generation++;
      await persist(next);
      session = next;
      return next.user;
    },
    async restore() {
      session = await storage.get();
      if (!session) return null;
      const data = await request("/auth/perfil");
      if (!data?.user || typeof data.user.rol !== "string")
        throw new ApiError(
          "Perfil de usuario no válido. Revisa la integración de seguridad.",
        );
      session = { ...session, user: data.user };
      await persist(session);
      return data.user;
    },
    async profile() {
      const data = await request("/auth/perfil");
      if (!data?.user || typeof data.user.rol !== "string")
        throw new ApiError(
          "Perfil de usuario no válido. Revisa la integración de seguridad.",
        );
      return data.user;
    },
    async logout() {
      // Mantener la sesión si no se confirma la revocación remota permite reintentar.
      if (refreshing) await refreshing;
      await wire("/auth/logout", {
        method: "POST",
        body: { refreshToken: session?.refreshToken, allDevices: false },
      });
      await clear();
    },
  };
}
