export const colors = {
  background: "#030712",
  surface: "#111827",
  border: "#374151",
  primary: "#22c55e",
  text: "#f0fdf4",
  muted: "#9ca3af",
  error: "#fca5a5",
};
export const roles = ["ciudadano", "moderador", "admin", "entidad"];
export function destinations(user) {
  if (!roles.includes(user?.rol) || user.activo === false || user.activo === 0)
    return [];
  return [
    "Inicio",
    user.rol === "entidad" ? "Asignados" : "Reportes",
    "Crear",
    "Mis reportes",
    "Cuenta",
  ];
}
export function canVisit(user, route) {
  return (
    destinations(user).includes(route) ||
    (route === "Detalle" && destinations(user).length > 0)
  );
}
export function validateAuth(form, register = false) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    return "Introduce un correo válido.";
  if (!form.password) return "Introduce tu contraseña.";
  if (register) {
    if (form.nombre.trim().length < 2 || form.apellido.trim().length < 2)
      return "Nombre y apellido: mínimo 2 caracteres.";
    if (form.password.length < 15)
      return "Usa una frase de al menos 15 caracteres.";
    if (form.password !== form.confirmar)
      return "Las contraseñas no coinciden.";
  }
  return null;
}
export function validateReport(form, files = []) {
  if (form.titulo.trim().length < 5)
    return "El título debe tener al menos 5 caracteres.";
  if (form.direccion.trim().length < 3)
    return "Introduce una dirección válida.";
  if (!form.tipo_contaminacion) return "Selecciona una categoría.";
  if (!["bajo", "medio", "alto", "critico"].includes(form.nivel_severidad))
    return "Selecciona la severidad.";
  if (files.length > 10) return "Máximo 10 evidencias.";
  if (
    files.some(
      (f) =>
        !["image/jpeg", "image/png", "image/webp"].includes(f.mimeType) ||
        !Number.isFinite(f.fileSize) ||
        f.fileSize <= 0 ||
        f.fileSize > 10 * 1024 * 1024,
    )
  )
    return "Cada imagen debe ser JPEG, PNG o WebP y pesar hasta 10 MB.";
  if (
    form.location &&
    (!Number.isFinite(form.location.latitude) ||
      Math.abs(form.location.latitude) > 90 ||
      !Number.isFinite(form.location.longitude) ||
      Math.abs(form.location.longitude) > 180)
  )
    return "La ubicación no es válida.";
  return null;
}
export function reportPayload(
  form,
  files,
  create = () => new FormData(),
  filePart = (file, index) => ({
    uri: file.uri,
    type: file.mimeType,
    name: file.fileName || `evidencia-${index}.jpg`,
  }),
) {
  const body = create();
  for (const key of [
    "titulo",
    "descripcion",
    "direccion",
    "municipio",
    "departamento",
    "tipo_contaminacion",
    "nivel_severidad",
  ])
    if (form[key]?.trim()) body.append(key, form[key].trim());
  if (form.location) {
    body.append("latitud", String(form.location.latitude));
    body.append("longitud", String(form.location.longitude));
  }
  files.forEach((f, index) =>
    body.append("files", filePart(f, index)),
  );
  return body;
}
export function singleFlight(action) {
  let pending;
  return (...args) =>
    pending ||
    (pending = Promise.resolve()
      .then(() => action(...args))
      .finally(() => {
        pending = undefined;
      }));
}
export function validateApiUrl(input, allowHttp = false) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Configura EXPO_PUBLIC_API_URL con una URL absoluta.");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["https:", "http:"].includes(url.protocol)
  )
    throw new Error(
      "La URL de API no debe contener credenciales, parámetros ni fragmentos.",
    );
  if (["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname))
    throw new Error(
      "Usa la IP LAN o dominio del servidor, accesible desde el teléfono.",
    );
  if (url.protocol !== "https:" && !allowHttp)
    throw new Error(
      "La API requiere HTTPS; HTTP solo se permite en el perfil local explícito.",
    );
  return input.replace(/\/+$/, "");
}
