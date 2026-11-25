import React, { useState } from "react";
import { Image, Text } from "react-native";
import { Button, Field, Loading, Notice, Page, styles, useAction } from "./ui";
import { validateAuth } from "./domain";
export function AuthScreen({ client, onUser }) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    nombre: "",
    apellido: "",
    confirmar: "",
  });
  const action = useAction();
  const [attempted, setAttempted] = useState(false);
  const set = (key) => (value) => setForm((old) => ({ ...old, [key]: value }));
  return (
    <Page>
      <Image
        source={require("../assets/logo.png")}
        accessibilityLabel="GreenAlert"
        style={{ width: "100%", height: 100, resizeMode: "contain" }}
      />
      <Text style={styles.title}>
        {register ? "Crea tu cuenta" : "Bienvenido a GreenAlert"}
      </Text>
      <Text style={styles.muted}>Tu comunidad, un ambiente mejor.</Text>
      {register && (
        <>
          <Field
            label="Nombre"
            error={
              attempted && form.nombre.trim().length < 2
                ? "Mínimo 2 caracteres."
                : ""
            }
            value={form.nombre}
            onChangeText={set("nombre")}
            autoComplete="given-name"
            editable={!action.busy}
          />
          <Field
            label="Apellido"
            error={
              attempted && form.apellido.trim().length < 2
                ? "Mínimo 2 caracteres."
                : ""
            }
            value={form.apellido}
            onChangeText={set("apellido")}
            autoComplete="family-name"
            editable={!action.busy}
          />
        </>
      )}
      <Field
        label="Correo electrónico"
        error={
          attempted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
            ? "Revisa este correo."
            : ""
        }
        value={form.email}
        onChangeText={set("email")}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        editable={!action.busy}
      />
      <Field
        label="Contraseña"
        error={
          attempted &&
          (!form.password || (register && form.password.length < 15))
            ? "Revisa la contraseña."
            : ""
        }
        value={form.password}
        onChangeText={set("password")}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={register ? "new-password" : "current-password"}
        editable={!action.busy}
      />
      {register && (
        <>
          <Text style={styles.muted}>
            Mínimo 15 caracteres. Puedes usar una frase larga.
          </Text>
          <Field
            label="Confirmar contraseña"
            error={
              attempted && form.confirmar !== form.password
                ? "Las contraseñas no coinciden."
                : ""
            }
            value={form.confirmar}
            onChangeText={set("confirmar")}
            secureTextEntry
            editable={!action.busy}
          />
        </>
      )}
      <Notice error text={action.error} />
      {action.busy && <Loading />}
      <Button
        title={register ? "Registrarme" : "Iniciar sesión"}
        disabled={action.busy}
        onPress={() =>
          action.run(async () => {
            setAttempted(true);
            const error = validateAuth(form, register);
            if (error) throw new Error(error);
            onUser(await client.authenticate(form, register));
            setForm({
              email: "",
              password: "",
              confirmar: "",
              nombre: "",
              apellido: "",
            });
          })
        }
      />
      <Button
        secondary
        title={register ? "Ya tengo una cuenta" : "Crear una cuenta"}
        disabled={action.busy}
        onPress={() => {
          setRegister(!register);
          setAttempted(false);
          action.setError("");
        }}
      />
    </Page>
  );
}
