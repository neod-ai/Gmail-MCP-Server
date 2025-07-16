
import { UserCredentialsManager, UserCredentials } from './user-credentials-manager.js';
import { OAuth2Client } from 'google-auth-library';

export class AuthenticationMiddleware {
  constructor(
    private userCredentialsManager: UserCredentialsManager,
    private baseOAuthClient: OAuth2Client
  ) {}

  /**
   * Ejecuta una herramienta con autenticación de usuario stateless
   */
  async executeWithUserAuth(request: any, handler: any): Promise<any> {
    try {
      if (process.env.DEBUG_USER_AUTH === 'true') {
        console.log('[DEBUG] Starting user authentication flow');
        console.log('[DEBUG] Request method:', request.method);
        console.log('[DEBUG] Tool name:', request.params?.name);
      }

      // 1. Extraer credenciales del request
      const userCredentials = this.userCredentialsManager.extractUserCredentials(
        request.params.arguments
      );

      // 2. Validar credenciales
      this.userCredentialsManager.validateCredentials(userCredentials);

      // 3. Crear OAuth client fresco para esta request específica
      const userOAuthClient = this.userCredentialsManager.createUserOAuthClient(userCredentials);

      // 4. Limpiar argumentos antes de pasarlos al handler
      const cleanArgs = this.userCredentialsManager.cleanToolArgs(request.params.arguments);

      if (process.env.DEBUG_USER_AUTH === 'true') {
        console.log('[DEBUG] Executing tool with user OAuth client');
      }

      // 5. Ejecutar herramienta con OAuth client del usuario
      const result = await handler.runTool(cleanArgs, userOAuthClient);

      if (process.env.DEBUG_USER_AUTH === 'true') {
        console.log('[DEBUG] Tool execution completed successfully');
      }

      // 6. El OAuth client será automáticamente liberado por garbage collection
      return result;

    } catch (error: any) {
      if (process.env.DEBUG_USER_AUTH === 'true') {
        console.log('[DEBUG] Error in user authentication flow:', error.message);
      }

      // Re-lanzar el error con contexto adicional
      if (error.message.includes('credentials')) {
        throw new Error(`Authentication failed: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Verifica si el request incluye credenciales de usuario
   */
  hasUserCredentials(args: any): boolean {
    return !!(
      args._userCredentials || 
      args.userCredentials || 
      args._userContext?.credentials
    );
  }
}
