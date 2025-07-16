# 🚀 PROMPT COMPLETO: Implementación de Autenticación de Usuario Sin Estado (Stateless) para Servidores MCP

## 🎯 INSTRUCCIONES PARA EL LLM

**ERES UN EXPERTO EN DESARROLLO DE SERVIDORES MCP CON AUTENTICACIÓN STATELESS**

Tu tarea es implementar un sistema completo de autenticación de usuario sin estado para un servidor MCP existente, incluyendo:

1. **Código del servidor** (UserCredentialsManager, AuthenticationMiddleware, schemas)
2. **Configuración Docker** completa para desarrollo y producción
3. **Scripts de deployment** para Google Cloud Run
4. **Clientes de ejemplo** funcionales (Python, Node.js, Firebase)
5. **Documentación completa** con troubleshooting
6. **Configuración de Secret Manager** y variables de entorno
7. **Logging y monitoring** estructurado
8. **Scripts de verificación** end-to-end

## 📋 CONTEXTO DEL PROBLEMA

Necesito transformar un servidor MCP existente para que use autenticación **completamente sin estado (stateless)** donde:

- **El servidor NO almacena credenciales** en memoria, base de datos, o archivos
- **El cliente envía credenciales OAuth** con cada request en `arguments._userCredentials`
- **Cada request es independiente** - no hay estado entre llamadas
- **OAuth clients se crean frescos** para cada request y se descartan
- **Sistema escalable** - soporte para miles de usuarios simultáneos
- **Compatible con Google Cloud Run** - auto-scaling horizontal
- **Soporte para Firebase Auth** (opcional) - tokens de Firebase + OAuth
- **Docker ready** - contenedores optimizados para producción

## 🎯 OBJETIVO FINAL

Crear un servidor MCP que funcione con este flujo:

1. **Cliente obtiene tokens OAuth** (Google, GitHub, etc.) independientemente
2. **Cliente incluye credenciales** en cada llamada MCP: `arguments._userCredentials`
3. **Servidor extrae credenciales** del request usando AuthenticationMiddleware
4. **Servidor crea OAuth client fresco** para esta request específica
5. **Servidor ejecuta herramienta** con el OAuth client temporal
6. **OAuth client se descarta** automáticamente (garbage collection)
7. **Servidor retorna resultado** - sin mantener estado alguno

## 🏗️ Arquitectura Objetivo

```
┌─────────────────┐    ┌─────────────────────────────────────┐    ┌─────────────────┐
│     Cliente     │    │           Servidor MCP              │    │   API Externa   │
│                 │    │                                     │    │  (Google, etc)  │
├─────────────────┤    ├─────────────────────────────────────┤    ├─────────────────┤
│ 1. Obtiene      │    │ 4. Extrae credenciales del request │    │ 7. Procesa      │
│    OAuth tokens │───▶│ 5. Crea OAuth client fresco        │───▶│    llamada API  │
│                 │    │ 6. Ejecuta herramienta MCP         │    │                 │
│ 2. Envía        │    │                                     │    │ 8. Retorna      │
│    credentials  │    │ 9. Descarta OAuth client           │◀───│    respuesta    │
│    con request  │    │10. Retorna resultado al cliente    │    │                 │
│                 │    │                                     │    │                 │
│ 3. Recibe       │◀───│ ❌ NO MANTIENE ESTADO              │    │                 │
│    respuesta    │    │                                     │    │                 │
└─────────────────┘    └─────────────────────────────────────┘    └─────────────────┘
```

## 🔧 Componentes a Implementar/Refactorizar

### 1. **UserCredentialsManager** (Gestiona credenciales sin estado)

