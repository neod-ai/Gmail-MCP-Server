#!/bin/bash

# 🚀 Script de Deploy para MS365 MCP Server a Cloud Run
# Basado en el deployment exitoso del Google Calendar MCP

set -e  # Exit on error

echo "🚀 Iniciando deployment de MS365 MCP server a Cloud Run..."

# Configuración
PROJECT_ID=${PROJECT_ID:-$(gcloud config get-value project)}
REGION=${REGION:-"europe-west1"}
SERVICE_NAME=${SERVICE_NAME:-"ms365-mcp-server"}
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "📋 Configuración:"
echo "  Project ID: ${PROJECT_ID}"
echo "  Region: ${REGION}"
echo "  Service: ${SERVICE_NAME}"
echo "  Image: ${IMAGE_NAME}"

# Verificaciones previas
echo "🔍 Verificando configuración..."

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: PROJECT_ID not set. Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

# Configurar gcloud
echo "⚙️  Configurando gcloud..."
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION

# Habilitar APIs necesarias
echo "🔧 Habilitando APIs de Google Cloud..."
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Crear o actualizar secrets en Secret Manager
echo "🔐 Configurando Secret Manager..."

# Obtener valores del .env
if [ -f ".env" ]; then
    CLIENT_ID=$(grep MS365_MCP_CLIENT_ID .env | cut -d '=' -f2)
    CLIENT_SECRET=$(grep MS365_MCP_CLIENT_SECRET .env | cut -d '=' -f2)
    TENANT_ID=$(grep MS365_MCP_TENANT_ID .env | cut -d '=' -f2)
    
    # Crear secrets
    echo "  Creando/actualizando secrets..."
    echo "$CLIENT_ID" | gcloud secrets create ms365-client-id --data-file=- || echo "$CLIENT_ID" | gcloud secrets versions add ms365-client-id --data-file=-
    echo "$CLIENT_SECRET" | gcloud secrets create ms365-client-secret --data-file=- || echo "$CLIENT_SECRET" | gcloud secrets versions add ms365-client-secret --data-file=-
    echo "$TENANT_ID" | gcloud secrets create ms365-tenant-id --data-file=- || echo "$TENANT_ID" | gcloud secrets versions add ms365-tenant-id --data-file=-
else
    echo "⚠️  No se encontró .env, asumiendo que los secrets ya existen en Secret Manager"
fi

# Configurar permisos para Cloud Run service account
echo "🛡️  Configurando permisos de service account..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
CLOUD_RUN_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "  Project Number: $PROJECT_NUMBER"
echo "  Service Account: $CLOUD_RUN_SERVICE_ACCOUNT"

# Otorgar permisos al service account de Cloud Run
gcloud secrets add-iam-policy-binding ms365-client-id \
  --member="serviceAccount:${CLOUD_RUN_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" || true

gcloud secrets add-iam-policy-binding ms365-client-secret \
  --member="serviceAccount:${CLOUD_RUN_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" || true

gcloud secrets add-iam-policy-binding ms365-tenant-id \
  --member="serviceAccount:${CLOUD_RUN_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" || true

echo "✅ Permisos configurados correctamente"

# Build del proyecto
echo "🏗️  Construyendo proyecto..."
npm run build

# Verificar que el build fue exitoso
if [ ! -d "dist" ]; then
    echo "❌ Error: Build directory not found. Make sure 'npm run build' completed successfully"
    exit 1
fi

echo "✅ Build completado exitosamente"

# Construir imagen Docker
echo "🐳 Construyendo imagen Docker..."
# Usar el Dockerfile principal en lugar del simple
gcloud builds submit --tag $IMAGE_NAME

# Verificar que la imagen se construyó correctamente
if ! gcloud container images describe $IMAGE_NAME >/dev/null 2>&1; then
    echo "❌ Error: Docker image build failed"
    exit 1
fi

echo "✅ Imagen Docker construida exitosamente"

# Deploy a Cloud Run
echo "🚀 Desplegando a Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 5 \
  --min-instances 0 \
  --concurrency 1000 \
  --timeout 300s \
  --set-env-vars="NODE_ENV=production,USE_USER_CREDENTIALS=true,DEBUG_USER_AUTH=false,DISABLE_FILE_LOGGING=true" \
  --set-secrets="MS365_MCP_CLIENT_ID=ms365-client-id:latest,MS365_MCP_CLIENT_SECRET=ms365-client-secret:latest,MS365_MCP_TENANT_ID=ms365-tenant-id:latest"

# Obtener URL del servicio
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")

echo "✅ Deployment completado exitosamente!"
echo "🌐 Service URL: $SERVICE_URL"

# Verificaciones post-deployment
echo "🔍 Verificando deployment..."

echo "  1. Verificando que el servicio esté disponible..."
sleep 5  # Esperar a que el servicio esté listo

