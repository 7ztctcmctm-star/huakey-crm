const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const logDir = path.resolve(__dirname, '..', 'logs');

const transports = [];

if (isProduction) {
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '30d',
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  );
} else {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
          const metaStr = Object.keys(metadata).length
            ? ' ' + JSON.stringify(metadata)
            : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      )
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'http',
  levels: winston.config.npm.levels,
  defaultMeta: {
    service: 'huakey-crm-backend',
    env: process.env.NODE_ENV || 'development'
  },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports
});

/**
 * 从 req 对象提取公共日志字段
 */
function extractReqMeta(req) {
  if (!req) return {};
  return {
    traceId: req.traceId || 'N/A',
    userId: req.user?.userId || req.user?.id || 'anonymous',
    method: req.method,
    path: req.originalUrl || req.url || 'unknown'
  };
}

module.exports = {
  logger,
  error: (message, meta = {}) => logger.error(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  info: (message, meta = {}) => logger.info(message, meta),
  http: (message, meta = {}) => {
    const { req, ...rest } = meta;
    const enriched = { ...extractReqMeta(req), ...rest };
    logger.http(message, enriched);
  }
};
