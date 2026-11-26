import React, { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import {
  Button,
  Choices,
  Field,
  Loading,
  Notice,
  Page,
  styles,
  useAction,
} from "./ui";
import { reportPayload, validateReport } from "./domain";
const empty = () => ({
  titulo: "",
  descripcion: "",
  direccion: "",
  municipio: "",
  departamento: "",
  tipo_contaminacion: "",
  nivel_severidad: "medio",
  location: null,
});
export function CreateScreen({ client, onCreated }) {
  const [form, setForm] = useState(empty);
  const [files, setFiles] = useState([]);
  const [categories, setCategories] = useState(null);
  const [categoryError, setCategoryError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const action = useAction();
  const [success, setSuccess] = useState(false);
  const set = (key) => (value) => setForm((old) => ({ ...old, [key]: value }));
  useEffect(() => {
    let alive = true;
    client
      .request("/categorias")
      .then((d) => {
        if (alive) setCategories(d.categorias);
      })
      .catch((e) => {
        if (alive) setCategoryError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [attempt, client]);
  async function locate() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        "Permiso de ubicación denegado. Puedes enviar el reporte con su dirección.",
      );
    if (!(await Location.hasServicesEnabledAsync()))
      throw new Error("Activa la ubicación del teléfono.");
    let timer;
    try {
      const result = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error("No se obtuvo ubicación. Reintenta al aire libre."),
              ),
            20000,
          );
        }),
      ]);
      set("location")(result.coords);
    } finally {
      clearTimeout(timer);
    }
  }
  async function pick(camera) {
    if (files.length >= 10) throw new Error("Máximo 10 imágenes.");
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
      throw new Error(
        "Permiso de cámara denegado. Puedes elegir una foto de la galería.",
      );
    const options = {
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
      exif: false,
    };
    // El selector del sistema concede acceso solo al archivo elegido; no pide acceso global a la galería.
    const result = camera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    const file = {
      ...asset,
      fileSize: asset.fileSize ?? new File(asset.uri).size,
    };
    const error = validateReport(
      {
        titulo: "Imagen válida",
        direccion: "Dirección",
        tipo_contaminacion: "validacion",
        nivel_severidad: "medio",
      },
      [file],
    );
    if (error) throw new Error(error);
    setFiles((previous) => [...previous, file]);
  }
  if (success)
    return (
      <Page>
        <Text style={styles.title}>Reporte enviado</Text>
        <Notice text="El servidor confirmó la creación del reporte." />
        <Button title="Consultar mis reportes" onPress={onCreated} />
        <Button
          secondary
          title="Crear otro reporte"
          onPress={() => {
            setSuccess(false);
            setForm(empty());
            setFiles([]);
          }}
        />
      </Page>
    );
  return (
    <Page>
      <Text style={styles.title}>Cuida tu entorno</Text>
      <Text style={styles.muted}>
        Describe el problema ambiental. Ubicación y fotos son opcionales.
      </Text>
      <Field
        label="Título"
        value={form.titulo}
        onChangeText={set("titulo")}
        editable={!action.busy}
        maxLength={200}
        error={
          form.titulo && form.titulo.trim().length < 5
            ? "Mínimo 5 caracteres."
            : ""
        }
      />
      <Field
        label="Descripción"
        value={form.descripcion}
        onChangeText={set("descripcion")}
        editable={!action.busy}
        multiline
      />
      <Field
        label="Dirección"
        value={form.direccion}
        onChangeText={set("direccion")}
        editable={!action.busy}
      />
      <Field
        label="Municipio (opcional)"
        value={form.municipio}
        onChangeText={set("municipio")}
        editable={!action.busy}
      />
      <Field
        label="Departamento (opcional)"
        value={form.departamento}
        onChangeText={set("departamento")}
        editable={!action.busy}
      />
      <Text style={styles.heading}>Categoría</Text>
      {!categories && !categoryError && <Loading />}
      <Notice error text={categoryError} />
      {categoryError && (
        <Button
          title="Reintentar categorías"
          disabled={action.busy}
          onPress={() => {
            setCategories(null);
            setCategoryError("");
            setAttempt((a) => a + 1);
          }}
        />
      )}
      {categories?.length === 0 && (
        <Notice text="No hay categorías disponibles. Intenta más tarde." />
      )}
      <Choices
        values={(categories || []).map((c) => ({
          label: c.nombre,
          value: c.codigo,
        }))}
        value={form.tipo_contaminacion}
        onChange={set("tipo_contaminacion")}
        disabled={action.busy}
      />
      <Text style={styles.heading}>Severidad</Text>
      <Choices
        values={["bajo", "medio", "alto", "critico"].map((v) => ({
          label: v,
          value: v,
        }))}
        value={form.nivel_severidad}
        onChange={set("nivel_severidad")}
        disabled={action.busy}
      />
      <Button
        title="Usar ubicación del teléfono"
        secondary
        disabled={action.busy}
        onPress={() => action.run(locate)}
      />
      {form.location && (
        <>
          <Text style={styles.muted}>
            Latitud {form.location.latitude.toFixed(5)}, longitud{" "}
            {form.location.longitude.toFixed(5)}
          </Text>
          <Button
            title="Quitar ubicación"
            secondary
            disabled={action.busy}
            onPress={() => set("location")(null)}
          />
        </>
      )}
      <Text style={styles.heading}>Evidencias · {files.length}/10</Text>
      <Text style={styles.muted}>
        Imágenes JPEG, PNG o WebP, máximo 10 MB cada una.
      </Text>
      <Button
        title="Tomar foto"
        secondary
        disabled={action.busy}
        onPress={() => action.run(() => pick(true))}
      />
      <Button
        title="Elegir imagen"
        secondary
        disabled={action.busy}
        onPress={() => action.run(() => pick(false))}
      />
      {files.map((f, i) => (
        <View key={`${f.uri}-${i}`} style={styles.card}>
          <Image
            source={{ uri: f.uri }}
            accessibilityLabel={`Evidencia ${i + 1}`}
            style={{ height: 150, width: "100%", resizeMode: "contain" }}
          />
          <Button
            title={`Quitar imagen ${i + 1}`}
            secondary
            disabled={action.busy}
            onPress={() =>
              setFiles((previous) => previous.filter((_, index) => index !== i))
            }
          />
        </View>
      ))}
      <Notice error text={action.error} />
      {action.busy && <Loading />}
      <Button
        title="Enviar reporte"
        disabled={action.busy || !categories?.length}
        onPress={() =>
          action.run(async () => {
            const error = validateReport(form, files);
            if (error) throw new Error(error);
            if (!categories.some((c) => c.codigo === form.tipo_contaminacion))
              throw new Error("Selecciona una categoría disponible.");
            try {
              await client.request("/reportes", {
                method: "POST",
                // Expo 58 serializa File/Blob; el descriptor URI heredado no es un archivo para expo/fetch.
                body: reportPayload(form, files, undefined, (file) => new File(file.uri)),
                multipart: true,
                timeoutMs: 60000,
              });
            } catch (e) {
              if (!e.status)
                throw new Error(
                  `${e.message} Antes de reenviar, revisa Mis reportes para evitar duplicados.`,
                );
              throw e;
            }
            setSuccess(true);
          })
        }
      />
    </Page>
  );
}
