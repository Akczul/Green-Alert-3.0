import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { colors as c } from "./domain";
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { color: c.text, fontSize: 28, fontFamily: "InterBold" },
  heading: { color: c.text, fontSize: 20, fontFamily: "InterBold" },
  text: { color: c.text, fontSize: 16, fontFamily: "Inter" },
  muted: { color: c.muted, fontSize: 14, fontFamily: "Inter" },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    padding: 18,
    borderRadius: 18,
    gap: 10,
  },
  input: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 14,
    color: c.text,
    fontSize: 16,
    minHeight: 50,
    fontFamily: "Inter",
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
export function Page({ children }) {
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Button({ title, onPress, disabled, secondary = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: 12,
        padding: 14,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: secondary ? c.surface : c.primary,
        borderWidth: 1,
        borderColor: secondary ? c.border : c.primary,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "InterBold",
          fontSize: 15,
          color: secondary ? c.text : "#052e16",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, value, onChangeText, error, ...props }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.text}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={c.muted}
        style={styles.input}
        {...props}
      />
      {error ? <Notice error text={error} /> : null}
    </View>
  );
}
export function Notice({ text, error }) {
  return text ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.text, { color: error ? c.error : c.primary }]}
    >
      {text}
    </Text>
  ) : null;
}
export function Loading() {
  return (
    <ActivityIndicator
      accessibilityLabel="Cargando"
      color={c.primary}
      size="large"
    />
  );
}
export function Choices({ values, value, onChange, disabled }) {
  return (
    <View style={styles.row}>
      {values.map((item) => (
        <Button
          key={item.value}
          title={`${value === item.value ? "✓ " : ""}${item.label}`}
          secondary={value !== item.value}
          disabled={disabled}
          onPress={() => onChange(item.value)}
        />
      ))}
    </View>
  );
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message || "No se pudo completar la operación.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
