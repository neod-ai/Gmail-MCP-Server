
import { OAuth2Client } from 'google-auth-library';

export interface UserCredentials {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  tokenType?: string;
  scope?: string;
  idToken?: string;
}

export class UserCredentialsManager {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }

  /**
   * Extrae credenciales de usuario desde los argumentos del request
   * Busca en múltiples ubicaciones posibles
   */
  extractUserCredentials(args: any): UserCredentials {
    // Debug logging
    if (process.env.DEBUG_USER_AUTH === 'true') {
      console.log('[DEBUG] Extracting user credentials from args');
      console.log('[DEBUG] Raw args keys:', Object.keys(args));
    }

    // Buscar en múltiples ubicaciones posibles
    if (args._userCredentials) {
      if (process.env.DEBUG_USER_AUTH === 'true') {
        console.log('[DEBUG] Found credentials in _userCredentials');
      }
      return args._userCredentials;
    }
    
    if (args.userCredentials) {
      if (process.env.DEBUG_USER_AUTH === 'true') {
        console.log('[DEBUG] Found credentials in userCredentials');
      }
      return args.userCredentials;
    }
    
    if (args._userContext?.credentials) {
      if (process.env.DEBUG_USER_AUTH === 'true') {
        console.log('[DEBUG] Found credentials in _userContext.credentials');
      }
      return args._userContext.credentials;
    }
    
    throw new Error("User credentials are required but not found in request. Please include credentials in '_userCredentials' field.");
  }

  /**
   * Valida que las credenciales requeridas estén presentes
   */
  validateCredentials(credentials: UserCredentials): void {
    if (!credentials.accessToken) {
      throw new Error("Missing access token in user credentials");
    }

    // Verificar si el token ha expirado
    if (this.isTokenExpired(credentials)) {
      throw new Error("Access token has expired. Please refresh your credentials.");
    }

    if (process.env.DEBUG_USER_AUTH === 'true') {
      console.log('[DEBUG] User credentials validated successfully:', {
        hasAccessToken: !!credentials.accessToken,
        hasRefreshToken: !!credentials.refreshToken,
        hasIdToken: !!credentials.idToken,
        expiryDate: credentials.expiryDate,
        isExpired: this.isTokenExpired(credentials)
      });
    }
  }

  /**
   * Verifica si el token ha expirado
   */
  isTokenExpired(credentials: UserCredentials): boolean {
    if (!credentials.expiryDate) {
      return false; // Si no hay fecha de expiración, asumimos que es válido
    }

    const now = Date.now();
    const expiryTime = credentials.expiryDate;
    
    // Consideramos expirado si falta menos de 5 minutos
    const bufferTime = 5 * 60 * 1000; // 5 minutos en millisegundos
    
    return now >= (expiryTime - bufferTime);
  }

  /**
   * Crea un OAuth2Client fresco para esta request específica
   * IMPORTANTE: NO reutilizar instancias entre requests
   */
  createUserOAuthClient(userCredentials: UserCredentials): OAuth2Client {
    if (process.env.DEBUG_USER_AUTH === 'true') {
      console.log('[DEBUG] Creating fresh OAuth2Client for user request');
    }

    // Crear nueva instancia SIEMPRE - sin caché
    const oauthClient = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    // Configurar credenciales del usuario
    const credentials: any = {
      access_token: userCredentials.accessToken,
    };

    if (userCredentials.refreshToken) {
      credentials.refresh_token = userCredentials.refreshToken;
    }

    if (userCredentials.expiryDate) {
      credentials.expiry_date = userCredentials.expiryDate;
    }

    if (userCredentials.tokenType) {
      credentials.token_type = userCredentials.tokenType;
    }

    if (userCredentials.scope) {
      credentials.scope = userCredentials.scope;
    }

    if (userCredentials.idToken) {
      credentials.id_token = userCredentials.idToken;
    }

    oauthClient.setCredentials(credentials);

    if (process.env.DEBUG_USER_AUTH === 'true') {
      console.log('[DEBUG] OAuth2Client configured with user credentials');
    }

    return oauthClient;
  }

  /**
   * Limpia los argumentos removiendo campos relacionados con autenticación
   * antes de pasarlos a los handlers de herramientas
   */
  cleanToolArgs(args: any): any {
    const cleanArgs = { ...args };
    
    // Remover todos los campos relacionados con autenticación
    delete cleanArgs._userCredentials;
    delete cleanArgs.userCredentials;
    delete cleanArgs._userContext;
    delete cleanArgs.userId;
    delete cleanArgs.sessionId;
    
    if (process.env.DEBUG_USER_AUTH === 'true') {
      console.log('[DEBUG] Cleaned tool arguments, removed auth fields');
    }
    
    return cleanArgs;
  }
}
