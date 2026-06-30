const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '铧旗 CRM API',
      version: '1.0.0',
      description: '铧旗 CRM 企业管理系统 RESTful API 文档',
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: '本地开发',
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