FROM denoland/deno:alpine

# Install git and bash (needed for clone.sh)
RUN apk add --no-cache git bash

WORKDIR /app

# Copy application files
COPY main.ts .
COPY clone.sh .
COPY deno.json .

# Make clone.sh executable
RUN chmod +x clone.sh

EXPOSE 8000

CMD ["deno", "task", "start"] 