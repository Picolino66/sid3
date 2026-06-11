import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'path';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { BucketsModule } from './buckets/buckets.module';
import { HealthModule } from './health/health.module';
import { ConnectionsModule } from './connections/connections.module';
import { ObjectsModule } from './objects/objects.module';
import { OperationLogsModule } from './operation-logs/operation-logs.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { StorageProvidersModule } from './storage-providers/storage-providers.module';
import { StoragePoolsModule } from './storage-pools/storage-pools.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(__dirname, '../../../../.env'), resolve(__dirname, '../../.env')]
    }),
    PrismaModule,
    AuthModule,
    ProjectsModule,
    ConnectionsModule,
    ApiKeysModule,
    BucketsModule,
    StorageProvidersModule,
    StoragePoolsModule,
    StatsModule,
    ObjectsModule,
    OperationLogsModule,
    HealthModule
  ]
})
export class AppModule {}
