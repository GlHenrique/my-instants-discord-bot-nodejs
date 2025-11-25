# Stage 1: Build - Compilar TypeScript
FROM node:22-slim AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar TODAS as dependências (incluindo devDependencies para compilar)
RUN npm ci --no-audit --no-fund \
    && npm cache clean --force

# Copiar código fonte
COPY . .

# Compilar TypeScript
RUN npm run build

# Stage 2: Production - Imagem final otimizada
FROM node:22-slim

# Instalar apenas FFmpeg (necessário para processamento de áudio)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/*

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar APENAS dependências de produção
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# Copiar código compilado do stage de build
COPY --from=builder /app/dist ./dist

# Expor porta (opcional, para health checks)
EXPOSE 3000

# Criar script de entrada que executa o bot diretamente
# (sem --env-file pois docker-compose já carrega as variáveis)
RUN echo '#!/bin/sh\nnode dist/index.js' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Comando para iniciar a aplicação
ENTRYPOINT ["/app/entrypoint.sh"]

