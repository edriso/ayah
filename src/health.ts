import { createServer } from 'node:http';
import { logger } from './lib/logger';

/**
 * Tiny /health endpoint for uptime checks. Returns 200 while the process is
 * alive. A bind failure is logged but never crashes the bot.
 */
export function startHealthServer(): void {
  const parsed = parseInt(process.env.PORT || '', 10);
  const port = Number.isInteger(parsed) && parsed >= 0 && parsed < 65536 ? parsed : 8080;

  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));
  });

  server.on('error', (err) => {
    logger.warn('Health server failed to bind, continuing without it', {
      port,
      error: String(err),
    });
  });

  server.listen(port, () => logger.info('Health server listening', { port }));
}
