import React, { useState } from "react";
import { Text } from "react-native";
import { Button, Field, Loading, Notice, Page, styles, useAction } from "./ui";
export function Account({ client, user, onUser }) {
  const action = useAction();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  return (
    <Page>
      <Text style={styles.title}>Mi cuenta</Text>
      <Text style={styles.text}>
        {user.nombre} {user.apellido}
      </Text>
      <Text style={styles.muted}>
        {user.email} · {user.rol}
      </Text>
      {!user.email_verificado && (
        <>
          <Notice text="Tu correo está pendiente de verificación." />
          <Field
            label="Código de verificación"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            editable={!action.busy}
          />
          <Button
            title="Verificar correo"
            disabled={action.busy}
            onPress={() =>
              action.run(async () => {
                if (!/^\d{6}$/.test(code))
                  throw new Error("Introduce el código de 6 dígitos.");
                await client.request("/auth/verificar-email", {
                  method: "POST",
                  body: { codigo: code },
                });
                onUser(await client.profile());
                setMessage("Correo verificado.");
              })
            }
          />
          <Button
            title="Reenviar código"
            secondary
            disabled={action.busy}
            onPress={() =>
              action.run(async () => {
                await client.request("/auth/enviar-verificacion", {
                  method: "POST",
                });
                setMessage("Código solicitado. Revisa tu correo.");
              })
            }
          />
        </>
      )}
      <Notice text={message} />
      <Notice error text={action.error} />
      {action.busy && <Loading />}
      <Button
        title="Actualizar permisos"
        secondary
        disabled={action.busy}
        onPress={() => action.run(async () => onUser(await client.profile()))}
      />
      <Button
        title="Cerrar sesión"
        disabled={action.busy}
        onPress={() => action.run(() => client.logout())}
      />
      <Text style={styles.muted}>
        El cierre revoca la renovación en el servidor. Si no hay conexión,
        reintenta cuando vuelva la red.
      </Text>
    </Page>
  );
}
