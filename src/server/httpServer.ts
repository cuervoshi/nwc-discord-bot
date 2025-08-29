import express from 'express';
import { log } from '../handlers/log.js';
import { BOT_CONFIG } from '../utils/config.js';
import { handleLud16Callback } from './callback.js';
import { handleLud21Verify } from './verify.js';

export function createHttpServer() {
  const app = express();
  
  // Middleware to parse JSON
  app.use(express.json());
  
  // LUD16 callback endpoint
  app.get('/lnurl/:username/callback', handleLud16Callback);
  
  // LUD21 verify endpoint
  app.get('/lnurl/:username/verify/:invoice', handleLud21Verify);
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });
  
  return app;
}

export function startHttpServer() {
  if (!BOT_CONFIG.HTTP_SERVER.ENABLED) {
    log("HTTP server is disabled", "info");
    return null;
  }
  
  const app = createHttpServer();
  const port = BOT_CONFIG.HTTP_SERVER.PORT;
  
  const server = app.listen(port, () => {
    log(`HTTP server started on port ${port}`, "info");
    log(`LUD16 callback endpoint: http://localhost:${port}/lnurl/{username}/callback`, "info");
    log(`LUD21 verify endpoint: http://localhost:${port}/lnurl/{username}/verify/{invoice}`, "info");
  });
  
  return server;
}
