---
description: Rebuild and deploy to NAS Docker
---
1. Run `npm run build` in the frontend directory
2. Run `docker compose build --no-cache`
3. Verify migrate.js has retry logic for DB readiness
4. Start the container and check logs for migration errors
5. If any migration fails, fix the SQL (remember: MySQL syntax only!) and rebuild
6. Verify the app is accessible and API endpoints respond
