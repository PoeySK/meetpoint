import { DataSource } from 'typeorm';
import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    private readonly dataSource?;
    constructor(appService: AppService, dataSource?: DataSource | undefined);
    getHello(): string;
    getHealth(): Promise<{
        status: string;
        service: string;
        timestamp: string;
        dependencies: {
            database: {
                status: "up" | "down" | "not_configured";
            };
        };
    }>;
    private getDatabaseHealth;
}
