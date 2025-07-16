
import { z } from "zod";

/**
 * Schema para credenciales de usuario OAuth
 */
export const userCredentialsSchema = z.object({
  accessToken: z.string().nullable().optional(),
  refreshToken: z.string().nullable().optional(),
  expiryDate: z.number().nullable().optional(),
  tokenType: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  idToken: z.string().nullable().optional(),
}).optional();

/**
 * Schema para contexto de usuario (alternativo)
 */
export const userContextSchema = z.object({
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  credentials: userCredentialsSchema,
}).optional();

/**
 * Schema base que incluye campos de autenticación de usuario
 * Usar con .merge() en todos los schemas de herramientas
 */
export const baseUserAuthSchema = z.object({
  // Opción 1: Credenciales directas
  _userCredentials: userCredentialsSchema,
  userCredentials: userCredentialsSchema,
  
  // Opción 2: Contexto de usuario
  _userContext: userContextSchema,
  
  // Campos adicionales opcionales
  userId: z.string().optional(),
  sessionId: z.string().optional(),
});

/**
 * Función helper para agregar soporte de credenciales de usuario a cualquier schema
 */
export function withUserAuth<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.merge(baseUserAuthSchema);
}
