#!/bin/bash

# 🚀 Script de Deploy para Gmail MCP Server a Cloud Run
# Configurado para usar puerto dinámico y region europe-west1

set -e  # Exit on error

echo "🚀 Iniciando deployment de Gmail MCP server a Cloud Run..."

# Configuración
PROJECT_ID=${PROJECT_ID:-$(gcloud config get-value project)}
REGION=${REGION:-"europe-west1"}
SERVICE_NAME=${SERVICE_NAME:-"gmail-mcp-server"}
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "📋 Configuración:"
echo "  Project ID: ${PROJECT_ID}"
echo "  Region: ${REGION}"
echo "  Service: ${SERVICE_NAME}"
echo "  Image: ${IMAGE_NAME}"

# Verificaciones previas
log_info "Verificando configuración..."

if [ -z "$PROJECT_ID" ]; then
    log_error "PROJECT_ID not set. Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

# Verificar que gcloud esté instalado
if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI no está instalado"
    echo "Instala desde: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Verificar configuración de gcloud
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    log_error "No hay cuentas activas en gcloud"
    echo "Ejecuta: gcloud auth login"
    exit 1
fi

# Configurar gcloud
log_info "Configurando gcloud..."
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION

# Habilitar APIs necesarias
log_info "Habilitando APIs de Google Cloud..."
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Configurar Secret Manager para Gmail OAuth
log_info "Configurando Secret Manager para Gmail OAuth..."

# Verificar si existe el archivo de credenciales OAuth
if [ -f "gcp-oauth.keys.json" ]; then
    log_info "Archivo gcp-oauth.keys.json encontrado, subiendo a Secret Manager..."
    
    # Crear o actualizar el secret con el archivo de credenciales OAuth
    if gcloud secrets describe gmail-oauth-credentials &>/dev/null; then
        log_info "Secret gmail-oauth-credentials ya existe, actualizando..."
        gcloud secrets versions add gmail-oauth-credentials --data-file=gcp-oauth.keys.json
    else
        log_info "Creando nuevo secret gmail-oauth-credentials..."
        gcloud secrets create gmail-oauth-credentials --data-file=gcp-oauth.keys.json
    fi
    
    log_success "Credenciales OAuth configuradas en Secret Manager"
else
    log_warning "No se encontró gcp-oauth.keys.json"
    log_warning "Asegúrate de que las credenciales OAuth ya estén configuradas en Secret Manager"
fi

# Configurar permisos para Cloud Run service account
log_info "Configurando permisos de service account..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
CLOUD_RUN_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "  Project Number: $PROJECT_NUMBER"
echo "  Service Account: $CLOUD_RUN_SERVICE_ACCOUNT"

# Otorgar permisos al service account de Cloud Run
if gcloud secrets describe gmail-oauth-credentials &>/dev/null; then
    gcloud secrets add-iam-policy-binding gmail-oauth-credentials \
      --member="serviceAccount:${CLOUD_RUN_SERVICE_ACCOUNT}" \
      --role="roles/secretmanager.secretAccessor" || true
    
    log_success "Permisos configurados correctamente"
fi

# Build del proyecto
log_info "Construyendo proyecto..."
npm run build

# Verificar que el build fue exitoso
if [ ! -d "dist" ]; then
    log_error "Build directory not found. Make sure 'npm run build' completed successfully"
    exit 1
fi

log_success "Build completado exitosamente"

# Construir imagen Docker usando Cloud Build
log_info "Construyendo imagen Docker con Cloud Build..."
gcloud builds submit --tag $IMAGE_NAME

# Verificar que la imagen se construyó correctamente
if ! gcloud container images describe $IMAGE_NAME >/dev/null 2>&1; then
    log_error "Docker image build failed"
    exit 1
fi

log_success "Imagen Docker construida exitosamente"

# Deploy a Cloud Run
log_info "Desplegando a Cloud Run..."

# Configurar variables de entorno base
ENV_VARS="NODE_ENV=production,USE_USER_CREDENTIALS=true,DEBUG_USER_AUTH=false,DISABLE_FILE_LOGGING=true"

# Configurar secrets
SECRETS=""
if gcloud secrets describe gmail-oauth-credentials &>/dev/null; then
    SECRETS="--set-secrets=OAUTH_CREDENTIALS=gmail-oauth-credentials:latest"
fi

# Deploy con configuración específica para Gmail
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --min-instances 0 \
  --concurrency 1000 \
  --timeout 300s \
  --set-env-vars="$ENV_VARS" \
  $SECRETS

# Obtener URL del servicio
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")

log_success "Deployment completado exitosamente!"
echo "🌐 Service URL: $SERVICE_URL"

# Verificaciones post-deployment
log_info "Verificando deployment..."

echo "  1. Verificando que el servicio esté disponible..."
sleep 10  # Esperar a que el servicio esté listo

# Test básico del servicio
echo "  2. Probando endpoint básico..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVICE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' || echo "curl_failed")

if [ "$HTTP_STATUS" = "200" ]; then
    log_success "Servicio respondiendo correctamente (HTTP 200)"
elif [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "401" ]; then
    log_success "Servicio respondiendo (HTTP $HTTP_STATUS - normal para MCP sin auth)"
elif [ "$HTTP_STATUS" = "curl_failed" ]; then
    log_warning "No se pudo conectar al servicio (puede estar iniciando)"
else
    log_warning "Servicio respondiendo con HTTP $HTTP_STATUS"
fi

echo "  3. Verificando logs recientes..."
gcloud run services logs read $SERVICE_NAME --region=$REGION --limit=10 2>/dev/null || log_warning "No se pudieron obtener los logs"

echo ""
log_success "🎉 Deployment completado exitosamente!"
echo ""
echo "📋 Información del servicio:"
echo "  URL: $SERVICE_URL"
echo "  Region: $REGION"
echo "  Service Name: $SERVICE_NAME"
echo "  Image: $IMAGE_NAME"
echo "  Min Instances: 0"
echo "  Max Instances: 10"
echo "  Puerto: 8080 (dinámico vía \$PORT)"
echo ""
echo "📖 Comandos útiles:"
echo "  Ver logs: gcloud run services logs read $SERVICE_NAME --region=$REGION --follow"
echo "  Describir servicio: gcloud run services describe $SERVICE_NAME --region=$REGION"
echo "  Actualizar: ./deploy-gmail-cloud-run.sh"
echo "  Eliminar: gcloud run services delete $SERVICE_NAME --region=$REGION"
echo ""
echo "🔗 Enlaces útiles:"
echo "  Cloud Run Console: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME"
echo "  Cloud Build Console: https://console.cloud.google.com/cloud-build/builds"
echo "  Secret Manager Console: https://console.cloud.google.com/security/secret-manager"
echo ""
echo "🧪 Para probar el servicio:"
echo "  curl -X POST \"$SERVICE_URL/mcp\" -H \"Content-Type: application/json\" -d '{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"id\":1}'"
echo ""
echo "⚙️  Configuración para clientes MCP:"
echo "  Actualiza la URL del servidor en tus clientes a: $SERVICE_URL"
echo ""
echo "🔐 OAuth Flow:"
echo "  Para autenticación OAuth, los usuarios visitarán: $SERVICE_URL/auth"
