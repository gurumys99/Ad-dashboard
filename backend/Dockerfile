# Use Node 20 on Debian Slim
FROM node:20-bookworm-slim

# Install PowerShell Core dependencies
RUN apt-get update && apt-get install -y \
    wget \
    apt-transport-https \
    software-properties-common \
    libicu-dev \
    && rm -rf /var/lib/apt/lists/*

# Install PowerShell Core
RUN wget -q https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y powershell \
    && rm packages-microsoft-prod.deb

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy backend code
COPY . .

# Copy scripts folder from parent directory to the correct location for the backend to see
# (Assumes backend/Dockerfile is used with context at the project root or backend folder)
# If context is PROJECT ROOT, we copy both backend and scripts. 
# If context is BACKEND, we will need to handle the scripts folder mapping.
# For simplicity with Docker Compose, we'll set context to BACKEND and mount scripts.

EXPOSE 5000

CMD ["node", "server.js"]
