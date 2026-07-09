const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { version } = require('../package.json');

const PORT = process.env.PORT || 5000;
const API_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`;

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '铧旗 CRM API',
      version,
      description: '铧旗 CRM 企业管理系统 RESTful API 文档',
    },
    servers: [
      {
        url: API_URL,
        description: process.env.API_BASE_URL ? '当前环境' : '本地开发',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 200 },
            message: { type: 'string', example: 'success' },
            data: { type: 'object' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./routes/**/*.js'], // 扫描所有路由文件中的 @swagger 注释
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * 挂载到 Express app 上。
 * 用法：app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
 */
module.exports = { swaggerUi, swaggerSpec };