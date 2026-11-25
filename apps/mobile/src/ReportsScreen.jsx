import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Image, Linking, Text, View } from "react-native";
import { Button, Loading, Notice, Page, styles } from "./ui";
export function ReportsScreen({ client, own, entity, onDetail }) {
  const [state, setState] = useState({
    items: [],
    total: 0,
    loading: true,
    error: "",
  });
  const lock = useRef(false);
  const alive = useRef(true);
  const items = useRef([]);
  const load = useCallback(
    async (append = false) => {
      if (lock.current) return;
      lock.current = true;
      try {
        const offset = append ? items.current.length : 0;
        const data = await client.request(
          `${own ? "/reportes/mis-reportes" : "/reportes"}?limit=20&offset=${offset}`,
        );
        if (alive.current) {
          items.current = append
            ? [...items.current, ...data.reportes]
            : data.reportes;
          setState({
            items: items.current,
            total: Number(data.total),
            loading: false,
            error: "",
          });
        }
      } catch (e) {
        if (alive.current)
          setState((s) => ({ ...s, loading: false, error: e.message }));
      } finally {
        lock.current = false;
      }
    },
    [client, own],
  );
  const reload = (append = false) => {
    if (lock.current) return;
    setState((s) => ({ ...s, loading: true, error: "" }));
    return load(append);
  };
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);
  return (
    <View style={styles.page}>
      <FlatList
        contentContainerStyle={styles.content}
        data={state.items}
        keyExtractor={(r) => String(r.id_reporte)}
        refreshing={state.loading}
        onRefresh={() => reload()}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>
              {own
                ? "Mis reportes"
                : entity
                  ? "Reportes asignados"
                  : "Reportes ambientales"}
            </Text>
            <Text style={styles.muted}>
              {state.total} reportes · Desliza para actualizar
            </Text>
            <Notice error text={state.error} />
            {state.error ? (
              <Button
                title="Reintentar"
                onPress={() => reload()}
                disabled={state.loading}
              />
            ) : null}
          </>
        }
        ListEmptyComponent={
          !state.loading && !state.error ? (
            <Text style={styles.text}>Aún no hay reportes para mostrar.</Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.heading}>{item.titulo}</Text>
            <Text style={styles.muted}>
              {item.tipo_contaminacion} ·{" "}
              {String(item.estado).replace(/_/g, " ")}
            </Text>
            <Text style={styles.text}>{item.direccion}</Text>
            <Button
              secondary
              title={`Ver reporte ${item.id_reporte}`}
              onPress={() => onDetail(item.id_reporte)}
            />
          </View>
        )}
        ListFooterComponent={
          state.loading ? (
            <Loading />
          ) : state.items.length < state.total ? (
            <Button title="Cargar más" onPress={() => reload(true)} />
          ) : null
        }
      />
    </View>
  );
}
export function DetailScreen({ client, id, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    client
      .request(`/reportes/${id}`)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, attempt, client]);
  return (
    <Page>
      <Button title="Volver a reportes" secondary onPress={onBack} />
      {!data && !error && <Loading />}
      <Notice error text={error} />
      {error && (
        <Button
          title="Reintentar"
          onPress={() => {
            setError("");
            setData(null);
            setAttempt((x) => x + 1);
          }}
        />
      )}
      {data && (
        <>
          <Text style={styles.title}>{data.reporte.titulo}</Text>
          <View style={styles.card}>
            <Text style={styles.text}>
              {data.reporte.tipo_contaminacion} · {data.reporte.nivel_severidad}
            </Text>
            <Text style={styles.text}>
              Estado: {String(data.reporte.estado).replace(/_/g, " ")}
            </Text>
            <Text style={styles.text}>
              {data.reporte.descripcion || "Sin descripción."}
            </Text>
            <Text style={styles.muted}>
              {[
                data.reporte.direccion,
                data.reporte.municipio,
                data.reporte.departamento,
              ]
                .filter(Boolean)
                .join(", ")}
            </Text>
          </View>
          <Text style={styles.heading}>Evidencias</Text>
          {!data.evidencias?.length && (
            <Text style={styles.muted}>Este reporte no tiene evidencias.</Text>
          )}
          {data.evidencias?.map((e) =>
            /^https:\/\//i.test(e.url_archivo) ? (
              <View key={e.id_evidencia} style={styles.card}>
                {e.tipo_archivo === "imagen" ? (
                  <Image
                    source={{ uri: e.url_archivo }}
                    accessibilityLabel={
                      e.nombre_original || "Evidencia del reporte"
                    }
                    style={{
                      height: 220,
                      width: "100%",
                      resizeMode: "contain",
                    }}
                  />
                ) : (
                  <Button
                    secondary
                    title="Abrir video"
                    onPress={() =>
                      Linking.openURL(e.url_archivo).catch(() =>
                        setError("No se pudo abrir el video."),
                      )
                    }
                  />
                )}
              </View>
            ) : (
              <Text key={e.id_evidencia} style={styles.muted}>
                Evidencia no disponible mediante HTTPS.
              </Text>
            ),
          )}
        </>
      )}
    </Page>
  );
}