```typescript
export interface UserCredentials {
  accessToken: string;
  refreshToken: string;
  expiryDate?: number;
  tokenType?: string;
  scope?: string;
  idToken?: string;
}

export class UserCredentialsManager {
  // ✅ Crear OAuth client (SIEMPRE nueva instancia, sin caché)
  createUserOAuthClient(userCredentials: UserCredentials, baseOAuthClient: any): any
  
  // ✅ Validar credenciales requeridas
  validateCredentials(credentials: UserCredentials): void
  
  // ✅ Verificar expiración de token
  isTokenExpired(credentials: UserCredentials): boolean
  
  // ❌ NO IMPLEMENTAR: métodos de caché, estado, o persistencia
}
```

### 2. **AuthenticationMiddleware** (Intercepta requests y maneja auth)

```typescript
export class AuthenticationMiddleware {
  constructor(
    private userCredentialsManager: UserCredentialsManager,
    private baseOAuthClient: any
  ) {}

  async executeWithUserAuth(request: any, handler: any): Promise<any> {
    // 1. Extraer credenciales del request
    const credentials = this.userCredentialsManager.extractUserCredentials(request.params.arguments);

    // 2. Validar credenciales
    this.userCredentialsManager.validateCredentials(credentials);

    // 3. Crear OAuth client fresco
    const oauthClient = this.userCredentialsManager.createUserOAuthClient(credentials, this.baseOAuthClient);

    // 4. Ejecutar herramienta con OAuth client
    const result = await handler.runTool(request.params.arguments, oauthClient);

    // 5. Retornar resultado
    return result;
  }
}
```

### 3. **Configuración del Servidor Principal**

```typescript
export class MainMcpServer {
  private useUserAuth: boolean;
  private userCredentialsManager?: UserCredentialsManager;
  private authMiddleware?: AuthenticationMiddleware;

  async executeWithHandler(handler: any, args: any): Promise<any> {
    if (this.useUserAuth && this.authMiddleware) {
      // Usar autenticación basada en credenciales del cliente
      return await this.authMiddleware.executeWithUserAuth(request, handler);
    }
    
    // Fallback a autenticación tradicional del servidor
    return await handler.runTool(args, this.traditionalOAuthClient);
  }
}
```

## 📝 Ejemplos de Clientes Funcionales

### Cliente Python Completo

```python
#!/usr/bin/env python3
import json
import requests
import os
from pathlib import Path

class MCPClient:
    def __init__(self, server_url, token_file):
        self.server_url = server_url
        self.token_file = token_file
        self.credentials = self._load_credentials()
    
    def _load_credentials(self):
        """Cargar credenciales desde archivo de tokens"""
        if not os.path.exists(self.token_file):
            raise FileNotFoundError(f"Token file not found: {self.token_file}")
        
        with open(self.token_file, 'r') as f:
            tokens = json.load(f)
        
        # Manejar estructura anidada
        user_tokens = tokens.get('normal', tokens)
        
        return {
            "accessToken": user_tokens.get('access_token'),
            "refreshToken": user_tokens.get('refresh_token'),
            "expiryDate": user_tokens.get('expiry_date'),
            "tokenType": user_tokens.get('token_type', 'Bearer'),
            "scope": user_tokens.get('scope'),
        }
    
    def call_tool(self, tool_name, arguments=None):
        """Llamar una herramienta MCP con credenciales"""
        if arguments is None:
            arguments = {}
        
        # Agregar credenciales a los argumentos
        arguments["_userCredentials"] = self.credentials
        
        request_data = {
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        
        print(f"[DEBUG] Calling tool: {tool_name}")
        print(f"[DEBUG] Has access token: {bool(self.credentials.get('accessToken'))}")
        
        response = requests.post(
            f"{self.server_url}/api/mcp",
            json=request_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            raise Exception(f"Request failed: {response.status_code} - {response.text}")
        
        return response.json()

# Uso del cliente
if __name__ == "__main__":
    client = MCPClient(
        server_url="http://localhost:8000",
        token_file=os.path.expanduser("~/.config/google-calendar-mcp/tokens.json")
    )
    
    # Listar calendarios
    result = client.call_tool("list_calendars")
    print(json.dumps(result, indent=2))
    
    # Listar eventos
    events = client.call_tool("list_events", {
        "calendarId": "primary",
        "maxResults": 10
    })
    print(json.dumps(events, indent=2))
```

