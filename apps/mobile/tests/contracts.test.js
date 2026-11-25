import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const backend = resolve(__dirname, "../../backend");
const spec = readFileSync(resolve(backend, "docs/openapi.yaml"), "utf8");
const auth = readFileSync(resolve(backend, "routes/auth.routes.js"), "utf8");
const reports = readFileSync(
  resolve(backend, "routes/reporte.routes.js"),
  "utf8",
);
const categories = readFileSync(
  resolve(backend, "routes/categoria-riesgo.routes.js"),
  "utf8",
);
test.each([
  ["post", "/auth/login", auth, "/login"],
  ["post", "/auth/register", auth, "/register"],
  ["post", "/auth/refresh", auth, "/refresh"],
  ["post", "/auth/logout", auth, "/logout"],
  ["get", "/auth/perfil", auth, "/perfil"],
  ["post", "/auth/enviar-verificacion", auth, "/enviar-verificacion"],
  ["post", "/auth/verificar-email", auth, "/verificar-email"],
  ["get", "/reportes", reports, "/"],
  ["post", "/reportes", reports, "/"],
  ["get", "/reportes/mis-reportes", reports, "/mis-reportes"],
  ["get", "/reportes/{id}", reports, "/:id"],
  ["get", "/categorias", categories, "/"],
])(
  "%s %s existe en Express y OpenAPI de este checkout",
  (method, path, router, local) => {
    const block = spec.split(`\n  ${path}:`)[1]?.split(/\n  \/[^ ]/)[0];
    expect(block).toBeDefined();
    expect(block).toContain(`\n    ${method}:`);
    expect(router).toMatch(
      new RegExp(
        `Router\\.${method}\\(\\s*['"]${local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`,
      ),
    );
  },
);
