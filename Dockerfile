FROM node:20-slim

# Instala as dependÃªncias do sistema necessÃ¡rias (se houver)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia arquivos de dependÃªncias
COPY package*.json ./

# Instala todas as dependÃªncias (incluindo dev para o build)
RUN npm install

# Copia o restante dos arquivos
COPY . .

# Builda o frontend (Vite)
RUN npm run build

# ExpÃµe a porta 3000 (padrÃ£o do seu server.ts)
EXPOSE 3000

# VariÃ¡veis de ambiente padrÃ£o
ENV NODE_ENV=production
ENV PORT=3000

# Comando para iniciar a aplicaÃ§Ã£o
CMD ["npm", "start"]
