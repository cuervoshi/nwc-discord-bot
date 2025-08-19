FROM --platform=$TARGETPLATFORM node:lts-bullseye-slim

ARG TARGETPLATFORM
ARG BUILDPLATFORM

RUN echo "I am running on $BUILDPLATFORM, building for $TARGETPLATFORM" > /log

# Create app directory
WORKDIR /app

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm

# Copy the app code
COPY . .

# Install packages
RUN pnpm install

RUN pnpm build

# Run the application
CMD [ "pnpm", "start" ]