### Cliente Node.js Completo

```javascript
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class MCPClient {
    constructor(serverUrl, tokenFile) {
        this.serverUrl = serverUrl;
        this.tokenFile = tokenFile;
        this.credentials = this._loadCredentials();
    }
    
    _loadCredentials() {
        if (!fs.existsSync(this.tokenFile)) {
            throw new Error(`Token file not found: ${this.tokenFile}`);
        }
        
        const tokens = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
        const userTokens = tokens.normal || tokens;
        
        return {
            accessToken: userTokens.access_token,
            refreshToken: userTokens.refresh_token,
            expiryDate: userTokens.expiry_date,
            tokenType: userTokens.token_type || 'Bearer',
            scope: userTokens.scope,
        };
    }
    
    async callTool(toolName, arguments = {}) {
        // Agregar credenciales
        arguments._userCredentials = this.credentials;
        
        const requestData = {
            method: "tools/call",
            params: {
                name: toolName,
                arguments: arguments
            }
        };
        
        console.log(`[DEBUG] Calling tool: ${toolName}`);
        console.log(`[DEBUG] Has access token: ${!!this.credentials.accessToken}`);
        
        try {
            const response = await axios.post(
                `${this.serverUrl}/api/mcp`,
                requestData,
                { headers: { 'Content-Type': 'application/json' } }
            );
            
            return response.data;
        } catch (error) {
            throw new Error(`Request failed: ${error.response?.status} - ${error.response?.data}`);
        }
    }
}

// Uso del cliente
async function main() {
    const client = new MCPClient(
        'http://localhost:8000',
        path.join(process.env.HOME, '.config/google-calendar-mcp/tokens.json')
    );
    
    try {
        // Listar calendarios
        const calendars = await client.callTool('list_calendars');
        console.log('Calendars:', JSON.stringify(calendars, null, 2));
        
        // Listar eventos
        const events = await client.callTool('list_events', {
            calendarId: 'primary',
            maxResults: 10
        });
        console.log('Events:', JSON.stringify(events, null, 2));
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
```

## 🎯 Comandos de Verificación End-to-End

```bash
# 1. Compilar el servidor
npm run build

# 2. Configurar variables de entorno
export USE_USER_CREDENTIALS=true
export DEBUG_USER_AUTH=true

# 3. Iniciar servidor en modo HTTP
npm run dev http

# En otra terminal:
# 4. Verificar tokens de usuario
cat ~/.config/google-calendar-mcp/tokens.json

# 5. Probar cliente Python
python3 test_mcp_server.py

# 6. Probar cliente Node.js
node test_mcp_client.js

# 7. Verificar logs del servidor para debug info
# Deberías ver logs como:
# [DEBUG] Using user credentials for authentication
# [DEBUG] User credentials received: accessToken=PRESENT, refreshToken=PRESENT
# [DEBUG] Created fresh OAuth2Client for user request
```

## 📝 Especificaciones de Implementación

### Campos de Credenciales en Requests

El cliente debe enviar las credenciales en uno de estos formatos:

```typescript
// Opción 1: Campo directo
{
  "name": "tool-name",
  "arguments": {
    "param1": "value1",
    "_userCredentials": {
      "accessToken": "ya29.xxx",
      "refreshToken": "1//xxx",
      "expiryDate": 1704067200000
    }
  }
}

// Opción 2: Contexto de usuario
{
  "name": "tool-name", 
  "arguments": {
    "param1": "value1",
    "_userContext": {
      "userId": "user123",
      "credentials": {
        "accessToken": "ya29.xxx",
        "refreshToken": "1//xxx"
      }
    }
  }
}
```

