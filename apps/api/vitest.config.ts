import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://specforge:specforge@localhost:5432/specforge',
      REDIS_URL: 'redis://localhost:6379',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      JWT_SECRET: 'test-jwt-secret-minimum-16-chars',
      MODEL_ROUTING_ENABLED: 'false',
      EMBEDDINGS_ENABLED: 'false',
    },
  },
});