# Test básico del servicio
echo "  2. Probando endpoint básico..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVICE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}')

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "  ✅ Servicio respondiendo correctamente (HTTP 200)"
elif [ "$HTTP_STATUS" -eq 400 ] || [ "$HTTP_STATUS" -eq 401 ]; then
    echo "  ✅ Servicio respondiendo (HTTP $HTTP_STATUS - normal para MCP sin auth)"
else
    echo "  ⚠️  Servicio respondiendo con HTTP $HTTP_STATUS"
fi

echo "  3. Verificando logs recientes..."
gcloud beta run services logs read $SERVICE_NAME --region=$REGION --limit=10

echo ""
echo "🎉 Deployment completado exitosamente!"
echo ""
echo "📋 Información del servicio:"
echo "  URL: $SERVICE_URL"
echo "  Region: $REGION"
echo "  Service Name: $SERVICE_NAME"
echo "  Image: $IMAGE_NAME"
echo ""
echo "📖 Comandos útiles:"
echo "  Ver logs: gcloud beta run services logs read $SERVICE_NAME --region=$REGION"
echo "  Describir servicio: gcloud run services describe $SERVICE_NAME --region=$REGION"
echo "  Actualizar: ./deploy-cloud-run.sh"
echo ""
echo "🔗 Enlaces útiles:"
echo "  Cloud Run Console: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME"
echo "  Cloud Build Console: https://console.cloud.google.com/cloud-build/builds"
echo "  Secret Manager Console: https://console.cloud.google.com/security/secret-manager"
echo ""
echo "🧪 Para probar el servicio:"
echo "  curl -X POST \"$SERVICE_URL/mcp\" -H \"Content-Type: application/json\" -d '{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"id\":1}'"

# Configuración
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-"your-project-id"}
SERVICE_NAME="ms365-mcp-server"
REGION="europe-west1"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Colores
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

# Verificar que gcloud esté instalado
if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI no está instalado"
    echo "Instala desde: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Verificar que docker esté instalado
if ! command -v docker &> /dev/null; then
    log_error "Docker no está instalado"
    echo "Instala desde: https://docs.docker.com/get-docker/"
    exit 1
fi

# Verificar configuración de gcloud
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    log_error "No hay cuentas activas en gcloud"
    echo "Ejecuta: gcloud auth login"
    exit 1
fi

# Configurar proyecto
log_info "Configurando proyecto: $PROJECT_ID"
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION

# Habilitar APIs necesarias
log_info "Habilitando APIs necesarias..."
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Crear secrets en Secret Manager
log_info "Configurando secrets en Secret Manager..."

# Verificar si los secrets existen
if gcloud secrets describe ms365-client-id &>/dev/null; then
    log_info "Secret ms365-client-id ya existe"
else
    echo -n "$MS365_MCP_CLIENT_ID" | gcloud secrets create ms365-client-id --data-file=-
    log_success "Secret ms365-client-id creado"
fi

if gcloud secrets describe ms365-client-secret &>/dev/null; then
    log_info "Secret ms365-client-secret ya existe"
else
    echo -n "$MS365_MCP_CLIENT_SECRET" | gcloud secrets create ms365-client-secret --data-file=-
    log_success "Secret ms365-client-secret creado"
fi

if gcloud secrets describe ms365-tenant-id &>/dev/null; then
    log_info "Secret ms365-tenant-id ya existe"
else
    echo -n "$MS365_MCP_TENANT_ID" | gcloud secrets create ms365-tenant-id --data-file=-
    log_success "Secret ms365-tenant-id creado"
fi

# Construir imagen Docker
log_info "Construyendo imagen Docker..."
docker build -t $IMAGE_NAME .

# Subir imagen a Container Registry
log_info "Subiendo imagen a Container Registry..."
docker push $IMAGE_NAME

# Deploy a Cloud Run
log_info "Deployando a Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars USE_USER_CREDENTIALS=true \
  --set-env-vars DEBUG_USER_AUTH=false \
  --set-env-vars NODE_ENV=production \
  --set-secrets MS365_MCP_CLIENT_ID=ms365-client-id:latest \
  --set-secrets MS365_MCP_CLIENT_SECRET=ms365-client-secret:latest \
  --set-secrets MS365_MCP_TENANT_ID=ms365-tenant-id:latest \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 1000 \
  --max-instances 5 \
  --timeout 300s \
  --port 8080

# Obtener URL del servicio
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)")

log_success "Deployment completado!"
echo ""
echo "🌐 URL del servicio: $SERVICE_URL"
echo "📊 Consola: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME"
echo ""
echo "🧪 Para probar:"
echo "curl $SERVICE_URL/health"
echo ""
echo "📱 Uso con clientes:"
echo "Cambia la URL del servidor en tus clientes a: $SERVICE_URL"

# Mostrar logs recientes
log_info "Logs recientes:"
gcloud run services logs read $SERVICE_NAME --region $REGION --limit 20