### Extracción de Credenciales

```typescript
private extractUserCredentials(args: any): UserCredentials {
  // Buscar en múltiples ubicaciones posibles
  if (args._userCredentials) return args._userCredentials;
  if (args.userCredentials) return args.userCredentials;
  if (args._userContext?.credentials) return args._userContext.credentials;
  
  throw new Error("User credentials are required");
}
```

### Limpieza de Argumentos

```typescript
private cleanToolArgs(args: any): any {
  const cleanArgs = { ...args };
  delete cleanArgs._userCredentials;
  delete cleanArgs.userCredentials;
  delete cleanArgs._userContext;
  delete cleanArgs.userId;
  delete cleanArgs.sessionId;
  return cleanArgs;
}
```

## 🚫 Antipatrones a Evitar

1. **❌ NO implementar caché de OAuth clients**
   ```typescript
   // ❌ MAL - tiene caché en memoria
   private oauthClientCache: Map<string, OAuthClient> = new Map();
   ```

2. **❌ NO almacenar credenciales en el servidor**
   ```typescript
   // ❌ MAL - almacena estado
   private userCredentials: Map<string, Credentials> = new Map();
   ```

3. **❌ NO reutilizar OAuth clients entre requests**
   ```typescript
   // ❌ MAL - reutiliza instancias
   if (this.cachedClient) return this.cachedClient;
   ```

4. **❌ NO usar sesiones o cookies para auth**
   ```typescript
   // ❌ MAL - mantiene estado de sesión
   private sessions: Map<string, Session> = new Map();
   ```

## ✅ Patrones Correctos

1. **✅ Crear OAuth client fresco por request**
   ```typescript
   // ✅ BIEN - nueva instancia cada vez
   createOAuthClient(credentials: UserCredentials): OAuthClient {
     return new OAuthClient(this.config, credentials);
   }
   ```

2. **✅ Validar credenciales en cada request**
   ```typescript
   // ✅ BIEN - valida sin almacenar
   validateCredentials(creds: UserCredentials): void {
     if (!creds.accessToken) throw new Error("Missing access token");
   }
   ```

3. **✅ Limpiar argumentos antes de pasarlos a handlers**
   ```typescript
   // ✅ BIEN - remove campos de auth de los args
   const cleanArgs = this.cleanToolArgs(request.params.arguments);
   ```

## 🔄 Flujo de Request Completo

```
1. Cliente → Servidor: Request con credenciales embebidas
2. AuthMiddleware → Extrae credenciales del request
3. UserCredentialsManager → Valida credenciales
4. UserCredentialsManager → Crea OAuth client fresco
5. Handler → Ejecuta con OAuth client
6. API Externa → Procesa llamada autenticada
7. Handler → Retorna resultado
8. OAuth client → Se descarta (garbage collection)
9. Servidor → Cliente: Respuesta limpia
```

## 🏷️ Adaptaciones por Plataforma

### Para Google APIs:
- OAuth client: `OAuth2Client` de `google-auth-library`
- Credenciales: `access_token`, `refresh_token`, `expiry_date`

### Para Microsoft APIs:
- OAuth client: `Client` de `@azure/msal-node`
- Credenciales: `accessToken`, `refreshToken`, `expiresOn`

### Para GitHub APIs:
- OAuth client: `Octokit` con auth
- Credenciales: `token`, `type: "oauth"`

### Para Slack APIs:
- OAuth client: `WebClient` de `@slack/web-api`
- Credenciales: `token`

## 🔍 Troubleshooting Común

### Problema: "User credentials are required"
**Síntomas:** El servidor retorna error diciendo que faltan credenciales de usuario.
**Causas:**
1. Variable `USE_USER_CREDENTIALS=true` no está configurada
2. Cliente no está enviando credenciales en `arguments._userCredentials`
3. Esquemas Zod no fueron actualizados para aceptar credenciales

