"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const clientOrigins = (configService.get('CLIENT_ORIGIN') ?? 'http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    app.enableCors({
        origin: clientOrigins.length === 1 ? clientOrigins[0] : clientOrigins,
    });
    const port = Number.parseInt(configService.get('SERVER_PORT') ??
        configService.get('PORT') ??
        '3001', 10);
    await app.listen(port);
}
bootstrap();
//# sourceMappingURL=main.js.map