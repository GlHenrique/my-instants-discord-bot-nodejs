# Use Node.js 22 (LTS) como imagem base
FROM node:22-slim

# Instalar dependências do sistema necessárias para FFmpeg e opus
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Compilar TypeScript
RUN npm run build

# Expor porta (opcional, para health checks)
EXPOSE 3000

# Criar script de entrada que faz deploy e inicia o bot
RUN echo '#!/bin/sh\nnpm run deploy && npm start' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Comando para iniciar a aplicação (faz deploy antes de iniciar)
ENTRYPOINT ["/app/entrypoint.sh"]