**Solución:**
```bash
# Verificar variables de entorno
echo $USE_USER_CREDENTIALS  # Debe ser 'true'

# Verificar estructura del request
curl -X POST http://localhost:8000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "list_calendars",
      "arguments": {
        "_userCredentials": {
          "accessToken": "ya29.xxx",
          "refreshToken": "1//xxx"
        }
      }
    }
  }'
```

### Problema: "Invalid credentials" o "Token expired"
**Síntomas:** Error de autenticación con la API externa.
**Causas:**
1. Tokens expirados
2. Tokens inválidos o corruptos
3. Scopes insuficientes

**Solución:**
```bash
# Regenerar tokens OAuth
npm run oauth:authorize
# o usar el script de tu plataforma para obtener nuevos tokens

# Verificar scopes requeridos en gcp-oauth.keys.json
cat gcp-oauth.keys.json | jq '.web.scopes'
```

### Problema: Memory leaks o performance degradado
**Síntomas:** El servidor consume más memoria con el tiempo.
**Causas:**
1. OAuth clients no se están liberando correctamente
2. Hay caché implementado incorrectamente
3. Referencias circulares en objetos

**Solución:**
```typescript
// Verificar que no hay caché en UserCredentialsManager
export class UserCredentialsManager {
  // ❌ NO debe tener estas propiedades
  // private clientCache: Map<string, any>;
  // private credentialsStore: Map<string, any>;
  
  // ✅ Solo métodos stateless
  createUserOAuthClient(credentials: UserCredentials): OAuthClient {
    // Crear nueva instancia cada vez
    return new OAuth2Client(this.config, credentials);
  }
}
```

### Problema: Esquemas Zod fallan con "unexpected null"
**Síntomas:** Error de validación cuando campos son `null`.
**Causa:** Esquemas no configurados para aceptar `null`.

**Solución:**
```typescript
// ❌ MAL
accessToken: z.string().optional(),

// ✅ BIEN
accessToken: z.string().nullable().optional(),
```

### Problema: Cliente Python/Node.js no puede cargar tokens
**Síntomas:** `FileNotFoundError` o tokens `undefined`.
**Causa:** Ruta incorrecta o estructura de archivo incorrecta.

**Solución:**
```python
# Verificar ubicación del archivo
import os
token_file = os.path.expanduser("~/.config/google-calendar-mcp/tokens.json")
print(f"Token file exists: {os.path.exists(token_file)}")

# Verificar estructura
import json
with open(token_file, 'r') as f:
    tokens = json.load(f)
print(json.dumps(tokens, indent=2))
```

## 🧪 Verificación de Implementación

**Criterios de éxito:**

1. ✅ **Sin estado**: El servidor no mantiene OAuth clients entre requests
2. ✅ **Sin memory leaks**: No se acumulan instancias en memoria
3. ✅ **Escalable**: Puede manejar miles de usuarios simultáneos
4. ✅ **Seguro**: Credenciales solo existen durante el request
5. ✅ **Performance**: Overhead mínimo por crear OAuth clients frescos
6. ✅ **Debug**: Logs claros para trazar problemas
7. ✅ **Flexible**: Soporte para múltiples formatos de credenciales
8. ✅ **Compatible**: Funciona con clientes Python y Node.js

**Checklist de implementación completa:**

### Servidor (Backend)
- [ ] **UserCredentialsManager** implementado sin caché ni estado
- [ ] **AuthenticationMiddleware** extrae credenciales y crea OAuth clients frescos
- [ ] **Servidor principal** integra middleware con flag `USE_USER_CREDENTIALS`
- [ ] **Todos los esquemas Zod** actualizados con `.merge(userCredentialsSchema)`
- [ ] **Debug logging** implementado en puntos clave
- [ ] **Limpieza de argumentos** antes de pasar a handlers
- [ ] **Variables de entorno** para activar/desactivar modo usuario
- [ ] **Validación de credenciales** robusta con manejo de errores

