
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

/**
 * Handler base para herramientas que encapsula la lógica de Gmail
 */
export class ToolHandler {
  /**
   * Ejecuta una herramienta con el OAuth client proporcionado
   */
  async runTool(args: any, oauthClient: OAuth2Client): Promise<any> {
    // Inicializar Gmail API con el OAuth client
    const gmail = google.gmail({ version: 'v1', auth: oauthClient });
    
    // Este método será sobrescrito por implementaciones específicas
    throw new Error('runTool method must be implemented by subclass');
  }
}

/**
 * Handler genérico que ejecuta cualquier función con Gmail API
 */
export class GenericToolHandler extends ToolHandler {
  constructor(private toolFunction: (args: any, gmail: any) => Promise<any>) {
    super();
  }

  async runTool(args: any, oauthClient: OAuth2Client): Promise<any> {
    const gmail = google.gmail({ version: 'v1', auth: oauthClient });
    return await this.toolFunction(args, gmail);
  }
}
