export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter, getClientSupabaseConfig, saveClientSupabaseConfig, normalizeSupabaseUrl } from "./custom-fetch";
export type { AuthTokenGetter, ClientSupabaseConfig } from "./custom-fetch";