### Clientes
- [ ] **Cliente Python** funcional con carga de tokens desde archivo
- [ ] **Cliente Node.js** funcional con manejo de errores
- [ ] **Manejo de estructura de tokens** anidada (`{"normal": {...}}`)
- [ ] **Envío de credenciales** en formato correcto (`arguments._userCredentials`)
- [ ] **Debug logging** en cliente para trazar problemas

### Documentación
- [ ] **README-USER-AUTH.md** con guía completa para usuarios
- [ ] **Ejemplos de código** funcionales para Python y Node.js
- [ ] **Documentación de API** con formato de credenciales
- [ ] **Troubleshooting guide** con problemas comunes
- [ ] **Migration guide** si se migra desde sistema con estado

**Comandos de verificación:**
```bash
# 1. Verificar compilación sin errores
npm run build
echo "Build status: $?"

# 2. Verificar tests pasan
npm test
echo "Test status: $?"

# 3. Verificar variables de entorno
echo "USE_USER_CREDENTIALS=$USE_USER_CREDENTIALS"
echo "DEBUG_USER_AUTH=$DEBUG_USER_AUTH"

# 4. Iniciar servidor con debug
npm run dev http &
SERVER_PID=$!

# 5. Esperar a que inicie
sleep 2

# 6. Probar cliente Python
python3 test_mcp_server.py
PYTHON_STATUS=$?

# 7. Probar cliente Node.js
node test_mcp_client.js
NODE_STATUS=$?

# 8. Limpiar
kill $SERVER_PID

# 9. Verificar resultados
if [ $PYTHON_STATUS -eq 0 ] && [ $NODE_STATUS -eq 0 ]; then
    echo "✅ All tests passed - Implementation successful!"
else
    echo "❌ Tests failed - Check logs for details"
fi

# 10. Verificar memoria (opcional - para monitoreo)
# node --inspect server.js
# Conectar Chrome DevTools y monitorear heap usage
```

**Verificación de memoria (producción):**
```bash
# Monitorear uso de memoria durante carga
while true; do
  ps aux | grep "node.*server" | grep -v grep
  sleep 10
done

# O usar herramientas especializadas
npm install -g clinic
clinic doctor -- node server.js
```

## 📚 Documentación Requerida

