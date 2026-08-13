"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const app_service_1 = require("./app.service");
let AppController = class AppController {
    appService;
    dataSource;
    constructor(appService, dataSource) {
        this.appService = appService;
        this.dataSource = dataSource;
    }
    getHello() {
        return this.appService.getHello();
    }
    async getHealth() {
        const database = await this.getDatabaseHealth();
        return {
            status: database.status === 'up' ? 'ok' : 'degraded',
            service: 'server',
            timestamp: new Date().toISOString(),
            dependencies: {
                database,
            },
        };
    }
    async getDatabaseHealth() {
        if (!this.dataSource) {
            return { status: 'not_configured' };
        }
        if (!this.dataSource.isInitialized) {
            return { status: 'down' };
        }
        try {
            await this.dataSource.query('SELECT 1');
            return { status: 'up' };
        }
        catch {
            return { status: 'down' };
        }
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "getHello", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getHealth", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [app_service_1.AppService,
        typeorm_1.DataSource])
], AppController);
//# sourceMappingURL=app.controller.js.map