1. **README-USER-AUTH.md**: Guía para el cliente sobre cómo enviar credenciales
2. **Examples/**: Ejemplos de código del cliente
3. **API docs**: Documentar formato de credenciales requerido
4. **Migration guide**: Si hay servidor existente que migrar

---

## 🚨 Errores Comunes y Lecciones Aprendidas

### Error #1: Esquemas Zod No Actualizados
**❌ Problema:** Después de agregar soporte para credenciales de usuario, olvidar actualizar los esquemas Zod de todas las herramientas.
**✅ Solución:** Crear un esquema reutilizable y aplicarlo a TODAS las herramientas:

```typescript
// En tools/registry.ts - Schema reutilizable
const userCredentialsSchema = z.object({
  _userCredentials: z.object({
    accessToken: z.string().nullable().optional(),
    refreshToken: z.string().nullable().optional(),
    expiryDate: z.number().optional(),
    tokenType: z.string().optional(),
    scope: z.string().optional(),
    idToken: z.string().optional(),
  }).optional(),
  userCredentials: z.object({
    accessToken: z.string().nullable().optional(),
    refreshToken: z.string().nullable().optional(),
    expiryDate: z.number().optional(),
  }).optional(),
  _userContext: z.object({
    userId: z.string().optional(),
    credentials: z.object({
      accessToken: z.string().nullable().optional(),
      refreshToken: z.string().nullable().optional(),
    }).optional(),
  }).optional(),
});

// Aplicar a CADA herramienta
const createEventSchema = z.object({
  // ... parámetros específicos ...
}).merge(userCredentialsSchema);
```

### Error #2: Cliente Python - Estructura de Tokens Incorrecta
**❌ Problema:** Asumir que el archivo de tokens tiene una estructura plana cuando en realidad tiene anidación.
**✅ Solución:** Verificar la estructura real del archivo y cargar correctamente:

```python
# ❌ MAL - asume estructura plana
with open(token_file, 'r') as f:
    tokens = json.load(f)
access_token = tokens.get('access_token')  # None!

# ✅ BIEN - maneja estructura anidada
with open(token_file, 'r') as f:
    tokens = json.load(f)
# El archivo real: {"normal": {"access_token": "...", ...}}
user_tokens = tokens.get('normal', {})
access_token = user_tokens.get('access_token')
```

### Error #3: Campos Null vs Undefined en Validación
**❌ Problema:** Los esquemas Zod fallan cuando campos opcionales llegan como `null` en lugar de `undefined`.
**✅ Solución:** Permitir explícitamente `null` en campos opcionales:

```typescript
// ❌ MAL - falla con null
accessToken: z.string().optional(),

// ✅ BIEN - acepta null y undefined
accessToken: z.string().nullable().optional(),
```

### Error #4: Debug Logs Insuficientes
**❌ Problema:** No poder trazar dónde fallan las credenciales en el flujo.
**✅ Solución:** Agregar debug logs en puntos clave:

```typescript
// En AuthMiddleware
console.log('[DEBUG] Raw request args:', JSON.stringify(args, null, 2));
console.log('[DEBUG] Extracted credentials:', {
  hasAccessToken: !!userCredentials.accessToken,
  hasRefreshToken: !!userCredentials.refreshToken,
});

// En Registry
console.log('[DEBUG] Tool execution with user auth');
console.log('[DEBUG] User credentials received:', {
  accessToken: credentials.accessToken ? 'PRESENT' : 'MISSING',
});
```

### Error #5: No Limpiar Variables de Entorno
**❌ Problema:** Olvidar activar el modo de autenticación de usuario en el servidor.
**✅ Solución:** Verificar variables de entorno al inicio:

```bash
# Para desarrollo con debug
export USE_USER_CREDENTIALS=true
export DEBUG_USER_AUTH=true
npm run dev http

# Verificar que las variables están activas
echo "USE_USER_CREDENTIALS=$USE_USER_CREDENTIALS"
echo "DEBUG_USER_AUTH=$DEBUG_USER_AUTH"
```

### Error #6: Formato Incorrecto en Requests
**❌ Problema:** Enviar credenciales en formato incorrecto o ubicación equivocada.
**✅ Solución:** Usar el formato exacto esperado por el middleware:

```python
# ✅ CORRECTO - En arguments, no en params principales
request_data = {
    "method": "tools/call",
    "params": {
        "name": "list_calendars",
        "arguments": {
            # Parámetros específicos de la herramienta...
            "_userCredentials": {
                "accessToken": access_token,
                "refreshToken": refresh_token,
                "expiryDate": expires_at,
            }
        }
    }
}
```

## 🚀 Despliegue en Google Cloud Run

### Arquitectura Cloud Run + Firebase Auth

```
┌─────────────────┐    ┌──────────────────────────────────────┐    ┌─────────────────┐
│  Cliente Web    │    │          Cloud Run                   │    │   Google APIs   │
│  (Firebase)     │    │                                      │    │                 │
├─────────────────┤    ├──────────────────────────────────────┤    ├─────────────────┤
│ 1. Auth con     │    │ 4. Recibe request con credenciales  │    │ 7. Calendar API │
│    Firebase     │───▶│ 5. Extrae credenciales de Secret    │───▶│    GitHub API   │
│                 │    │    Manager (OAuth keys)             │    │    etc...       │
│ 2. Obtiene      │    │ 6. Crea OAuth client fresco         │    │                 │
│    tokens OAuth │    │                                      │    │ 8. Retorna      │
│                 │    │ 9. Procesa herramienta MCP          │◀───│    datos        │
│ 3. Envía        │◀───│10. Retorna resultado                 │    │                 │
│    credenciales │    │                                      │    │                 │
│    con request  │    │ ❌ NO MANTIENE ESTADO               │    │                 │
└─────────────────┘    │ ✅ AUTO-ESCALABLE HORIZONTAL        │    │                 │
                       └──────────────────────────────────────┘    └─────────────────┘
```

### Configuración de Google Cloud

#### 1. **Preparación del Proyecto**

```bash
# Configurar proyecto y región
gcloud config set project TU-PROJECT-ID
gcloud config set run/region europe-west1

# Habilitar APIs necesarias
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable calendar-json.googleapis.com
```

#### 2. **Configuración de Secrets Manager**

```bash
# Crear secret para OAuth credentials
gcloud secrets create google-oauth-credentials --data-file=gcp-oauth.keys.json

# Verificar que se creó correctamente
gcloud secrets versions list google-oauth-credentials

# Otorgar permisos al service account de Cloud Run
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding google-oauth-credentials \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### 3. **Dockerfile Optimizado para Cloud Run**

```dockerfile
# Etapa 1: Construcción
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Etapa 2: Producción
FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
USER node
EXPOSE 8080
CMD ["node", "build/index.js", "--transport", "http"]
```

### .dockerignore

```plaintext
node_modules
*.log
.git
coverage/
test/
docs/
examples/
future_features/
```

### Comandos para Construcción y Despliegue

```bash
# Construir imagen Docker
DOCKER_IMAGE="google-calendar-mcp:latest"
docker build -t $DOCKER_IMAGE .

# Ejecutar contenedor localmente
PORT=8080
docker run -p $PORT:8080 $DOCKER_IMAGE

# Subir a Google Container Registry (opcional)
GCR_IMAGE="gcr.io/PROJECT-ID/google-calendar-mcp"
docker tag $DOCKER_IMAGE $GCR_IMAGE
docker push $GCR_IMAGE
```

## 🔧 DETALLES DEL MIDDLEWARE

### AuthenticationMiddleware

```typescript
export class AuthenticationMiddleware {
  constructor(
    private userCredentialsManager: UserCredentialsManager,
    private baseOAuthClient: any
  ) {}

  async executeWithUserAuth(request: any, handler: any): Promise<any> {
    // 1. Extraer credenciales del request
    const credentials = this.userCredentialsManager.extractUserCredentials(request.params.arguments);

    // 2. Validar credenciales
    this.userCredentialsManager.validateCredentials(credentials);

    // 3. Crear OAuth client fresco
    const oauthClient = this.userCredentialsManager.createUserOAuthClient(credentials, this.baseOAuthClient);

    // 4. Ejecutar herramienta con OAuth client
    const result = await handler.runTool(request.params.arguments, oauthClient);

    // 5. Retornar resultado
    return result;
  }
}
```

## 🔑 CREDENCIALES DESDE FIREBASE

### Modificación de UserCredentials

```typescript
export interface UserCredentials {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  firebaseIdToken?: string;
  firebaseUid?: string;
  firebaseEmail?: string;
}
```

### FirebaseAuthMiddleware

```typescript
import { auth } from 'firebase-admin';

export class FirebaseAuthMiddleware {
  async validateFirebaseToken(idToken: string): Promise<auth.DecodedIdToken> {
    try {
      return await auth().verifyIdToken(idToken);
    } catch (error) {
      throw new Error(`Invalid Firebase token: ${error.message}`);
    }
  }

  extractFirebaseContext(args: any): UserCredentials | null {
    if (args._firebaseAuth) {
      return args._firebaseAuth;
    }
    if (args._userContext?.firebaseAuth) {
      return args._userContext.firebaseAuth;
    }
    return null;
  }
}
```
